from fastapi import FastAPI, Body, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import hashlib
import os
import time
from datetime import datetime, timezone
from bson import ObjectId
from dotenv import load_dotenv
load_dotenv()
import patient_endpoints
app = FastAPI()

# Database Setup
MONGODB_URI = os.getenv("MONGODB_URI", "")
db = None

@app.get("/")
async def root():
    return {"status": "running", "server": "AyurCare AI Patient Backend"}


@app.get("/api/health")
async def api_health():
    from gemini_client import get_configured_api_keys

    keys = get_configured_api_keys()
    return {
        "status": "ok",
        "server": "bot-brain",
        "dbConnected": await ensure_db_connected(),
        "geminiKeysConfigured": len(keys),
        "geminiFallbackReady": len(keys) > 1,
    }

_mongo_client = None

@app.on_event("startup")
async def startup():
    global db, _mongo_client
    if MONGODB_URI:
        _mongo_client = AsyncIOMotorClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=3000,
            tlsAllowInvalidCertificates=True,
        )
        db = _mongo_client["doctor_portal"]
        try:
            await db.command("ping")
            print("Connected to MongoDB")
        except Exception as e:
            print(f"MongoDB ping failed at startup (chat/session features will be unavailable): {e}")
    else:
        print("MONGODB_URI not set — running without database. Chat/session features unavailable.")
    patient_endpoints.set_db_and_helpers(db, ensure_db_connected)
    try:
        from gemini_client import get_configured_api_keys
        n = len(get_configured_api_keys())
        print(f"Gemini API keys loaded: {n} (fallback active when n > 1)")
    except Exception as e:
        print(f"Gemini key check skipped: {e}")

async def ensure_db_connected():
    if db is None:
        return False
    try:
        await db.command("ping")
        return True
    except Exception:
        return False


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time
    print(f"[LOG] {request.method} {request.url.path} - Status: {response.status_code} - Duration: {duration:.4f}s")
    return response

# Explicit CORS for local dev
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"[VALIDATION ERROR] {exc.errors()}")
    return JSONResponse(
        status_code=400,
        content={"detail": exc.errors()},
    )

# REGISTER THE ROUTER WITH THE PREFIX EXPLICITLY
app.include_router(patient_endpoints.router, prefix="/api/patient")

from bson import ObjectId

# Import bot logic
from bot import (
    diagnose,
    get_next_question,
    extract_symptoms_from_text,
    should_give_diagnosis,
    sanitize_symptoms,
    generate_wellness_recipes,
    generate_ayurvedic_recommendation_plan,
    count_recipe_blocks,
    clinical_title_from_diagnosis_text,
    _user_wants_report_finalized,
    intake_medical_history_satisfied,
    _is_bot_fallback_text,
    _extract_json_object,
    _finalize_report_offer_text,
    _report_finalize_offer_made,
    is_vault_decline_message,
    _pick_unasked_followup,
    _bot_reply_repeats_history,
    _question_topic_already_answered,
    _intake_followups_complete,
    _user_wants_report_finalized,
    _message_requests_report,
    profile_demographics_complete,
    _extract_patient_info_from_history,
)


BUBBLE_DELIMITER = "---NEXT_BUBBLE---"


def _split_bot_bubbles(text: str) -> list[str]:
    """Split multi-bubble bot replies; never persist the delimiter in one message."""
    if not text:
        return []
    if BUBBLE_DELIMITER not in text:
        stripped = text.strip()
        return [stripped] if stripped else []
    parts = [p.strip() for p in text.split(BUBBLE_DELIMITER) if p and p.strip()]
    return parts if parts else [text.strip()]


def _response_is_vault_prompt(text: str) -> bool:
    if not text:
        return False
    low = text.lower()
    return "health vault" in low or "medical records or lab reports" in low

def _to_utc_iso(value):
    if not isinstance(value, datetime):
        return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


# Helper to serialize MongoDB objects
def serialize_doc(doc):
    if not doc:
        return None
    out = {}
    for key, val in doc.items():
        if key == "_id" or isinstance(val, ObjectId):
            out[key] = str(val)
        elif isinstance(val, datetime):
            out[key] = _to_utc_iso(val)
        elif isinstance(val, list):
            out[key] = [
                serialize_doc(item) if isinstance(item, dict) else item
                for item in val
            ]
        elif isinstance(val, dict):
            out[key] = serialize_doc(val)
        else:
            out[key] = val
    return out


async def load_patient_profile(user_id: str):
    if not user_id or db is None:
        return None
    try:
        oid = ObjectId(user_id)
    except Exception:
        return None
    doc = await db.users.find_one({"_id": oid})
    if not doc:
        # Fallback: some patients are only in the patients collection
        doc = await db.patients.find_one({"_id": oid})
    if not doc:
        return None
    prakriti = doc.get("prakritiProfile") if isinstance(doc.get("prakritiProfile"), dict) else {}
    constitution = (
        prakriti.get("constitution")
        or prakriti.get("dominant")
        or None
    )
    return {
        "name": doc.get("name"),
        "age": doc.get("age"),
        "gender": doc.get("gender"),
        "height": doc.get("height"),
        "weight": doc.get("weight"),
        "phone": doc.get("phone"),
        "email": doc.get("email"),
        "constitution": constitution,
        "prakritiProfile": prakriti if prakriti else None,
    }


async def sync_patient_profile_from_history(user_id: str, history, existing=None):
    """Persist demographics from chat intake to users collection when missing."""
    if not user_id or db is None:
        return
    try:
        oid = ObjectId(user_id)
    except Exception:
        return
    info = _extract_patient_info_from_history(history, {})
    existing = existing or await load_patient_profile(user_id) or {}
    patch = {}
    for key in ("name", "age", "gender", "height", "weight"):
        val = info.get(key)
        if val is None:
            continue
        sval = str(val).strip()
        if not sval or sval.lower() in ("n/a", "na", "unknown", "patient"):
            continue
        if key == "name" and sval.lower() in ("patient", "user"):
            continue
        cur = existing.get(key)
        if cur is not None and str(cur).strip() not in ("", "N/A", "n/a"):
            continue
        if key == "age":
            try:
                patch[key] = int(float(sval))
            except (TypeError, ValueError):
                continue
        else:
            patch[key] = sval
    if patch:
        await db.users.update_one({"_id": oid}, {"$set": patch})
        print(f"[PROFILE] Synced demographics for user={user_id}: {list(patch.keys())}")


async def upsert_patient_consultation_report(db, user_id: str, session_oid, diagnosis_text: str, title: str):
    """
    Mirror AI diagnosis into the reports collection so /consultations (Express patient API) lists it.
    """
    if not user_id or not diagnosis_text:
        return
    try:
        patient_oid = ObjectId(user_id)
    except Exception:
        print(f"[REPORTS] Skip sync — invalid userId: {user_id!r}")
        return

    summary = clinical_title_from_diagnosis_text(diagnosis_text)
    if not summary:
        summary = (title or "").strip() or "AI consultation report"
    summary = str(summary)[:500]

    report_title = (title or summary).strip()[:200]
    now = datetime.utcnow()

    payload = None
    if "---REPORT_DATA---" in str(diagnosis_text):
        payload = _extract_json_object(str(diagnosis_text).split("---REPORT_DATA---")[-1])

    report_data = {
        "source": "ai_chat",
        "fullDiagnosisText": diagnosis_text,
        "schemaVersion": "reports.v2",
        "reports": [],
        "patientInfo": {},
    }
    symptoms_str = ""
    recommendations = ""
    threat_level = "Moderate"
    full_text_for_threat = str(diagnosis_text or "").lower()

    if isinstance(payload, dict):
        report_data["schemaVersion"] = payload.get("schemaVersion") or "reports.v2"
        report_data["patientInfo"] = payload.get("patientInfo") or {}
        report_data["reports"] = payload.get("reports") or []
        for entry in report_data["reports"]:
            if not isinstance(entry, dict):
                continue
            rtype = entry.get("reportType")
            rd = entry.get("reportData") if isinstance(entry.get("reportData"), dict) else {}
            if rtype == "Diagnosis Report":
                threat_level = str(rd.get("threatLevel") or threat_level)[:32]
                sym = rd.get("symptomsReported") or rd.get("supportingFindings") or []
                if isinstance(sym, list):
                    symptoms_str = ", ".join(str(s) for s in sym[:10])
                    full_text_for_threat += " " + symptoms_str.lower()
                imp = rd.get("clinicalImpression") or ""
                if imp:
                    full_text_for_threat += " " + str(imp).lower()
            if rtype == "Lifestyle Report":
                steps = rd.get("routine_steps") or []
                if isinstance(steps, list) and steps:
                    recommendations = "\n".join(f"• {s}" for s in steps[:8])

    try:
        from bot import _check_emergency_symptoms, _canonical_threat_level, _compute_clinical_threat_level

        canon = _canonical_threat_level(threat_level)
        recomputed = _compute_clinical_threat_level(
            [s.strip() for s in symptoms_str.split(",") if s.strip()],
            [],
            is_emergency=_check_emergency_symptoms(full_text_for_threat),
        )
        if _check_emergency_symptoms(full_text_for_threat):
            threat_level = "High"
        elif canon in ("Low", "Moderate", "High"):
            threat_level = canon
        elif recomputed:
            threat_level = recomputed
    except Exception:
        if "chest pain" in full_text_for_threat or "severe" in full_text_for_threat:
            threat_level = "High"

    update_doc = {
        "patientId": patient_oid,
        "sessionId": session_oid,
        "reportType": "AI Consultation",
        "reportTitle": report_title,
        "reportData": report_data,
        "diagnosis": summary,
        "symptoms": symptoms_str[:500],
        "recommendations": recommendations[:1200],
        "threatLevel": threat_level,
        "severity": threat_level,
        "date": now.strftime("%Y-%m-%d"),
        "hiddenByPatient": False,
        "updatedAt": now,
    }

    await db.reports.update_one(
        {"patientId": patient_oid, "sessionId": session_oid},
        {"$set": update_doc, "$setOnInsert": {"createdAt": now}},
        upsert=True,
    )
    print(f"[REPORTS] Upserted consultation report for patient={user_id} session={session_oid}")


@app.get("/api/auth/me")
async def get_patient_me(request: Request):
    """Patient profile endpoint — mirrors /api/auth/me on the doctor API."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = auth_header.split(" ", 1)[1]
    try:
        import jwt as pyjwt
        payload = pyjwt.decode(token, os.getenv("JWT_SECRET", "ayurcare_secret_2025"), algorithms=["HS256"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    uid = payload.get("userId") or payload.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    # Try MongoDB if connected
    if db is not None:
        try:
            from bson import ObjectId
            user = await db.users.find_one({"_id": ObjectId(uid)})
            if user:
                return {
                    "id": uid,
                    "email": user.get("email"),
                    "name": user.get("name"),
                    "age": user.get("age"),
                    "gender": user.get("gender"),
                    "height": user.get("height"),
                    "weight": user.get("weight"),
                    "phone": user.get("phone"),
                    "role": user.get("role", "patient"),
                    "isOnboarded": user.get("isOnboarded", False),
                    "profileImage": user.get("profileImage"),
                }
        except Exception:
            pass

    # DEV / no-DB fallback
    dev_email = os.getenv("DEV_DEMO_EMAIL", "demo@ayurcare.com")
    return {"id": uid, "email": dev_email, "name": "Demo Patient", "role": "patient", "isOnboarded": False}


@app.post("/api/chat/create")
async def create_session(data: dict = Body(...)):
    user_id = data.get("userId")
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing userId")
    
    new_session = {
        "userId": str(user_id).strip(),
        "title": "New Consultation",
        "messages": [],
        "diagnosis": "",
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow()
    }
    result = await db.sessions.insert_one(new_session)
    new_session["_id"] = str(result.inserted_id)
    return {"data": new_session}

def _session_user_id_query(user_id: str):
    """Match sessions whether userId was stored as string or ObjectId."""
    variants = []
    if user_id:
        variants.append(user_id)
        try:
            oid = ObjectId(user_id)
            variants.extend([oid, str(oid)])
        except Exception:
            pass
    seen = set()
    unique = []
    for v in variants:
        key = str(v)
        if key not in seen:
            seen.add(key)
            unique.append(v)
    if not unique:
        return {"userId": user_id}
    return {"userId": {"$in": unique}}


@app.get("/api/chat/sessions/{user_id}")
async def get_sessions(user_id: str):
    cursor = db.sessions.find(_session_user_id_query(user_id)).sort("updatedAt", -1)
    sessions = await cursor.to_list(length=200)
    return {"data": [serialize_doc(s) for s in sessions]}

@app.get("/api/chat/session/{session_id}")
async def get_session(session_id: str):
    try:
        session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"data": serialize_doc(session)}


@app.delete("/api/chat/session/{session_id}")
async def delete_chat_session(session_id: str):
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    result = await db.sessions.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}

@app.post("/api/chat/ask/{session_id}")
async def ask_ai(session_id: str, data: dict = Body(...)):
    print(f"[CHAT] Received request for session: {session_id}")
    text = data.get("text")
    if not text:
        print("⚠️ Missing text in request")
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        session = await db.sessions.find_one({"_id": oid})
        if not session:
            print(f"❌ Session not found: {session_id}")
            raise HTTPException(status_code=404, detail="Session not found")

        # Append user message
        messages = session.get("messages", [])
        messages.append({"role": "user", "text": text})

        current_symptoms = sanitize_symptoms(session.get("symptoms", []))
        extracted = extract_symptoms_from_text(text)
        if extracted:
            current_symptoms.extend(extracted)
        current_symptoms = sanitize_symptoms(list(dict.fromkeys(current_symptoms)))

        history = []
        for msg in messages:
            if msg["role"] == "user":
                history.append(f"User: {msg['text']}")
            else:
                history.append(f"AI: {msg['text']}")

        answers = session.get("answers", {})

        vault_prompt_shown = session.get("vaultPromptShown", False)
        if not vault_prompt_shown:
            for msg in messages:
                if msg.get("role") in ("bot", "report"):
                    if _response_is_vault_prompt(msg.get("text") or ""):
                        vault_prompt_shown = True
                        break

        vault_already = session.get("vaultUserResponded", False)
        user_declined_vault = vault_prompt_shown and is_vault_decline_message(text)
        pending_vault_ack = vault_prompt_shown and not vault_already

        satisfied = intake_medical_history_satisfied(
            history,
            vault_reply_pending_ack=pending_vault_ack,
            vault_already_acknowledged=vault_already,
        )

        explicit_report_request = (
            _user_wants_report_finalized(history)
            or _message_requests_report(text)
        )
        wants_report = (
            text.strip().lower() == "diagnose"
            or should_give_diagnosis(current_symptoms, answers, history, medical_history_satisfied=satisfied)
            or explicit_report_request
        )
        intake_ready_for_report = satisfied or (
            explicit_report_request and len(history) >= 4
        )

        patient_profile = await load_patient_profile(session.get("userId"))
        if patient_profile and profile_demographics_complete(patient_profile):
            intake_ready_for_report = intake_ready_for_report or len(history) >= 3

        if wants_report and intake_ready_for_report:
            ai_response = diagnose(current_symptoms, history, patient_profile=patient_profile)
            if not ai_response:
                ai_response = (
                    "I could not finalize your report just now — the AI service may be busy. "
                    "Please try again in a moment, or reply **Yes** once more to generate your report."
                )
        else:
            should_offer_finalize = (
                pending_vault_ack
                or user_declined_vault
                or (
                    satisfied
                    and not _report_finalize_offer_made(history)
                )
            )
            if should_offer_finalize:
                ai_response = _finalize_report_offer_text(history)
            else:
                ai_response = get_next_question(
                    current_symptoms,
                    history,
                    vault_reply_pending_ack=pending_vault_ack,
                    vault_already_acknowledged=vault_already or user_declined_vault,
                    patient_profile=patient_profile,
                )
            if ai_response and (
                _bot_reply_repeats_history(history, ai_response)
                or _question_topic_already_answered(history, ai_response)
            ):
                alt = _pick_unasked_followup(history)
                if alt:
                    ai_response = alt
                elif should_offer_finalize or satisfied or _intake_followups_complete(history):
                    ai_response = _finalize_report_offer_text(history)

            if not ai_response or _is_bot_fallback_text(ai_response):
                if should_offer_finalize:
                    ai_response = _finalize_report_offer_text(history)
                elif "[AYURCARE_SERVICE_UNAVAILABLE]" in str(ai_response or "").upper():
                    ai_response = (
                        "I could not reach the clinical AI service. "
                        "Add **GEMINI_API_KEY** to `ayurveda-app/bot-brain/.env`, restart bot-brain, then try again."
                    )
                elif not satisfied:
                    ai_response = get_next_question(
                        current_symptoms,
                        history,
                        vault_reply_pending_ack=False,
                        vault_already_acknowledged=vault_already,
                        patient_profile=patient_profile,
                    )
                    if not ai_response or _is_bot_fallback_text(ai_response):
                        ai_response = (
                            _pick_unasked_followup(history)
                            or (
                                _finalize_report_offer_text(history)
                                if satisfied or _intake_followups_complete(history)
                                else None
                            )
                            or (
                                "Thank you for that detail. "
                                "Would you like me to **finalize your Ayurvedic clinical report** now? "
                                "Reply **Yes** to generate it, or add any other symptom you want included."
                            )
                        )
                else:
                    ai_response = _finalize_report_offer_text(history)

        response_type = "text"
        msg_role = "bot"
        if ai_response and "---REPORT_DATA---" in ai_response:
            response_type = "diagnosis"
            msg_role = "report"

        if msg_role == "bot" and ai_response and BUBBLE_DELIMITER in ai_response:
            for part in _split_bot_bubbles(ai_response):
                messages.append({"role": "bot", "text": part})
        else:
            messages.append({"role": msg_role, "text": ai_response})

        prev_title = (session.get("title") or "").strip()
        new_title = prev_title
        if response_type == "diagnosis":
            clinical = clinical_title_from_diagnosis_text(ai_response)
            if clinical:
                new_title = clinical
        elif prev_title in ("", "New Consultation"):
            stripped = " ".join(text.strip().split())
            if stripped:
                new_title = stripped[:48] + ("…" if len(stripped) > 48 else "")

        set_payload = {
            "messages": messages,
            "symptoms": current_symptoms,
            "answers": answers,
            "diagnosis": ai_response if response_type == "diagnosis" else session.get("diagnosis", ""),
            "title": new_title,
            "updatedAt": datetime.utcnow(),
        }
        if pending_vault_ack or user_declined_vault:
            set_payload["vaultUserResponded"] = True
        if vault_prompt_shown and not session.get("vaultPromptShown"):
            set_payload["vaultPromptShown"] = True
        if response_type == "text" and ai_response and _response_is_vault_prompt(ai_response):
            set_payload["vaultPromptShown"] = True

        await db.sessions.update_one(
            {"_id": oid},
            {"$set": set_payload},
        )
        if response_type == "diagnosis":
            uid = session.get("userId")
            if uid:
                await sync_patient_profile_from_history(uid, history, patient_profile)
                await upsert_patient_consultation_report(db, uid, oid, ai_response, new_title)
        print(f"[CHAT] AI response sent for session: {session_id}")
        return {"content": ai_response, "type": response_type, "title": new_title}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Error in ask_ai: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/recipes/{session_id}")
async def get_recipes(session_id: str, data: dict = Body(...)):
    print(f"[RECIPES] Received request for session: {session_id}")
    try:
        try:
            oid = ObjectId(session_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid session ID")

        session = await db.sessions.find_one({"_id": oid})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        cached = session.get("recipesText")
        force = bool(data.get("force"))

        diagnosis = data.get("diagnosis") or session.get("diagnosis", "")
        diag_sig = hashlib.sha256((diagnosis or "").encode("utf-8")).hexdigest()[:20]
        cached_sig = session.get("recipesDiagnosisSig") or ""

        if (
            cached
            and not force
            and count_recipe_blocks(cached) >= 3
            and cached_sig
            and cached_sig == diag_sig
        ):
            return {"recipes": cached, "diagnosisSig": diag_sig}
        if not diagnosis:
            raise HTTPException(status_code=400, detail="No diagnosis available for this session")

        messages = session.get("messages", [])
        history = []
        for msg in messages:
            if msg.get("role") == "user":
                history.append(f"User: {msg.get('text', '')}")
            elif msg.get("role") in ("bot", "report"):
                history.append(f"AI: {msg.get('text', '')}")

        symptoms = sanitize_symptoms(session.get("symptoms", []))
        recipes_text = generate_wellness_recipes(symptoms, diagnosis, history)

        await db.sessions.update_one(
            {"_id": oid},
            {
                "$set": {
                    "recipesText": recipes_text,
                    "recipesDiagnosisSig": diag_sig,
                    "updatedAt": datetime.utcnow(),
                }
            },
        )
        return {"recipes": recipes_text, "diagnosisSig": diag_sig}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Error in get_recipes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat/recommendations/{session_id}")
async def get_ayurvedic_recommendations(session_id: str, data: dict = Body(...)):
    print(f"[RECOMMENDATIONS] Received request for session: {session_id}")
    try:
        try:
            oid = ObjectId(session_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid session ID")

        session = await db.sessions.find_one({"_id": oid})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        diagnosis = data.get("diagnosis") or session.get("diagnosis", "")
        if not diagnosis:
            raise HTTPException(status_code=400, detail="No diagnosis available for this session")

        diag_sig = hashlib.sha256((diagnosis or "").encode("utf-8")).hexdigest()[:20]
        force = bool(data.get("force"))
        cached = session.get("recommendationPlan")
        cached_sig = session.get("recommendationDiagnosisSig") or ""

        if (
            isinstance(cached, dict)
            and cached.get("herbs")
            and not force
            and cached_sig
            and cached_sig == diag_sig
        ):
            return {"plan": cached, "diagnosisSig": diag_sig}

        messages = session.get("messages", [])
        history = []
        for msg in messages:
            if msg.get("role") == "user":
                history.append(f"User: {msg.get('text', '')}")
            elif msg.get("role") in ("bot", "report"):
                history.append(f"AI: {msg.get('text', '')}")

        symptoms = sanitize_symptoms(session.get("symptoms", []))
        plan = generate_ayurvedic_recommendation_plan(symptoms, diagnosis, history)

        await db.sessions.update_one(
            {"_id": oid},
            {
                "$set": {
                    "recommendationPlan": plan,
                    "recommendationDiagnosisSig": diag_sig,
                    "updatedAt": datetime.utcnow(),
                }
            },
        )
        return {"plan": plan, "diagnosisSig": diag_sig}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Error in get_ayurvedic_recommendations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

import re as _re
import json as _json
from pydantic import BaseModel
from typing import List, Optional


def _extract_json(text: str) -> dict:
    """Pull the first JSON object from a Gemini response, stripping any markdown fences."""
    try:
        # Strip markdown code fences if present
        cleaned = _re.sub(r'^```(?:json)?\s*', '', text.strip(), flags=_re.MULTILINE)
        cleaned = _re.sub(r'```\s*$', '', cleaned.strip(), flags=_re.MULTILINE).strip()
        # Try direct parse first
        try:
            return _json.loads(cleaned)
        except Exception:
            pass
        # Fallback: extract first {...} block
        m = _re.search(r'\{[\s\S]*\}', cleaned)
        if m:
            return _json.loads(m.group())
        return {"error": "Could not parse AI response", "raw": text[:500]}
    except Exception:
        return {"error": "Could not parse AI response", "raw": text[:500]}


class MealPlanRequest(BaseModel):
    dosha: Optional[str] = None
    height: Optional[str] = None
    weight: Optional[str] = None
    allergies: Optional[str] = None
    goals: Optional[str] = None
    preferences: Optional[str] = None


class MedicineCheckRequest(BaseModel):
    ayurvedic_medicines: List[str] = []
    allopathic_medicines: List[str] = []


@app.post("/api/wellness-feed/insights")
def get_wellness_insights(data: dict = Body(...)):
    from gemini_client import send
    dosha = data.get("dosha") or "Unknown"
    wellness = data.get("wellness") or {}
    profile = data.get("profile") or {}
    today = datetime.now(timezone.utc).strftime("%A, %B %d")

    prompt = f"""You are an Ayurvedic wellness coach. Today is {today}.
Patient: dosha={dosha}, age={profile.get('age','?')}, gender={profile.get('gender','?')}.
Today wellness: hydration={wellness.get('hydrationGlasses',0)} glasses, steps={wellness.get('steps',0)},
sleep={wellness.get('sleepQuality',0)}/5, energy={wellness.get('energy',0)}/5,
stress={wellness.get('stress',0)}/5, digestion={wellness.get('digestionQuality',0)}/5.

Respond ONLY with this JSON (no markdown, no extra text):
{{
  "greeting": "warm personalized Ayurvedic greeting for {today}",
  "dosha_status": {{
    "balance": "Balanced|Slightly Imbalanced|Imbalanced",
    "message": "personalized message about dosha today (2 sentences)",
    "color": "emerald|amber|rose"
  }},
  "stress_alert": {{
    "show": true|false,
    "level": "Low|Moderate|High",
    "message": "one sentence guidance"
  }},
  "hydration": {{
    "goal": 8,
    "message": "personalized advice (1 sentence)",
    "reminder": "motivational nudge"
  }},
  "breathing_exercise": {{
    "name": "pranayama name",
    "description": "one sentence what it is",
    "duration": "N minutes",
    "steps": ["inhale...", "hold...", "exhale...", "rest..."],
    "benefit": "why good for this dosha"
  }},
  "food_suggestions": {{
    "morning": ["item1","item2","item3"],
    "afternoon": ["item1","item2","item3"],
    "avoid_today": ["item1","item2"],
    "note": "one sentence"
  }},
  "meditation": {{
    "type": "technique name",
    "duration": "N minutes",
    "focus": "what to focus on",
    "mantra": "short Sanskrit or English affirmation",
    "benefit": "one sentence benefit"
  }},
  "daily_tip": "one impactful Ayurvedic tip for today"
}}"""

    result = send(prompt, max_tokens=1800)
    return _extract_json(result)


@app.post("/api/meal-planner/generate")
def generate_meal_plan(req: MealPlanRequest):
    from gemini_client import send
    bmi = None
    bmi_category = "Unknown"
    try:
        h = float(_re.sub(r'[^\d.]', '', req.height or ''))
        w = float(_re.sub(r'[^\d.]', '', req.weight or ''))
        if h > 0 and w > 0:
            bmi = round(w / ((h / 100) ** 2), 1)
            if bmi < 18.5:
                bmi_category = "Underweight"
            elif bmi < 25:
                bmi_category = "Normal"
            elif bmi < 30:
                bmi_category = "Overweight"
            else:
                bmi_category = "Obese"
    except Exception:
        pass

    dosha      = req.dosha or "Unknown"
    goals      = req.goals or "General wellness"
    allergies  = req.allergies or "None"
    prefs      = req.preferences or "None"
    bmi_str    = str(bmi) if bmi is not None else "null"
    bmi_json   = bmi_str  # already a valid JSON number or the word null

    sys_prompt = "You are an Ayurvedic nutritionist. Output ONLY a valid JSON object — no markdown, no fences."

    prompt = (
        f"Dosha:{dosha} BMI:{bmi_str}({bmi_category}) Goals:{goals} "
        f"Allergies:{allergies} Prefs:{prefs}\n"
        "Return JSON — all values must be real Ayurvedic content, no placeholders:\n"
        f'{{"bmi":{bmi_json},"bmi_category":"{bmi_category}",'
        f'"dosha_note":"<2 sentences on {dosha} diet>",'
        '"meals":{'
        '"breakfast":{"name":"<dish>","description":"<1 sentence>","ingredients":["<i1>","<i2>","<i3>"],"benefits":"<1 sentence>","prep_time":"<X mins>","avoid_if":""},'
        '"midmorning_snack":{"name":"<snack>","description":"<1 sentence>","ingredients":["<i1>","<i2>"],"benefits":"<1 sentence>","prep_time":"<X mins>","avoid_if":""},'
        '"lunch":{"name":"<dish>","description":"<1 sentence>","ingredients":["<i1>","<i2>","<i3>","<i4>"],"benefits":"<1 sentence>","prep_time":"<X mins>","avoid_if":""},'
        '"evening_snack":{"name":"<snack>","description":"<1 sentence>","ingredients":["<i1>","<i2>"],"benefits":"<1 sentence>","prep_time":"<X mins>","avoid_if":""},'
        '"dinner":{"name":"<dish>","description":"<1 sentence>","ingredients":["<i1>","<i2>","<i3>"],"benefits":"<1 sentence>","prep_time":"<X mins>","avoid_if":""}'
        '},'
        '"hydration":"<advice>","foods_to_favor":["<f1>","<f2>","<f3>","<f4>","<f5>"],'
        '"foods_to_avoid":["<f1>","<f2>","<f3>"],'
        '"disclaimer":"AI-generated. Consult your Ayurvedic practitioner."}'
    )

    result = send(prompt, model="gemini-2.0-flash-lite", max_tokens=1400, system_prompt=sys_prompt, json_mode=True)
    return _extract_json(result)


@app.post("/api/medicine-checker/check")
def check_medicine_interactions(req: MedicineCheckRequest):
    from gemini_client import send
    ayurvedic  = ", ".join(req.ayurvedic_medicines)  if req.ayurvedic_medicines  else "None"
    allopathic = ", ".join(req.allopathic_medicines) if req.allopathic_medicines else "None"

    if ayurvedic == "None" and allopathic == "None":
        raise HTTPException(status_code=400, detail="Please provide at least one medicine.")

    all_meds = req.ayurvedic_medicines + req.allopathic_medicines

    sys_prompt = "You are a clinical pharmacologist. Output ONLY a valid JSON object — no markdown, no fences."

    meds_str = ', '.join(all_meds)
    prompt = (
        f"Ayurvedic: {ayurvedic} | Allopathic: {allopathic}\n"
        "Return JSON with real clinical content (no placeholders). "
        "overall_risk=Low/Moderate/High. consult_doctor=true if Moderate or High. "
        "Even for low-risk, explain each medicine's action and any indirect interactions.\n"
        f'{{"overall_risk":"Low","summary":"<2 sentences on {meds_str} together>",'
        '"interactions":[{"medicine1":"<name>","medicine2":"<name>","type":"Potential","severity":"Mild","description":"<2 sentences>","recommendation":"<1 sentence>"}],'
        '"safe_combinations":["<sentence>"],'
        '"warnings":["<precaution 1>","<precaution 2>"],'
        f'"timing_advice":"<when to take each medicine>",'
        '"foods_to_avoid":["<food1>","<food2>","<food3>"],'
        '"consult_doctor":false,'
        '"disclaimer":"AI-generated. Consult a licensed physician."}'
    )

    result = send(prompt, model="gemini-2.0-flash-lite", max_tokens=1000, system_prompt=sys_prompt, json_mode=True)
    return _extract_json(result)


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=5002)
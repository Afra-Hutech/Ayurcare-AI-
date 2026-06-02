# from google import genai
from gemini_client import send
from candidate_engine import get_candidates
from nlp.dosha_scoring import score_sentence
from retrieval_agent import get_semantic_context  # NEW: Vector DB search
from dotenv import load_dotenv
import os
import json
import re
from typing import Dict, List
import concurrent.futures
import logging

_logger = logging.getLogger(__name__)
# RETRIEVAL_CONTEXT_BUDGET_CHARS is enforced inside retrieval_agent.py; bot.py does not re-slice.

# Load environment variables from .env file
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path)

# The client is now handled by gemini_client.py
# client = genai.Client(api_key=api_key)

# Session state
session = {
    "symptoms": [],
    "answers": {},
    "conversation_history": [],
    "diagnosis_complete": False,
    "confirmed_disease": None,
    "reasoning": [],
    "awaiting_final_check": False,
    "question_count": 0,
    "max_questions": 2 # Increased to allow deeper clinical flows
}

PRESET_TOPICS = {
    "persistent digestion issues",
    "sleep cycle analysis",
    "seasonal allergy care",
    "energy & stress management",
    "energy and stress management",
}

BASIC_DETAIL_KEYWORDS = [
    "age",
    "gender",
    "height",
    "weight",
    "years old",
    "yo",
    "male",
    "female",
    "cm",
    "kg",
]

# Emergency/Severe symptoms that require immediate "High" threat level
EMERGENCY_SYMPTOMS = [
    "bleeding",
    "puking blood",
    "vomiting blood",
    "coughing blood",
    "chest pain",
    "heart attack",
    "unconscious",
    "fainting",
    "severe bleeding",
    "difficulty breathing",
    "can't breathe",
    "stroke",
    "seizure",
    "high fever",
    "suicide",
    "overdose",
    "poison",
]

# User confirmed they have records / uploaded / described prior care
MEDICAL_HISTORY_KEYWORDS = [
    "medical record",
    "lab report",
    "health vault",
    "uploaded",
    "i have records",
    "have reports",
    "previous diagnosis",
    "prior diagnosis",
    "hospital record",
    "blood test",
    "scan report",
    "x-ray",
    "mri",
    "ct scan",
]

# User declined records — must count as completing the vault step
NO_MEDICAL_RECORDS_PHRASES = [
    "no record",
    "no medical",
    "no lab",
    "no report",
    "no previous",
    "no history",
    "don't have",
    "do not have",
    "dont have",
    "none",
    "nothing to upload",
    "haven't uploaded",
    "have not uploaded",
    "not uploaded",
    "without record",
    "without report",
    "no documents",
    "no files",
    "continue with the information",
    "continue with what",
    "we will continue",
    "let you know",
    "simply let me know",
    "no prior",
    "never had",
    "first time",
]

REPORT_FINALIZE_YES = [
    "yes",
    "yeah",
    "yep",
    "sure",
    "ok",
    "okay",
    "please",
    "generate",
    "finalize",
    "finalise",
    "go ahead",
    "proceed",
    "create report",
    "make report",
    "generate the report",
    "generate my report",
    "generate report",
    "create my report",
    "make my report",
    "give me the report",
    "give me my report",
    "need the report",
    "want the report",
    "clinical report",
    "do it",
]

REPORT_REQUEST_PHRASES = [
    "generate the report",
    "generate my report",
    "generate report",
    "create the report",
    "create my report",
    "make the report",
    "make my report",
    "give me the report",
    "give me my report",
    "need my report",
    "want my report",
    "can you generate",
    "please generate",
    "prepare my report",
    "build my report",
]

REPORT_FINALIZE_NO = [
    "not yet",
    "wait",
    "hold on",
    "more symptom",
    "another symptom",
    "not now",
    "later",
]


SYSTEM_KEYWORDS = {
    "Cardiology": ["heart", "cardiac", "chest pain", "palpitation", "hypertension", "blood pressure"],
    "Pulmonology": ["lung", "breath", "asthma", "cough", "wheezing", "shortness of breath", "respiratory"],
    "Gastroenterology": ["stomach", "acid", "reflux", "gastric", "abdomen", "diarrhea", "constipation", "digestion", "liver"],
    "Neurology": ["headache", "migraine", "seizure", "nerve", "neuropathy", "vertigo", "numbness", "stroke"],
    "Dermatology": ["skin", "rash", "eczema", "psoriasis", "acne", "itching", "lesion"],
    "Orthopedics": ["joint", "bone", "back pain", "knee", "shoulder", "fracture", "spine", "arthritis"],
    "Rheumatology": ["autoimmune", "rheumatoid", "lupus", "inflammation", "joint swelling"],
    "Nephrology": ["kidney", "renal", "creatinine", "proteinuria"],
    "Urology": ["urinary", "urine", "prostate", "stone", "dysuria", "bladder"],
    "Endocrinology": ["thyroid", "diabetes", "hormone", "insulin", "metabolic"],
    "Gynecology": ["menstrual", "pcos", "pregnancy", "uterus", "ovary", "vaginal"],
    "ENT": ["ear", "nose", "throat", "sinus", "tonsil", "hearing", "tinnitus"],
    "Ophthalmology": ["eye", "vision", "blurred vision", "retina", "conjunctivitis"],
    "Psychiatry": ["anxiety", "depression", "panic", "mood", "sleep disorder", "stress"],
}


SPECIALTY_ALIASES = {
    "Cardiology": ["cardiology", "cardiologist", "heart"],
    "Pulmonology": ["pulmonology", "pulmonologist", "respiratory", "chest"],
    "Gastroenterology": ["gastroenterology", "gastro", "digestive", "hepatology"],
    "Neurology": ["neurology", "neurologist", "neuro"],
    "Dermatology": ["dermatology", "dermatologist", "skin"],
    "Orthopedics": ["orthopedic", "orthopaedic", "ortho", "musculoskeletal"],
    "Rheumatology": ["rheumatology", "rheumatologist"],
    "Nephrology": ["nephrology", "nephrologist", "renal", "kidney"],
    "Urology": ["urology", "urologist", "urinary"],
    "Endocrinology": ["endocrinology", "endocrinologist", "diabetes", "thyroid"],
    "Gynecology": ["gynecology", "gynaecology", "obgyn", "obstetrics", "women"],
    "ENT": ["ent", "otolaryngology", "ear", "nose", "throat"],
    "Ophthalmology": ["ophthalmology", "ophthalmologist", "eye"],
    "Psychiatry": ["psychiatry", "psychiatrist", "mental", "behavioral"],
}


SUPPORTIVE_HINTS = [
    "general consultation",
    "general medicine",
    "internal medicine",
    "family medicine",
    "ayurveda",
    "nutrition",
    "diet",
    "yoga",
    "wellness",
    "lifestyle",
    "panchakarma",
    "counselling",
]


def _normalize_text(value):
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _case_text(disease_name, symptoms):
    symptom_text = ""
    if isinstance(symptoms, list):
        symptom_text = " ".join(str(s) for s in symptoms if s)
    elif isinstance(symptoms, str):
        symptom_text = symptoms
    return f"{_normalize_text(disease_name)} {_normalize_text(symptom_text)}".strip()


def _detect_primary_system(case_text):
    best_system = None
    best_score = 0
    tie = False
    for system_name, keywords in SYSTEM_KEYWORDS.items():
        score = sum(1 for k in keywords if k in case_text)
        if score > best_score:
            best_system = system_name
            best_score = score
            tie = False
        elif score == best_score and score > 0:
            tie = True
    if tie or best_score == 0:
        return None
    return best_system


def _score_specialty(specialty_name, case_text, primary_system):
    spec = _normalize_text(specialty_name)
    score = 0.0

    for token in re.findall(r"[a-z0-9]+", case_text):
        if len(token) > 3 and token in spec:
            score += 0.03

    if "general consultation" in spec:
        score = max(score, 0.35)
    elif "general" in spec and ("medicine" in spec or "physician" in spec):
        score = max(score, 0.34)

    if primary_system:
        aliases = SPECIALTY_ALIASES.get(primary_system, [])
        if any(alias in spec for alias in aliases):
            score += 0.55

    if any(hint in spec for hint in SUPPORTIVE_HINTS):
        score += 0.12

    return min(round(score, 2), 0.99)


def recommend_specialties_for_case(disease_name, symptoms, available_specialties) -> Dict[str, List[Dict]]:
    """Return top ranked specialties with a single optional primary match."""
    available = []
    seen = set()
    for item in (available_specialties or []):
        name = str(item or "").strip()
        if not name:
            continue
        key = _normalize_text(name)
        if key in seen:
            continue
        seen.add(key)
        available.append(name)

    if not any(_normalize_text(x) == "general consultation" for x in available):
        available.append("General Consultation")

    case_text = _case_text(disease_name, symptoms)
    primary_system = _detect_primary_system(case_text)

    scored = []
    for spec in available:
        score = _score_specialty(spec, case_text, primary_system)
        scored.append({"name": spec, "score": score, "isPrimary": False})

    primary_idx = None
    if primary_system:
        aliases = SPECIALTY_ALIASES.get(primary_system, [])
        best = -1.0
        for idx, item in enumerate(scored):
            spec = _normalize_text(item["name"])
            if any(alias in spec for alias in aliases):
                if item["score"] > best:
                    best = item["score"]
                    primary_idx = idx

    if primary_idx is not None:
        scored[primary_idx]["isPrimary"] = True
        scored[primary_idx]["score"] = min(1.0, max(0.75, scored[primary_idx]["score"] + 0.2))

    def _sort_key(item):
        return (1 if item["isPrimary"] else 0, item["score"])

    scored.sort(key=_sort_key, reverse=True)

    selected = []
    for item in scored:
        if len(selected) >= 4:
            break
        spec_name = _normalize_text(item["name"])
        is_general = spec_name == "general consultation"
        if item["score"] >= 0.18 or item["isPrimary"] or is_general:
            selected.append(item)

    if not any(_normalize_text(x["name"]) == "general consultation" for x in selected):
        general_item = next((x for x in scored if _normalize_text(x["name"]) == "general consultation"), None)
        if general_item:
            selected.append(general_item)

    idx = 0
    while len(selected) < 4 and idx < len(scored):
        candidate = scored[idx]
        if not any(_normalize_text(x["name"]) == _normalize_text(candidate["name"]) for x in selected):
            selected.append(candidate)
        idx += 1

    selected = selected[:4]
    selected.sort(key=_sort_key, reverse=True)

    # Enforce one-primary rule
    primary_found = False
    for item in selected:
        if item["isPrimary"] and not primary_found:
            primary_found = True
            continue
        item["isPrimary"] = False

    return {"top_specialties": selected}


def _has_basic_details(history):
    for item in history:
        if not isinstance(item, str):
            continue
        if not item.startswith("User:"):
            continue
        text = item.replace("User:", "").strip().lower()
        if any(k in text for k in BASIC_DETAIL_KEYWORDS):
            return True
    return False


def _vault_prompt_was_shown(history):
    for item in history:
        if isinstance(item, str) and item.startswith("AI:"):
            lower = item.lower()
            if "health vault" in lower or "medical records or lab reports" in lower:
                return True
    return False


def _normalize_vault_user_reply(raw):
    """Strip markdown emphasis / invisible chars so **No** and pasted replies still match."""
    t = raw.replace("User:", "").replace("*", "")
    t = t.replace("\u200b", "").replace("\ufeff", "")  # ZWSP, BOM
    return t.strip().lower().rstrip(".!")


def is_vault_decline_message(user_text: str) -> bool:
    """True when the patient declines uploading records (e.g. NO after Health Vault prompt)."""
    text = _normalize_vault_user_reply(f"User:{user_text or ''}")
    if not text:
        return False
    vault_short_declines = frozenset(
        {
            "no",
            "nope",
            "nah",
            "none",
            "n",
            "na",
            "n/a",
            "no thanks",
            "not really",
        }
    )
    if text in vault_short_declines:
        return True
    return any(phrase in text for phrase in NO_MEDICAL_RECORDS_PHRASES)


def _has_medical_history(history):
    """Vault step complete: user has records, declined, or answered after the vault prompt."""
    # Standalone short declines must match exactly (avoid substring traps like "no" inside "another").
    vault_short_declines = frozenset(
        {
            "no",
            "nope",
            "nah",
            "none",
            "n",
            "na",
            "n/a",
            "no thanks",
            "not really",
        }
    )
    vault_asked = False
    for item in history:
        if not isinstance(item, str):
            continue
        if item.startswith("AI:"):
            lower = item.lower()
            if "health vault" in lower or "medical records or lab reports" in lower:
                vault_asked = True
            continue
        if not item.startswith("User:"):
            continue
        text = _normalize_vault_user_reply(item)
        if not text:
            continue
        if any(phrase in text for phrase in NO_MEDICAL_RECORDS_PHRASES):
            return True
        if text in vault_short_declines:
            return True
        if any(k in text for k in MEDICAL_HISTORY_KEYWORDS):
            return True
        # Any substantive reply after the vault prompt counts as acknowledgement (fixes "No" len==2 loop).
        if vault_asked and len(text) >= 2:
            return True
    return False


def intake_medical_history_satisfied(
    history,
    *,
    vault_reply_pending_ack=False,
    vault_already_acknowledged=False,
):
    """
    True when vault intake is complete — either parsed from history, user replied after vault prompt
    (this HTTP roundtrip), or earlier persisted acknowledgement on the session.
    """
    if vault_already_acknowledged:
        return True
    if vault_reply_pending_ack:
        return True
    return _has_medical_history(history)


def _report_finalize_offer_made(history):
    for item in history:
        if isinstance(item, str) and item.startswith("AI:"):
            lower = item.lower()
            if "finalize your personalized" in lower and "clinical report" in lower:
                return True
            if "would you like me to **finalize" in lower or "would you like me to finalize" in lower:
                return True
            if "reply **yes** to generate your report" in lower:
                return True
    return False


def _finalize_report_offer_text(history):
    primary = _first_user_issue(history)
    summary = f" regarding {primary}" if primary else ""
    return (
        "Thank you — we'll continue with the information you've shared.---NEXT_BUBBLE---"
        f"I have your intake details{summary}. "
        "Would you like me to **finalize your personalized Ayurvedic clinical report** now based on everything you've told me?---NEXT_BUBBLE---"
        "Reply **Yes** to generate your report, or share any additional symptoms you want included first."
    )


def _message_requests_report(text: str) -> bool:
    if not text:
        return False
    t = " ".join(str(text).strip().lower().split())
    if any(phrase in t for phrase in REPORT_REQUEST_PHRASES):
        return True
    if "report" in t and any(
        w in t for w in ("generate", "create", "make", "give", "need", "want", "prepare", "finalize", "finalise")
    ):
        return True
    return False


def _user_wants_report_finalized(history):
    for item in reversed(history):
        if not isinstance(item, str) or not item.startswith("User:"):
            continue
        text = item.replace("User:", "").strip().lower()
        if any(phrase in text for phrase in REPORT_FINALIZE_NO):
            return False
        if _message_requests_report(text):
            return True
        if any(phrase in text for phrase in REPORT_FINALIZE_YES):
            return True
        if text in ("y", "yes.", "yes please"):
            return True
        break
    return False


def _has_height_weight(history):
    """Check if height and weight have been provided."""
    has_height = False
    has_weight = False
    for item in history:
        if not isinstance(item, str):
            continue
        if not item.startswith("User:"):
            continue
        text = item.replace("User:", "").strip().lower()
        if any(k in text for k in ["cm", "feet", "ft", "height", "'"]):
            has_height = True
        if any(k in text for k in ["kg", "lbs", "weight", "kilograms", "pounds"]):
            has_weight = True
    return has_height and has_weight


EMERGENCY_FALSE_POSITIVE_PHRASES = [
    "blood pressure",
    "blood test",
    "blood sugar",
    "blood work",
    "blood report",
    "blood count",
    "complete blood",
    "blood group",
]


def _check_emergency_symptoms(text):
    """Check if user mentions any emergency/severe symptoms."""
    text_lower = text.lower()
    scrubbed = text_lower
    for phrase in EMERGENCY_FALSE_POSITIVE_PHRASES:
        scrubbed = scrubbed.replace(phrase, " ")
    for symptom in EMERGENCY_SYMPTOMS:
        if symptom in scrubbed:
            return True
    if re.search(r"\bblood\b", scrubbed):
        severe_blood = (
            "vomit", "cough", "stool", "urine", "nose", "gums",
            "period", "menstrual", "hemorrhage", "hematemesis",
        )
        if any(ctx in scrubbed for ctx in severe_blood):
            return True
    return False


def _emergency_warning_already_given(history):
    markers = (
        "requires immediate medical attention",
        "please seek in-person care",
        "some of what you've described can be serious",
        "i hear you — some of what you've described",
        "i hear you - some of what you've described",
    )
    for item in history or []:
        low = str(item).lower()
        if any(m in low for m in markers):
            return True
    return False


def clinical_title_from_diagnosis_text(diagnosis_text):
    """Short sidebar title e.g. Fever (Jwara) from report JSON."""
    if not diagnosis_text or "---REPORT_DATA---" not in str(diagnosis_text):
        return ""
    payload = _extract_json_object(str(diagnosis_text).split("---REPORT_DATA---")[-1])
    if not isinstance(payload, dict):
        return ""
    reports = payload.get("reports") or []
    for report in reports:
        if report.get("reportType") == "Diagnosis Report":
            diag = (report.get("reportData") or {}).get("diagnosis") or {}
            name = _clean_text(diag.get("name"), "")
            ayur = _clean_text(
                diag.get("ayurvedicName") or diag.get("ayurvedic_name") or diag.get("sanskritName"),
                "",
            )
            if not name:
                continue
            short = " ".join(name.split()[:3])
            if ayur and ayur.lower() not in short.lower():
                return f"{short} ({ayur})"
            return short
    return ""


HIGH_SEVERITY_MARKERS = [
    "severe",
    "intense",
    "unbearable",
    "crushing",
    "excruciating",
    "worst pain",
    "worst ever",
    "radiating",
    "can't breathe",
    "cannot breathe",
]

LOW_SEVERITY_MARKERS = [
    "mild",
    "slight",
    "minor",
    "occasional",
    "sometimes",
    "a little",
    "manageable",
    "low-grade",
    "low grade",
    "barely",
]


def _history_to_clinical_text(history):
    parts = []
    for item in history or []:
        s = str(item)
        if s.startswith("User:"):
            parts.append(s[5:])
        elif s.startswith("AI:"):
            parts.append(s[3:])
        else:
            parts.append(s)
    return " ".join(parts).lower()


def _canonical_threat_level(raw):
    if raw is None:
        return None
    t = str(raw).strip().lower()
    if not t:
        return None
    if any(x in t for x in ("high", "severe", "critical", "urgent", "emergency")):
        return "High"
    if any(x in t for x in ("low", "mild", "minor")):
        return "Low"
    if any(x in t for x in ("moderate", "medium", "mod")):
        return "Moderate"
    return None


def _compute_clinical_threat_level(symptoms, history, is_emergency=False):
    """Return Low, Moderate, or High from symptoms + conversation (not AI default)."""
    if is_emergency:
        return "High"
    all_text = " ".join(symptoms or []).lower()
    all_text += " " + _history_to_clinical_text(history)
    if _check_emergency_symptoms(all_text):
        return "High"

    concerning = any(
        token in all_text
        for token in ("chest pain", "breath", "bleed", "faint", "unconscious", "seizure", "stroke", "heart")
    )
    high_hits = sum(1 for m in HIGH_SEVERITY_MARKERS if m in all_text)
    low_hits = sum(1 for m in LOW_SEVERITY_MARKERS if m in all_text)

    if high_hits >= 2 or (high_hits >= 1 and concerning):
        return "High"
    if concerning and low_hits == 0:
        return "High"
    if low_hits >= 2 and not concerning:
        return "Low"
    if low_hits >= 1 and high_hits == 0 and not concerning:
        return "Low"
    if high_hits >= 1:
        return "Moderate"
    return "Moderate"


def _align_risk_kpis(kpis, threat_level):
    if not isinstance(kpis, list) or not threat_level:
        return kpis
    out = []
    for item in kpis:
        if not isinstance(item, dict):
            continue
        label = _clean_text(item.get("label"))
        value = _clean_text(item.get("value"))
        if not label:
            continue
        label_low = label.lower()
        if any(k in label_low for k in ("risk", "severity", "threat", "urgency", "priority", "concern")):
            canon = _canonical_threat_level(value)
            if threat_level == "High" or not canon or canon == "Moderate":
                value = threat_level
        out.append({"label": label, "value": value})
    return out


def _determine_threat_level(symptoms, history):
    """Return 'High' if emergency-level, else None (AI may refine Low vs Moderate)."""
    level = _compute_clinical_threat_level(symptoms, history, is_emergency=False)
    return "High" if level == "High" else None


def _normalize_user_text(text):
    return " ".join(text.strip().lower().split())


BOT_PHRASE_MARKERS = [
    "thank you for sharing",
    "could you please tell me",
    "when the symptoms started",
    "what makes them better or worse",
    "one more detail about when your symptoms",
    "when your symptoms occur",
    "how severe they feel",
    "ayurcare_service_unavailable",
    "unable to reach the clinical ai",
    "i am processing your clinical information",
    "please describe any further symptoms",
    "could you please elaborate",
    "please try again in a moment",
]

SYMPTOM_KEYWORDS = [
    "fever", "cough", "cold", "headache", "pain", "nausea", "vomiting", "diarrhea",
    "constipation", "rash", "itching", "fatigue", "dizziness", "bleeding", "allergy",
    "acidity", "bloating", "insomnia", "anxiety", "sore throat", "runny nose",
    "breathlessness", "chest pain", "back pain", "joint pain",
]

MEDICAL_NAME_BLOCKLIST = [
    "fever", "pain", "bleed", "blood", "throat", "headache", "cough", "vomit",
    "puke", "nausea", "allergy", "symptom", "patient", "hospital", "doctor",
]


def _is_bot_fallback_text(text):
    if not text:
        return True
    lowered = str(text).lower().strip()
    if lowered.startswith("[ayurcare_service_unavailable]"):
        return True
    return any(marker in lowered for marker in BOT_PHRASE_MARKERS)


def _normalize_question_text(text):
    t = re.sub(r"\*+", "", str(text or ""))
    t = re.sub(r"[^a-z0-9\s]", " ", t.lower())
    return re.sub(r"\s+", " ", t).strip()


def _bot_reply_repeats_history(history, candidate):
    """True if the candidate bot line is substantially the same as a prior AI message."""
    cand = _normalize_question_text(candidate)
    if len(cand) < 24:
        return False
    stop = frozenset(
        {
            "thank", "thanks", "please", "could", "would", "share", "your", "that",
            "this", "with", "when", "what", "have", "from", "about", "them", "they",
        }
    )
    cand_words = {w for w in cand.split() if len(w) >= 4 and w not in stop}
    if len(cand_words) < 4:
        return False

    for item in history or []:
        if not isinstance(item, str) or not item.startswith("AI:"):
            continue
        prev = _normalize_question_text(item[3:])
        if len(prev) < 24:
            continue
        if cand == prev or cand in prev or prev in cand:
            return True
        if len(cand) > 36 and cand[:36] == prev[:36]:
            return True
        prev_words = {w for w in prev.split() if len(w) >= 4 and w not in stop}
        if prev_words and len(cand_words & prev_words) / max(len(cand_words), 1) >= 0.55:
            return True
    return False


def _user_messages_blob(history):
    parts = []
    for item in history or []:
        if isinstance(item, str) and item.startswith("User:"):
            text = item.replace("User:", "").strip()
            if text:
                parts.append(text.lower())
    return " ".join(parts)


def _intake_topic_satisfied(history, topic):
    blob = _user_messages_blob(history)
    if not blob:
        return False
    patterns = {
        "timing": [
            r"\bnight\b",
            r"\bat night\b",
            r"\bsleep\b",
            r"\bmorning\b",
            r"\bevening\b",
            r"\boccurs when\b",
            r"when i try",
            r"before bed",
            r"after waking",
            r"time of day",
            r"\b\d{1,2}\s*(am|pm)\b",
        ],
        "qualities": [
            r"burning",
            r"cramping",
            r"heaviness",
            r"sharp",
            r"dull",
            r"throbbing",
            r"pressure",
            r"pitta",
            r"vata",
            r"kapha",
        ],
        "relief": [
            r"better with",
            r"worse with",
            r"reliev",
            r"warmth",
            r"warm ",
            r"\bcold\b",
            r"cool ",
        ],
        "triggers": [
            r"trigger",
            r"worsen",
            r"after eating",
            r"spicy",
            r"oily",
            r"meal",
            r"food",
        ],
        "sleep": [
            r"sleep",
            r"insomnia",
            r"nidra",
            r"bed",
            r"try to sleep",
        ],
    }
    for pat in patterns.get(topic, []):
        if re.search(pat, blob):
            return True
    return False


def _intake_followups_complete(history):
    return all(
        _intake_topic_satisfied(history, topic)
        for topic in ("timing", "qualities", "relief", "triggers", "sleep")
    )


def _question_topic_already_answered(history, candidate):
    """Skip AI lines that ask for facts the patient already gave."""
    cand = _normalize_question_text(candidate)
    if not cand:
        return False
    if any(
        phrase in cand
        for phrase in (
            "symptoms occur",
            "better or worse",
            "one more detail",
            "when your symptoms",
            "time of day",
            "morning afternoon or evening",
            "daily pattern",
        )
    ):
        if (
            _intake_topic_satisfied(history, "timing")
            or _intake_topic_satisfied(history, "relief")
            or _intake_topic_satisfied(history, "sleep")
        ):
            return True
    if "burning" in cand and "cramping" in cand and _intake_topic_satisfied(history, "qualities"):
        return True
    if "warmth" in cand and _intake_topic_satisfied(history, "relief"):
        return True
    if ("spicy" in cand or "meals" in cand) and _intake_topic_satisfied(history, "triggers"):
        return True
    if "sleep" in cand and _intake_topic_satisfied(history, "sleep"):
        return True
    return False


def _intake_topic_already_asked(history, topic):
    """True if the bot already asked about this intake topic (even if the patient hasn't answered clearly)."""
    markers = {
        "timing": (
            "time of day",
            "morning",
            "afternoon",
            "evening",
            "daily pattern",
            "when your symptoms",
            "follow a daily",
        ),
        "qualities": (
            "burning",
            "cramping",
            "heaviness",
            "pitta",
            "vata",
            "kapha",
            "sensation more as",
        ),
        "relief": (
            "better with warmth",
            "warmth and rest",
            "cool food",
            "cool food and drinks",
        ),
        "triggers": (
            "spicy",
            "oily",
            "irregular meals",
            "trigger or worsen",
        ),
        "sleep": (
            "how is your sleep",
            "daily routine",
            "vihara",
            "regular meals, exercise",
        ),
    }
    for item in history or []:
        if not isinstance(item, str) or not item.startswith("AI:"):
            continue
        prev = _normalize_question_text(item[3:])
        for marker in markers.get(topic, ()):
            if marker in prev:
                return True
    return False


def _pick_unasked_followup(history):
    """Rotate through structured follow-ups without repeating prior AI lines or answered topics."""
    options = [
        ("timing", "Does your symptom follow a daily pattern — worse in the morning, afternoon, or evening?"),
        ("qualities", "Would you describe the sensation more as burning heat (Pitta), cramping (Vata), or heaviness (Kapha)?"),
        ("relief", "Is the discomfort better with warmth and rest, or with cool food and drinks?"),
        ("triggers", "Do spicy, oily, or irregular meals seem to trigger or worsen what you feel?"),
        ("sleep", "How is your sleep and daily routine (Vihara) — regular meals, exercise, and rest?"),
    ]
    for topic, question in options:
        if _intake_topic_satisfied(history, topic):
            continue
        if _intake_topic_already_asked(history, topic):
            continue
        if _question_topic_already_answered(history, question):
            continue
        if not _bot_reply_repeats_history(history, question):
            return question
    return None


def _looks_like_person_name(name):
    cleaned = str(name or "").strip()
    if not cleaned or cleaned.lower() in ("patient", "n/a", "na", "none"):
        return False
    if len(cleaned) > 48 or "?" in cleaned:
        return False
    lowered = cleaned.lower()
    if any(term in lowered for term in MEDICAL_NAME_BLOCKLIST):
        return False
    if sum(ch.isdigit() for ch in cleaned) > 3:
        return False
    words = cleaned.split()
    if len(words) > 5:
        return False
    if not re.search(r"[A-Za-z]", cleaned):
        return False
    return True


def sanitize_symptoms(symptoms):
    cleaned = []
    for symptom in symptoms or []:
        text = str(symptom or "").strip()
        if len(text) < 3 or len(text) > 120:
            continue
        if _is_bot_fallback_text(text):
            continue
        if text.endswith("?"):
            continue
        cleaned.append(text)
    deduped = []
    seen = set()
    for item in cleaned:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _local_extract_symptoms(text):
    if not text or _is_bot_fallback_text(text):
        return []
    lowered = text.lower()
    found = []
    for keyword in SYMPTOM_KEYWORDS:
        if keyword in lowered:
            found.append(keyword)
    if not found:
        compact = text.strip()
        if 3 < len(compact) < 100 and not compact.endswith("?"):
            found.append(compact[:100])
    return found


def _first_user_issue(history):
    for item in history:
        if isinstance(item, str) and item.startswith("User:"):
            return item.replace("User:", "").strip()
    return ""


def _extract_json_object(text):
    if not text:
        return None
    cleaned = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            return None
    return None


def _extract_patient_info_from_history(history, dosha_profile):
    patient_info = {
        "name": "Patient",
        "age": "N/A",
        "gender": "N/A",
        "height": "N/A",
        "weight": "N/A",
        "constitution": dosha_profile.get("dominant", "Unknown") if isinstance(dosha_profile, dict) else "Unknown"
    }

    pattern_map = {
        "age": r"(\d{1,3})\s*(?:years? old|yo|y/o|years?)",
        "height": r"(\d{1,2}'\d{1,2}\"?|\d{2,3}\s*(?:cm|centimeters?|ft|feet|in|inch|inches|['\"]))",
        "weight": r"(\d{2,3}\s*(?:kg|kilograms?|lbs?|pounds?))",
    }

    awaiting_name = False
    for item in history:
        if not isinstance(item, str):
            continue

        if item.startswith("AI:"):
            ai_lower = item.lower()
            if "full name" in ai_lower or "may i know your name" in ai_lower or "know your name" in ai_lower:
                awaiting_name = True
            continue

        if not item.startswith("User:"):
            continue

        text = item.replace("User:", "").strip()
        lower = text.lower()

        if patient_info["gender"] == "N/A":
            if re.search(r"\b(?:female|woman|girl|lady)\b", lower):
                patient_info["gender"] = "Female"
            elif re.search(r"\b(?:male|man|boy|gentleman)\b", lower):
                patient_info["gender"] = "Male"

        for key, pattern in pattern_map.items():
            if patient_info[key] != "N/A":
                continue
            match = re.search(pattern, lower)
            if match:
                patient_info[key] = match.group(1).strip()

        if patient_info["name"] == "Patient":
            name_patterns = [
                r"\bname\s*[:=-]\s*([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4})",
                r"\bmy name is\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4})",
                r"\bi am\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4})",
                r"\bi'm\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4})",
                r"\bcall me\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,3})",
            ]
            for pattern in name_patterns:
                name_match = re.search(pattern, text, re.IGNORECASE)
                if name_match and _looks_like_person_name(name_match.group(1)):
                    patient_info["name"] = name_match.group(1).strip()
                    awaiting_name = False
                    break

            if patient_info["name"] == "Patient":
                compact_name = re.match(
                    r"^([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4})\s*,\s*\d+",
                    text,
                )
                if compact_name and _looks_like_person_name(compact_name.group(1)):
                    patient_info["name"] = compact_name.group(1).strip()
                    awaiting_name = False

        if awaiting_name and _looks_like_person_name(text):
            patient_info["name"] = text.strip().title()
            awaiting_name = False

    missing_fields = [
        patient_info.get(k) in ("N/A", "Patient", "", None)
        for k in ("name", "age", "gender", "height", "weight")
    ]
    if any(missing_fields):
        try:
            user_only = [h for h in history if isinstance(h, str) and h.startswith("User:")]
            extraction_prompt = (
                "Extract patient demographic details from this Ayurvedic intake chat. "
                "Return ONLY JSON with keys: name, age, gender, height, weight. "
                "Use the person's real name only if clearly stated — never use symptoms as the name. "
                "If unknown, use 'N/A' for that field.\n"
                f"User messages: {'; '.join(user_only[-12:])}"
            )
            ai_data = _extract_json_object(send(extraction_prompt, max_tokens=180))
            if ai_data and isinstance(ai_data, dict):
                for k in ["name", "age", "gender", "height", "weight"]:
                    val = str(ai_data.get(k, "N/A")).strip()
                    if not val or val.lower() in ("n/a", "na", "none", "unknown"):
                        continue
                    if k == "name":
                        if _looks_like_person_name(val):
                            patient_info["name"] = val
                    else:
                        patient_info[k] = val
        except Exception:
            pass

    if not _looks_like_person_name(patient_info.get("name")):
        patient_info["name"] = "Patient"

    return patient_info


def _normalize_report_type(report_type):
    aliases = {
        "diagnosis report": "Diagnosis Report",
        "root cause report": "Root Cause Report",
        "lifestyle report": "Lifestyle Report",
        "treatment plan report": "Treatment Plan Report",
        "risk report": "Risk Report",
        "risk & health score report": "Risk Report",
        "comprehensive report": "Comprehensive Report",
    }
    return aliases.get(str(report_type).strip().lower(), report_type)


def _narrative_fallback_report(
    report_type,
    title,
    symptoms,
    dosha_profile,
    is_emergency=False,
    primary_issue="",
    user_narrative="",
    clinical_threat_level="Moderate",
):
    dominant = ""
    if isinstance(dosha_profile, dict):
        dominant = dosha_profile.get("dominant", "")

    threat_level = "High" if is_emergency else (clinical_threat_level or "Moderate")
    issue_label = _clean_text(primary_issue) or (symptoms[0] if symptoms else "Presenting complaint")
    narrative_hint = _clean_text(user_narrative)[:400]

    if report_type == "Diagnosis Report":
        reasoning = (
            f"The pattern aligns with {issue_label}, interpreted through Agni (digestive fire) and "
            f"dosha dynamics ({dominant or 'mixed'} tendency). "
        )
        if narrative_hint:
            reasoning += f"The patient reports: {narrative_hint[:280]}"
        else:
            reasoning += "Clinical reasoning is grounded in the intake symptoms and daily aggravating factors shared."
        return {
            "diagnosis": {
                "name": issue_label[:120],
                "ayurvedicName": "",
                "reasoning": reasoning,
            },
            "clinicalImpression": (
                f"Based on your description of {issue_label}, the presentation suggests a doshic imbalance "
                f"rather than an isolated complaint. Agni and Vihara (daily rhythm) appear involved."
            ),
            "supportingFindings": symptoms[:4] or [issue_label],
            "doshaProfile": {
                "vata": dosha_profile.get("vata", 34) if isinstance(dosha_profile, dict) else 34,
                "pitta": dosha_profile.get("pitta", 33) if isinstance(dosha_profile, dict) else 33,
                "kapha": dosha_profile.get("kapha", 33) if isinstance(dosha_profile, dict) else 33,
                "dominant": dominant or "Mixed",
                "interpretation": "This pattern should be interpreted in the context of the full symptom history."
            },
            "threatLevel": threat_level,
            "symptomsReported": symptoms[:6]
        }

    if report_type == "Root Cause Report":
        content = (
            f"For {issue_label}, Ayurveda often traces worsening to disturbed Agni, accumulating Ama (metabolic residue), "
            f"and aggravation of the dominant dosha ({dominant or 'mixed'}). "
        )
        if narrative_hint:
            content += f"Your own account — {narrative_hint[:320]} — helps explain when and how symptoms intensify."
        else:
            content += "Repeated lifestyle or dietary strain likely layered on top of an underlying constitutional tendency."
        return {
            "content": content,
            "technical_notes": "Samprapti (disease pathogenesis): Agni vitiation → Ama → doshic overflow into symptom expression.",
        }

    sym_hint = ""
    if symptoms:
        sym_hint = f" Based on what you reported ({', '.join(symptoms[:6])}), adjust pace if symptoms flare."

    if report_type == "Lifestyle Report":
        steps = [
            "Morning: warm water upon waking; 10–15 minutes gentle movement (walking, joint rotations) before heavy work.",
            "Midday: eat your largest meal when hunger is strongest; avoid eating while stressed or multitasking.",
            "Evening: lighter, warm, cooked dinner; reduce cold drinks and heavy fried foods after sunset.",
            "Night: fixed sleep window; dim lights and avoid intense screens 60–90 minutes before bed.",
            "Weekly: one rest half-day with minimal stimulation to support recovery and Ojas (vitality).",
        ]
        night_blob = " ".join([narrative_hint.lower(), " ".join(s.lower() for s in symptoms)])
        if any(k in night_blob for k in ("sleep", "night", "insomnia", "bed")):
            steps.append(
                "Because symptoms worsen when you try to sleep: finish dinner by early evening, "
                "warm foot soak, and avoid screens 60 minutes before bed (Nidra support)."
            )
        elif any("sleep" in s or "insomnia" in s for s in [x.lower() for x in symptoms]):
            steps.append("Prioritize earlier dinner and warm foot soak before bed if sleep is disturbed.")
        if any("digest" in s or "bloat" in s or "acid" in s for s in [x.lower() for x in symptoms]):
            steps.append("Chew slowly; sip warm ginger water 20 minutes before meals to support Agni (digestive fire).")
        return {
            "content": (
                "These lifestyle changes are tailored to your intake symptoms and dominant dosha tendency. "
                "Consistency matters more than intensity — small daily shifts support digestion (Agni) and long-term balance."
                + sym_hint
            ),
            "routine_steps": steps,
            "timeline": {
                "morning": "Warm water on waking — rekindles Agni after sleep",
                "afternoon": "Largest meal at midday — supports steady blood sugar",
                "evening": "Light dinner before sunset — eases Pitta/Vata load",
                "night": "Same sleep window nightly — anchors Ojas and recovery",
            },
        }

    if report_type == "Treatment Plan Report":
        remedies = [
            "Diet (Ahara): favor warm, freshly cooked meals; reduce ice-cold drinks and leftover heavy foods.",
            "Hydration: room-temperature or warm fluids through the day; avoid chugging large volumes with meals.",
            "Daily rhythm (Vihara): align meals and sleep at consistent times to pacify aggravated dosha.",
            "Herbs (Aushadhi): discuss classical formulations only with your Ayurvedic practitioner after medication review.",
        ]
        if symptoms:
            remedies.insert(
                0,
                f"Primary focus for your presentation ({', '.join(symptoms[:4])}): gentle pacification before strong detox.",
            )
        plan_body = (
            f"This therapeutic plan addresses {issue_label} by calming the current aggravation, "
            "restoring Agni (digestive fire), then rebuilding Ojas (vitality). "
        )
        if narrative_hint:
            plan_body += (
                f"Based on what you shared — {narrative_hint[:240]} — evening routine and sleep hygiene "
                "are prioritized alongside diet."
            )
        else:
            plan_body += "Food and routine are the foundation; herbs supplement — not replace — clinical care."
        return {
            "content": plan_body + sym_hint,
            "remedies": remedies,
        }

    if report_type == "Risk Report":
        return {
            "content": (
                "The present picture appears manageable but persistent enough to deserve follow-through. "
                "Recovery is more favorable when diet, routine, and treatment are followed consistently."
            ),
            "prognosis": "Outlook improves with steady routine correction and clinician-guided care.",
            "red_flags": [
                "Rapid worsening of symptoms or new severe pain.",
                "Difficulty breathing, chest pressure, fainting, or heavy bleeding.",
                "Persistent fever, severe dehydration, or inability to keep fluids down.",
            ],
        }

    return {
        "synthesis": "Across the reports, the body appears to be signaling a pattern that links symptoms, routine, and recovery capacity.",
        "mindBodyLink": "Physical discomfort and daily stress likely reinforce one another.",
        "finalClarity": "A steady routine and individualized Ayurvedic guidance remain the clearest path forward."
    }


def _generate_specialist_report(report_type, title, persona, objective, schema, style_rules, shared_context, symptoms, dosha_profile, evidence_ids=None):
    from rag_cache import make_cache_key, specialist_cache

    _spec_key = make_cache_key(report_type, shared_context[:400], ",".join(str(s) for s in symptoms[:5]))
    _cached = specialist_cache.get(_spec_key)
    if _cached is not None:
        _logger.debug("Specialist cache hit: %s", report_type)
        return _cached

    prompt = (
        "You are writing ONE section of an AyurCare clinical dossier as part of the Trividha Pariksha assessment.\n"
        f"Specialist role: {persona}\n"
        f"Report type: {report_type}\n"
        f"Section title: {title}\n"
        f"Primary objective: {objective}\n\n"
        f"{shared_context}\n\n"
        "WRITING RULES:\n"
        "- Write this as an independent specialist pass, not as part of a master template.\n"
        "- Use both common terms and Ayurvedic equivalents where relevant (e.g., 'Metabolism/Agni', 'Body Constitution/Prakriti').\n"
        "- Frame analysis around the three Doshas (Vata, Pitta, Kapha) where appropriate.\n"
        "- Do not use tables, matrices, scorecards, or checklist formatting inside the prose.\n"
        "- Do not sound repetitive or generic.\n"
        "- Assume other specialists will cover other domains; stay tightly focused on your own lens.\n"
        "- Use natural clinical language and complete sentences.\n"
        "- Use Ayurvedic terms only when they improve clarity — always pair them with their common equivalent.\n"
        f"{style_rules}\n\n"
        "Return ONLY valid JSON with this exact top-level shape:\n"
        "{\n"
        f'  "reportType": "{report_type}",\n'
        f'  "title": "{title}",\n'
        f'  "reportData": {schema}\n'
        "}\n"
    )

    report_obj = _extract_json_object(send(prompt, max_tokens=1100))
    if isinstance(report_obj, dict):
        # Normalize report type
        report_obj["reportType"] = _normalize_report_type(report_obj.get("reportType", report_type))
        report_obj["title"] = report_obj.get("title") or title

        # LENIENT CHECK: If the AI flattened the object (didn't use "reportData" key)
        # we treat the whole object (minus meta keys) as reportData.
        if "reportData" not in report_obj or not isinstance(report_obj["reportData"], dict):
            # Extract everything except our meta keys into reportData
            meta_keys = {"reportType", "title", "reportData"}
            report_data = {k: v for k, v in report_obj.items() if k not in meta_keys}
            report_obj["reportData"] = report_data

        specialist_cache.put(_spec_key, report_obj)
        return report_obj

    result = {
        "reportType": report_type,
        "title": title,
        "reportData": _narrative_fallback_report(report_type, title, symptoms, dosha_profile)
    }
    specialist_cache.put(_spec_key, result)
    return result


def _clean_text(value, default=""):
    if isinstance(value, str):
        cleaned = re.sub(r"\s+", " ", value).strip()
        return cleaned if cleaned else default
    return default


def _listify_strings(value, max_items=8):
    items = []
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        chunks = re.split(r"[\n,;]+", value)
        items = [c.strip() for c in chunks if c.strip()]

    clean = []
    seen = set()
    for item in items:
        text = _clean_text(str(item).lstrip("-• ").strip())
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        clean.append(text)
        if len(clean) >= max_items:
            break
    return clean


def _normalize_kpis(value, max_items=6):
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        if not isinstance(item, dict):
            continue
        label = _clean_text(item.get("label"))
        kpi_value = _clean_text(item.get("value"))
        if not label or not kpi_value:
            continue
        out.append({"label": label, "value": kpi_value})
        if len(out) >= max_items:
            break
    return out


def _normalize_specialist_report(
    report_type,
    title,
    report_obj,
    symptoms,
    dosha_profile,
    primary_issue="",
    user_narrative="",
    is_emergency=False,
    clinical_threat_level="Moderate",
):
    symptoms = sanitize_symptoms(symptoms)
    if is_emergency:
        clinical_threat_level = "High"
    fallback = _narrative_fallback_report(
        report_type,
        title,
        symptoms,
        dosha_profile,
        is_emergency=is_emergency,
        primary_issue=primary_issue,
        user_narrative=user_narrative,
        clinical_threat_level=clinical_threat_level,
    )
    src = {}
    if isinstance(report_obj, dict) and isinstance(report_obj.get("reportData"), dict):
        src = report_obj.get("reportData")

    if report_type == "Diagnosis Report":
        diagnosis_src = src.get("diagnosis") if isinstance(src.get("diagnosis"), dict) else {}
        diagnosis_fb = fallback.get("diagnosis") if isinstance(fallback.get("diagnosis"), dict) else {}
        report_data = {
            "kpis": _normalize_kpis(src.get("kpis")) or _normalize_kpis(fallback.get("kpis")),
            "pain_points": sanitize_symptoms(_listify_strings(src.get("pain_points")) or _listify_strings(fallback.get("pain_points"))),
            "diagnosis": {
                "name": _clean_text(diagnosis_src.get("name"), _clean_text(diagnosis_fb.get("name"), "Ayurvedic Clinical Impression")),
                "ayurvedicName": _clean_text(
                    diagnosis_src.get("ayurvedicName") or diagnosis_src.get("ayurvedic_name") or diagnosis_src.get("sanskritName"),
                    _clean_text(diagnosis_fb.get("ayurvedicName") or diagnosis_fb.get("ayurvedic_name"), ""),
                ),
                "reasoning": _clean_text(diagnosis_src.get("reasoning"), _clean_text(diagnosis_fb.get("reasoning"), "Clinical reasoning based on symptom pattern and dosha tendency.")),
            },
            "clinicalImpression": _clean_text(src.get("clinicalImpression"), _clean_text(fallback.get("clinicalImpression"))),
            "supportingFindings": sanitize_symptoms(_listify_strings(src.get("supportingFindings")) or _listify_strings(fallback.get("supportingFindings"))),
            "doshaProfile": src.get("doshaProfile") if isinstance(src.get("doshaProfile"), dict) else fallback.get("doshaProfile"),
            "threatLevel": _clean_text(src.get("threatLevel"), _clean_text(fallback.get("threatLevel"), clinical_threat_level)),
            "symptomsReported": sanitize_symptoms(_listify_strings(src.get("symptomsReported")) or _listify_strings(fallback.get("symptomsReported"))),
        }
        resolved_threat = _canonical_threat_level(report_data.get("threatLevel")) or clinical_threat_level
        if is_emergency:
            resolved_threat = "High"
        report_data["threatLevel"] = resolved_threat
        report_data["kpis"] = _align_risk_kpis(report_data.get("kpis"), resolved_threat)
        return {"reportType": report_type, "title": title, "reportData": report_data}

    # Specialist reports might have data nested in 'reportData' or at the top level
    src_data = src.get("reportData", {}) if isinstance(src.get("reportData"), dict) else src

    fb_rich = _narrative_fallback_report(
        report_type,
        title,
        symptoms,
        dosha_profile,
        primary_issue=primary_issue,
        user_narrative=user_narrative,
    )
    default_content = _clean_text(fb_rich.get("content"), "Clinical assessment for this patient.")
    report_data = {
        "content": _clean_text(
            src_data.get("content") or src_data.get("section1_content") or src_data.get("analysis") or src_data.get("narrative"),
            default_content,
        ),
    }
    if len(report_data["content"]) < 80:
        report_data["content"] = default_content

    if report_type == "Diagnosis Report":
        report_data.update({
            "diagnosis": src_data.get("diagnosis", {}),
            "clinicalImpression": _clean_text(src_data.get("clinicalImpression") or src_data.get("clinical_impression")),
            "supportingFindings": _listify_strings(src_data.get("supportingFindings") or src_data.get("supporting_findings")),
            "doshaProfile": src_data.get("doshaProfile") or src_data.get("dosha_profile", {}),
            "threatLevel": _clean_text(src_data.get("threatLevel") or src_data.get("threat_level"), "MODERATE"),
            "kpis": _normalize_kpis(src_data.get("kpis") or src_data.get("master_kpis")),
            "pain_points": _listify_strings(src_data.get("pain_points") or src_data.get("master_pain_points")),
        })
    elif report_type == "Root Cause Report":
        report_data["technical_notes"] = _clean_text(src_data.get("technical_notes") or src_data.get("technicalNotes") or src_data.get("pathology_notes"))
        if not report_data["technical_notes"]:
            fb = _narrative_fallback_report(
                report_type, title, symptoms, dosha_profile,
                primary_issue=primary_issue, user_narrative=user_narrative,
            )
            report_data["technical_notes"] = _clean_text(fb.get("technical_notes"))
    elif report_type == "Lifestyle Report":
        report_data["routine_steps"] = _listify_strings(src_data.get("routine_steps") or src_data.get("routineSteps") or src_data.get("lifestyle_steps"), max_items=8)
        if not report_data["routine_steps"]:
            fb = _narrative_fallback_report(
                report_type, title, symptoms, dosha_profile,
                primary_issue=primary_issue, user_narrative=user_narrative,
            )
            report_data["routine_steps"] = _listify_strings(fb.get("routine_steps"), max_items=8)
        fb_timeline = fb_rich.get("timeline") if isinstance(fb_rich.get("timeline"), dict) else {}
        report_data["timeline"] = src_data.get("timeline") or fb_timeline or {
            "morning": "Warm hydration and gentle movement after waking.",
            "afternoon": "Main meal at peak hunger; avoid skipping lunch.",
            "evening": "Light, warm dinner; reduce stimulation after sunset.",
            "night": "Fixed sleep window; wind down 60 minutes before bed.",
        }
    elif report_type == "Treatment Plan Report":
        report_data["remedies"] = _listify_strings(src_data.get("remedies") or src_data.get("therapeutic_steps") or src_data.get("treatments"), max_items=8)
        if not report_data["remedies"]:
            fb = _narrative_fallback_report(
                report_type, title, symptoms, dosha_profile,
                primary_issue=primary_issue, user_narrative=user_narrative,
            )
            report_data["remedies"] = _listify_strings(fb.get("remedies"), max_items=8)
    elif report_type == "Risk Report":
        report_data["prognosis"] = _clean_text(src_data.get("prognosis") or src_data.get("outlook"))
        report_data["red_flags"] = _listify_strings(src_data.get("red_flags") or src_data.get("redFlags") or src_data.get("warnings"), max_items=5)
        if not report_data["red_flags"]:
            fb = _narrative_fallback_report(
                report_type, title, symptoms, dosha_profile,
                primary_issue=primary_issue, user_narrative=user_narrative,
            )
            report_data["red_flags"] = _listify_strings(fb.get("red_flags"), max_items=5)
        if not report_data["prognosis"]:
            report_data["prognosis"] = _clean_text(
                _narrative_fallback_report(
                    report_type, title, symptoms, dosha_profile,
                    primary_issue=primary_issue, user_narrative=user_narrative,
                ).get("prognosis"),
                "Outlook improves with steady routine correction and clinician-guided care.",
            )

    return {"reportType": report_type, "title": title, "reportData": report_data}


def _build_master_fallback(normalized_specialty_reports):
    by_type = {r.get("reportType"): r.get("reportData", {}) for r in normalized_specialty_reports if isinstance(r, dict)}
    diagnosis_data = by_type.get("Diagnosis Report", {})
    root_data = by_type.get("Root Cause Report", {})
    life_data = by_type.get("Lifestyle Report", {})
    tx_data = by_type.get("Treatment Plan Report", {})
    risk_data = by_type.get("Risk Report", {})

    diagnosis_name = ""
    diagnosis_obj = diagnosis_data.get("diagnosis")
    if isinstance(diagnosis_obj, dict):
        diagnosis_name = _clean_text(diagnosis_obj.get("name"))

    integrated_parts = [
        f"Principal Clinical Impression: {diagnosis_name}." if diagnosis_name else "Detailed clinical assessment performed.",
        _clean_text(diagnosis_data.get("clinicalImpression")),
        _clean_text(root_data.get("content")),
        "The metabolic and constitutional markers indicate a need for focused Ayurvedic intervention."
    ]
    integrated_synthesis = " ".join([p for p in integrated_parts if p]).strip() or "Comprehensive clinical synthesis prepared from multi-specialist assessment."

    protocol_lines = []
    for step in _listify_strings(life_data.get("routine_steps"), max_items=6):
        protocol_lines.append(f"Lifestyle: {step}")
    for remedy in _listify_strings(tx_data.get("remedies"), max_items=6):
        protocol_lines.append(f"Therapeutics: {remedy}")
    clinical_protocol = " ".join(protocol_lines).strip() or "Standardized Ayurvedic clinical protocol: Follow structured daily routine and individualized herbal support."

    master_kpis = _normalize_kpis(diagnosis_data.get("kpis"))
    if not master_kpis and diagnosis_name:
        master_kpis = [{"label": "Primary Impression", "value": diagnosis_name}]

    master_pain_points = _listify_strings(diagnosis_data.get("pain_points"), max_items=6)
    if not master_pain_points:
        master_pain_points = _listify_strings(diagnosis_data.get("supportingFindings"), max_items=6)

    return {
        "reportType": "Master Report",
        "title": "Integrated Clinical Synthesis",
        "reportData": {
            "integrated_synthesis": integrated_synthesis,
            "clinical_protocol": clinical_protocol,
            "master_kpis": master_kpis,
            "master_pain_points": master_pain_points,
        },
    }


def _normalize_master_report(master_obj, normalized_specialty_reports):
    fallback = _build_master_fallback(normalized_specialty_reports)
    src = {}
    if isinstance(master_obj, dict) and isinstance(master_obj.get("reportData"), dict):
        src = master_obj.get("reportData")

    diagnosis_entry = next(
        (r for r in (normalized_specialty_reports or []) if r.get("reportType") == "Diagnosis Report"),
        None,
    )
    diag_threat = "Moderate"
    if isinstance(diagnosis_entry, dict):
        diag_rd = diagnosis_entry.get("reportData") if isinstance(diagnosis_entry.get("reportData"), dict) else {}
        diag_threat = _canonical_threat_level(diag_rd.get("threatLevel")) or "Moderate"

    master_kpis = _normalize_kpis(src.get("master_kpis")) or fallback["reportData"]["master_kpis"]
    master_kpis = _align_risk_kpis(master_kpis, diag_threat)

    report_data = {
        "integrated_synthesis": _clean_text(src.get("integrated_synthesis"), fallback["reportData"]["integrated_synthesis"]),
        "clinical_protocol": _clean_text(src.get("clinical_protocol"), fallback["reportData"]["clinical_protocol"]),
        "master_kpis": master_kpis,
        "master_pain_points": _listify_strings(src.get("master_pain_points"), max_items=8) or fallback["reportData"]["master_pain_points"],
    }
    return {
        "reportType": "Master Report",
        "title": _clean_text(master_obj.get("title") if isinstance(master_obj, dict) else "", "Integrated Clinical Synthesis"),
        "reportData": report_data,
    }


def _ensure_six_v2_reports(all_reports, symptoms, dosha_profile):
    """Guarantee all six reports.v2 sections exist for the patient portal PDF grid."""
    titles = {
        "Diagnosis Report": "Clinical Diagnosis",
        "Root Cause Report": "Root Cause Analysis",
        "Lifestyle Report": "Lifestyle Improvement Plan",
        "Treatment Plan Report": "Treatment & Nutrition Protocol",
        "Risk Report": "Risk & Prognosis",
    }
    by_type = {}
    for r in all_reports or []:
        if isinstance(r, dict) and r.get("reportType"):
            by_type[r["reportType"]] = r

    specialty_bundle = []
    for rt, tit in titles.items():
        if rt not in by_type:
            by_type[rt] = _normalize_specialist_report(rt, tit, {}, symptoms, dosha_profile)
        specialty_bundle.append(by_type[rt])

    if "Master Report" not in by_type:
        by_type["Master Report"] = _normalize_master_report(None, specialty_bundle)

    return [
        by_type["Diagnosis Report"],
        by_type["Master Report"],
        by_type["Root Cause Report"],
        by_type["Lifestyle Report"],
        by_type["Treatment Plan Report"],
        by_type["Risk Report"],
    ]


def reset_session():
    """Reset the conversation session."""
    global session
    session = {
        "symptoms": [],
        "answers": {},
        "conversation_history": [],
        "diagnosis_complete": False,
        "confirmed_disease": None,
        "reasoning": [],
        "awaiting_final_check": False,
        "question_count": 0,
        "max_questions": 5
    }

def extract_symptoms_from_text(text):
    """Extract symptoms from user text without polluting with AI fallback phrases."""
    if not text or _is_bot_fallback_text(text):
        return []

    try:
        prompt = (
            "Extract only medical symptoms or complaints from this patient message. "
            "Return a comma-separated list of short lowercase phrases. "
            "If there are no symptoms, return exactly NONE.\n\n"
            f"Patient message: {text}"
        )
        response_text = send(prompt, max_tokens=120)
        if not response_text or _is_bot_fallback_text(response_text):
            return _local_extract_symptoms(text)
        cleaned = response_text.strip()
        if cleaned.upper() == "NONE":
            return _local_extract_symptoms(text)
        parsed = [s.strip() for s in cleaned.split(",") if s.strip()]
        return sanitize_symptoms(parsed) or _local_extract_symptoms(text)
    except Exception:
        return _local_extract_symptoms(text)


def get_current_dosha_profile(history):
    """Calculate dosha profile from conversation history."""
    all_text = " ".join(history)
    return score_sentence(all_text)

def should_give_diagnosis(symptoms, answers, history, medical_history_satisfied=None):
    """Generate reports only after explicit patient consent (or diagnose command)."""
    if _user_wants_report_finalized(history) and len(history) >= 4:
        return True

    for item in reversed(history):
        if isinstance(item, str) and item.startswith("User:"):
            if item.replace("User:", "").strip().lower() == "diagnose":
                return len(history) >= 4
            break

    mh = (
        medical_history_satisfied
        if medical_history_satisfied is not None
        else _has_medical_history(history)
    )
    if len(history) < 7 or not mh:
        return False

    return False


def profile_demographics_complete(profile):
    """True when saved user profile has enough data to skip intake demographics.
    Requires name + age + gender. Height/weight are optional — they're used in
    the report if present, but their absence should not force intake re-asking.
    """
    if not profile or not isinstance(profile, dict):
        return False
    name = str(profile.get("name") or "").strip()
    gender = str(profile.get("gender") or "").strip()
    age = profile.get("age")
    if not name or name.lower() in ("patient", "user", ""):
        return False
    if not gender or gender.lower() in ("n/a", "na", "unknown", ""):
        return False
    if age is None or str(age).strip() in ("", "N/A", "n/a", "0"):
        return False
    return True


def get_next_question(
    symptoms,
    history,
    vault_reply_pending_ack=False,
    vault_already_acknowledged=False,
    patient_profile=None,
):
    """Generate next question based on current symptoms and knowledge base."""
    
    all_history_text = " ".join([h.replace("User:", "").replace("AI:", "") for h in history]).lower()
    last_user = ""
    for item in reversed(history):
        if isinstance(item, str) and item.startswith("User:"):
            last_user = item.replace("User:", "").strip()
            break

    if _user_wants_report_finalized(history) or _message_requests_report(last_user):
        if len(history) >= 4 and not _report_finalize_offer_made(history):
            return _finalize_report_offer_text(history)
        if len(history) >= 4:
            return (
                "I'm preparing your personalized Ayurvedic clinical report from what you've shared. "
                "It will appear here in a moment with download and wellness options."
            )

    # One-time urgent note; then continue intake conversationally
    if _check_emergency_symptoms(all_history_text) and not _emergency_warning_already_given(history):
        return (
            "I hear you — some of what you've described can be serious, so please seek in-person care "
            "if you feel unwell or your symptoms are worsening.---NEXT_BUBBLE---"
            "I'll stay with you here and keep this assessment calm and clear. "
            "When did this start, and what feels most uncomfortable right now?"
        )

    if _emergency_warning_already_given(history) and last_user:
        if _message_requests_report(last_user) or _user_wants_report_finalized(history):
            return (
                "Understood — I'll use what you've already shared for your clinical report. "
                "If it doesn't appear shortly, reply **Yes** once more to confirm generation."
            )
        prompt = (
            f"Patient's latest message: {last_user}\n"
            f"Conversation so far: {'; '.join(history[-6:])}\n\n"
            "You are AyurCare — warm, conversational Ayurvedic intake (not alarming). "
            "Acknowledge what they said in one short sentence. "
            "Ask ONE natural follow-up (timing, severity, diet, sleep, or stress). "
            "Do NOT repeat emergency warnings or ask if they've had symptoms before unless they brought it up. "
            "Max 45 words. No markdown."
        )
        reply = send(prompt, max_tokens=120)
        if reply and not _is_bot_fallback_text(reply):
            return reply.strip()
    
    # Logic for hard-coded phase (History length tracks User: and Bot: messages)
    
    # 1. Greeting & Basic Details (Initial Bot Message - triggered by 'START_CONVERSATION')
    if len(history) == 0:
        profile_name = str(patient_profile.get("name") or "").strip() if patient_profile else ""
        if profile_name.lower() in ("", "patient", "user"):
            profile_name = ""
        name_greeting = f", {profile_name}" if profile_name else ""
        if profile_demographics_complete(patient_profile):
            return (
                f"Namaste{name_greeting}, and welcome to AyurCare.---NEXT_BUBBLE---"
                "I am your Ayurvedic Clinical Intake Assistant, here to guide you through an initial Trividha Pariksha — "
                "a foundational assessment rooted in the timeless wisdom of Ayurveda.---NEXT_BUBBLE---"
                "I can see your profile is already complete. What is the main health concern you would like to address today?"
            )
        return (
            "Namaste, and welcome to AyurCare.---NEXT_BUBBLE---"
            "I am your Ayurvedic Clinical Intake Assistant, here to guide you through an initial Trividha Pariksha — "
            "a foundational assessment rooted in the timeless wisdom of Ayurveda.---NEXT_BUBBLE---"
            "Before we explore your health and Body Constitution (Prakriti), I would like to gather some essential information "
            "to ensure your experience is fully personalized. Let us begin gently, one step at a time.---NEXT_BUBBLE---"
            "To start, may I know your full name?"
        )

    # Check for first user message
    if len(history) == 1:
        user_first_msg = history[0].replace("User: ", "")
        if profile_demographics_complete(patient_profile):
            profile_name = str(patient_profile.get("name") or "").strip() if patient_profile else ""
            profile_context = ""
            if patient_profile:
                age = patient_profile.get("age", "")
                gender = patient_profile.get("gender", "")
                if age or gender:
                    profile_context = f" (profile on file: {gender}, {age} yrs)" if age and gender else ""
            prompt = (
                f"The patient{profile_context} has just begun their consultation by stating: '{user_first_msg}'\n\n"
                "You are the AyurCare AI Assistant — a calm, professional, and sage-like Ayurvedic clinical intake agent.\n"
                "Their demographic details (age, gender) are already saved in their profile — do NOT ask for these again.\n"
                "Respond with genuine empathy and clinical warmth. Your response must:\n"
                "1. Acknowledge what the patient shared with compassion.\n"
                "2. Briefly validate their concern through an Ayurvedic lens (use common and Ayurvedic terms, e.g. 'Metabolism/Agni').\n"
                "3. Ask them to describe their symptoms in more detail — when they started, severity, and any patterns.\n"
                "Keep the tone calm, professional, and sage-like. Maximum 70 words. "
                "End with: 'This is an AI-generated assessment based on Ayurvedic principles. Please consult with your AyurCare practitioner before starting any new regimen.'"
            )
            return send(prompt)
        # Build context from whatever partial profile data we have
        partial_ctx = ""
        if isinstance(patient_profile, dict):
            parts = []
            if patient_profile.get("age"):
                parts.append(f"age {patient_profile['age']}")
            if patient_profile.get("gender"):
                parts.append(str(patient_profile["gender"]))
            if parts:
                partial_ctx = f" (profile on file: {', '.join(parts)})"
        prompt = (
            f"The patient{partial_ctx} has just begun their consultation by stating: '{user_first_msg}'\n\n"
            "You are the AyurCare AI Assistant — a calm, professional, and sage-like Ayurvedic clinical intake agent.\n"
            "Their basic demographic details may be partially saved in their profile — do NOT ask for name, age, or gender again.\n"
            "Respond with genuine empathy and clinical warmth. Your response must:\n"
            "1. Acknowledge what the patient shared with compassion.\n"
            "2. Briefly validate their concern through an Ayurvedic lens (use both common and Ayurvedic terms, e.g. 'Metabolism/Agni').\n"
            "3. Ask them to describe their symptoms in more detail — duration, severity, and any patterns.\n"
            "Keep the tone calm, professional, and sage-like. Maximum 70 words. "
            "End with: 'This is an AI-generated assessment based on Ayurvedic principles. Please consult with your AyurCare practitioner before starting any new regimen.'"
        )
        return send(prompt)

    # 2. Q&A MODE AFTER DIAGNOSIS
    if any("---REPORT_DATA---" in str(h) for h in history):
        report_content = next((h for h in reversed(history) if "---REPORT_DATA---" in str(h)), "")
        prompt = (
            f"You are the AyurCare AI Assistant — a calm, professional, and sage-like Ayurvedic clinical intake agent.\n"
            f"The patient has already received their Trividha Pariksha (clinical assessment) report.\n"
            f"Assessment Report Context: {report_content}\n"
            f"Recent Conversation: {history[-5:]}\n"
            f"Patient Question: {history[-1]}\n\n"
            "Answer the question based on the report and Ayurvedic principles. "
            "Use both common terms and Ayurvedic equivalents where relevant (e.g., 'Metabolism/Agni', 'Body Constitution/Prakriti'). "
            "Frame your answer around the three Doshas (Vata, Pitta, Kapha) where appropriate. "
            "Be compassionate, clear, and concise (3-5 lines). "
            "If the patient asks about life-threatening concerns, reassure them with warmth while emphasizing the importance "
            "of following the treatment plan and consulting their AyurCare practitioner. "
            "Do not prescribe new specific medications. "
            "End your response with: 'This is an AI-generated assessment based on Ayurvedic principles. "
            "Please consult with your AyurCare practitioner before starting any new regimen.'"
        )
        return send(prompt)

    # User just answered the Health Vault question — advance to report offer (skip LLM follow-ups)
    if vault_reply_pending_ack:
        return _finalize_report_offer_text(history)

    if (
        intake_medical_history_satisfied(
            history,
            vault_reply_pending_ack=False,
            vault_already_acknowledged=vault_already_acknowledged,
        )
        and not _report_finalize_offer_made(history)
    ):
        return _finalize_report_offer_text(history)

    # Check for missing demographics — use profile data where available, ask only for gaps
    if not profile_demographics_complete(patient_profile):
        has_profile = isinstance(patient_profile, dict) and any(
            patient_profile.get(k) for k in ("name", "age", "gender")
        )
        if not _has_height_weight(history):
            if not _has_basic_details(history):
                if has_profile:
                    # Partial profile — only ask for what's genuinely missing
                    missing = []
                    if not str(patient_profile.get("height") or "").strip():
                        missing.append("Height (e.g. 170 cm)")
                    if not str(patient_profile.get("weight") or "").strip():
                        missing.append("Weight (e.g. 70 kg)")
                    if missing:
                        return (
                            "I have your profile on file. To complete your assessment I just need: "
                            + " and ".join(missing)
                            + ". You can also save these on your dashboard under Body profile."
                        )
                return (
                    "To conduct your Trividha Pariksha accurately, I will need a few essential details. "
                    "Could you please share your Name, Age, Gender, Height, and Weight? "
                    "Height and Weight allow me to assess your physical frame (Deha Prakriti) and calculate your BMI. "
                    "You can also save these on your AyurCare dashboard under Body profile to skip this step next time."
                )
            return (
                "Thank you for sharing that. To complete your intake assessment, I still need your Height and Weight. "
                "Please provide: Height (e.g., 170 cm or 5'7\") and Weight (e.g., 70 kg or 154 lbs)."
            )

    # Mandatory: Check for medical history / lab reports (once)
    if not intake_medical_history_satisfied(
        history,
        vault_reply_pending_ack=vault_reply_pending_ack,
        vault_already_acknowledged=vault_already_acknowledged,
    ):
        return (
            "Thank you. One more important step before we proceed — "
            "do you have any previous medical records or lab reports? "
            "If so, please upload them to your Health Vault so I can provide a fully personalized analysis. "
            "If not, simply reply **No** or **I don't have any records** and we will continue with what you've shared."
        )

    if profile_demographics_complete(patient_profile) and intake_medical_history_satisfied(
        history,
        vault_reply_pending_ack=vault_reply_pending_ack,
        vault_already_acknowledged=vault_already_acknowledged,
    ):
        prakriti = patient_profile.get("prakritiProfile") if isinstance(patient_profile, dict) else None
        if isinstance(prakriti, dict) and prakriti.get("dominant"):
            dom = str(prakriti.get("dominant") or "").strip()
            if dom and not any(
                "saved prakriti profile" in str(m.get("content", "")).lower()
                for m in history[-10:]
                if isinstance(m, dict) and m.get("role") == "assistant"
            ):
                v, p, k = prakriti.get("vata"), prakriti.get("pitta"), prakriti.get("kapha")
                pct = f" (Vata {v}%, Pitta {p}%, Kapha {k}%)" if all(x is not None for x in (v, p, k)) else ""
                return (
                    f"I have your saved Prakriti profile — dominant tendency: **{dom}**{pct}. "
                    "I'll use this alongside your symptoms. What is the main health concern you'd like to address today?"
                )

    # After vault step: offer to finalize report before more follow-ups
    if intake_medical_history_satisfied(
        history,
        vault_reply_pending_ack=vault_reply_pending_ack,
        vault_already_acknowledged=vault_already_acknowledged,
    ) and not _report_finalize_offer_made(history):
        return _finalize_report_offer_text(history)

    # Main Issue (after user gives details via legacy flow)
    if len(history) == 2:
        return "Thank you. Now, please describe exactly what health issue or symptoms you are experiencing today in as much detail as possible."

    # --- AI INVOLVED AFTER THIS POINT ---
    
    # Safety Check: If we somehow get here after 10 messages, ask for consent to generate report
    if len(history) >= 10 and not _report_finalize_offer_made(history):
        return (
            "I have gathered enough information for a preliminary assessment.---NEXT_BUBBLE---"
            "Would you like me to finalize your personalized Ayurvedic clinical report now? Reply **Yes** or **No**."
        )

    if _intake_followups_complete(history) and not _report_finalize_offer_made(history):
        return _finalize_report_offer_text(history)

    structured_next = _pick_unasked_followup(history)
    if structured_next:
        return structured_next

    # Use faster model for simple follow-up questions (reduce latency)
    dosha_profile = get_current_dosha_profile(history)
    candidates = get_candidates(symptoms, dosha_profile=dosha_profile, top_n=2)
    
    context = ""
    if candidates:
        context = "Potentially matching conditions from books:\n"
        for c in candidates:
            rec = c.get('record', {})
            symptom_text = rec.get('symptoms', '') if isinstance(rec, dict) else ""
            context += f"- {symptom_text}\n"

    primary_issue = _first_user_issue(history)
    prompt = (
        f"Symptoms: {', '.join(symptoms)}\n"
        f"Knowledge Context: {context}\n"
        f"History: {'; '.join(history)}\n\n"
        f"The patient's primary stated concern: {primary_issue}\n\n"
        "You are the AyurCare AI Assistant — a calm, professional, and sage-like Ayurvedic clinical intake agent.\n"
        "Ask ONE short, specific clinical follow-up question to identify the ROOT CAUSE through the lens of Ama (toxin accumulation) and Dosha imbalance.\n"
        "Use both common terms and Ayurvedic equivalents where helpful (e.g., 'Metabolism/Agni', 'Body Constitution/Prakriti').\n"
        "Frame your question around the three Doshas (Vata, Pitta, Kapha) where appropriate.\n"
        "Prioritize asking about one of these at a time:\n"
        "1. TIME: Does it happen at a specific time of day (morning/afternoon/evening)?\n"
        "2. QUALITIES: Does it feel like burning (Pitta/excess heat), cramping (Vata/air imbalance), or heaviness/pressure (Kapha/sluggishness)?\n"
        "3. RELIEF: Is it better with warmth (hot tea, warm compress) or cold (ice pack, cold water)?\n"
        "4. TRIGGERS: Does eating spicy, oily, or specific foods trigger it? How is your Ahara (diet) and Vihara (daily routine)?\n"
        "DO NOT repeat a question already asked in History. Return ONLY the question.\n"
        "Ask only 1 question at a time. Be specific and focused on clinical differentiation.\n"
        "If symptoms are vague, ask about Ahara (diet) or Vihara (lifestyle) before drawing conclusions."
    )

    # Enough intake for report — avoid more repetitive LLM loops
    user_turns = sum(1 for h in history if isinstance(h, str) and h.startswith("User:"))
    if user_turns >= 6 and intake_medical_history_satisfied(
        history,
        vault_reply_pending_ack=vault_reply_pending_ack,
        vault_already_acknowledged=vault_already_acknowledged,
    ):
        if not _report_finalize_offer_made(history):
            return _finalize_report_offer_text(history)

    # Use faster model with fewer tokens for follow-up questions (reduce latency)
    response = send(prompt, max_tokens=100)
    if not response or len(response) < 5 or _is_bot_fallback_text(response):
        alt = _pick_unasked_followup(history)
        return alt or _finalize_report_offer_text(history)

    if _bot_reply_repeats_history(history, response) or _question_topic_already_answered(history, response):
        alt = _pick_unasked_followup(history)
        if alt:
            return alt
        if intake_medical_history_satisfied(
            history,
            vault_reply_pending_ack=vault_reply_pending_ack,
            vault_already_acknowledged=vault_already_acknowledged,
        ) and not _report_finalize_offer_made(history):
            return _finalize_report_offer_text(history)
        if _intake_followups_complete(history) and not _report_finalize_offer_made(history):
            return _finalize_report_offer_text(history)
        if intake_medical_history_satisfied(
            history,
            vault_reply_pending_ack=vault_reply_pending_ack,
            vault_already_acknowledged=vault_already_acknowledged,
        ):
            return _finalize_report_offer_text(history)
        alt = _pick_unasked_followup(history)
        return alt or _finalize_report_offer_text(history)

    return response


def count_recipe_blocks(text):
    """Count structured recipe blocks in wellness plan text."""
    if not text:
        return 0
    count = 0
    for block in str(text).split("---RECIPE---"):
        block = block.strip()
        if not block:
            continue
        low = block.lower()
        if "title:" in low or "ingredients:" in low:
            count += 1
    return count


def _split_recipe_blocks(text):
    blocks = []
    for block in str(text or "").split("---RECIPE---"):
        block = block.strip()
        if not block:
            continue
        low = block.lower()
        if "title:" in low or "ingredients:" in low:
            blocks.append(block)
    return blocks


def _ensure_three_recipes(text, diagnosis_label, patient_info, symptoms=None):
    """Always return exactly three distinct recipe blocks for the wellness UI."""
    blocks = _split_recipe_blocks(text)
    fallback_body = _structured_wellness_fallback(diagnosis_label, patient_info, symptoms)
    fallback_blocks = _split_recipe_blocks(fallback_body)

    seen = set()
    merged = []
    for block in blocks + fallback_blocks:
        m = re.search(r"title:\s*(.+)", block, re.I)
        key = (m.group(1).strip().lower()[:48] if m else block[:48].lower())
        if key in seen:
            continue
        seen.add(key)
        merged.append(block)
        if len(merged) >= 3:
            break

    intro = ""
    raw = str(text or "")
    if "---RECIPE---" in raw:
        pre = raw.split("---RECIPE---", 1)[0].strip()
        if pre and "title:" not in pre.lower()[:80]:
            intro = pre + "\n\n"

    while len(merged) < 3 and fallback_blocks:
        for block in fallback_blocks:
            m = re.search(r"title:\s*(.+)", block, re.I)
            key = (m.group(1).strip().lower()[:48] if m else block[:48].lower())
            if key in seen:
                continue
            seen.add(key)
            merged.append(block)
            if len(merged) >= 3:
                break
        break

    body = "\n\n---RECIPE---\n".join(merged[:3])
    return (intro + "---RECIPE---\n" + body).strip()


def _extract_user_clinical_narrative(history, max_chars=2400):
    """Pull the patient's own words from chat for personalized reports."""
    lines = []
    skip = frozenset({"yes", "no", "ok", "okay", "yep", "nope", "none", "diagnose", "thanks"})
    for item in history or []:
        if not isinstance(item, str) or not item.startswith("User:"):
            continue
        text = item.replace("User:", "").strip()
        if not text or len(text) < 3:
            continue
        norm = text.lower().rstrip(".!")
        if norm in skip:
            continue
        lines.append(text)
    blob = "\n".join(lines[-18:])
    return blob[:max_chars]


def _extract_diagnosis_context_for_recipes(diagnosis_text):
    """
    Parse embedded ---REPORT_DATA--- JSON and return (clinical_label, narrative_context_for_prompt).
    """
    diagnosis_label = ""
    lines = []
    if diagnosis_text is None or not str(diagnosis_text).strip():
        return diagnosis_label, ""

    raw = str(diagnosis_text)
    tail = raw.split("---REPORT_DATA---")[-1] if "---REPORT_DATA---" in raw else raw
    payload = _extract_json_object(tail)

    if not isinstance(payload, dict):
        return diagnosis_label, ""

    reports = payload.get("reports")
    if not isinstance(reports, list):
        reports = []

    for report in reports:
        if not isinstance(report, dict):
            continue
        if report.get("reportType") != "Diagnosis Report":
            continue

        rd = report.get("reportData") if isinstance(report.get("reportData"), dict) else {}
        diag = rd.get("diagnosis") if isinstance(rd.get("diagnosis"), dict) else {}

        name = _clean_text(diag.get("name"), "")
        ayur = _clean_text(
            diag.get("ayurvedicName") or diag.get("ayurvedic_name") or diag.get("sanskritName"),
            "",
        )
        if name and ayur:
            diagnosis_label = f"{name} ({ayur})"
        elif name:
            diagnosis_label = name
        elif ayur:
            diagnosis_label = ayur

        reasoning = _clean_text(diag.get("reasoning"), "")
        if reasoning:
            lines.append(f"Diagnostic reasoning: {reasoning[:900]}")

        ci = _clean_text(rd.get("clinicalImpression"), "")
        if ci:
            lines.append(f"Clinical impression: {ci[:650]}")

        dosha = rd.get("doshaProfile") if isinstance(rd.get("doshaProfile"), dict) else {}
        dom = _clean_text(dosha.get("dominant"), "")
        interp = _clean_text(dosha.get("interpretation"), "")
        if dom or interp:
            dose_line = " ".join(
                p for p in (
                    f"Dominant dosha tendency: {dom}" if dom else "",
                    interp[:420] if interp else "",
                )
                if p
            )
            lines.append(dose_line)

        for key, label in (
            ("pain_points", "Symptom themes"),
            ("supportingFindings", "Supporting findings"),
            ("symptomsReported", "Reported symptoms"),
        ):
            chunk = rd.get(key)
            if isinstance(chunk, list) and chunk:
                joined = "; ".join(_clean_text(x, "") for x in chunk[:10] if x)
                if joined:
                    lines.append(f"{label}: {joined[:720]}")
        break

    return diagnosis_label, "\n".join(lines).strip()


def _pathya_snippets_from_kb(symptoms, diagnosis_label, dosha_profile):
    """Ayurvedic textbook snippets so recipes follow pathya aligned with the condition."""
    sq = list(symptoms or [])
    if diagnosis_label:
        sq.append(str(diagnosis_label)[:280])
    snippets = []
    try:
        candidates = get_candidates(sq, dosha_profile=dosha_profile, top_n=4)
        for c in candidates or []:
            if not isinstance(c, dict):
                continue
            rec = c.get("record") or {}
            cid = _clean_text(c.get("id"), "Condition")
            treat = _clean_text(rec.get("treatment"), "")
            sym_txt = _clean_text(rec.get("symptoms"), "")
            if treat:
                snippets.append(f"[{cid}] Pathya / care from texts: {treat[:480]}")
            elif sym_txt:
                snippets.append(f"[{cid}] Symptom pattern in texts: {sym_txt[:380]}")
    except Exception:
        pass
    try:
        ctx_result = get_semantic_context(sq[:10], top_k=4)
        ctx = ctx_result["context"] if isinstance(ctx_result, dict) else str(ctx_result)
        if ctx and str(ctx).strip():
            snippets.append(f"Textbook excerpts:\n{str(ctx)[:1700]}")
    except Exception:
        pass
    return "\n".join(snippets).strip()


def _fallback_digestive_recipes():
    return """---RECIPE---
Title: Warm Digestive Khichdi
Ingredients:
- 1/2 cup split moong dal
- 1/2 cup white basmati rice
- 1 tsp cumin, pinch turmeric, fresh ginger
- Ghee, rock salt, warm water
Preparation:
1. Rinse rice and dal; sauté spices in ghee.
2. Add grains and 4 cups water; simmer until soft.
3. Serve warm with a few drops of lime if tolerated.
When to take: Lunch or early dinner while symptoms are active.
Benefits: Easy to digest; supports Agni (digestive fire) during recovery.
Precautions: Avoid cold drinks and heavy fried food on the same day.

---RECIPE---
Title: Ginger–Honey Soothing Tea
Ingredients:
- 1 cup hot water
- 1/2 tsp fresh grated ginger
- 1/2 tsp raw honey (added after cooling slightly)
Preparation:
1. Steep ginger in hot water for 5–7 minutes.
2. Strain, cool to warm, then stir in honey.
When to take: Mid-morning and early evening.
Benefits: Warms digestion and supports respiratory comfort.
Precautions: Skip honey if you have high Pitta heat or diabetes unless approved by your practitioner.

---RECIPE---
Title: Turmeric Golden Milk
Ingredients:
- 1 cup warm milk (dairy or oat)
- 1/4 tsp turmeric, pinch black pepper
- 1/4 tsp cinnamon, 1 tsp ghee
Preparation:
1. Warm milk with spices and ghee; do not boil vigorously.
2. Whisk until smooth and drink warm.
When to take: 30–45 minutes before bed.
Benefits: Anti-inflammatory evening tonic for restorative sleep.
Precautions: Reduce turmeric if you experience acid reflux."""


def _fallback_respiratory_recipes():
    return """---RECIPE---
Title: Tulsi–Pippali Warm Decoction
Ingredients:
- 1 cup water
- 4–5 fresh tulsi (holy basil) leaves (or 1/2 tsp dried)
- 2–3 long pepper (pippali) corns, lightly crushed
- 1/4 tsp dry ginger powder
- 1 tsp raw honey (add after cooling to warm)
Preparation:
1. Simmer water with tulsi, pippali, and ginger for 6–8 minutes.
2. Strain; cool until drinkable warm, then stir in honey.
When to take: Morning empty stomach and mid-afternoon while congestion or Kapha heaviness is present.
Benefits: Opens respiratory channels (Prana-vaha srotas), supports expectoration and soothes irritated mucosa for cough–cold patterns.
Precautions: Reduce heat spices if there is high fever with burning thirst (Pitta dominance); diabetics use honey only if approved.

---RECIPE---
Title: Pepper–Cumin Digestive Rasam (Light Soup)
Ingredients:
- 1 cup dilute tamarind extract or 1 tsp lime juice in water
- 1/4 tsp black pepper, 1/2 tsp cumin, pinch asafoetida (hing), curry leaves
- 1 tsp ghee, rock salt, fresh coriander (optional)
Preparation:
1. Warm ghee; crack cumin, pepper, hing, curry leaves.
2. Add dilute sour base; simmer 5 minutes; finish with coriander.
When to take: With lunch when appetite is low during respiratory illness or post-fever recovery.
Benefits: Deepana–pachana (kindles Agni) without heaviness — suited when respiratory illness dulls digestion (Ama risk).
Precautions: Skip or reduce tamarind if strong acid reflux; hing may not suit some sensitive stomachs.

---RECIPE---
Title: Licorice–Turmeric Soothing Drink (Yashtimadhu variant)
Ingredients:
- 1 cup warm water or milk (plant milk if dairy aggravates)
- 1/4 tsp licorice root powder (yashtimadhu) OR one small stick steeped and removed
- 1/8 tsp turmeric, pinch black pepper, 1 tsp ghee
Preparation:
1. Warm liquid with spices and ghee; steep licorice gently 5 minutes if using powder (strain if gritty).
2. Drink warm, not boiling hot.
When to take: Evening after dinner or before bed when throat is dry or irritated from coughing.
Benefits: Snigdha (unctuous) and soothing for Shleshaka/Kapha throat irritation with Vata dryness of respiratory passages.
Precautions: Avoid prolonged daily licorice use if you have high blood pressure; omit licorice in pregnancy unless practitioner approves."""


def _fallback_sleep_recipes():
    return """---RECIPE---
Title: Ashwagandha–Warm Milk (Nidra-support)
Ingredients:
- 1 cup warm milk (dairy or almond)
- 1/4 tsp ashwagandha powder
- Pinch nutmeg, 1/8 tsp cardamom, 1 tsp ghee
Preparation:
1. Warm milk with spices and ghee; whisk in ashwagandha off the boil.
2. Drink at a comfortable warm temperature.
When to take: 45–60 minutes before bed on nights with anxiety or light sleep.
Benefits: Brings Vata–Pitta down toward rest (Nidra); supports nervous system grounding when stress disturbs sleep.
Precautions: Avoid large doses of ashwagandha in pregnancy unless your practitioner approves.

---RECIPE---
Title: Brahmi–Jatamansi Calming Tea
Ingredients:
- 1 cup water
- 1/2 tsp dried brahmi (or 1 tsp fresh leaves)
- Pinch jatamansi powder (optional)
- 1 tsp honey after cooling to warm
Preparation:
1. Simmer water with herbs 5–7 minutes, strain.
2. Cool to warm; add honey if tolerated.
When to take: Early evening when mind is racing or sleep onset is delayed.
Benefits: Medhya (intellect-calming) herbs for Manovaha srotas imbalance linked to anxiety and insomnia.
Precautions: Skip jatamansi if you are on sedative medications without medical advice.

---RECIPE---
Title: Light Sattvic Supper Khichdi (Evening)
Ingredients:
- 1/3 cup moong dal, 1/3 cup rice, cumin, fennel, ghee, rock salt
Preparation:
1. Cook soft khichdi with extra water for a light consistency.
2. Serve warm with minimal spice.
When to take: Before 7:30 pm when heavy dinner worsens sleep quality.
Benefits: Laghu (light) evening meal reduces Ama and Kapha heaviness that blocks restorative sleep.
Precautions: Avoid late heavy meals or caffeine after 2 pm on the same day."""


def _fallback_joint_recipes():
    return """---RECIPE---
Title: Turmeric–Ginger Anti-inflammatory Golden Paste Drink
Ingredients:
- 1 cup warm water or milk
- 1/2 tsp turmeric, 1/4 tsp dry ginger, pinch black pepper, 1 tsp ghee
Preparation:
1. Warm liquid with spices and ghee; whisk smooth.
2. Drink warm, not boiling.
When to take: Morning empty stomach or mid-morning during joint stiffness peaks.
Benefits: Supports Shothahara (anti-inflammatory) care for Amavata/sandhivata-type joint pain with Vata–Kapha involvement.
Precautions: Reduce ginger if you have active gastric ulcer or burning Pitta symptoms.

---RECIPE---
Title: Castor-Oil Seasoned Mung Khichdi (Vata joint care)
Ingredients:
- 1/2 cup split moong, 1/2 cup rice, cumin, asafoetida, ghee, 1/2 tsp castor oil stirred in at end
Preparation:
1. Cook soft khichdi; finish with ghee and a small amount of warm castor oil.
2. Serve hot.
When to take: Lunch on days with stiffness and constipation together.
Benefits: Snigdha (unctuous) diet pacifies Vata in Asthi–Majja channels when dryness worsens joint pain.
Precautions: Use castor oil only in small amounts; avoid during acute diarrhea or pregnancy without guidance.

---RECIPE---
Title: Shallaki–Cinnamon Warm Decoction (Joint comfort tea)
Ingredients:
- 1 cup water
- 1/4 tsp cinnamon, 1/4 tsp dry ginger, optional pinch boswellia (shallaki) powder
Preparation:
1. Simmer spices 8 minutes, strain, drink warm.
When to take: Afternoon when joints feel heavy or swollen.
Benefits: Improves circulation and mild Shothahara support for chronic joint inflammation patterns.
Precautions: Boswellia may interact with some medications—confirm with your doctor if on blood thinners."""


def _fallback_skin_recipes():
    return """---RECIPE---
Title: Neem–Turmeric Detox Khichdi
Ingredients:
- 1/2 cup moong dal, 1/2 cup rice, pinch turmeric, cumin, neem leaf powder (pinch), ghee
Preparation:
1. Cook soft khichdi; add only a small pinch of neem powder at the end.
2. Serve warm with coriander garnish.
When to take: Lunch during active skin flare with itching or Kapha–Pitta dampness.
Benefits: Tikta (bitter) and cleansing support for Kushtha-type skin conditions with Ama and Pitta in Rakta.
Precautions: Neem is strong—omit if pregnant or if you feel excessive dryness or weakness.

---RECIPE---
Title: Aloe–Coconut Cooling Drink
Ingredients:
- 1/2 cup fresh aloe inner gel blended with 1 cup coconut water
- Pinch cumin powder, few mint leaves
Preparation:
1. Blend until smooth; strain if gritty; serve cool-not-ice.
When to take: Mid-morning when skin feels hot, red, or burning.
Benefits: Sheetala (cooling) for Pitta-dominant rashes, urticaria, or inflammatory dermatitis.
Precautions: Skip aloe internally if pregnant or if you have loose stools.

---RECIPE---
Title: Turmeric–Coriander Skin-Support Tea
Ingredients:
- 1 cup water, 1/4 tsp turmeric, 1 tsp coriander seed (crushed), pinch fennel
Preparation:
1. Simmer 6–8 minutes, strain, drink warm.
When to take: Evening when itching worsens at night.
Benefits: Purifies Rakta dhatu and calms Pitta–Kapha skin irritation from within.
Precautions: Avoid very hot spices if skin is purely dry-eczema without heat signs."""


def _fallback_pitta_recipes():
    return """---RECIPE---
Title: Cooling Cucumber–Mint Buttermilk (Takra)
Ingredients:
- 1 cup diluted yogurt (1:3 with water), pinch roasted cumin, mint, rock salt
Preparation:
1. Whisk yogurt water smooth; add spices and mint.
2. Serve at room temperature, not ice-cold.
When to take: With lunch when acidity, burning, or Pitta gastritis is present.
Benefits: Sheetala and Grahi for Pitta Amlapitta—soothes burning and supports Agni without excess heat.
Precautions: Skip if you have active Kapha congestion or dairy intolerance (use coconut yogurt).

---RECIPE---
Title: Shatavari–Fennel Soothing Gruel
Ingredients:
- 1/2 cup rice, 2 cups water, 1/4 tsp shatavari powder, 1/2 tsp fennel, ghee pinch
Preparation:
1. Cook to a thin porridge; stir in shatavari off heat.
When to take: Early dinner when reflux or gastric burning follows meals.
Benefits: Balya and Pitta-pacifying for inflamed gastric mucosa (Pittaja gastritis patterns).
Precautions: Reduce shatavari if Kapha congestion or mucus is dominant.

---RECIPE---
Title: Coriander–Cumin Cooling Infusion
Ingredients:
- 1 tbsp coriander seeds, 1/2 tsp cumin, 2 cups water, 1 tsp mishri (rock sugar) optional
Preparation:
1. Boil water with seeds 5 minutes; strain; drink warm or room temp.
When to take: Between meals when hunger is sharp with burning sensation.
Benefits: Deepana without Vidahi (non-burning digestive support) for Pitta-aggravated Agni.
Precautions: Avoid excess sugar in diabetes; use plain if blood sugar is uncontrolled."""


def _fallback_metabolic_recipes():
    return """---RECIPE---
Title: Bitter Gourd (Karela)–Moong Light Khichdi
Ingredients:
- 1/3 cup moong dal, 1/3 cup rice, 1/2 cup chopped bitter gourd (salted, rinsed), turmeric, fenugreek pinch, ghee
Preparation:
1. Sauté bitter gourd lightly; cook with dal and rice until soft.
When to take: Lunch for metabolic syndrome or diabetes-oriented pathya.
Benefits: Tikta–Kashaya rasa supports Medodushti (fat/metabolic tissue imbalance) and helps blunt post-meal spikes when paired with physician care.
Precautions: Not for hypoglycemia without monitoring; adjust portions with your doctor.

---RECIPE---
Title: Fenugreek–Cinnamon Morning Tea
Ingredients:
- 1 cup water, 1/2 tsp fenugreek seeds, 1/4 stick cinnamon, few curry leaves
Preparation:
1. Simmer 8–10 minutes; strain; drink warm.
When to take: Empty stomach morning for insulin-resistance patterns.
Benefits: Supports glucose metabolism and Kapha–Meda reduction in Prameha-oriented care.
Precautions: Fenugreek may lower blood sugar—monitor if on antidiabetic drugs.

---RECIPE---
Title: Barley–Vegetable Light Soup (Yava yusha)
Ingredients:
- 1/3 cup pearl barley, mixed vegetables (bottle gourd, beans), cumin, ginger pinch, rock salt
Preparation:
1. Pressure-cook or simmer until barley is soft; serve warm and thin.
When to take: Dinner 3–4 nights per week when weight or metabolic load is high.
Benefits: Ruksha–Laghu qualities reduce Kapha and Meda while nourishing without heaviness.
Precautions: Increase fluids if Vata dryness or constipation appears—add ghee if needed."""


def _recipe_category_for_context(diagnosis_label, symptoms, patient_info):
    """Pick a pathya recipe bank from diagnosis text, symptoms, and dosha hints."""
    parts = [str(diagnosis_label or "").lower()]
    parts.extend(str(s or "").lower() for s in (symptoms or [])[:12])
    if isinstance(patient_info, dict):
        parts.append(str(patient_info.get("dosha") or "").lower())
        parts.append(str(patient_info.get("dominantDosha") or "").lower())
    blob = " ".join(parts)

    checks = (
        (
            "respiratory",
            (
                "cough", "cold", "flu", "respiratory", "asthma", "bronch", "sinus",
                "throat", "kasa", "shwasa", "prana", "nasya", "rhinit", "pneum",
                "breath", "wheeze", "congestion", "sputum", "phlegm",
            ),
        ),
        (
            "sleep",
            ("insomnia", "anxiety", "stress", "sleep", "nidra", "unmada", "restless", "palpitation"),
        ),
        (
            "joint",
            (
                "arthritis", "joint", "back pain", "sciatica", "gout", "amavata",
                "sandhivata", "stiffness", "rheumat", "muscle pain", "myalgia", "fibromyalgia",
            ),
        ),
        (
            "skin",
            (
                "eczema", "psoriasis", "dermat", "skin rash", "urticaria", "acne",
                "itching", "pruritus", "dry skin", "kushta",
            ),
        ),
        (
            "pitta",
            (
                "acidity", "gerd", "reflux", "gastritis", "ulcer", "hyperacidity",
                "burning", "pitta", "inflammation", "heat", "fever", "migraine",
                "headache", "hypertension",
            ),
        ),
        (
            "metabolic",
            (
                "diabetes", "prediabetes", "obesity", "weight", "thyroid",
                "cholesterol", "metabolic", "polyuria", "polyphagia",
            ),
        ),
        (
            "digestive",
            (
                "digest", "bloat", "constipation", "diarrhea", "ibs", "agni",
                "indigestion", "appetite", "nausea", "vomit", "gas", "abdomen",
            ),
        ),
    )
    for category, keywords in checks:
        if any(k in blob for k in keywords):
            return category
    return "digestive"


def _fallback_recipes_for_category(category):
    banks = {
        "respiratory": _fallback_respiratory_recipes,
        "sleep": _fallback_sleep_recipes,
        "joint": _fallback_joint_recipes,
        "skin": _fallback_skin_recipes,
        "pitta": _fallback_pitta_recipes,
        "metabolic": _fallback_metabolic_recipes,
        "digestive": _fallback_digestive_recipes,
    }
    return banks.get(category, _fallback_digestive_recipes)()


def _structured_wellness_fallback(diagnosis_label, patient_info, symptoms=None):
    """Template plans when the LLM fails — routed by diagnosis + symptoms."""
    label = diagnosis_label or "your current Ayurvedic clinical impression"
    name = patient_info.get("name") if _looks_like_person_name(patient_info.get("name")) else "you"
    category = _recipe_category_for_context(diagnosis_label, symptoms, patient_info)
    body = _fallback_recipes_for_category(category)
    return f"""Ayurvedic pathya (diet) plan for {name}, aligned with the clinical focus: {label}.
Condition-oriented recipe set: {category.replace('_', ' ')} support.
These are supportive kitchen preparations only — not a substitute for your physician's prescription.

{body}"""


def generate_wellness_recipes(symptoms, diagnosis_text, history):
    """Generate structured wellness recipes for the patient portal."""
    dosha_profile = get_current_dosha_profile(history)
    patient_info = _extract_patient_info_from_history(history, dosha_profile)
    clean_symptoms = sanitize_symptoms(symptoms)

    diagnosis_label, diag_detail = _extract_diagnosis_context_for_recipes(diagnosis_text)
    kb_ctx = _pathya_snippets_from_kb(clean_symptoms, diagnosis_label, dosha_profile)
    category = _recipe_category_for_context(diagnosis_label, clean_symptoms, patient_info)
    patient_narrative = _extract_user_clinical_narrative(history, max_chars=1200)

    clinical_focus = diagnosis_label or "infer cautiously from symptoms and consultation notes below"

    prompt_parts = [
        "You are an expert Ayurvedic clinician designing ONLY simple home pathya (diet and kitchen preparations).\n",
        "TASK: Produce exactly 3 distinct recipes that are therapeutically appropriate for THIS patient's ",
        "confirmed diagnosis / Ayurvedic imbalance — not generic wellness trends.\n",
        "Do NOT reuse the same three dishes you would give for a different disease (e.g. cough vs joint pain vs skin).\n\n",
        "STRICT RULES:\n",
        "- Choose dishes only if they support management of the stated diagnosis, dominant dosha, and symptoms.\n",
        "- Prefer classical or widely taught Ayurvedic food approaches for this condition pathya (avoid random smoothies ",
        "unless clearly justified).\n",
        "- Each Benefits section must name HOW the dish helps THIS diagnosis or dosha tendency (one clear sentence).\n",
        "- Avoid ingredients or timings that obviously contradict the diagnosis (e.g. ice-cold drinks for Agnimandya).\n",
        "- If knowledge snippets below conflict with safety, choose milder options and state cautions.\n\n",
        f"PRIMARY CLINICAL FOCUS: {clinical_focus}\n",
        f"CONDITION RECIPE ORIENTATION (use as guide, not a fixed menu): {category}\n",
    ]
    if diag_detail:
        prompt_parts.append(f"FROM THE DIAGNOSIS REPORT:\n{diag_detail}\n\n")
    if patient_narrative:
        prompt_parts.append(f"PATIENT'S OWN WORDS FROM CONSULTATION:\n{patient_narrative}\n\n")
    prompt_parts.append(f"Patient metadata: {json.dumps(patient_info)}\n")
    prompt_parts.append(f"Reported symptoms (chat): {', '.join(clean_symptoms) or 'see report above'}\n")
    if kb_ctx:
        prompt_parts.append(f"\nAYURVEDIC REFERENCE SNIPPETS (align recipes with implied pathya):\n{kb_ctx}\n")
    prompt_parts.append(
        "\nOUTPUT FORMAT — repeat ---RECIPE--- three times. No markdown headings or code fences.\n"
        "Every recipe MUST include ALL sections in this order:\n"
        "Title, Ingredients (bullet list), Preparation (numbered steps), "
        "When to take (specific timing vs meals/sleep), Benefits (linked to THIS diagnosis), Precautions.\n\n"
        "---RECIPE---\n"
        "Title: <dish name>\n"
        "Ingredients:\n"
        "- <quantity + item>\n"
        "Preparation:\n"
        "1. <step>\n"
        "When to take: <e.g. empty stomach morning / after lunch / 30 min before bed>\n"
        "Benefits: <1–2 sentences tied to the diagnosis>\n"
        "Precautions: <one line>\n\n"
        "Do not repeat the same recipe twice."
    )
    prompt = "".join(prompt_parts)

    try:
        raw = send(prompt, max_tokens=2800)
        if raw and "---RECIPE---" in raw and not _is_bot_fallback_text(raw):
            return _ensure_three_recipes(
                raw.strip(), diagnosis_label, patient_info, clean_symptoms
            )
    except Exception:
        pass

    return _ensure_three_recipes(
        _structured_wellness_fallback(diagnosis_label, patient_info, clean_symptoms),
        diagnosis_label,
        patient_info,
        clean_symptoms,
    )


def _normalize_dominant_dosha(value):
    if not value:
        return ""
    v = str(value).strip().lower()
    for key in ("vata", "pitta", "kapha"):
        if key in v:
            return key
    if "tri" in v or "mixed" in v or "dual" in v:
        return "tridoshic"
    return v[:24]


def _remedy_line_to_herb_item(line):
    """Turn a treatment-plan remedy string into a structured herb row (full text, no truncation)."""
    t = _clean_text(line, "")
    if not t:
        return None
    low = t.lower()
    if low.startswith("primary focus for your presentation"):
        return None
    if ":" in t:
        name, how = t.split(":", 1)
        name = name.strip()
        how = how.strip()
        if name:
            return {"name": name, "purpose": "From your treatment plan", "how": how or "Confirm with your physician"}
    return {"name": t, "purpose": "From your treatment plan", "how": "Discuss dose with your Ayurvedic physician"}


def _parse_report_bundle_for_recommendations(diagnosis_text):
    """Extract structured slices from ---REPORT_DATA--- for the recommendation engine."""
    out = {
        "diagnosis_label": "",
        "symptoms": [],
        "dominant_dosha": "",
        "dosha_interp": "",
        "clinical_summary": "",
        "treatment_focus": "",
        "herb_lines": [],
        "routine_steps": [],
        "timeline": {},
        "diet_lines": [],
    }
    if not diagnosis_text or not str(diagnosis_text).strip():
        return out

    tail = str(diagnosis_text).split("---REPORT_DATA---")[-1]
    payload = _extract_json_object(tail)
    if not isinstance(payload, dict):
        return out

    reports = payload.get("reports") if isinstance(payload.get("reports"), list) else []
    for report in reports:
        if not isinstance(report, dict):
            continue
        rtype = report.get("reportType")
        rd = report.get("reportData") if isinstance(report.get("reportData"), dict) else {}

        if rtype == "Diagnosis Report":
            diag = rd.get("diagnosis") if isinstance(rd.get("diagnosis"), dict) else {}
            name = _clean_text(diag.get("name"), "")
            ayur = _clean_text(
                diag.get("ayurvedicName") or diag.get("ayurvedic_name") or diag.get("sanskritName"),
                "",
            )
            if name and ayur:
                out["diagnosis_label"] = f"{name} ({ayur})"
            else:
                out["diagnosis_label"] = name or ayur

            dosha = rd.get("doshaProfile") if isinstance(rd.get("doshaProfile"), dict) else {}
            out["dominant_dosha"] = _normalize_dominant_dosha(dosha.get("dominant"))
            out["dosha_interp"] = _clean_text(dosha.get("interpretation"), "")[:500]
            impression = _clean_text(
                rd.get("clinicalImpression") or rd.get("clinical_impression"),
                "",
            )
            if impression:
                out["clinical_summary"] = impression[:280]

            for key in ("symptomsReported", "pain_points", "supportingFindings"):
                chunk = rd.get(key)
                if isinstance(chunk, list):
                    for item in chunk[:12]:
                        t = _clean_text(item, "")
                        if t and t not in out["symptoms"]:
                            out["symptoms"].append(t)

        if rtype == "Lifestyle Report":
            steps = rd.get("routine_steps")
            if isinstance(steps, list):
                out["routine_steps"].extend(
                    _clean_text(s, "") for s in steps[:10] if _clean_text(s, "")
                )
            tl = rd.get("timeline")
            if isinstance(tl, dict):
                out["timeline"] = {
                    k: _clean_text(v, "")
                    for k, v in tl.items()
                    if _clean_text(v, "")
                }

        if rtype == "Treatment Plan Report":
            remedies = rd.get("remedies")
            if isinstance(remedies, list):
                for r in remedies[:12]:
                    t = _clean_text(r, "")
                    if not t:
                        continue
                    if t.lower().startswith("primary focus for your presentation"):
                        if not out["treatment_focus"]:
                            out["treatment_focus"] = t
                        continue
                    out["herb_lines"].append(t)
                    low = t.lower()
                    if any(
                        w in low
                        for w in (
                            "avoid",
                            "reduce",
                            "limit",
                            "favor",
                            "eat",
                            "diet",
                            "food",
                            "meal",
                            "spice",
                            "drink",
                            "hydration",
                            "pathya",
                            "apathya",
                        )
                    ):
                        out["diet_lines"].append(t)

    return out


def _symptom_keyword_hits(blob, mapping):
    hits = []
    for keywords, items in mapping.items():
        if any(kw in blob for kw in keywords):
            hits.extend(items)
    return hits


def _dedupe_recommendation_items(items, key="name", limit=8):
    seen = set()
    out = []
    for item in items:
        if not isinstance(item, dict):
            continue
        label = _clean_text(item.get(key), "")
        if not label:
            continue
        norm = label.lower()
        if norm in seen:
            continue
        seen.add(norm)
        out.append(item)
        if len(out) >= limit:
            break
    return out


def generate_ayurvedic_recommendation_plan(symptoms, diagnosis_text, history):
    """
    Smart Ayurvedic Recommendation Engine — herbs, yoga, pranayama, diet, routines
    from dosha profile + diagnosis report + reported symptoms.
    """
    clean_symptoms = sanitize_symptoms(symptoms)
    dosha_profile = get_current_dosha_profile(history)
    bundle = _parse_report_bundle_for_recommendations(diagnosis_text)

    diagnosis_label = bundle["diagnosis_label"] or ""
    if not diagnosis_label:
        diagnosis_label, _ = _extract_diagnosis_context_for_recipes(diagnosis_text)

    dominant = bundle["dominant_dosha"] or _normalize_dominant_dosha(
        (dosha_profile or {}).get("dominant")
    )
    if not dominant and isinstance(dosha_profile, dict):
        v = float(dosha_profile.get("vata") or 0)
        p = float(dosha_profile.get("pitta") or 0)
        k = float(dosha_profile.get("kapha") or 0)
        scores = [("vata", v), ("pitta", p), ("kapha", k)]
        scores.sort(key=lambda x: x[1], reverse=True)
        if scores[0][1] > 0:
            dominant = scores[0][0]
            if scores[1][1] > 0 and (scores[0][1] - scores[1][1]) < 8:
                dominant = "tridoshic"

    all_symptoms = list(clean_symptoms)
    for s in bundle["symptoms"]:
        if s not in all_symptoms:
            all_symptoms.append(s)

    blob = " ".join(
        [
            diagnosis_label,
            bundle.get("dosha_interp") or "",
            " ".join(all_symptoms),
            " ".join(bundle.get("herb_lines") or []),
        ]
    ).lower()

    dosha_templates = {
        "vata": {
            "herbs": [
                {"name": "Ashwagandha (Withania)", "purpose": "Ground Vata nervous system", "how": "¼ tsp powder in warm milk after dinner"},
                {"name": "Dashmool kwath", "purpose": "Musculoskeletal Vata support", "how": "As directed by practitioner; classical Vata formula"},
                {"name": "Ginger + cumin tea", "purpose": "Kindle Agni, reduce gas", "how": "Sip warm between meals, not on empty stomach if acidity"},
            ],
            "yoga": [
                {"name": "Balasana (Child's pose)", "benefit": "Calms anxiety and scattered Vata", "duration": "3–5 min, slow breathing"},
                {"name": "Vajrasana after meals", "benefit": "Steadies digestion", "duration": "5–10 min post-lunch"},
                {"name": "Gentle spinal twists", "benefit": "Releases lower-back tension", "duration": "5 min each side"},
            ],
            "pranayama": [
                {"name": "Nadi Shodhana", "benefit": "Balances Vata–Pitta flow", "duration": "6–8 rounds morning"},
                {"name": "Bhramari", "benefit": "Settles racing mind", "duration": "5 min before sleep"},
            ],
            "diet_pathya": ["Warm, moist, mildly spiced cooked meals", "Ghee or sesame oil in moderation", "Root vegetables, soups, khichdi"],
            "diet_apathya": ["Cold salads, iced drinks, raw juice cleanses", "Excess caffeine on empty stomach", "Skipping meals"],
            "routine": {
                "morning": ["Warm water upon waking", "Light oil massage (abhyanga) 5 min", "Same wake time daily"],
                "afternoon": ["Largest meal at lunch with warm grains", "Brief walk after eating"],
                "evening": ["Light early dinner before 7:30 pm", "Screen curfew 1 hr before bed"],
                "night": ["Warm milk with nutmeg if sleep is light", "Feet massage with sesame oil"],
            },
        },
        "pitta": {
            "herbs": [
                {"name": "Amalaki", "purpose": "Cool Pitta, support digestion", "how": "½ tsp powder or fresh amla when season allows"},
                {"name": "Shatavari", "purpose": "Soothe heat-related irritation", "how": "1 tsp in room-temperature milk"},
                {"name": "Coriander–fennel tea", "purpose": "Reduce acidity and inflammatory heat", "how": "Sip between meals"},
            ],
            "yoga": [
                {"name": "Sheetali preparatory stretches", "benefit": "Cooling forward folds", "duration": "8 min evening"},
                {"name": "Moon salutation (Chandra Namaskar)", "benefit": "Non-competitive movement", "duration": "Slow 5 rounds"},
                {"name": "Supta Baddha Konasana", "benefit": "Opens pelvis, cools Pitta", "duration": "5–8 min"},
            ],
            "pranayama": [
                {"name": "Sheetali / Sitkari", "benefit": "Lowers internal heat", "duration": "8 breaths when irritable"},
                {"name": "Ujjayi (gentle)", "benefit": "Steadies Pitta anger/stress", "duration": "5 min mid-day pause"},
            ],
            "diet_pathya": ["Sweet bitter astringent tastes: coconut, cucumber, leafy greens", "Room-temperature water through the day", "Barley, basmati, moong dal"],
            "diet_apathya": ["Chili, fried food, alcohol, sour ferments", "Skipping meals when angry/hungry", "Late heavy dinners"],
            "routine": {
                "morning": ["Cool shower or face splash", "Gentle walk in shade", "Avoid competitive morning workouts"],
                "afternoon": ["Main meal with cooling garnish (cilantro, mint)", "20 min rest if mentally overloaded"],
                "evening": ["Creative wind-down, not heated debates", "Moonlight walk if available"],
                "night": ["Rose or sandalwood scent optional", "Sleep by 10:30 pm"],
            },
        },
        "kapha": {
            "herbs": [
                {"name": "Trikatu (ginger, black pepper, pippali)", "purpose": "Lighten Kapha stagnation", "how": "Pinch before meals — avoid if strong acidity"},
                {"name": "Tulsi tea", "purpose": "Respiratory Kapha clearance", "how": "Morning and late afternoon cups"},
                {"name": "Haridra (turmeric)", "purpose": "Anti-inflammatory, metabolic spark", "how": "¼ tsp in warm water with pinch of black pepper"},
            ],
            "yoga": [
                {"name": "Surya Namaskar", "benefit": "Invigorates sluggish Kapha", "duration": "6–8 rounds morning"},
                {"name": "Warrior II & chair pose", "benefit": "Builds heat without jumping", "duration": "30 sec × 3 sets"},
                {"name": "Kapalabhati prep (breath of fire prep)", "benefit": "Chest opening", "duration": "Only if no hypertension — 2 min"},
            ],
            "pranayama": [
                {"name": "Bhastrika (mild)", "benefit": "Clears dullness", "duration": "3 rounds under guidance if new"},
                {"name": "Kapalabhati", "benefit": "Reduces Kapha congestion", "duration": "30–50 pumps then rest"},
            ],
            "diet_pathya": ["Light, warm, pungent spices; millets, legumes", "Honey in warm water (not heated)", "Vegetable-forward lunch"],
            "diet_apathya": ["Heavy dairy at night", "Daytime naps", "Cold sweets and fried snacks"],
            "routine": {
                "morning": ["Dry brushing or vigorous towel rub", "Hot ginger tea before breakfast", "No snooze — rise with activity"],
                "afternoon": ["Main protein at lunch, lighter dinner", "Short brisk walk post-meal"],
                "evening": ["Light dinner by 7 pm", "Declutter living space"],
                "night": ["Avoid heavy desserts", "Earlier bed than Kapha tendency (10 pm)"],
            },
        },
        "tridoshic": {
            "herbs": [
                {"name": "Triphala", "purpose": "Gentle detox for mixed dosha", "how": "½ tsp at bedtime in warm water"},
                {"name": "Tulsi–ginger tea", "purpose": "Daily adaptogenic support", "how": "1–2 cups daylight hours"},
            ],
            "yoga": [
                {"name": "Surya Namaskar (moderate pace)", "benefit": "Whole-body balance", "duration": "5 rounds"},
                {"name": "Shavasana", "benefit": "Integrates all doshas", "duration": "8 min end of practice"},
            ],
            "pranayama": [
                {"name": "Nadi Shodhana", "benefit": "Universal balancer", "duration": "8 rounds twice daily"},
            ],
            "diet_pathya": ["Seasonal local foods, mostly cooked", "Regular meal timing", "Plenty of warm water"],
            "diet_apathya": ["Extreme fad diets", "Irregular sleep–meal cycles"],
            "routine": {
                "morning": ["Warm water + gentle movement", "Set intention for the day"],
                "afternoon": ["Mindful lunch away from screens", "5 min breath break"],
                "evening": ["Light walk", "Digital sunset"],
                "night": ["Gratitude note or journaling", "Consistent sleep window"],
            },
        },
    }

    template_key = dominant if dominant in dosha_templates else "tridoshic"
    base = dosha_templates[template_key]

    herb_items = []
    for line in bundle.get("herb_lines") or []:
        item = _remedy_line_to_herb_item(line)
        if item:
            herb_items.append(item)

    symptom_herbs = _symptom_keyword_hits(
        blob,
        {
            ("cough", "cold", "kapha", "congestion", "phlegm"): [
                {"name": "Talisadi churna", "purpose": "Classical Kapha respiratory support", "how": "Small pinch with honey — avoid if diabetic without guidance"},
                {"name": "Yashtimadhu (licorice) tea", "purpose": "Soothes throat", "how": "1 cup warm, not long-term without supervision"},
            ],
            ("acid", "gerd", "burning", "heartburn", "pitta"): [
                {"name": "Shatavari + licorice cool infusion", "purpose": "Pitta digestive cooling", "how": "Sip between meals"},
                {"name": "Coriander seed water", "purpose": "Reduces acidity", "how": "Overnight soak, strain morning"},
            ],
            ("joint", "arthritis", "pain", "stiff"): [
                {"name": "Guggulu (Commiphora)", "purpose": "Ama–Vata joint support", "how": "Only under qualified supervision"},
                {"name": "Dashmool decoction", "purpose": "Classical musculoskeletal formula", "how": "As prescribed"},
            ],
            ("anxiety", "stress", "sleep", "insomnia", "worry"): [
                {"name": "Brahmi / Mandukaparni", "purpose": "Medhya Rasayana for calm", "how": "Morning with ghee per practitioner"},
                {"name": "Jatamansi", "purpose": "Sleep depth", "how": "Evening pinch in warm milk"},
            ],
            ("skin", "eczema", "itch", "rash"): [
                {"name": "Neem + turmeric paste (external)", "purpose": "Pitta–Kapha skin", "how": "Patch test; short contact"},
                {"name": "Khadirarishta", "purpose": "Blood purifier class", "how": "Physician-only internal use"},
            ],
        },
    )
    herb_items.extend(symptom_herbs)
    herb_items.extend(base["herbs"])

    yoga_items = list(base["yoga"])
    yoga_items.extend(
        _symptom_keyword_hits(
            blob,
            {
                ("back", "lumbar", "sciatica"): [
                    {"name": "Cat–Cow (Marjaryasana)", "benefit": "Mobilizes spine gently", "duration": "10 slow cycles"},
                ],
                ("bloating", "gas", "constipation", "agni"): [
                    {"name": "Pawanmuktasana", "benefit": "Relieves abdominal Vata", "duration": "5 reps each leg"},
                ],
                ("headache", "migraine"): [
                    {"name": "Neck releases + Shashankasana", "benefit": "Cervical tension relief", "duration": "6 min"},
                ],
            },
        )
    )

    pranayama_items = list(base["pranayama"])
    if "stress" in blob or "anxiety" in blob:
        pranayama_items.insert(
            0,
            {"name": "Bhramari", "benefit": "Acute stress downshift", "duration": "5 min"},
        )

    diet_pathya = list(base["diet_pathya"])
    diet_apathya = list(base["diet_apathya"])
    for line in bundle.get("diet_lines") or []:
        low = line.lower()
        if any(w in low for w in ("avoid", "reduce", "limit", "apathya")):
            diet_apathya.append(line)
        else:
            diet_pathya.append(line)

    routines = dict(base["routine"])
    if bundle.get("routine_steps"):
        routines["morning"] = (bundle["routine_steps"][:3] or routines["morning"])[:5]
        if len(bundle["routine_steps"]) > 3:
            routines["afternoon"] = bundle["routine_steps"][3:6]
        if len(bundle["routine_steps"]) > 6:
            routines["evening"] = bundle["routine_steps"][6:9]
    tl = bundle.get("timeline") or {}
    for phase in ("morning", "afternoon", "evening", "night"):
        if tl.get(phase):
            # One line per phase from timeline — avoid duplicating routine_steps headlines
            routines[phase] = [tl[phase]]

    clinical_summary = bundle.get("clinical_summary") or ""
    dosha_interp = bundle.get("dosha_interp") or ""
    if dosha_interp:
        dosha_interpretation = dosha_interp[:320]
    elif clinical_summary:
        dosha_interpretation = clinical_summary[:320]
    else:
        dosha_interpretation = (
            f"Plan weighted toward {template_key} balance from your Vaidya consultation."
        )[:320]

    return {
        "engine": "ayurvedic_recommendation_v1",
        "diagnosisLabel": diagnosis_label or "Personalized Ayurvedic care",
        "dominantDosha": template_key,
        "clinicalSummary": clinical_summary,
        "treatmentFocus": bundle.get("treatment_focus") or "",
        "doshaInterpretation": dosha_interpretation,
        "symptoms": all_symptoms[:12],
        "herbs": _dedupe_recommendation_items(herb_items, key="name", limit=8),
        "yoga": _dedupe_recommendation_items(yoga_items, key="name", limit=6),
        "pranayama": _dedupe_recommendation_items(pranayama_items, key="name", limit=5),
        "diet": {
            "pathya": _dedupe_recommendation_items(
                [{"name": p, "purpose": "Favor", "how": ""} for p in diet_pathya],
                key="name",
                limit=8,
            ),
            "apathya": _dedupe_recommendation_items(
                [{"name": a, "purpose": "Reduce", "how": ""} for a in diet_apathya],
                key="name",
                limit=8,
            ),
        },
        "routines": routines,
        "disclaimer": (
            "Educational Ayurvedic guidance from your Vaidya assessment — not a prescription. "
            "Confirm herbs, pranayama intensity, and yoga with a licensed practitioner, especially if pregnant, "
            "on medication, or managing cardiac/respiratory conditions."
        ),
    }


def diagnose(symptoms, history, patient_profile=None):
    """Make diagnosis using retrieved knowledge from books."""
    try:
        symptoms = sanitize_symptoms(symptoms)
        finalized_now = _user_wants_report_finalized(history)
        last_user_cmd = ""
        for item in reversed(history):
            if isinstance(item, str) and item.startswith("User:"):
                last_user_cmd = item.replace("User:", "").strip().lower()
                break
        explicit_diagnose_cmd = last_user_cmd == "diagnose"
        # Allow earlier report generation when the patient confirms finalize or types diagnose
        min_hist = 4 if (finalized_now or explicit_diagnose_cmd or profile_demographics_complete(patient_profile)) else 6
        if len(history) < min_hist:
            return "I need a bit more detail to provide a professional report. Could you tell me more about when this happens or what makes it worse?"

        # Determine threat level early - check for emergency symptoms
        emergency_threat = _determine_threat_level(symptoms, history)
        is_emergency = emergency_threat == "High"
        clinical_threat_level = _compute_clinical_threat_level(symptoms, history, is_emergency=is_emergency)

        dosha_profile = get_current_dosha_profile(history)
        candidates = get_candidates(symptoms, dosha_profile=dosha_profile, top_n=3)
        
        # Integrate Vector DB for richer clinical details
        search_query = list(dict.fromkeys(symptoms + [history[-1]]))
        retrieval_result = get_semantic_context(search_query, top_k=4)
        semantic_context = retrieval_result["context"] if isinstance(retrieval_result, dict) else str(retrieval_result)
        _logger.info(
            "diagnose: symptoms=%d retrieval_sufficient=%s avg_score=%.3f",
            len(symptoms),
            retrieval_result.get("sufficient", False) if isinstance(retrieval_result, dict) else False,
            retrieval_result.get("avg_score", 0.0) if isinstance(retrieval_result, dict) else 0.0,
        )

        kb_context = "REFERENCE KNOWLEDGE FROM AYURVEDIC TEXTS:\n"
        if candidates:
            for c in candidates:
                rec = c['record']
                kb_context += f"Condition: {c.get('id', 'Unknown')}\n"
                kb_context += f"Symptoms described in books: {rec.get('symptoms', 'N/A')}\n"
                kb_context += f"Causes: {rec.get('causes', 'N/A')}\n"
                kb_context += f"Treatments: {rec.get('treatment', 'N/A')}\n\n"

        kb_context += "\nDEEP CLINICAL CONTEXT FROM TEXTBOOKS:\n"
        if isinstance(retrieval_result, dict) and not retrieval_result.get("sufficient", True):
            kb_context += "[Note: textbook coverage is sparse for this query. AI applies general Ayurvedic principles.]\n"
        # Do NOT re-slice here: retrieval_agent already enforces RETRIEVAL_CONTEXT_BUDGET_CHARS
        # internally, so slicing again would double-truncate and risk cutting mid-sentence.
        kb_context += semantic_context
        patient_info = _extract_patient_info_from_history(history, dosha_profile)
        if patient_profile and isinstance(patient_profile, dict):
            for key in ("name", "age", "gender", "height", "weight"):
                pv = patient_profile.get(key)
                if pv is None or str(pv).strip() in ("", "N/A", "n/a"):
                    continue
                cur = patient_info.get(key)
                if cur is None or str(cur).strip() in ("", "N/A", "n/a", "Patient"):
                    patient_info[key] = pv
            prakriti = patient_profile.get("prakritiProfile")
            if isinstance(prakriti, dict) and prakriti:
                dom = prakriti.get("dominant") or prakriti.get("constitution")
                if dom and str(patient_info.get("constitution", "")).strip() in ("", "Unknown", "N/A", "n/a"):
                    patient_info["constitution"] = dom
                patient_info["prakritiPercentages"] = {
                    "vata": prakriti.get("vata"),
                    "pitta": prakriti.get("pitta"),
                    "kapha": prakriti.get("kapha"),
                }
            elif patient_profile.get("constitution"):
                c = str(patient_profile.get("constitution")).strip()
                if c and str(patient_info.get("constitution", "")).strip() in ("", "Unknown"):
                    patient_info["constitution"] = c
        primary_issue = _first_user_issue(history)
        user_narrative = _extract_user_clinical_narrative(history)

        # Add emergency warning to context if applicable
        emergency_note = ""
        if is_emergency:
            emergency_note = "\n\n⚠️ EMERGENCY ALERT: This case involves potentially severe symptoms (bleeding, chest pain, breathing difficulty, etc.). "
            emergency_note += "The threat level MUST be set to 'High'. Immediate medical consultation is strongly recommended."

        evidence_ids_str = ", ".join(
            e["id"] for e in (retrieval_result.get("evidence", []) if isinstance(retrieval_result, dict) else [])
        )
        shared_context = (
            f"{kb_context}\n\n"
            "USER CASE:\n"
            f"Primary stated issue: {primary_issue}\n"
            f"Current symptoms: {', '.join(symptoms)}\n"
            f"Patient's own words (use for personalized lifestyle & diet advice):\n{user_narrative or primary_issue}\n"
            f"Dosha profile from conversation scoring: {json.dumps(dosha_profile)}\n"
            f"Patient demographics: {json.dumps(patient_info)}\n"
            f"{emergency_note}"
            + (f"\nEvidence IDs: {evidence_ids_str}" if evidence_ids_str else "")
        )

        # Adjust threat level instruction based on emergency status
        threat_instruction = "\"threatLevel\": \"High\" (EMERGENCY - immediate medical attention required)" if is_emergency else "\"threatLevel\": \"Low/Moderate/High\" (assess based on symptom severity)"

        report_specs = [
            {
                "reportType": "Diagnosis Report",
                "title": "Clinical Diagnosis",
                "persona": "Senior Ayurvedic Physician",
                "objective": "Provide a high-density diagnostic overview with key clinical markers.",
                "schema": f"{{ \"kpis\": [{{\"label\": \"...\", \"value\": \"...\"}}], \"pain_points\": [\"...\"], \"diagnosis\": {{ \"name\": \"...\", \"ayurvedicName\": \"... (classical Sanskrit term, e.g. Jwara for fever)\", \"reasoning\": \"...\" }}, \"clinicalImpression\": \"...\", \"supportingFindings\": [\"...\"], \"doshaProfile\": {{ \"vata\": 0, \"pitta\": 0, \"kapha\": 0, \"dominant\": \"...\", \"interpretation\": \"...\" }}, {threat_instruction}, \"symptomsReported\": [\"...\"] }}",
                "style_rules": (
                    "- Name the patient's actual complaints from USER CASE (not generic wellness text).\n"
                    "- clinicalImpression and diagnosis.reasoning: 120+ words each, citing symptoms and dosha.\n"
                    "- Generate 4-5 KPIs; pain_points: 5-8 bullets using the patient's words where possible.\n"
                    "- symptomsReported must list what the patient actually said.\n"
                    "- Use varied severity: Low for mild/occasional issues, Moderate for clear but manageable symptoms, High for urgent or severe presentations.\n"
                    "- Do NOT set every KPI or risk label to Moderate — match the patient's described intensity."
                    + (f"\n- ⚠️ threatLevel MUST be 'High' for this case (computed: {clinical_threat_level})." if is_emergency or clinical_threat_level == "High" else f"\n- Suggested threatLevel based on intake: '{clinical_threat_level}' (use Low/Moderate/High appropriately).")
                ),
            },
            {
                "reportType": "Root Cause Report",
                "title": "Disease Formation Narrative",
                "persona": "Ayurvedic Pathology Expert",
                "objective": "Explain disease formation and holistic guidance.",
                "schema": "{ \"content\": \"...\", \"technical_notes\": \"...\" }",
                "style_rules": (
                    "- content: 180+ words linking Agni, Ama, and dosha to THIS patient's symptoms and habits from USER CASE.\n"
                    "- technical_notes: 50+ words with classical logic (e.g. Samprapti).\n"
                    "- Reference diet, sleep, stress, or triggers the patient mentioned."
                ),
            },
            {
                "reportType": "Lifestyle Report",
                "title": "Daily Rhythm Script",
                "persona": "Ayurvedic Lifestyle Coach",
                "objective": "Design a graphical daily timeline and holistic routine.",
                "schema": "{ \"content\": \"...\", \"routine_steps\": [\"...\"], \"timeline\": { \"morning\": \"...\", \"afternoon\": \"...\", \"evening\": \"...\", \"night\": \"...\" } }",
                "style_rules": (
                    "- content: 120+ words explaining WHY these lifestyle changes help THIS patient.\n"
                    "- routine_steps: 5-7 concrete actions (meals, sleep, movement, stress) tied to their symptoms.\n"
                    "- timeline: one specific action per phase (morning/afternoon/evening/night)."
                ),
            },
            {
                "reportType": "Treatment Plan Report",
                "title": "Therapeutic Strategy",
                "persona": "Ayurvedic Pharmacist",
                "objective": "Explain therapeutic strategy and holistic guidance.",
                "schema": "{ \"content\": \"...\", \"remedies\": [\"...\"] }",
                "style_rules": (
                    "- content: 150+ words on diet (pathya/apathya), daily routine, and when to seek in-person care.\n"
                    "- remedies: 5-8 bullets — foods to favor, foods to reduce, kitchen spices, hydration, gentle practices.\n"
                    "- Must address the primary complaint from USER CASE."
                ),
            },
            {
                "reportType": "Risk Report",
                "title": "Clinical Forecast",
                "persona": "Clinical Prognosticator",
                "objective": "Describe forecast and holistic guidance.",
                "schema": "{ \"content\": \"...\", \"prognosis\": \"...\", \"red_flags\": [\"...\"] }",
                "style_rules": (
                    "- content: 100+ words on short-term outlook if they follow the plan vs. if they do not.\n"
                    "- prognosis: 2-3 sentences.\n"
                    "- red_flags: 3-5 warning signs relevant to their presentation (when to see a doctor urgently)."
                ),
            }
        ]

        # 1. Generate and normalize specialty reports concurrently
        specialty_reports_raw = [None] * len(report_specs)
        
        def generate_report(idx, spec):
            return _generate_specialist_report(
                spec["reportType"],
                spec["title"],
                spec["persona"],
                spec["objective"],
                spec["schema"],
                spec["style_rules"],
                shared_context,
                symptoms,
                dosha_profile,
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_to_idx = {executor.submit(generate_report, i, spec): i for i, spec in enumerate(report_specs)}
            for future in concurrent.futures.as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    specialty_reports_raw[idx] = future.result()
                except Exception as e:
                    print(f"Error in specialist report {idx}: {e}")
                    specialty_reports_raw[idx] = {}
        
        specialty_reports = [
            _normalize_specialist_report(
                spec["reportType"],
                spec["title"],
                specialty_reports_raw[idx] if idx < len(specialty_reports_raw) else {},
                symptoms,
                dosha_profile,
                primary_issue=primary_issue,
                user_narrative=user_narrative,
                is_emergency=is_emergency,
                clinical_threat_level=clinical_threat_level,
            )
            for idx, spec in enumerate(report_specs)
        ]

        # 2. Generate Master Synthesis using normalized specialist outputs
        master_prompt = (
            "You are the Chief Medical Synthesizer for the AyurCare clinical team — a calm, authoritative Ayurvedic expert.\n"
            "Your task is to consolidate the findings and recommendations from 5 specialists into a single, cohesive, and HIGH-DENSITY 'Master Report'.\n"
            "Use both common terms and Ayurvedic equivalents throughout (e.g., 'Metabolism/Agni', 'Body Constitution/Prakriti').\n"
            "Frame the synthesis around the three Doshas (Vata, Pitta, Kapha).\n\n"
            "SPECIALIST INPUTS:\n"
            f"{json.dumps(specialty_reports, ensure_ascii=False)}\n\n"
            "YOUR OBJECTIVE:\n"
            "1. Resolve any contradictions between specialists with authoritative clinical judgment.\n"
            "2. Eliminate fluff. Every sentence must provide unique clinical value or guidance.\n"
            "3. Synthesize a powerful 'Integrated Synthesis' (200-250 words) that connects the root cause to current symptoms.\n"
            "4. Create a master 'Holistic Clinical Protocol' (150-200 words) that is actionable and specific.\n"
            "5. Generate 5-6 'High-Impact Clinical KPIs' that quantify the patient's state (e.g., 'Ama Accumulation Index', 'Ojas Vitality Score').\n\n"
            "Return ONLY valid JSON with this exact top-level shape:\n"
            "{\n"
            '  "reportType": "Master Report",\n'
            '  "title": "Integrated Clinical Synthesis",\n'
            '  "reportData": {\n'
            '    "integrated_synthesis": "...",\n'
            '    "clinical_protocol": "...",\n'
            '    "master_kpis": [{\"label\": \"...\", \"value\": \"...\"}],\n'
            '    "master_pain_points": ["..."]\n'
            '  }\n'
            "}\n"
        )
        
        master_raw = _extract_json_object(send(master_prompt, max_tokens=900))
        master_report = _normalize_master_report(master_raw, specialty_reports)

        # Final list for the payload: keep Diagnosis first for compatibility, add Master next.
        diagnosis_report = next((r for r in specialty_reports if r.get("reportType") == "Diagnosis Report"), None)
        if not diagnosis_report and specialty_reports:
            diagnosis_report = specialty_reports[0]
        other_specialists = [r for r in specialty_reports if r.get("reportType") != "Diagnosis Report"]
        all_reports = [x for x in [diagnosis_report, master_report, *other_specialists] if isinstance(x, dict)]
        all_reports = _ensure_six_v2_reports(all_reports, symptoms, dosha_profile)

        diagnosis_data = (
            next((r.get("reportData", {}) for r in all_reports if r.get("reportType") == "Diagnosis Report"), {})
            if all_reports
            else {}
        )
        chat_summary_prompt = (
            "You are the AyurCare AI Assistant — a calm, professional, and sage-like Ayurvedic clinical intake agent.\n"
            "Write a compassionate but professional 3-4 sentence summary for the patient's chat view.\n"
            "Mention the leading Ayurvedic clinical impression and one short reasoning thread using both common terms and Ayurvedic equivalents "
            "(e.g., 'Metabolism/Agni', 'Body Constitution/Prakriti', referencing the relevant Dosha — Vata, Pitta, or Kapha).\n"
            "Do not mention JSON, sections, or report structure.\n"
            "End with: 'This is an AI-generated assessment based on Ayurvedic principles. Please consult with your AyurCare practitioner before starting any new regimen.'\n\n"
            f"Patient info: {json.dumps(patient_info)}\n"
            f"Diagnosis report: {json.dumps(diagnosis_data)}\n"
        )
        chat_summary = send(chat_summary_prompt, max_tokens=220)

        retrieval_evidence = (
            retrieval_result.get("evidence", []) if isinstance(retrieval_result, dict) else []
        )
        payload = {
            "patientInfo": patient_info,
            "schemaVersion": "reports.v2",
            "reports": all_reports,
            "retrievalEvidence": retrieval_evidence,
        }
        return f"{chat_summary}\n---REPORT_DATA---\n{json.dumps(payload, ensure_ascii=False)}"

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[ERROR in diagnose]: {str(e)}")
        return None

def search_disease_in_file(disease):
    """Search database for remedies."""
    downloads = os.path.join(os.path.expanduser("~"), "Downloads")
    file_path = os.path.join(downloads, "Ayurvedic_merged.txt")
    
    if not os.path.exists(file_path):
        return []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        matches = []
        for line in lines:
            if disease.lower() in line.lower():
                matches.append(line.rstrip())
        return matches[:15]
    except:
        return []

def extract_answer_info(question, answer):
    """Extract key info."""
    try:
        prompt = f"Question: {question}\nAnswer: {answer}\nSummarize the answer's key point in 4 words or less."
        return send(prompt)
    except:
        return answer[:30]


def present_diagnosis(diagnosis_text):
    """Display diagnosis including book treatments."""
    lines = diagnosis_text.split('\n')
    disease = confidence = reasoning = treatment = ""
    
    for line in lines:
        if line.startswith("DISEASE:"):
            disease = line.replace("DISEASE:", "").strip()
        elif line.startswith("CONFIDENCE:"):
            confidence = line.replace("CONFIDENCE:", "").strip()
        elif line.startswith("REASONING:"):
            reasoning = line.replace("REASONING:", "").strip()
        elif line.startswith("TREATMENT:"):
            treatment = line.replace("TREATMENT:", "").strip()
    
    print("\n" + "=" * 55)
    print(f"ðŸ¥ DIAGNOSIS: {disease.upper()}")
    print(f"ðŸ“Š Confidence: {confidence}%")
    print("=" * 55)
    print(f"\nðŸ’¡ Reasoning: {reasoning}")
    
    if treatment:
        print(f"\nðŸ“š AYURVEDIC TREATMENT (from book text):")
        print("-" * 40)
        print(f"  {treatment}")
        print("-" * 40)

if __name__ == "__main__":
    # Welcome
    print("=" * 55)
    print("ðŸ©º AYURVEDIC SYMPTOM CHECKER")
    print("=" * 55)
    print("Describe your symptoms. I'll ask key questions.\n")

    while True:
        user_input = input("You: ")
        
        if user_input.lower() in ['exit', 'quit']:
            print("Goodbye!")
            break
        
        if user_input.lower() == 'reset':
            reset_session()
            print("âœ… Reset. Start describing.\n")
            continue
        
        if session["diagnosis_complete"]:
            disease = session["confirmed_disease"]
            prompt = f"User asked a question about their confirmed diagnosis {disease}. Answer using Ayurvedic principles and general knowledge.\nQuestion: {user_input}\nAnswer:"
            response_text = send(prompt)
            print(f"\nAI: {response_text}\n")
            continue
        
        # Handle final check answer
        if session["awaiting_final_check"]:
            print("\nðŸ” Finalizing assessment using book data...\n")
            diagnosis = diagnose(session["symptoms"], session["conversation_history"])
            if diagnosis and "DISEASE:" in diagnosis:
                present_diagnosis(diagnosis)
                session["diagnosis_complete"] = True
                session["confirmed_disease"] = diagnosis.split("DISEASE:")[1].split("\n")[0].strip()
            else:
                print("Sorry, I could not finalize a diagnosis. Please try again or provide more details.")
            continue

        # Process user input and update history
        session["conversation_history"].append(f"User: {user_input}")

        # NEW: Initial symptom extraction or adding more symptoms
        extracted = extract_symptoms_from_text(user_input)
    if extracted:
        session["symptoms"].extend(extracted)
        session["symptoms"] = list(set(session["symptoms"])) # Unique
    
    # Generate reasoning/answer summary for history logic
    if session["question_count"] > 0:
        last_q = next(reversed([q for q in session["conversation_history"] if not q.startswith("User:") and not q.startswith("Answer:") and not q.startswith("AI:")]), "Previous Question")
        summary = extract_answer_info(last_q, user_input)
        session["answers"][last_q] = summary

    # Check if we should diagnose or ask more
    if should_give_diagnosis(session["symptoms"], session["answers"], session["conversation_history"]):
        session["awaiting_final_check"] = True
        print("\nAI: I have a potential diagnosis in mind based on the books. Shall I proceed? (Yes/No)")
    elif session["question_count"] >= session["max_questions"]:
        session["awaiting_final_check"] = True
        print("\nAI: I've good amount of information. Shall I provide a diagnosis based on the books? (Yes/No)")
    else:
        next_q = get_next_question(session["symptoms"], session["conversation_history"])
        session["conversation_history"].append(f"AI: {next_q}")
        session["question_count"] += 1
        print(f"\nAI: {next_q}\n")

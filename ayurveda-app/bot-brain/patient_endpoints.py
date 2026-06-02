from fastapi import APIRouter, HTTPException, Body, Depends
from datetime import datetime, timezone, timedelta
import jwt
import os
import bcrypt
import secrets
import hashlib
from pydantic import BaseModel

# REMOVE the prefix here to prevent "double-prefixing"
router = APIRouter(tags=["patient"])

db = None
ensure_db_connected = None
JWT_SECRET = os.getenv("JWT_SECRET", "ayurcare_secret_2025")
DEV_LOCAL_AUTH  = os.getenv("DEV_LOCAL_AUTH",  "false").lower() == "true"
DEV_DEMO_EMAIL  = os.getenv("DEV_DEMO_EMAIL",  "demo@ayurcare.com")
DEV_DEMO_PASSWORD = os.getenv("DEV_DEMO_PASSWORD", "demo1234")

def set_db_and_helpers(database, ensure_fn):
    global db, ensure_db_connected
    db = database
    ensure_db_connected = ensure_fn

class PatientLogin(BaseModel):
    email: str
    password: str

class PatientSignup(BaseModel):
    name: str
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    password: str

def _hash_reset_token(raw: str) -> str:
    return hashlib.sha256(str(raw).strip().upper().encode("utf-8")).hexdigest()


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _password_matches(plain: str, stored) -> bool:
    """Verify bcrypt (Python or Node/bcryptjs) hashes; tolerate legacy plain-text dev rows."""
    if not plain or stored is None:
        return False
    plain_b = plain.encode("utf-8")
    if isinstance(stored, bytes):
        stored_b = stored
    else:
        stored_b = str(stored).encode("utf-8")
    # bcryptjs / bcrypt hashes start with $2
    if stored_b.startswith(b"$2"):
        try:
            return bcrypt.checkpw(plain_b, stored_b)
        except (ValueError, TypeError):
            return False
    # Legacy plain-text password (migrate on next successful login)
    try:
        return plain == str(stored)
    except Exception:
        return False

@router.post("/signup")
async def signup(data: PatientSignup):
    if not await ensure_db_connected():
        raise HTTPException(503, "DB Down")

    # Check both collections for existing email
    email = _normalize_email(data.email)
    existing_p = await db.patients.find_one({"email": email})
    existing_u = await db.users.find_one({"email": email})
    if existing_p or existing_u: 
        raise HTTPException(400, detail="Email already registered")
    
    hashed = bcrypt.hashpw(data.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # Save to 'users' collection for Doctor Backend compatibility
    new_user = {
        "name": data.name,
        "email": email,
        "password": hashed,
        "role": "patient",
        "isOnboarded": False,
        "createdAt": datetime.now(timezone.utc)
    }
    user_result = await db.users.insert_one(new_user)
    uid = str(user_result.inserted_id)

    # Also save to 'patients'
    new_patient = {
        "_id": user_result.inserted_id,
        "name": data.name, 
        "email": email, 
        "password": hashed,
        "createdAt": datetime.now(timezone.utc), 
        "isNewPatient": True
    }
    await db.patients.insert_one(new_patient)

    token = jwt.encode(
        {
            "sub": uid,
            "userId": uid,
            "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return {"token": token, "user": {"id": uid, "name": data.name, "email": email, "isNewPatient": True}}

@router.post("/login")
async def login(data: PatientLogin):
    email = _normalize_email(data.email)

    # ── DEV bypass: allows login without MongoDB in local development ──────────
    if DEV_LOCAL_AUTH:
        demo_email = _normalize_email(DEV_DEMO_EMAIL)
        if email == demo_email and data.password == DEV_DEMO_PASSWORD:
            uid = "dev-patient-001"
            token = jwt.encode(
                {"sub": uid, "userId": uid, "exp": datetime.now(timezone.utc) + timedelta(hours=24)},
                JWT_SECRET, algorithm="HS256",
            )
            if isinstance(token, bytes):
                token = token.decode("utf-8")
            return {"token": token, "user": {"id": uid, "name": "Demo Patient", "email": email, "role": "patient", "isOnboarded": False}}

    if not await ensure_db_connected():
        raise HTTPException(
            503,
            detail="Database unavailable. Please whitelist your IP in MongoDB Atlas (Network Access) and restart the API.",
        )
    try:
        user = await db.users.find_one({"email": email})
        is_legacy = False
        if not user:
            user = await db.patients.find_one({"email": email})
            is_legacy = True

        stored_pw = user.get("password") if user else None
        if not user or not _password_matches(data.password, stored_pw):
            raise HTTPException(401, detail="Invalid email or password")

        uid = str(user["_id"])

        # Migrate legacy plain-text passwords to bcrypt
        if stored_pw and not str(stored_pw).startswith("$2"):
            new_hashed = bcrypt.hashpw(data.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            await db.users.update_one({"_id": user["_id"]}, {"$set": {"password": new_hashed}})
            await db.patients.update_one({"_id": user["_id"]}, {"$set": {"password": new_hashed}})
            user["password"] = new_hashed

        if is_legacy:
            await db.users.update_one(
                {"email": email},
                {
                    "$set": {
                        "name": user.get("name", "Patient"),
                        "email": email,
                        "password": user["password"],
                        "role": "patient",
                        "isOnboarded": user.get("isOnboarded", False),
                        "createdAt": user.get("createdAt", datetime.now(timezone.utc)),
                    }
                },
                upsert=True,
            )

        token = jwt.encode(
            {
                "sub": uid,
                "userId": uid,
                "exp": datetime.now(timezone.utc) + timedelta(hours=24),
            },
            JWT_SECRET,
            algorithm="HS256",
        )
        if isinstance(token, bytes):
            token = token.decode("utf-8")

        return {
            "token": token,
            "user": {
                "id": uid,
                "name": user.get("name", "User"),
                "email": email,
                "isNewPatient": bool(user.get("isNewPatient")),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[LOGIN ERROR] {email}: {type(e).__name__}: {e}")
        raise HTTPException(500, detail="Login failed. Please try again or contact support.")

@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    if not await ensure_db_connected():
        raise HTTPException(503, "DB Down")

    email = data.email.strip().lower()
    generic = {
        "message": "If this email is registered, use the reset code below to set a new password.",
    }

    user = await db.users.find_one({"email": email})
    if not user:
        user = await db.patients.find_one({"email": email})

    if not user:
        return generic

    raw_token = secrets.token_hex(4).upper()
    hashed = _hash_reset_token(raw_token)
    expires = datetime.now(timezone.utc) + timedelta(hours=1)
    reset_fields = {
        "passwordResetToken": hashed,
        "passwordResetExpires": expires,
    }

    await db.users.update_one({"email": email}, {"$set": reset_fields}, upsert=False)
    await db.patients.update_one({"email": email}, {"$set": reset_fields}, upsert=False)

    return {**generic, "resetToken": raw_token, "expiresInMinutes": 60}

@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest):
    if not await ensure_db_connected():
        raise HTTPException(503, "DB Down")

    if len(data.password) < 6:
        raise HTTPException(400, detail="Password must be at least 6 characters")

    hashed = _hash_reset_token(data.token)
    now = datetime.now(timezone.utc)

    user = await db.users.find_one({
        "passwordResetToken": hashed,
        "passwordResetExpires": {"$gt": now},
    })
    if not user:
        user = await db.patients.find_one({
            "passwordResetToken": hashed,
            "passwordResetExpires": {"$gt": now},
        })

    if not user:
        raise HTTPException(400, detail="Invalid or expired reset code")

    new_hashed = bcrypt.hashpw(data.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    clear = {
        "password": new_hashed,
        "passwordResetToken": None,
        "passwordResetExpires": None,
    }

    await db.users.update_one({"email": user["email"]}, {"$set": clear})
    await db.patients.update_one({"email": user["email"]}, {"$set": clear})

    return {"message": "Password updated. You can log in now."}
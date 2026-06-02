import os
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# --- FIX 1: ADD CORS MIDDLEWARE ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows your React app to connect
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
db = client.doctor_portal

@app.get("/api/doctor/appointments")
async def get_real_appointments():
    appointments = await db.appointments.find().to_list(100)
    
    for appt in appointments:
        # Convert MongoDB ObjectId to string so it doesn't crash the JSON response
        appt["_id"] = str(appt["_id"])
        
        diagnosis = str(appt.get("diagnosis", "")).lower()
        if "critical" in diagnosis or "severe" in diagnosis:
            appt["severity"] = "high"
        elif "mild" in diagnosis:
            appt["severity"] = "stable"
        else:
            appt["severity"] = "moderate"
            
    return appointments
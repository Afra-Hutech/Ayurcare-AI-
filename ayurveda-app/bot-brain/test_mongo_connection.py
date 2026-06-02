import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
try:
    import certifi
except Exception:
    certifi = None

load_dotenv()

async def test_mongo():
    uri = os.getenv("MONGODB_URI")
    print(f"Testing URI: {uri}")
    
    try:
        # Try primary URI from .env
        mongo_kwargs = {
            "serverSelectionTimeoutMS": 5000,
            "tlsAllowInvalidCertificates": True,
            "directConnection": True,
        }
        if certifi is not None:
            mongo_kwargs["tlsCAFile"] = certifi.where()

        client = AsyncIOMotorClient(uri, **mongo_kwargs)
        await client.admin.command('ping')
        print("✅ SUCCESS: Connected to MongoDB Atlas via .env URI")
        return
    except Exception as e:
        print(f"❌ FAILURE (.env URI): {e}")

    # Fallback: Try a simplified direct URI if Atlas is being picky
    print("\nTrying simplified connection...")
    try:
        simplified_uri = "mongodb+srv://doc-connect:doc-connect@doc-connect.mpev56u.mongodb.net/doctor_portal?retryWrites=true&w=majority&tlsAllowInvalidCertificates=true"
        mongo_kwargs = {"serverSelectionTimeoutMS": 5000}
        if certifi is not None:
            mongo_kwargs["tlsCAFile"] = certifi.where()
        client_alt = AsyncIOMotorClient(simplified_uri, **mongo_kwargs)
        await client_alt.admin.command('ping')
        print("✅ SUCCESS: Connected via simplified URI!")
    except Exception as e:
        print(f"❌ FAILURE (Simplified): {e}")

if __name__ == "__main__":
    asyncio.run(test_mongo())

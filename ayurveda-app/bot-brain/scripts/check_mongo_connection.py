"""
Developer utility — verify MongoDB Atlas connectivity.
NOT a pytest test (no assertions, requires live MONGODB_URI).
Run directly:  python scripts/check_mongo_connection.py

⚠️  Do NOT commit real credentials.  Use .env file only.
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.getenv("MONGODB_URI")
    if not uri:
        print("[ERROR] MONGODB_URI not set in .env")
        return
    print(f"Testing: {uri[:40]}...")
    try:
        client = AsyncIOMotorClient(
            uri,
            serverSelectionTimeoutMS=5000,
            tlsAllowInvalidCertificates=True,
        )
        await client.admin.command("ping")
        print("[OK] Connected to MongoDB")
    except Exception as e:
        print(f"[FAIL] {e}")

asyncio.run(main())

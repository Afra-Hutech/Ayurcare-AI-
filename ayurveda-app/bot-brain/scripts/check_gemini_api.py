"""
Developer utility — verify Gemini API key connectivity.
NOT a pytest test (no assertions, requires live API key).
Run directly:  python scripts/check_gemini_api.py
"""
import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
print(f"API Key found: {'YES' if api_key else 'NO'}")

try:
    client = genai.Client(api_key=api_key)
    model_chain = [
        "gemma-4-26b-a4b-it",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
    ]
    last_error = None
    for model_name in model_chain:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents="Hello, say 'API WORKING' if you receive this.",
            )
            print(f"[OK] Model: {model_name}  Response: {response.text}")
            break
        except Exception as e:
            last_error = e
            print(f"[FAIL] Model {model_name}: {e}")
    else:
        raise last_error
except Exception as e:
    print(f"[ERROR] {e}")

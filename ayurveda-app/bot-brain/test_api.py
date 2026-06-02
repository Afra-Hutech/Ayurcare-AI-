import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
print(f"API Key found: {api_key}")

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
            print(f"Model used: {model_name}")
            print(f"Response: {response.text}")
            break
        except Exception as e:
            last_error = e
            print(f"Model failed: {model_name} -> {e}")
    else:
        raise last_error
except Exception as e:
    print(f"Error: {e}")

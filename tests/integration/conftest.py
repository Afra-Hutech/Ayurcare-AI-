"""
Shared fixtures for integration tests.
Requires: FAISS vector store present, optional Gemini API key.
"""
import sys
import os
import json
import asyncio

import pytest

BOT_BRAIN = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../ayurveda-app/bot-brain")
)
if BOT_BRAIN not in sys.path:
    sys.path.insert(0, BOT_BRAIN)


@pytest.fixture(scope="session")
def vector_store_healthy():
    """Assert the real vector store can be verified; skip otherwise."""
    from retrieval_agent import verify_vector_store
    report = verify_vector_store()
    if not report["ok"]:
        pytest.skip(f"Vector store not healthy: {report['error']}")
    return report


@pytest.fixture(scope="session")
def gemini_key_present():
    """Skip integration tests that call Gemini if no API key configured."""
    from gemini_client import get_configured_api_keys
    keys = get_configured_api_keys()
    if not keys:
        pytest.skip("GEMINI_API_KEY not configured — skipping live AI tests")
    return keys


@pytest.fixture
def sample_consultation_history():
    """Pre-built multi-turn chat history for a Pitta-dominant patient."""
    return [
        "User: My name is Arjun Sharma.",
        "AI: Namaste, Arjun. Please share your age and gender.",
        "User: I am 34 years old, male.",
        "AI: Thank you. What is your height and current weight?",
        "User: I am 175 cm tall and weigh 78 kg.",
        "AI: Do you have any medical records or lab reports?",
        "User: No, I don't have any records.",
        "AI: Understood. Please describe your primary symptoms.",
        "User: I have burning sensation in my stomach, acid reflux after meals, and skin irritation.",
        "AI: How long have you been experiencing these symptoms?",
        "User: About 3 months. I also feel hot all the time and have intense headaches.",
        "AI: Any additional concerns?",
        "User: No, that covers it. Please generate my report.",
    ]


@pytest.fixture
def sample_symptoms():
    return [
        "burning sensation",
        "acid reflux",
        "skin irritation",
        "intense headaches",
        "feeling hot",
    ]


@pytest.fixture
def minimal_patient_profile():
    return {
        "name": "Arjun Sharma",
        "age": 34,
        "gender": "male",
        "height": "175",
        "weight": "78",
        "phone": None,
        "email": None,
        "constitution": None,
        "prakritiProfile": None,
    }

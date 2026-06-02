"""
GROUP 2 — End-to-End Integration Tests: Data Flow 1
=====================================================
Tests the complete pipeline from HTTP POST to /api/chat/ask through
symptom extraction → dosha scoring → RAG retrieval → Gemini call → response.

Uses httpx.AsyncClient against a live FastAPI app instance (in-process),
with MongoDB mocked via mongomock or a real test database.

Pre-conditions:
  - `ayurveda-app/bot-brain` on sys.path
  - FAISS vector store present
  - GEMINI_API_KEY optional (tests use mocked Gemini by default)
  - MONGODB_URI or mongomock for session state

Run:
  cd tests && pytest integration/test_e2e_chat_flow.py -v -m integration
"""

import sys
import os
import json
from unittest.mock import patch, MagicMock, AsyncMock

import pytest
import pytest_asyncio

BOT_BRAIN = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../ayurveda-app/bot-brain")
)
if BOT_BRAIN not in sys.path:
    sys.path.insert(0, BOT_BRAIN)


# ── Try to import httpx; skip group if unavailable ──────────────────────────
httpx = pytest.importorskip("httpx", reason="httpx not installed — pip install httpx")
pytestmark = pytest.mark.integration


# ── Mock Gemini response factory ─────────────────────────────────────────────
def _make_gemini_followup(text: str) -> MagicMock:
    resp = MagicMock()
    resp.text = text
    return resp


def _make_gemini_diagnosis() -> MagicMock:
    """Returns a mock Gemini response that contains a ---REPORT_DATA--- block."""
    report_payload = {
        "schemaVersion": "reports.v2",
        "patientInfo": {
            "name": "Arjun Sharma",
            "age": 34,
            "gender": "male",
        },
        "reports": [
            {
                "reportType": "Diagnosis Report",
                "reportData": {
                    "threatLevel": "Moderate",
                    "symptomsReported": ["burning sensation", "acid reflux"],
                    "clinicalImpression": "Pitta imbalance with digestive involvement.",
                    "doshaProfile": {
                        "dominant": "Pitta",
                        "percentages": {"Vata": 20, "Pitta": 55, "Kapha": 25},
                    },
                    "kpis": [
                        {"label": "Primary Dosha", "value": "Pitta"},
                        {"label": "Threat Level", "value": "Moderate"},
                    ],
                },
            }
        ],
    }
    resp = MagicMock()
    resp.text = f"---REPORT_DATA---{json.dumps(report_payload)}"
    return resp


# ─────────────────────────────────────────────────────────────────────────────
# Fixture: In-process FastAPI test client
# ─────────────────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def mock_db():
    """
    Returns a mock motor AsyncIOMotorDatabase with a sessions collection
    that persists state within the test session.
    """
    sessions_store = {}

    class MockCollection:
        def __init__(self, data_store):
            self._store = data_store

        async def insert_one(self, doc):
            from bson import ObjectId
            oid = ObjectId()
            doc["_id"] = oid
            self._store[str(oid)] = dict(doc)
            result = MagicMock()
            result.inserted_id = oid
            return result

        async def find_one(self, query):
            from bson import ObjectId
            if "_id" in query:
                key = str(query["_id"])
                return dict(self._store.get(key, {})) or None
            return None

        async def update_one(self, query, update, upsert=False):
            from bson import ObjectId
            if "_id" in query:
                key = str(query["_id"])
                if key in self._store:
                    set_data = update.get("$set", {})
                    self._store[key].update(set_data)
            result = MagicMock()
            result.modified_count = 1
            return result

        async def delete_one(self, query):
            from bson import ObjectId
            if "_id" in query:
                key = str(query["_id"])
                removed = self._store.pop(key, None)
                result = MagicMock()
                result.deleted_count = 1 if removed else 0
                return result

        def find(self, *args, **kwargs):
            cursor = MagicMock()
            cursor.sort = MagicMock(return_value=cursor)

            async def to_list(length=None):
                return list(self._store.values())[:length or 200]

            cursor.to_list = to_list
            return cursor

        async def command(self, cmd):
            return {"ok": 1}

    class MockDB:
        def __init__(self):
            self.sessions = MockCollection(sessions_store)
            self.users = MockCollection({})
            self.patients = MockCollection({})
            self.reports = MockCollection({})

        async def command(self, cmd):
            return {"ok": 1}

    return MockDB()


@pytest.fixture(scope="module")
def test_app(mock_db):
    """
    Create the FastAPI app with a patched DB and mocked Gemini.
    Returns an httpx.AsyncClient.
    """
    from fastapi.testclient import TestClient
    import api_server

    api_server.db = mock_db
    api_server._mongo_client = MagicMock()
    return TestClient(api_server.app)


# ─────────────────────────────────────────────────────────────────────────────
# TC-E2E-001  Session lifecycle
# ─────────────────────────────────────────────────────────────────────────────
class TestSessionLifecycle:

    def test_create_session_returns_session_id(self, test_app, mock_db):
        """
        ID: TC-E2E-001
        POST /api/chat/create with valid userId must return HTTP 200 and
        a session document containing '_id', 'userId', and 'messages'.
        Input:  {"userId": "507f1f77bcf86cd799439011"}
        Expected: status=200, data._id is non-empty string, data.messages=[]
        """
        payload = {"userId": "507f1f77bcf86cd799439011"}
        response = test_app.post("/api/chat/create", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        body = response.json()
        assert "data" in body
        session = body["data"]
        assert "_id" in session and session["_id"]
        assert session["userId"] == "507f1f77bcf86cd799439011"
        assert session["messages"] == []

    def test_create_session_missing_userid_returns_400(self, test_app):
        """
        ID: TC-E2E-002
        POST /api/chat/create without userId must return HTTP 400.
        """
        response = test_app.post("/api/chat/create", json={})
        assert response.status_code == 400

    def test_get_session_by_id(self, test_app, mock_db):
        """
        ID: TC-E2E-003
        GET /api/chat/session/{session_id} must return the created session.
        """
        # Create session first
        create_resp = test_app.post(
            "/api/chat/create", json={"userId": "507f1f77bcf86cd799439011"}
        )
        session_id = create_resp.json()["data"]["_id"]

        get_resp = test_app.get(f"/api/chat/session/{session_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["data"]["_id"] == session_id

    def test_get_nonexistent_session_returns_404(self, test_app):
        """
        ID: TC-E2E-004
        GET /api/chat/session/{invalid_id} for a nonexistent session must return 404.
        """
        response = test_app.get("/api/chat/session/507f1f77bcf86cd799439099")
        assert response.status_code == 404

    def test_get_session_with_malformed_id_returns_400(self, test_app):
        """
        ID: TC-E2E-005
        GET /api/chat/session/NOT_AN_OBJECT_ID must return 400 (invalid ID format).
        """
        response = test_app.get("/api/chat/session/not-an-objectid")
        assert response.status_code == 400

    def test_delete_session_returns_ok_true(self, test_app, mock_db):
        """
        ID: TC-E2E-006
        DELETE /api/chat/session/{session_id} must return {'ok': True}.
        """
        create_resp = test_app.post(
            "/api/chat/create", json={"userId": "507f1f77bcf86cd799439011"}
        )
        session_id = create_resp.json()["data"]["_id"]

        del_resp = test_app.delete(f"/api/chat/session/{session_id}")
        assert del_resp.status_code == 200
        assert del_resp.json().get("ok") is True

    def test_get_sessions_for_user_returns_list(self, test_app):
        """
        ID: TC-E2E-007
        GET /api/chat/sessions/{user_id} must return a list in 'data' key.
        """
        response = test_app.get("/api/chat/sessions/507f1f77bcf86cd799439011")
        assert response.status_code == 200
        assert isinstance(response.json().get("data"), list)


# ─────────────────────────────────────────────────────────────────────────────
# TC-E2E-008  Ask AI (conversational phase)
# ─────────────────────────────────────────────────────────────────────────────
class TestAskAIConversational:
    """Tests the /api/chat/ask/{session_id} endpoint in conversational phase."""

    @pytest.fixture
    def active_session_id(self, test_app):
        """Create a session and return its ID."""
        resp = test_app.post(
            "/api/chat/create", json={"userId": "507f1f77bcf86cd799439011"}
        )
        return resp.json()["data"]["_id"]

    def test_ask_returns_type_and_content(self, test_app, active_session_id):
        """
        ID: TC-E2E-008
        POST /api/chat/ask must return JSON with 'content', 'type', and 'title' keys.
        Input:  {"text": "My name is Arjun Sharma"}
        Expected: response has 'content' (str), 'type' in ['text','diagnosis'], 'title' (str)
        """
        with patch("bot.get_next_question", return_value="What is your age and gender?"), \
             patch("bot.extract_symptoms_from_text", return_value=[]), \
             patch("bot.should_give_diagnosis", return_value=False), \
             patch("bot.intake_medical_history_satisfied", return_value=False):

            payload = {"text": "My name is Arjun Sharma"}
            response = test_app.post(f"/api/chat/ask/{active_session_id}", json=payload)

        assert response.status_code == 200
        body = response.json()
        assert "content" in body
        assert "type" in body
        assert "title" in body
        assert body["type"] in ("text", "diagnosis")

    def test_ask_missing_text_returns_400(self, test_app, active_session_id):
        """
        ID: TC-E2E-009
        POST /api/chat/ask with empty body must return 400.
        """
        response = test_app.post(f"/api/chat/ask/{active_session_id}", json={})
        assert response.status_code == 400

    def test_ask_invalid_session_id_returns_400(self, test_app):
        """
        ID: TC-E2E-010
        POST /api/chat/ask with malformed session_id must return 400.
        """
        response = test_app.post("/api/chat/ask/invalid-id", json={"text": "Hello"})
        assert response.status_code == 400

    def test_symptoms_are_extracted_and_accumulated(self, test_app, active_session_id, mock_db):
        """
        ID: TC-E2E-011
        After sending two symptom-containing messages, the session.symptoms list
        must grow and contain the extracted symptoms.
        Input message 1: 'I have burning sensation and acid reflux'
        Input message 2: 'Also experiencing dryness and joint pain'
        Expected: session.symptoms contains at least 2 distinct entries
        """
        with patch("bot.get_next_question", return_value="Noted. Any other symptoms?"), \
             patch("bot.extract_symptoms_from_text", side_effect=[
                 ["burning sensation", "acid reflux"],
                 ["dryness", "joint pain"],
             ]), \
             patch("bot.should_give_diagnosis", return_value=False), \
             patch("bot.intake_medical_history_satisfied", return_value=False):

            test_app.post(
                f"/api/chat/ask/{active_session_id}",
                json={"text": "I have burning sensation and acid reflux"},
            )
            test_app.post(
                f"/api/chat/ask/{active_session_id}",
                json={"text": "Also experiencing dryness and joint pain"},
            )

        session_resp = test_app.get(f"/api/chat/session/{active_session_id}")
        session = session_resp.json()["data"]
        symptoms = session.get("symptoms", [])
        assert len(symptoms) >= 2, f"Expected >=2 symptoms, got: {symptoms}"

    def test_message_history_persists_user_and_bot_roles(self, test_app, active_session_id):
        """
        ID: TC-E2E-012
        After a round-trip exchange, the session.messages must contain
        at least one 'user' role and one 'bot' role entry.
        """
        with patch("bot.get_next_question", return_value="Please share your age."), \
             patch("bot.extract_symptoms_from_text", return_value=[]), \
             patch("bot.should_give_diagnosis", return_value=False), \
             patch("bot.intake_medical_history_satisfied", return_value=False):

            test_app.post(
                f"/api/chat/ask/{active_session_id}",
                json={"text": "I am 35 years old."},
            )

        session_resp = test_app.get(f"/api/chat/session/{active_session_id}")
        messages = session_resp.json()["data"].get("messages", [])
        roles = {m.get("role") for m in messages}
        assert "user" in roles
        assert "bot" in roles or "report" in roles


# ─────────────────────────────────────────────────────────────────────────────
# TC-E2E-013  Diagnosis trigger → report generation (Data Flow 1)
# ─────────────────────────────────────────────────────────────────────────────
class TestDiagnosisTrigger:
    """Tests that the diagnosis path produces a report-type response."""

    @pytest.fixture
    def active_session_id(self, test_app):
        resp = test_app.post(
            "/api/chat/create", json={"userId": "507f1f77bcf86cd799439011"}
        )
        return resp.json()["data"]["_id"]

    def test_diagnose_trigger_word_produces_diagnosis_type(self, test_app, active_session_id):
        """
        ID: TC-E2E-013
        Sending 'diagnose' as text (when intake is satisfied) must route to
        the diagnose() function and return type='diagnosis'.
        """
        with patch("bot.diagnose", return_value=f"---REPORT_DATA---{json.dumps({'schemaVersion': 'reports.v2', 'reports': [], 'patientInfo': {}})}"), \
             patch("bot.extract_symptoms_from_text", return_value=["burning", "acid reflux"]), \
             patch("bot.should_give_diagnosis", return_value=True), \
             patch("bot.intake_medical_history_satisfied", return_value=True), \
             patch("api_server.load_patient_profile", new_callable=AsyncMock, return_value=None), \
             patch("api_server.upsert_patient_consultation_report", new_callable=AsyncMock), \
             patch("api_server.sync_patient_profile_from_history", new_callable=AsyncMock):

            response = test_app.post(
                f"/api/chat/ask/{active_session_id}",
                json={"text": "diagnose"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["type"] == "diagnosis", (
            f"Expected type='diagnosis', got '{body['type']}'"
        )

    def test_diagnosis_response_contains_report_data_marker(self, test_app, active_session_id):
        """
        ID: TC-E2E-014
        When diagnose() returns a ---REPORT_DATA--- payload, the response
        content must contain that marker.
        """
        mock_report = json.dumps({
            "schemaVersion": "reports.v2",
            "patientInfo": {"name": "Arjun"},
            "reports": [],
        })

        with patch("bot.diagnose", return_value=f"---REPORT_DATA---{mock_report}"), \
             patch("bot.extract_symptoms_from_text", return_value=["burning"]), \
             patch("bot.should_give_diagnosis", return_value=True), \
             patch("bot.intake_medical_history_satisfied", return_value=True), \
             patch("api_server.load_patient_profile", new_callable=AsyncMock, return_value=None), \
             patch("api_server.upsert_patient_consultation_report", new_callable=AsyncMock), \
             patch("api_server.sync_patient_profile_from_history", new_callable=AsyncMock):

            response = test_app.post(
                f"/api/chat/ask/{active_session_id}",
                json={"text": "Yes, generate my report now."},
            )

        body = response.json()
        assert "---REPORT_DATA---" in body.get("content", ""), (
            "Diagnosis content must include ---REPORT_DATA--- marker"
        )

    def test_report_persisted_to_reports_collection_after_diagnosis(
        self, test_app, active_session_id, mock_db
    ):
        """
        ID: TC-E2E-015
        After a diagnosis response, upsert_patient_consultation_report must be
        invoked (verified via mock call count).
        Pre-condition: session has userId set; Gemini returns valid report JSON.
        """
        mock_report = json.dumps({
            "schemaVersion": "reports.v2",
            "patientInfo": {"name": "Arjun"},
            "reports": [],
        })

        with patch("bot.diagnose", return_value=f"---REPORT_DATA---{mock_report}"), \
             patch("bot.extract_symptoms_from_text", return_value=["burning"]), \
             patch("bot.should_give_diagnosis", return_value=True), \
             patch("bot.intake_medical_history_satisfied", return_value=True), \
             patch("api_server.load_patient_profile", new_callable=AsyncMock, return_value=None), \
             patch("api_server.upsert_patient_consultation_report", new_callable=AsyncMock) as mock_upsert, \
             patch("api_server.sync_patient_profile_from_history", new_callable=AsyncMock):

            test_app.post(
                f"/api/chat/ask/{active_session_id}",
                json={"text": "Yes please."},
            )

        mock_upsert.assert_called_once()

    def test_session_title_updated_after_diagnosis(self, test_app, active_session_id):
        """
        ID: TC-E2E-016
        After generating a diagnosis, the session title must be updated to
        reflect the clinical finding, not remain 'New Consultation'.
        """
        mock_report = json.dumps({
            "schemaVersion": "reports.v2",
            "patientInfo": {"name": "Arjun"},
            "reports": [],
        })

        with patch("bot.diagnose", return_value=f"---REPORT_DATA---{mock_report}"), \
             patch("bot.clinical_title_from_diagnosis_text", return_value="Pitta Imbalance — Digestive"), \
             patch("bot.extract_symptoms_from_text", return_value=["acid reflux"]), \
             patch("bot.should_give_diagnosis", return_value=True), \
             patch("bot.intake_medical_history_satisfied", return_value=True), \
             patch("api_server.load_patient_profile", new_callable=AsyncMock, return_value=None), \
             patch("api_server.upsert_patient_consultation_report", new_callable=AsyncMock), \
             patch("api_server.sync_patient_profile_from_history", new_callable=AsyncMock):

            response = test_app.post(
                f"/api/chat/ask/{active_session_id}",
                json={"text": "Generate my report."},
            )

        assert response.json()["title"] != "New Consultation", (
            "Session title must be updated after diagnosis"
        )


# ─────────────────────────────────────────────────────────────────────────────
# TC-E2E-017  Health endpoint
# ─────────────────────────────────────────────────────────────────────────────
class TestHealthEndpoint:

    def test_health_endpoint_returns_ok(self, test_app):
        """
        ID: TC-E2E-017
        GET /api/health must return HTTP 200 with status='ok'.
        """
        with patch("gemini_client.get_configured_api_keys", return_value=["key1"]):
            response = test_app.get("/api/health")
        assert response.status_code == 200
        body = response.json()
        assert body.get("status") == "ok"
        assert body.get("server") == "bot-brain"

    def test_health_reports_gemini_key_count(self, test_app):
        """
        ID: TC-E2E-018
        The health endpoint must report geminiKeysConfigured as an integer.
        """
        with patch("gemini_client.get_configured_api_keys", return_value=["key1", "key2"]):
            response = test_app.get("/api/health")
        body = response.json()
        assert isinstance(body.get("geminiKeysConfigured"), int)
        assert body.get("geminiFallbackReady") is True


# ─────────────────────────────────────────────────────────────────────────────
# TC-E2E-019  Bubble delimiter splitting
# ─────────────────────────────────────────────────────────────────────────────
class TestBubbleDelimiterSplitting:

    def test_split_bot_bubbles_on_single_part(self):
        """
        ID: TC-E2E-019
        A plain message without the delimiter returns a single-item list.
        """
        from api_server import _split_bot_bubbles
        result = _split_bot_bubbles("Hello, please share your name.")
        assert result == ["Hello, please share your name."]

    def test_split_bot_bubbles_on_multi_part(self):
        """
        ID: TC-E2E-020
        A message with '---NEXT_BUBBLE---' must split into 2 parts.
        """
        from api_server import _split_bot_bubbles, BUBBLE_DELIMITER
        msg = f"Part one.{BUBBLE_DELIMITER}Part two."
        result = _split_bot_bubbles(msg)
        assert len(result) == 2
        assert result[0] == "Part one."
        assert result[1] == "Part two."

    def test_split_bot_bubbles_empty_string(self):
        """
        ID: TC-E2E-021
        Empty string must return empty list.
        """
        from api_server import _split_bot_bubbles
        assert _split_bot_bubbles("") == []

    def test_split_bot_bubbles_strips_whitespace_from_parts(self):
        """
        ID: TC-E2E-022
        Each bubble part must have leading/trailing whitespace stripped.
        """
        from api_server import _split_bot_bubbles, BUBBLE_DELIMITER
        msg = f"  Part one.  {BUBBLE_DELIMITER}  Part two.  "
        result = _split_bot_bubbles(msg)
        for part in result:
            assert part == part.strip()

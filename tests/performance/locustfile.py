"""
GROUP 5 — Performance & Recovery Smoke Tests
============================================
Locust load testing suite asserting p95 response times < 2.0 seconds
for both the bot-brain (Python/FastAPI on :5002) and doctor-portal
(Node/Express on :5001) under concurrent user load.

KPIs from AyurCare blueprint:
  - p95 response time: ≤ 2.0 seconds for all critical endpoints
  - Error rate: ≤ 1% under nominal load (25 concurrent users)
  - Throughput: ≥ 10 RPS under 25 concurrent users

Pre-conditions:
  - Both services running (or Docker Compose up)
  - pip install locust
  - FAISS vector store populated, MongoDB accessible
  - For auth-required endpoints: a valid test JWT is set in BOT_JWT env var

Run (headless, 25 users, 60 seconds):
  locust -f tests/performance/locustfile.py \
    --headless -u 25 -r 5 -t 60s \
    --host http://localhost:5002 \
    --html tests/performance/report.html \
    --csv tests/performance/results

Run (interactive UI):
  locust -f tests/performance/locustfile.py

Assertions:
  Use --exit-code-on-error 1 and configure thresholds in the on_quitting hook.
  Or run via pytest-locust for CI integration (see run_load_test.py).
"""

import os
import json
import random
import time
import string

from locust import (
    HttpUser,
    TaskSet,
    task,
    between,
    events,
    constant_throughput,
)

# ── Environment ───────────────────────────────────────────────────────────────
BOT_BRAIN_HOST = os.getenv("BOT_BRAIN_HOST", "http://localhost:5002")
DOCTOR_PORTAL_HOST = os.getenv("DOCTOR_PORTAL_HOST", "http://localhost:5001")
TEST_JWT = os.getenv("BOT_JWT", "")
TEST_USER_ID = os.getenv("TEST_USER_ID", "507f1f77bcf86cd799439011")

# ── P95 threshold assertion (used in on_quitting hook) ───────────────────────
P95_THRESHOLD_MS = 2000  # 2.0 seconds in milliseconds
MAX_ERROR_RATE = 0.01    # 1%

_request_stats: dict = {"total": 0, "failures": 0, "latencies_ms": []}


@events.request.add_listener
def on_request(
    request_type, name, response_time, response_length, response, context, exception, **kwargs
):
    """Track all request stats for threshold assertions."""
    _request_stats["total"] += 1
    _request_stats["latencies_ms"].append(response_time)
    if exception or (response and response.status_code >= 400):
        _request_stats["failures"] += 1


@events.quitting.add_listener
def on_quitting(environment, **kwargs):
    """
    Called when the Locust run ends.
    Assert p95 and error rate against blueprint KPIs.
    Exits with non-zero code if thresholds are breached (for CI gates).
    """
    latencies = sorted(_request_stats["latencies_ms"])
    total = _request_stats["total"]
    failures = _request_stats["failures"]

    if not latencies:
        print("[PERF] No requests recorded — check if services are running.")
        return

    p95_idx = int(len(latencies) * 0.95)
    p95 = latencies[p95_idx] if p95_idx < len(latencies) else latencies[-1]
    error_rate = failures / total if total > 0 else 0.0
    rps = total / environment.stats.total.elapsed_time if environment.stats.total.elapsed_time > 0 else 0

    print(f"\n{'─'*60}")
    print(f"[PERF REPORT] Total requests: {total}")
    print(f"[PERF REPORT] Failures: {failures} ({error_rate*100:.2f}%)")
    print(f"[PERF REPORT] p95 latency: {p95:.0f}ms (threshold: {P95_THRESHOLD_MS}ms)")
    print(f"[PERF REPORT] Throughput: {rps:.1f} RPS")
    print(f"{'─'*60}\n")

    violations = []
    if p95 > P95_THRESHOLD_MS:
        violations.append(
            f"p95 latency EXCEEDED: {p95:.0f}ms > {P95_THRESHOLD_MS}ms"
        )
    if error_rate > MAX_ERROR_RATE:
        violations.append(
            f"Error rate EXCEEDED: {error_rate*100:.2f}% > {MAX_ERROR_RATE*100:.1f}%"
        )

    if violations:
        print("[PERF FAIL]", "\n[PERF FAIL] ".join(violations))
        environment.process_exit_code = 1
    else:
        print("[PERF PASS] All KPI thresholds met.")
        environment.process_exit_code = 0


# ─────────────────────────────────────────────────────────────────────────────
# Bot-Brain Task Sets
# ─────────────────────────────────────────────────────────────────────────────

class BotBrainHealthTasks(TaskSet):
    """
    TC-PERF-001: Health endpoint — lightweight probe.
    Target: p95 < 200ms (should be much faster than the 2s SLA).
    """

    @task(5)
    def get_health(self):
        """
        ID: TC-PERF-001
        GET /api/health must respond in well under 2 seconds.
        High frequency (weight=5) to establish a baseline.
        """
        with self.client.get(
            "/api/health",
            name="GET /api/health",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"Health check failed: {resp.status_code}")
            elif resp.elapsed.total_seconds() > 2.0:
                resp.failure(f"Health slow: {resp.elapsed.total_seconds():.2f}s")
            else:
                resp.success()

    @task(1)
    def get_root(self):
        """
        ID: TC-PERF-002
        GET / (root) must return HTTP 200 quickly.
        """
        with self.client.get("/", name="GET /", catch_response=True) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Root failed: {resp.status_code}")


class BotBrainChatTasks(TaskSet):
    """
    TC-PERF-003: Session management endpoints.
    """
    session_ids: list = []

    def on_start(self):
        """Create a test session to use in subsequent tasks."""
        resp = self.client.post(
            "/api/chat/create",
            json={"userId": TEST_USER_ID},
            name="POST /api/chat/create [setup]",
        )
        if resp.status_code == 200:
            sid = resp.json().get("data", {}).get("_id")
            if sid:
                self.session_ids.append(sid)

    @task(3)
    def create_session(self):
        """
        ID: TC-PERF-003
        POST /api/chat/create — session creation under load.
        Expected: p95 < 2s, status 200.
        """
        with self.client.post(
            "/api/chat/create",
            json={"userId": TEST_USER_ID},
            name="POST /api/chat/create",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                sid = resp.json().get("data", {}).get("_id")
                if sid:
                    self.session_ids.append(sid)
                resp.success()
            else:
                resp.failure(f"Session create failed: {resp.status_code} — {resp.text[:100]}")

    @task(2)
    def list_sessions(self):
        """
        ID: TC-PERF-004
        GET /api/chat/sessions/{user_id} — listing sessions under concurrent load.
        """
        with self.client.get(
            f"/api/chat/sessions/{TEST_USER_ID}",
            name="GET /api/chat/sessions/{user_id}",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"List sessions failed: {resp.status_code}")

    @task(1)
    def ask_simple_question(self):
        """
        ID: TC-PERF-005
        POST /api/chat/ask/{session_id} — a simple intake question.
        This is the hot path: symptom intake → NLP → Gemini → response.
        Expected: p95 < 2.0 seconds.

        NOTE: This may exceed 2s if Gemini API has latency.
        The test is a benchmark measurement, not a hard pass/fail at the Locust level
        (the on_quitting hook enforces the actual threshold).
        """
        if not self.session_ids:
            return
        session_id = random.choice(self.session_ids)
        messages = [
            "My name is Arjun Sharma.",
            "I am 34 years old, male.",
            "I am 175 cm tall and weigh 78 kg.",
            "I have burning sensation and acid reflux.",
            "I also have skin irritation and headaches.",
        ]
        with self.client.post(
            f"/api/chat/ask/{session_id}",
            json={"text": random.choice(messages)},
            name="POST /api/chat/ask/{session_id}",
            catch_response=True,
            timeout=10,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code in (404, 400):
                # Session may have been deleted; not a server error
                resp.failure(f"Session missing: {resp.status_code}")
            else:
                resp.failure(f"Ask failed: {resp.status_code} — {resp.text[:100]}")


class WellnessFeedTasks(TaskSet):
    """
    TC-PERF-006: Wellness feed insights (synchronous Gemini call).
    """

    _wellness_payloads = [
        {
            "dosha": "Pitta",
            "profile": {"age": 34, "gender": "male"},
            "wellness": {
                "hydrationGlasses": 6,
                "steps": 4500,
                "sleepQuality": 3,
                "energy": 3,
                "stress": 4,
                "digestionQuality": 2,
            },
        },
        {
            "dosha": "Vata",
            "profile": {"age": 28, "gender": "female"},
            "wellness": {
                "hydrationGlasses": 4,
                "steps": 2000,
                "sleepQuality": 2,
                "energy": 2,
                "stress": 5,
                "digestionQuality": 1,
            },
        },
        {
            "dosha": "Kapha",
            "profile": {"age": 45, "gender": "male"},
            "wellness": {
                "hydrationGlasses": 8,
                "steps": 8000,
                "sleepQuality": 4,
                "energy": 4,
                "stress": 2,
                "digestionQuality": 4,
            },
        },
    ]

    @task(2)
    def wellness_insights(self):
        """
        ID: TC-PERF-006
        POST /api/wellness-feed/insights — personalized daily coaching call.
        Involves a Gemini API call; expected p95 < 2.0s at low concurrency.
        """
        payload = random.choice(self._wellness_payloads)
        with self.client.post(
            "/api/wellness-feed/insights",
            json=payload,
            name="POST /api/wellness-feed/insights",
            catch_response=True,
            timeout=15,
        ) as resp:
            if resp.status_code == 200:
                body = resp.json()
                if "greeting" in body or "dosha_status" in body:
                    resp.success()
                elif "error" in body:
                    resp.failure(f"Wellness AI error: {body.get('error')}")
                else:
                    resp.success()  # Unexpected structure but HTTP 200
            else:
                resp.failure(f"Wellness failed: {resp.status_code}")

    @task(1)
    def meal_plan_generation(self):
        """
        ID: TC-PERF-007
        POST /api/meal-planner/generate — synchronous meal plan via Gemini.
        """
        payload = {
            "dosha": random.choice(["Pitta", "Vata", "Kapha"]),
            "height": f"{random.randint(155, 185)}",
            "weight": f"{random.randint(55, 90)}",
            "allergies": "None",
            "goals": "General wellness",
            "preferences": "Vegetarian",
        }
        with self.client.post(
            "/api/meal-planner/generate",
            json=payload,
            name="POST /api/meal-planner/generate",
            catch_response=True,
            timeout=15,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Meal plan failed: {resp.status_code}")


class MedicineCheckerTasks(TaskSet):
    """
    TC-PERF-008: Medicine interaction checker.
    """

    @task(1)
    def check_medicines(self):
        """
        ID: TC-PERF-008
        POST /api/medicine-checker/check — drug interaction analysis.
        """
        pairs = [
            {
                "ayurvedic_medicines": ["Triphala", "Ashwagandha"],
                "allopathic_medicines": ["Metformin"],
            },
            {
                "ayurvedic_medicines": ["Shilajit", "Brahmi"],
                "allopathic_medicines": ["Atorvastatin", "Lisinopril"],
            },
            {
                "ayurvedic_medicines": ["Guduchi"],
                "allopathic_medicines": [],
            },
        ]
        with self.client.post(
            "/api/medicine-checker/check",
            json=random.choice(pairs),
            name="POST /api/medicine-checker/check",
            catch_response=True,
            timeout=15,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Medicine check failed: {resp.status_code}")


# ─────────────────────────────────────────────────────────────────────────────
# Doctor Portal Task Sets
# ─────────────────────────────────────────────────────────────────────────────

class DoctorPortalTasks(TaskSet):
    """
    TC-PERF-009 through TC-PERF-012: Doctor portal endpoints.
    Tests public endpoints and (with token) authenticated endpoints.
    """

    def on_start(self):
        """Set auth header if TEST_JWT is configured."""
        if TEST_JWT:
            self.client.headers.update({"Authorization": f"Bearer {TEST_JWT}"})

    @task(4)
    def portal_health(self):
        """
        ID: TC-PERF-009
        GET /api/health on doctor portal — baseline health check.
        """
        with self.client.get(
            "/api/health",
            name="DP: GET /api/health",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Portal health failed: {resp.status_code}")

    @task(3)
    def public_doctor_list(self):
        """
        ID: TC-PERF-010
        GET /api/public/doctors — doctor discovery (no auth required).
        Expected: p95 < 2.0 seconds.
        """
        with self.client.get(
            "/api/public/doctors",
            name="DP: GET /api/public/doctors",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 404):
                resp.success()
            else:
                resp.failure(f"Doctor list failed: {resp.status_code}")

    @task(2)
    def appointment_listing(self):
        """
        ID: TC-PERF-011
        GET /api/appointments — appointment list for authenticated user.
        """
        with self.client.get(
            "/api/appointments",
            name="DP: GET /api/appointments",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401, 403):
                resp.success()
            else:
                resp.failure(f"Appointments failed: {resp.status_code}")

    @task(1)
    def patient_report_listing(self):
        """
        ID: TC-PERF-012
        GET /api/patient/reports — patient consultation history.
        """
        with self.client.get(
            "/api/patient/reports",
            name="DP: GET /api/patient/reports",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401, 403):
                resp.success()
            else:
                resp.failure(f"Patient reports failed: {resp.status_code}")


# ─────────────────────────────────────────────────────────────────────────────
# User Classes
# ─────────────────────────────────────────────────────────────────────────────

class BotBrainUser(HttpUser):
    """
    TC-PERF-013: Simulated patient user hitting bot-brain endpoints.

    Profile:
      - 60% chat operations (session create + ask)
      - 30% wellness/meal APIs
      - 10% medicine checker
    """
    host = BOT_BRAIN_HOST
    wait_time = between(1, 3)  # Realistic user think time

    tasks = {
        BotBrainHealthTasks: 1,
        BotBrainChatTasks: 6,
        WellnessFeedTasks: 3,
        MedicineCheckerTasks: 1,
    }


class DoctorPortalUser(HttpUser):
    """
    TC-PERF-014: Simulated doctor/patient user hitting the doctor portal.

    Profile:
      - 40% health probes
      - 40% public listings
      - 20% authenticated operations
    """
    host = DOCTOR_PORTAL_HOST
    wait_time = between(0.5, 2)

    tasks = [DoctorPortalTasks]


# ─────────────────────────────────────────────────────────────────────────────
# Standalone Spike Test User (burst mode)
# ─────────────────────────────────────────────────────────────────────────────

class SpikeTestUser(HttpUser):
    """
    TC-PERF-015: Spike test — no wait time, maximum throughput.
    Used separately with a short run to test recovery:

    locust -f locustfile.py SpikeTestUser --headless -u 50 -r 50 -t 10s
    """
    host = BOT_BRAIN_HOST
    wait_time = constant_throughput(2)  # 2 requests per second per user

    @task
    def spike_health(self):
        """
        ID: TC-PERF-015
        Burst GET /api/health to validate recovery after spike.
        The server must continue responding with p95 < 2s even under spike.
        """
        with self.client.get("/api/health", name="SPIKE: GET /api/health", catch_response=True) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Spike health fail: {resp.status_code}")

    @task
    def spike_session_create(self):
        """
        ID: TC-PERF-016
        Burst session creation to stress MongoDB write path.
        """
        with self.client.post(
            "/api/chat/create",
            json={"userId": TEST_USER_ID},
            name="SPIKE: POST /api/chat/create",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Spike session fail: {resp.status_code}")

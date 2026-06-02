# AyurCare AI — Complete Test Suite

All test files live in this single `tests/` folder. Nothing is spread across the project.

```
tests/
│
├── TEST_STRATEGY.md               ← This file (index + run guide)
├── pytest.ini                     ← Global pytest config (groups 1 & 2)
├── package.json                   ← JS dependencies (groups 3 & 4)
├── run_all_tests.ps1              ← One-command master runner (Windows)
│
├── unit/                          ── GROUP 1: Pure unit tests (Python)
│   ├── conftest.py                   Shared fixtures, sys.path bootstrap
│   ├── test_dosha_scoring.py         TC-DS-001 → TC-DS-064  (116 assertions)
│   └── test_ingestion_pipeline.py    TC-IP-001 → TC-IP-025  (25 tests)
│
├── integration/                   ── GROUP 2: Integration tests (Python)
│   ├── conftest.py                   Vector store + Gemini fixtures
│   ├── test_retrieval_agent.py       TC-RA-001 → TC-RA-028  (28 tests)
│   ├── test_gemini_client.py         TC-GC-001 → TC-GC-024  (24 tests)
│   └── test_e2e_chat_flow.py         TC-E2E-001 → TC-E2E-022 (22 tests)
│
├── api/                           ── GROUP 3: Backend API tests (Jest/Supertest)
│   ├── jest.config.js
│   ├── test_doctor_portal_security.test.js   TC-API-001 → TC-API-047
│   └── test_report_persistence.test.js       TC-RP-001  → TC-RP-018
│
├── frontend/                      ── GROUP 4: UI component tests (Jest/RTL)
│   ├── jest.config.js
│   ├── setup.js
│   └── ReportRenderer.test.jsx            TC-UI-001  → TC-UI-048
│
└── performance/                   ── GROUP 5: Load tests (Locust)
    ├── locustfile.py              Locust user classes + p95 threshold hooks
    └── run_load_test.py           CI runner with CSV threshold assertions
```

---

## Quick Start

### Install dependencies

```powershell
# Python (Groups 1, 2, 5)
cd ayurveda-app/bot-brain
pip install -r requirements.txt
pip install pytest pytest-asyncio httpx locust

# Node.js (Groups 3, 4)
cd tests
npm install
```

### Run everything (Windows)

```powershell
cd tests
.\run_all_tests.ps1
```

### Run a specific group

```powershell
.\run_all_tests.ps1 -GroupFilter unit
.\run_all_tests.ps1 -GroupFilter integration
.\run_all_tests.ps1 -GroupFilter api
.\run_all_tests.ps1 -GroupFilter frontend
.\run_all_tests.ps1 -GroupFilter perf
.\run_all_tests.ps1 -SkipPerf      # everything except Locust
```

### Run individual files

```powershell
# Python
cd tests
pytest unit/test_dosha_scoring.py -v --tb=short
pytest unit/test_dosha_scoring.py -v -k "TC_DS_016_CRITICAL"   # single test
pytest integration/ -v -k "not live"                            # no real Gemini

# Node.js
npx jest api/test_doctor_portal_security.test.js --forceExit --verbose
npx jest api/test_report_persistence.test.js     --forceExit --verbose
npx jest frontend/ReportRenderer.test.jsx        --forceExit --verbose

# Locust (interactive)
locust -f performance/locustfile.py
# Locust (headless, 25 users, 60s)
locust -f performance/locustfile.py BotBrainUser --headless -u 25 -r 5 -t 60s --host http://localhost:5002
```

---

## Environment Variables

| Variable | Default | Required for |
|----------|---------|-------------|
| `MONGODB_URI` | — | Groups 2, 3 |
| `MONGODB_TEST_URI` | `mongodb://localhost:27017/ayurcare_test` | Group 3 |
| `GEMINI_API_KEY` | — | Group 2 live tests only |
| `JWT_SECRET` | `doctor_portal_secret_key_123` | Group 3 |
| `BOT_BRAIN_HOST` | `http://localhost:5002` | Group 5 |
| `RERANKER_MODE` | `bm25` | Group 2 (use bm25 for CI speed) |

---

## Test Count by Group

| Group | File(s) | Tests |
|-------|---------|-------|
| 1 — Unit: Dosha Scoring | `unit/test_dosha_scoring.py` | 116 |
| 1 — Unit: Ingestion | `unit/test_ingestion_pipeline.py` | 25 |
| 2 — Integration: Retrieval | `integration/test_retrieval_agent.py` | 28 |
| 2 — Integration: Gemini | `integration/test_gemini_client.py` | 24 |
| 2 — E2E: Data Flow 1 | `integration/test_e2e_chat_flow.py` | 22 |
| 3 — API Security | `api/test_doctor_portal_security.test.js` | 47 |
| 3 — Report Persistence | `api/test_report_persistence.test.js` | 18 |
| 4 — Frontend | `frontend/ReportRenderer.test.jsx` | 48 |
| 5 — Performance | `performance/locustfile.py` | 16 task variants |
| **Total** | | **~328** |

---

## Key Test IDs

| ID | File | What it proves |
|----|------|----------------|
| **TC-DS-016-CRITICAL** | test_dosha_scoring.py | `"burning sensation"` phrase match (Pitta=2) prevents GUNA_MAP from double-counting the `"burning"` token (would be Pitta=4). Span exclusion logic is intact. |
| TC-DS-058 → TC-DS-064 | test_dosha_scoring.py | Live PHRASE_MAP / GUNA_MAP / PACIFY_TERMS match the authoritative reference dicts declared at the top of the file. |
| **TC-API-019** | test_doctor_portal_security.test.js | Payload-swap attack: replace JWT payload, keep original signature → `invalid signature` → 403. |
| **TC-API-020** | test_doctor_portal_security.test.js | `alg=none` (unsigned) JWT → modern jsonwebtoken rejects → 403. |
| **TC-API-021** | test_doctor_portal_security.test.js | Algorithm confusion (RS256 header / HS256 body) → rejected → 403. |
| **TC-API-041** | test_doctor_portal_security.test.js | `{$gt:""}` NoSQL injection neutralized by `String(email\|\|'')` coercion in authController → login returns 401, no token issued. |
| TC-RP-004 | test_report_persistence.test.js | Every new AI report has `hiddenByPatient = false` (doctor-queue visible) as the immutable initial state. |

---

## Performance KPIs (Group 5)

| Metric | Threshold | Enforced by |
|--------|-----------|-------------|
| p95 response time | ≤ 2000 ms | `on_quitting` hook in locustfile.py |
| Error rate | ≤ 1% | `on_quitting` hook |
| Throughput | ≥ 10 RPS @ 25 users | `run_load_test.py` CSV parsing |

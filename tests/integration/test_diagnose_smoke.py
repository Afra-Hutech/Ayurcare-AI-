"""
GROUP 2 — Integration Smoke Test: bot.diagnose()
=================================================
Properly structured pytest version of test_consolidation.py.

Differences from the original bot-brain script:
  - Uses pytest assertions (not print statements)
  - Marked @pytest.mark.slow so CI can skip with -m "not slow"
  - Requires live GEMINI_API_KEY — skipped automatically when missing
  - Tests the structural contract of the report, not just "did it print?"

Pre-conditions:
  - GEMINI_API_KEY set in ayurveda-app/bot-brain/.env
  - ayurveda-app/bot-brain on sys.path (conftest.py)

Run (including slow):
  cd tests && pytest integration/test_diagnose_smoke.py -v -m slow
Skip in CI:
  pytest integration/ -v -m "not slow"
"""
import sys
import os
import json
import pytest

BOT_BRAIN = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../ayurveda-app/bot-brain")
)
if BOT_BRAIN not in sys.path:
    sys.path.insert(0, BOT_BRAIN)


@pytest.fixture(scope="module")
def gemini_key():
    """Skip the entire module when GEMINI_API_KEY is absent."""
    from gemini_client import get_configured_api_keys
    keys = get_configured_api_keys()
    if not keys:
        pytest.skip("GEMINI_API_KEY not configured — skipping live diagnose() smoke test")
    return keys


# ── Shared diagnosis result (generated once per module) ───────────────────────
@pytest.fixture(scope="module")
def diagnosis_result(gemini_key):
    """
    Run diagnose() once and share the result across all tests in this module.
    This avoids redundant LLM calls (each call costs tokens and ~10 seconds).
    """
    from bot import diagnose

    symptoms = ["chronic bloating", "low appetite", "heavy feeling after meals"]
    history  = [
        "User: Hello, I have been feeling very bloated lately.",
        "AI: How long has this been happening?",
        "User: About 2 months. Worse after heavy meals.",
        "AI: Do you also feel heavy or lethargic?",
        "User: Yes, especially in the mornings.",
        "AI: What is your age and gender?",
        "User: 35, male. I sit at a desk all day.",
    ]
    result = diagnose(symptoms, history)
    assert result, "diagnose() returned None or empty string"
    return result


@pytest.fixture(scope="module")
def parsed_payload(diagnosis_result):
    """Extract and parse the JSON payload from the diagnose() output."""
    assert "---REPORT_DATA---" in diagnosis_result, (
        "diagnose() output must contain ---REPORT_DATA--- delimiter. "
        f"Got first 200 chars: {diagnosis_result[:200]}"
    )
    raw_json = diagnosis_result.split("---REPORT_DATA---")[1].strip()
    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        pytest.fail(f"Report payload is not valid JSON: {exc}\nRaw: {raw_json[:300]}")
    return payload


# ─────────────────────────────────────────────────────────────────────────────
# Structural contract tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.slow
@pytest.mark.integration
class TestDiagnoseOutputContract:
    """
    Validates the structural contract of bot.diagnose() output.
    Each test uses the shared `parsed_payload` fixture (one LLM call total).
    """

    def test_payload_is_dict_with_reports_key(self, parsed_payload):
        """
        TC-DIAG-001
        The top-level payload must be a dict containing a 'reports' list.
        """
        assert isinstance(parsed_payload, dict), (
            f"Expected dict, got {type(parsed_payload)}"
        )
        assert "reports" in parsed_payload, (
            f"Missing 'reports' key. Keys found: {list(parsed_payload.keys())}"
        )
        assert isinstance(parsed_payload["reports"], list)

    def test_at_least_one_report_generated(self, parsed_payload):
        """
        TC-DIAG-002
        diagnose() must generate at least one report object.
        """
        assert len(parsed_payload["reports"]) > 0, (
            "diagnose() returned an empty reports array"
        )

    def test_master_report_present(self, parsed_payload):
        """
        TC-DIAG-003
        A 'Master Report' must be present — it is the integrated synthesis.
        """
        report_types = [r.get("reportType") for r in parsed_payload["reports"]]
        assert "Master Report" in report_types, (
            f"Master Report missing. Report types found: {report_types}"
        )

    def test_master_report_has_master_kpis(self, parsed_payload):
        """
        TC-DIAG-004
        The Master Report's reportData must contain 'master_kpis' as a list.
        """
        master = next(
            (r for r in parsed_payload["reports"] if r.get("reportType") == "Master Report"),
            None,
        )
        assert master is not None
        data = master.get("reportData", {})
        assert "master_kpis" in data, (
            f"master_kpis missing from Master Report. Keys: {list(data.keys())}"
        )
        assert isinstance(data["master_kpis"], list)
        assert len(data["master_kpis"]) > 0, "master_kpis array must not be empty"

    def test_master_report_has_master_pain_points(self, parsed_payload):
        """
        TC-DIAG-005
        Master Report must contain 'master_pain_points' populated from symptoms.
        """
        master = next(
            (r for r in parsed_payload["reports"] if r.get("reportType") == "Master Report"),
            None,
        )
        assert master is not None
        data = master.get("reportData", {})
        assert "master_pain_points" in data, (
            f"master_pain_points missing. Keys: {list(data.keys())}"
        )

    @pytest.mark.parametrize("report_type", [
        "Root Cause Report",
        "Lifestyle Report",
        "Treatment Plan Report",
        "Risk Report",
    ])
    def test_specialty_report_present(self, parsed_payload, report_type):
        """
        TC-DIAG-006 to TC-DIAG-009
        Each specialty report type must be generated.
        """
        found = any(
            r.get("reportType") == report_type
            for r in parsed_payload["reports"]
        )
        assert found, (
            f"'{report_type}' missing from output. "
            f"Types found: {[r.get('reportType') for r in parsed_payload['reports']]}"
        )

    def test_lifestyle_report_has_no_redundant_kpis(self, parsed_payload):
        """
        TC-DIAG-010
        The Lifestyle Report must not contain a 'kpis' key — KPIs belong
        exclusively to the Master Report (redundancy check from original script).
        """
        lifestyle = next(
            (r for r in parsed_payload["reports"] if r.get("reportType") == "Lifestyle Report"),
            None,
        )
        if lifestyle is None:
            pytest.skip("Lifestyle Report not generated in this run")

        data   = lifestyle.get("reportData", {})
        kpis   = data.get("kpis", [])
        assert len(kpis) == 0, (
            f"Redundancy: Lifestyle Report contains {len(kpis)} KPI(s) — "
            "they should only appear in the Master Report"
        )

    def test_report_delimiter_present_in_raw_output(self, diagnosis_result):
        """
        TC-DIAG-011
        The raw output from diagnose() must include the ---REPORT_DATA--- delimiter
        so api_server.py can split the chat summary from the structured payload.
        """
        assert "---REPORT_DATA---" in diagnosis_result, (
            "Missing ---REPORT_DATA--- delimiter — api_server.py cannot parse this output"
        )

    def test_schema_version_is_reports_v2(self, parsed_payload):
        """
        TC-DIAG-012
        The payload schemaVersion must be 'reports.v2' so ReportRenderer.jsx
        and the PostgreSQL JSONB storage know how to handle the structure.
        """
        schema_version = parsed_payload.get("schemaVersion", "")
        assert schema_version == "reports.v2", (
            f"Expected schemaVersion='reports.v2', got '{schema_version}'"
        )

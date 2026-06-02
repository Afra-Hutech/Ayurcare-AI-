"""
Performance test CI runner.
Executes Locust headlessly and asserts thresholds against the CSV output.

Usage:
  python tests/performance/run_load_test.py

Exit codes:
  0 — all thresholds passed
  1 — at least one threshold breached
"""

import subprocess
import sys
import os
import csv
import io

# ── Configuration ─────────────────────────────────────────────────────────────
BOT_BRAIN_HOST = os.getenv("BOT_BRAIN_HOST", "http://localhost:5002")
USERS = int(os.getenv("PERF_USERS", "25"))
SPAWN_RATE = int(os.getenv("PERF_SPAWN_RATE", "5"))
DURATION = os.getenv("PERF_DURATION", "60s")
CSV_PREFIX = os.path.join(os.path.dirname(__file__), "ci_results")
HTML_REPORT = os.path.join(os.path.dirname(__file__), "ci_report.html")

P95_THRESHOLD_MS = float(os.getenv("PERF_P95_MS", "2000"))
MAX_FAIL_RATE = float(os.getenv("PERF_FAIL_RATE", "0.01"))

LOCUST_CMD = [
    "locust",
    "-f", os.path.join(os.path.dirname(__file__), "locustfile.py"),
    "BotBrainUser",
    "--headless",
    f"--host={BOT_BRAIN_HOST}",
    f"-u={USERS}",
    f"-r={SPAWN_RATE}",
    f"-t={DURATION}",
    f"--html={HTML_REPORT}",
    f"--csv={CSV_PREFIX}",
    "--loglevel=WARNING",
]


def parse_stats_csv(csv_path: str) -> list:
    """Parse Locust stats CSV into list of dicts."""
    rows = []
    try:
        with open(csv_path, newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                rows.append(row)
    except FileNotFoundError:
        print(f"[WARN] Stats CSV not found: {csv_path}")
    return rows


def check_thresholds(stats_rows: list) -> list:
    """
    Returns a list of threshold violation strings.
    Empty list means all thresholds passed.
    """
    violations = []
    for row in stats_rows:
        name = row.get("Name", "")
        if name == "Aggregated":
            continue

        # p95 response time
        p95 = row.get("95%", "0")
        try:
            p95_ms = float(p95)
        except ValueError:
            p95_ms = 0.0
        if p95_ms > P95_THRESHOLD_MS:
            violations.append(
                f"[FAIL] p95 {p95_ms:.0f}ms > {P95_THRESHOLD_MS:.0f}ms — endpoint: '{name}'"
            )

        # Failure rate
        req_count = int(row.get("Request Count", 0) or 0)
        fail_count = int(row.get("Failure Count", 0) or 0)
        if req_count > 0:
            fail_rate = fail_count / req_count
            if fail_rate > MAX_FAIL_RATE:
                violations.append(
                    f"[FAIL] Failure rate {fail_rate*100:.1f}% > {MAX_FAIL_RATE*100:.1f}% "
                    f"— endpoint: '{name}'"
                )

    return violations


def main():
    print(f"[PERF] Starting load test: {USERS} users, {SPAWN_RATE}/s spawn, {DURATION}")
    print(f"[PERF] Target: {BOT_BRAIN_HOST}")
    print(f"[PERF] KPIs: p95 < {P95_THRESHOLD_MS}ms, error rate < {MAX_FAIL_RATE*100}%\n")

    result = subprocess.run(LOCUST_CMD, capture_output=True, text=True)
    print(result.stdout)
    if result.stderr:
        print("[STDERR]", result.stderr[:2000])

    stats_csv = f"{CSV_PREFIX}_stats.csv"
    stats = parse_stats_csv(stats_csv)
    violations = check_thresholds(stats)

    if violations:
        print("\n" + "═" * 60)
        print("PERFORMANCE THRESHOLD VIOLATIONS:")
        for v in violations:
            print(" ", v)
        print("═" * 60)
        sys.exit(1)
    else:
        print("\n[PASS] All performance thresholds met.")
        print(f"[INFO] HTML report: {HTML_REPORT}")
        sys.exit(0)


if __name__ == "__main__":
    main()

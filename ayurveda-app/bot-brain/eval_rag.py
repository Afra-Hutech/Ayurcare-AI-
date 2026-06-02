"""Evaluation harness for the AyurCare RAG retrieval pipeline.

Usage:
    python eval_rag.py
    python eval_rag.py --output results.json
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any, Dict, List

# ── Seed test cases ───────────────────────────────────────────────────────────
SEED_CASES: List[Dict[str, Any]] = [
    {
        "id": "gastritis",
        "symptoms": ["burning stomach", "acidity", "nausea after meals", "sour belching"],
        "expected_label": "amlapitta",
        "emergency": False,
    },
    {
        "id": "chest_pain_emergency",
        "symptoms": ["severe chest pain", "chest pressure", "shortness of breath", "left arm pain"],
        "expected_label": "hridayashoola",
        "emergency": True,
    },
    {
        "id": "arthritis",
        "symptoms": ["joint pain", "swollen knees", "morning stiffness", "crackling joints"],
        "expected_label": "sandhivata",
        "emergency": False,
    },
    {
        "id": "insomnia",
        "symptoms": ["cannot sleep", "racing mind at night", "waking up at 2am", "anxiety"],
        "expected_label": "anidra",
        "emergency": False,
    },
    {
        "id": "hematemesis_emergency",
        "symptoms": ["vomiting blood", "blood in vomit", "severe stomach pain", "dizziness", "black stool"],
        "expected_label": "raktatisara",
        "emergency": True,
    },
]


# ── Metric helpers ────────────────────────────────────────────────────────────
def _json_valid(result: Any) -> bool:
    """SemanticResult must be a dict with all required keys."""
    return isinstance(result, dict) and all(
        k in result for k in ("context", "sufficient", "avg_score", "min_score", "evidence")
    )


def _label_hit(result: Any, expected_label: str) -> bool:
    """True if the retrieved context mentions text related to the expected label."""
    if not isinstance(result, dict):
        return False
    ctx = result.get("context", "").lower()
    label = expected_label.lower()
    if label in ctx:
        return True
    # Partial match: first 5 chars (e.g. "amla" in "amlapitta")
    return len(label) >= 5 and label[:5] in ctx


def _safety_ok(result: Any, is_emergency: bool) -> bool:
    """Emergency cases must produce at least one evidence item."""
    if not is_emergency:
        return True
    return isinstance(result, dict) and len(result.get("evidence", [])) > 0


def _retrieval_hit(result: Any) -> bool:
    """True when at least one evidence chunk was returned."""
    return isinstance(result, dict) and len(result.get("evidence", [])) > 0


# ── Runner ────────────────────────────────────────────────────────────────────
def run_eval(output_path: str | None = None) -> None:
    try:
        from retrieval_agent import get_semantic_context
    except ImportError as exc:
        print(f"[eval] Cannot import retrieval_agent: {exc}", file=sys.stderr)
        sys.exit(1)

    records: List[Dict[str, Any]] = []
    passed = 0

    for case in SEED_CASES:
        t0 = time.perf_counter()
        result: Any = None
        error_msg: str = ""
        try:
            result = get_semantic_context(case["symptoms"], top_k=5)
        except Exception as exc:
            # result stays None; all metric helpers treat None as invalid gracefully.
            error_msg = str(exc)
            print(f"[eval] ERROR on {case['id']}: {exc}", file=sys.stderr)
        elapsed = time.perf_counter() - t0

        valid    = _json_valid(result)
        hit      = _retrieval_hit(result)
        label_ok = _label_hit(result, case["expected_label"])
        safe_ok  = _safety_ok(result, case["emergency"])
        case_pass = valid and hit  # minimum: well-formed + non-empty retrieval

        record: Dict[str, Any] = {
            "id":             case["id"],
            "emergency":      case["emergency"],
            "expected_label": case["expected_label"],
            "json_valid":     valid,
            "retrieval_hit":  hit,
            "label_hit":      label_ok,
            "safety_ok":      safe_ok,
            "sufficient":     result.get("sufficient", False) if isinstance(result, dict) else False,
            "avg_score":      round(result.get("avg_score", 0.0), 4) if isinstance(result, dict) else 0.0,
            "evidence_count": len(result.get("evidence", [])) if isinstance(result, dict) else 0,
            "latency_s":      round(elapsed, 3),
            "passed":         case_pass,
            "error":          error_msg or None,  # None when successful; populated on exception
        }
        records.append(record)
        if case_pass:
            passed += 1

        status = "PASS" if case_pass else "FAIL"
        print(
            f"[{status}] {case['id']:<28} "
            f"valid={valid} hit={hit} label={label_ok} safety={safe_ok} "
            f"avg_score={record['avg_score']:.3f} latency={elapsed:.2f}s"
        )

    total = len(SEED_CASES)
    summary = {
        "total":     total,
        "passed":    passed,
        "failed":    total - passed,
        "pass_rate": round(passed / total, 2),
        "cases":     records,
    }
    print(f"\nSummary: {passed}/{total} passed ({summary['pass_rate'] * 100:.0f}%)")

    if output_path:
        with open(output_path, "w", encoding="utf-8") as fh:
            json.dump(summary, fh, indent=2)
        print(f"Results written to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AyurCare RAG eval harness")
    parser.add_argument("--output", metavar="FILE", help="Write JSON results to FILE")
    args = parser.parse_args()
    run_eval(output_path=args.output)

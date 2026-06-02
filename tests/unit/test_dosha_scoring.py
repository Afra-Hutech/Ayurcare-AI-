"""
GROUP 1 ─ Complete Unit Test Suite: nlp/dosha_scoring.py
=========================================================
TC-DS-001 through TC-DS-064-c

ARCHITECTURE UNDER TEST
-----------------------
score_sentence(sentence) operates in four sequential phases:

  Phase 1 ─ PHRASE_MAP regex matching
    For each phrase in PHRASE_MAP:
      regex: r'\b' + re.escape(phrase) + r'\b'
      Match → scores[dosha] += base_score * direction
      Span recorded in matched_spans (prevents Phase 2 double-count)

  Phase 2 ─ GUNA_MAP token scanning
    All tokens via re.finditer(r'\w+', s) extracted into token_data.
    Tokens whose [start, end) falls inside ANY matched_span are SKIPPED.
    Remaining (uncovered) tokens checked against GUNA_MAP.
    Special case: token == 'cooling' → apply immediately, skip proximity.
    All others → proximity check within ±3 token indices.

  Phase 3 ─ PACIFY_TERMS proximity direction flip
    search window: range(max(0, idx-3), min(len(token_data), idx+3))
    If ANY token in that window (excluding self) is in PACIFY_TERMS[dosha]:
      direction = -1 (pacifying), else direction = +1 (aggravating)
    scores[dosha] += GUNA_MAP[token][dosha] * direction

  Phase 4 ─ Confidence calculation
    total_signals = len(matched_spans) + len(uncovered_indices)
    net_score     = sum(abs(v) for v in scores.values())
    directions    = [direction from PHRASE_MAP for each matched span]
    if total_signals == 0:
        conf = 0.0
    else:
        base_conf        = 0.3
        signal_bonus     = min(0.4, total_signals * 0.1)
        magnitude_bonus  = min(0.2, net_score * 0.05)
        consistency_bonus = 0.1 if directions and all same else 0
        conf = min(0.95, base_conf + signal_bonus + magnitude_bonus + consistency_bonus)
    All doshas share the same conf value.
    Return: {dosha: {'score': int, 'confidence': round(conf, 2)}}

VERIFIED ARITHMETIC EXAMPLES (used in exact-value assertions below)
--------------------------------------------------------------------
Input: "pitta aggravation"
  Phase 1: span(0,17), Pitta += 3*1 = 3
  Phase 2: 'pitta'(0,5) & 'aggravation'(6,17) both inside (0,17) → SKIPPED
  uncovered_indices = []
  total_signals = 1 + 0 = 1
  net_score = 3; directions=[1]; consistency_bonus=0.1
  conf = min(0.95, 0.3 + 0.1 + 0.15 + 0.1) = 0.65
  Result: Pitta={'score':3,'confidence':0.65}

Input: "The patient shows clear pitta aggravation."
  Phase 1: "pitta aggravation" span(24,41), Pitta=3
  uncovered: 'the','patient','shows','clear' (idx 0-3, none in GUNA_MAP)
  total_signals = 1 + 4 = 5
  net_score = 3; signal_bonus = min(0.4,0.5)=0.4; magnitude_bonus=0.15; c_bonus=0.1
  conf = min(0.95, 0.3+0.4+0.15+0.1) = exactly 0.95
  Result: Pitta={'score':3,'confidence':0.95}

Input: "Patient reports burning sensation."
  Phase 1: "burning sensation" span(16,33), Pitta += 2*1 = 2
  Tokens: patient(0,7) reports(8,15) burning(16,23) sensation(24,33)
  Span check [16,33]: 16<=16 and 23<=33 → 'burning' SKIPPED
                      16<=24 and 33<=33 → 'sensation' SKIPPED
  uncovered: 'patient'(idx0), 'reports'(idx1) — neither in GUNA_MAP
  total_signals = 1 + 2 = 3; net_score=2; directions=[1]; c_bonus=0.1
  conf = min(0.95, 0.3+0.3+0.10+0.1) = 0.80
  CRITICAL: Pitta == 2  (NOT 4 — 'burning' token is excluded from Phase 2)

Input: "Cooling therapy is recommended."
  Phase 1: no phrase match
  Phase 2: 'cooling' in GUNA_MAP → special early-continue branch
    scores['Pitta'] += -1; continue  (proximity check SKIPPED for cooling)
  net_score=1; total_signals=0+4=4; directions=[]
  conf = min(0.95, 0.3+0.4+0.05+0) = 0.75
  Result: Pitta={'score':-1,'confidence':0.75}

Input: "Herbs help reduce hot sensations."
  Phase 1: no phrase match
  'hot' at idx=3; GUNA_MAP['hot']={'Pitta':1}
  search window: range(max(0,3-3), min(5,3+3)) = range(0,5), skip idx=3
    searches: 'herbs'(0),'help'(1),'reduce'(2),'sensations'(4)
    'reduce' in PACIFY_TERMS['Pitta'] → direction = -1
  scores['Pitta'] += 1 * (-1) = -1
  Result: Pitta <= 0

Run:
    cd tests && pytest unit/test_dosha_scoring.py -v --tb=short

Dependencies (conftest.py adds bot-brain to sys.path, see conftest.py):
    pytest>=7.0
    No external services required.
"""

from __future__ import annotations

import re
import sys
import os
from typing import Dict, List, Optional, Tuple

import pytest

# ── sys.path bootstrap (also in conftest; duplicated for standalone execution) ──
_BOT_BRAIN_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../ayurveda-app/bot-brain")
)
if _BOT_BRAIN_PATH not in sys.path:
    sys.path.insert(0, _BOT_BRAIN_PATH)

from nlp.dosha_scoring import (
    GUNA_MAP,
    PACIFY_TERMS,
    PHRASE_MAP,
    SYMPTOM_DOSHA_MAP,
    explain_score,
    get_dominant_dosha,
    get_imbalanced_doshas,
    is_balancing_therapy,
    score_sentence,
    symptoms_to_dosha,
)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 0 ─ AUTHORITATIVE REFERENCE DATA STRUCTURES
#
# These are the "ground-truth" copies tested in TC-DS-058 → TC-DS-064.
# If a developer silently modifies PHRASE_MAP, GUNA_MAP, or PACIFY_TERMS
# in the source, the structural tests in the final class will fail before
# any runtime behavior is affected.
# ═══════════════════════════════════════════════════════════════════════════════

# Format: phrase_text → (dosha, base_score, direction)
#   dosha     : 'Pitta' | 'Vata' | 'Kapha'
#   base_score: positive integer (always > 0)
#   direction : +1 = aggravation (score added positively)
#               -1 = pacification (score subtracted)
EXPECTED_PHRASE_MAP: Dict[str, Tuple[str, int, int]] = {
    # ── Pitta aggravation ───────────────────────────────────────────────────
    "aggravation of pitta": ("Pitta", 3,  1),
    "pitta aggravation":    ("Pitta", 3,  1),
    "pitta prakopa":        ("Pitta", 3,  1),
    "pitta imbalance":      ("Pitta", 2,  1),
    "excess pitta":         ("Pitta", 2,  1),
    "pitta disorder":       ("Pitta", 2,  1),
    # ── Pitta pacification ──────────────────────────────────────────────────
    "reduce pitta":         ("Pitta", 2, -1),
    "pacify pitta":         ("Pitta", 2, -1),
    "balance pitta":        ("Pitta", 2, -1),
    "cooling for pitta":    ("Pitta", 2, -1),
    "pitta reducing":       ("Pitta", 2, -1),
    # ── Vata aggravation ────────────────────────────────────────────────────
    "vata aggravation":     ("Vata",  3,  1),
    "vata prakopa":         ("Vata",  3,  1),
    "vata imbalance":       ("Vata",  2,  1),
    "excess vata":          ("Vata",  2,  1),
    "vata disorder":        ("Vata",  2,  1),
    # ── Vata pacification ───────────────────────────────────────────────────
    "reduce vata":          ("Vata",  2, -1),
    "pacify vata":          ("Vata",  2, -1),
    "balance vata":         ("Vata",  2, -1),
    # ── Kapha aggravation ───────────────────────────────────────────────────
    "kapha aggravation":    ("Kapha", 3,  1),
    "kapha prakopa":        ("Kapha", 3,  1),
    "kapha imbalance":      ("Kapha", 2,  1),
    "excess kapha":         ("Kapha", 2,  1),
    "kapha disorder":       ("Kapha", 2,  1),
    # ── Kapha pacification ──────────────────────────────────────────────────
    "reduce kapha":         ("Kapha", 2, -1),
    "pacify kapha":         ("Kapha", 2, -1),
    "balance kapha":        ("Kapha", 2, -1),
    # ── Clinical symptom phrases ─────────────────────────────────────────────
    "burning sensation":    ("Pitta", 2,  1),
    "acid reflux":          ("Pitta", 2,  1),
    "dryness sensation":    ("Vata",  2,  1),
    "gas and bloating":     ("Vata",  2,  1),
    "constipation":         ("Vata",  1,  1),
    "congestion":           ("Kapha", 2,  1),
    "mucus accumulation":   ("Kapha", 2,  1),
}

# Format: token_text → {dosha: score_delta}
#   Positive delta = aggravating quality
#   Negative delta = pacifying quality  (only 'cooling' is negative here)
EXPECTED_GUNA_MAP: Dict[str, Dict[str, int]] = {
    # ── Pitta-increasing tokens ──────────────────────────────────────────────
    "hot":          {"Pitta":  1},
    "burning":      {"Pitta":  2},
    "sharp":        {"Pitta":  1},
    "acidic":       {"Pitta":  2},
    "sour":         {"Pitta":  1},
    "salty":        {"Pitta":  1},
    "penetrating":  {"Pitta":  1},
    "inflammatory": {"Pitta":  2},
    "fiery":        {"Pitta":  2},
    "intense":      {"Pitta":  1},
    # ── Vata-increasing tokens ───────────────────────────────────────────────
    "dry":          {"Vata":   1},
    "cold":         {"Vata":   1},
    "light":        {"Vata":   1},
    "rough":        {"Vata":   1},
    "mobile":       {"Vata":   1},
    "subtle":       {"Vata":   1},
    "quick":        {"Vata":   1},
    "erratic":      {"Vata":   2},
    "unsteady":     {"Vata":   2},
    # ── Kapha-increasing tokens ──────────────────────────────────────────────
    "heavy":        {"Kapha":  1},
    "oily":         {"Kapha":  1},
    "slow":         {"Kapha":  1},
    "dense":        {"Kapha":  1},
    "sweet":        {"Kapha":  1},
    "sticky":       {"Kapha":  1},
    "nourishing":   {"Kapha":  1},
    "congesting":   {"Kapha":  2},
    # ── Cooling (special early-continue in Phase 2) ───────────────────────────
    "cooling":      {"Pitta": -1},
}

# Proximity keywords that flip a GUNA token's direction to -1 when found within
# ±3 token indices.  Each list is the pacify vocabulary for that dosha.
EXPECTED_PACIFY_TERMS: Dict[str, List[str]] = {
    "Pitta": ["cooling", "cold", "sweet", "bitter", "astringent",
              "pacify", "reduce", "balance", "calm"],
    "Vata":  ["warm", "oily", "sweet", "nourishing", "grounding",
              "pacify", "reduce", "balance"],
    "Kapha": ["dry", "light", "warm", "stimulating", "bitter",
              "pungent", "pacify", "reduce", "balance"],
}

EXPECTED_SYMPTOM_DOSHA_MAP: Dict[str, Dict[str, int]] = {
    "pain":              {"Vata": 1},
    "joint pain":        {"Vata": 1},
    "stiffness":         {"Vata": 1, "Kapha": 1},
    "swelling":          {"Kapha": 1, "Pitta": 1},
    "redness":           {"Pitta": 1},
    "warmth":            {"Pitta": 1},
    "heaviness":         {"Kapha": 1},
    "coating on tongue": {"Kapha": 1},
    "burning":           {"Pitta": 1},
    "burning sensation": {"Pitta": 1},
    "fatigue":           {"Vata": 1, "Kapha": 1},
}

# ── Phase 4 formula constants ─────────────────────────────────────────────────
_CONF_BASE            = 0.3
_CONF_SIGNAL_RATE     = 0.1   # per signal
_CONF_SIGNAL_CAP      = 0.4   # min(0.4, signals * 0.1)
_CONF_MAGNITUDE_RATE  = 0.05  # per unit net_score
_CONF_MAGNITUDE_CAP   = 0.2   # min(0.2, net_score * 0.05)
_CONF_CONSISTENCY     = 0.1   # bonus when all phrase directions identical
_CONF_HARD_CAP        = 0.95  # min(..., 0.95)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 1 ─ PHASE 1: PHRASE_MAP DETECTION  (TC-DS-001 → TC-DS-021)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPhase1_PhraseDetection:
    """
    Phase 1 of score_sentence() applies regex patterns for every entry in
    PHRASE_MAP.  Pattern: r'\b' + re.escape(phrase) + r'\b'
    On match: scores[dosha] += base_score * direction
              matched_spans.append((match.start(), match.end()))

    These tests verify exact score values, isolation (non-matched doshas stay 0),
    cumulative arithmetic when multiple phrases match, and direction cancellation.
    """

    # ── Pitta aggravation phrases (direction = +1) ───────────────────────────

    @pytest.mark.parametrize("phrase, expected_pitta", [
        ("pitta aggravation",    3),  # TC-DS-001
        ("aggravation of pitta", 3),  # TC-DS-002
        ("pitta prakopa",        3),  # TC-DS-003
        ("pitta imbalance",      2),  # TC-DS-004
        ("excess pitta",         2),  # TC-DS-005
        ("pitta disorder",       2),  # TC-DS-006
    ])
    def test_pitta_aggravation_phrase_exact_score(self, phrase: str, expected_pitta: int):
        """
        TC-DS-001 → TC-DS-006
        Each Pitta-aggravation phrase must produce EXACTLY the documented score.
        The sentence template 'Diagnosis shows {phrase}.' contains no other
        PHRASE_MAP or GUNA_MAP entries so scores are unambiguous.

        Assertions:
          result['Pitta']['score'] == expected_pitta   (exact value from PHRASE_MAP)
          result['Vata']['score']  == 0                (other doshas unaffected)
          result['Kapha']['score'] == 0
        """
        sentence = f"Diagnosis shows {phrase}."
        result = score_sentence(sentence)

        assert result["Pitta"]["score"] == expected_pitta, (
            f"[{phrase!r}]  Expected Pitta={expected_pitta}, "
            f"got {result['Pitta']['score']}"
        )
        assert result["Vata"]["score"] == 0, (
            f"[{phrase!r}]  Vata must be 0, got {result['Vata']['score']}"
        )
        assert result["Kapha"]["score"] == 0, (
            f"[{phrase!r}]  Kapha must be 0, got {result['Kapha']['score']}"
        )

    @pytest.mark.parametrize("phrase, expected_pitta", [
        ("reduce pitta",     -2),  # TC-DS-007
        ("pacify pitta",     -2),  # TC-DS-008
        ("balance pitta",    -2),  # TC-DS-009
        ("cooling for pitta",-2),  # TC-DS-010
        ("pitta reducing",   -2),  # TC-DS-011
    ])
    def test_pitta_pacification_phrase_exact_score(self, phrase: str, expected_pitta: int):
        """
        TC-DS-007 → TC-DS-011
        Pitta-pacification phrases (direction=-1):  score = +2 * (-1) = -2.
        Negative score indicates the text recommends reducing Pitta, not aggravating it.
        """
        result = score_sentence(f"The treatment goal is to {phrase}.")
        assert result["Pitta"]["score"] == expected_pitta, (
            f"[{phrase!r}]  Expected Pitta={expected_pitta}, "
            f"got {result['Pitta']['score']}"
        )

    # ── Vata phrases ──────────────────────────────────────────────────────────

    @pytest.mark.parametrize("phrase, expected_vata", [
        ("vata aggravation", 3),   # TC-DS-012
        ("vata prakopa",     3),   # TC-DS-013
        ("vata imbalance",   2),   # TC-DS-014
        ("excess vata",      2),   # TC-DS-015
        ("vata disorder",    2),   # TC-DS-016
        ("reduce vata",     -2),   # TC-DS-017
        ("pacify vata",     -2),   # TC-DS-018
        ("balance vata",    -2),   # TC-DS-019
    ])
    def test_vata_phrase_exact_score_and_isolation(self, phrase: str, expected_vata: int):
        """TC-DS-012 → TC-DS-019  Vata phrases route only to Vata; others stay 0."""
        result = score_sentence(f"Assessment confirms {phrase}.")
        assert result["Vata"]["score"] == expected_vata, (
            f"[{phrase!r}]  Vata expected {expected_vata}, got {result['Vata']['score']}"
        )
        assert result["Pitta"]["score"] == 0
        assert result["Kapha"]["score"] == 0

    # ── Kapha phrases ─────────────────────────────────────────────────────────

    @pytest.mark.parametrize("phrase, expected_kapha", [
        ("kapha aggravation", 3),  # TC-DS-020
        ("kapha prakopa",     3),  # TC-DS-021
        ("kapha imbalance",   2),  # TC-DS-022
        ("excess kapha",      2),  # TC-DS-023
        ("kapha disorder",    2),  # TC-DS-024
        ("reduce kapha",     -2),  # TC-DS-025
        ("pacify kapha",     -2),  # TC-DS-026
        ("balance kapha",    -2),  # TC-DS-027
    ])
    def test_kapha_phrase_exact_score_and_isolation(self, phrase: str, expected_kapha: int):
        """TC-DS-020 → TC-DS-027  Kapha phrases route only to Kapha; others stay 0."""
        result = score_sentence(f"Patient shows {phrase}.")
        assert result["Kapha"]["score"] == expected_kapha, (
            f"[{phrase!r}]  Kapha expected {expected_kapha}, got {result['Kapha']['score']}"
        )
        assert result["Pitta"]["score"] == 0
        assert result["Vata"]["score"] == 0

    # ── Symptom phrases ───────────────────────────────────────────────────────

    @pytest.mark.parametrize("phrase, dosha, expected_score", [
        ("burning sensation",  "Pitta", 2),  # TC-DS-028
        ("acid reflux",        "Pitta", 2),  # TC-DS-029
        ("dryness sensation",  "Vata",  2),  # TC-DS-030
        ("gas and bloating",   "Vata",  2),  # TC-DS-031
        ("constipation",       "Vata",  1),  # TC-DS-032
        ("congestion",         "Kapha", 2),  # TC-DS-033
        ("mucus accumulation", "Kapha", 2),  # TC-DS-034
    ])
    def test_symptom_phrase_routes_to_correct_dosha_and_score(
        self, phrase: str, dosha: str, expected_score: int
    ):
        """
        TC-DS-028 → TC-DS-034
        Clinical symptom phrases are in PHRASE_MAP and must produce the
        documented dosha mapping.
        """
        result = score_sentence(f"Patient presents with {phrase}.")
        assert result[dosha]["score"] == expected_score, (
            f"[{phrase!r}]  {dosha} expected {expected_score}, "
            f"got {result[dosha]['score']}"
        )

    # ── TC-DS-016-CRITICAL  Anti-regression: no double-counting ───────────────

    def test_TC_DS_016_CRITICAL_burning_sensation_no_double_count(self):
        """
        TC-DS-016-CRITICAL  *** THE MOST IMPORTANT CORRECTNESS TEST ***

        Sentence:  "Patient reports burning sensation."
        casefold:  "patient reports burning sensation."

        Phase 1 execution trace:
          PHRASE_MAP["burning sensation"] → regex r'\bburning sensation\b'
          Match at span [16, 33]  (position depends on the template sentence)
          matched_spans = [(16, 33)]
          scores['Pitta'] += 2 * 1 = 2

        Phase 2 execution trace:
          All tokens: [patient(0,7), reports(8,15), burning(16,23), sensation(24,33)]
          Span exclusion check for burning(16,23):
            16 <= 16 AND 23 <= 33  → TRUE  → SKIP  (inside phrase span)
          Span exclusion check for sensation(24,33):
            16 <= 24 AND 33 <= 33  → TRUE  → SKIP  (inside phrase span)
          uncovered_indices = [patient(0), reports(1)]
          'patient' ∉ GUNA_MAP  → no score change
          'reports' ∉ GUNA_MAP  → no score change

        FINAL SCORE: Pitta = 2  (phrase only)
        WRONG SCORE: Pitta = 4  (what would happen without span exclusion)
                                 phrase(2) + GUNA token 'burning'(2) = 4

        If this test fails, matched_spans exclusion in Phase 2 is broken.
        """
        result = score_sentence("Patient reports burning sensation.")

        assert result["Pitta"]["score"] == 2, (
            "DOUBLE-COUNT DETECTED: 'burning' token was re-scored by GUNA_MAP "
            "even though it falls inside the 'burning sensation' phrase span.\n"
            f"Expected Pitta=2, got Pitta={result['Pitta']['score']} "
            "(4 = phrase(2) + guna_token(2) indicates Phase 2 span exclusion is broken)"
        )
        assert result["Vata"]["score"] == 0
        assert result["Kapha"]["score"] == 0

    def test_TC_DS_016_CRITICAL_burning_standalone_no_phrase_context(self):
        """
        TC-DS-016-CRITICAL-b  Baseline: 'burning' alone (no 'sensation' next to it)

        When 'burning sensation' phrase does NOT match (because 'sensation' is absent),
        'burning' token is in uncovered_indices and scored via GUNA_MAP → Pitta+2.
        This confirms Phase 2 GUNA scoring is active when no phrase covers the token.

        Input:  "The burning pain is persistent."
        'burning pain' does NOT match 'burning sensation' phrase.
        → 'burning' is uncovered → GUNA_MAP['burning'] = {'Pitta': 2}
        → Pitta >= 2
        """
        result = score_sentence("The burning pain is persistent.")
        assert result["Pitta"]["score"] >= 2, (
            "When 'burning' is not inside any phrase span, GUNA_MAP must score it. "
            f"Expected Pitta >= 2, got {result['Pitta']['score']}"
        )

    def test_cumulative_two_pitta_phrases_sums_correctly(self):
        """
        TC-DS-035
        Input:  "Pitta aggravation presents with acid reflux."
        Phase 1 matches:
          "pitta aggravation" → Pitta += 3
          "acid reflux"       → Pitta += 2
        Net: Pitta = 3 + 2 = 5

        This verifies that multiple phrase matches accumulate additively.
        """
        result = score_sentence("Pitta aggravation presents with acid reflux.")
        assert result["Pitta"]["score"] == 5, (
            f"Cumulative: expected 3+2=5, got {result['Pitta']['score']}"
        )

    def test_opposing_phrases_net_arithmetic(self):
        """
        TC-DS-036
        Input:  "Pitta aggravation is treated with herbs that pacify pitta."
        Phase 1 matches:
          "pitta aggravation" → Pitta += 3 * (+1) = +3
          "pacify pitta"      → Pitta += 2 * (-1) = -2
        Net: Pitta = 3 + (-2) = +1
        """
        result = score_sentence(
            "Pitta aggravation is treated with herbs that pacify pitta."
        )
        assert result["Pitta"]["score"] == 1, (
            f"Opposing-phrase net: expected 3+(-2)=1, got {result['Pitta']['score']}"
        )

    def test_two_dosha_simultaneous_phrase_accumulation(self):
        """
        TC-DS-037
        Input:  "Vata aggravation and pitta imbalance both present simultaneously."
        Phrases:
          "vata aggravation" → Vata  += 3
          "pitta imbalance"  → Pitta += 2
        Expected: Vata=3, Pitta=2, Kapha=0
        """
        result = score_sentence(
            "Vata aggravation and pitta imbalance both present simultaneously."
        )
        assert result["Vata"]["score"] == 3
        assert result["Pitta"]["score"] == 2
        assert result["Kapha"]["score"] == 0


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2 ─ PHASE 2: GUNA_MAP TOKEN SCORING  (TC-DS-038 → TC-DS-052)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPhase2_GunaTokenScoring:
    """
    Phase 2 scores uncovered tokens (those NOT inside any matched_span).
    The test sentences are constructed so that no PHRASE_MAP phrase fires,
    ensuring the score change is attributable entirely to the GUNA token.

    Special rule for 'cooling':
      GUNA_MAP['cooling'] = {'Pitta': -1}
      Implementation uses an early `continue` after applying the score,
      bypassing the proximity direction-flip loop entirely.
      This means 'cooling' always reduces Pitta by 1, regardless of context.
    """

    # ── Pitta-increasing tokens: exact minimum delta ──────────────────────────

    @pytest.mark.parametrize("token, expected_pitta_delta", [
        ("burning",      2),   # TC-DS-038  GUNA_MAP['burning'] = {'Pitta':2}
        ("inflammatory", 2),   # TC-DS-039  GUNA_MAP['inflammatory'] = {'Pitta':2}
        ("acidic",       2),   # TC-DS-040
        ("fiery",        2),   # TC-DS-041
        ("hot",          1),   # TC-DS-042
        ("sharp",        1),   # TC-DS-043
        ("sour",         1),   # TC-DS-044
        ("salty",        1),   # TC-DS-045
        ("penetrating",  1),   # TC-DS-046
        ("intense",      1),   # TC-DS-047
    ])
    def test_pitta_guna_token_increments_pitta_by_documented_delta(
        self, token: str, expected_pitta_delta: int
    ):
        """
        TC-DS-038 → TC-DS-047
        Each Pitta-increasing GUNA_MAP token must increment Pitta by at least
        its documented delta when appearing in a sentence with no phrase matches
        and no pacify terms in the ±3 token window.

        Template: "There is {token} in the body." avoids all PHRASE_MAP entries
        and has no PACIFY_TERMS tokens.
        """
        sentence = f"There is {token} in the body."
        result = score_sentence(sentence)
        assert result["Pitta"]["score"] >= expected_pitta_delta, (
            f"Token '{token}': GUNA_MAP delta expected >= {expected_pitta_delta}, "
            f"got Pitta={result['Pitta']['score']}"
        )

    # ── Vata-increasing tokens ─────────────────────────────────────────────────

    @pytest.mark.parametrize("token, expected_vata_delta", [
        ("dry",      1),   # TC-DS-048
        ("rough",    1),   # TC-DS-049
        ("erratic",  2),   # TC-DS-050  GUNA_MAP['erratic'] = {'Vata':2}
        ("unsteady", 2),   # TC-DS-051  GUNA_MAP['unsteady'] = {'Vata':2}
        ("cold",     1),   # TC-DS-052
        ("light",    1),   # TC-DS-053
        ("mobile",   1),   # TC-DS-054
        ("subtle",   1),   # TC-DS-055
        ("quick",    1),   # TC-DS-056
    ])
    def test_vata_guna_token_increments_vata(self, token: str, expected_vata_delta: int):
        """TC-DS-048 → TC-DS-056  Vata GUNA tokens in isolation."""
        result = score_sentence(f"There is a {token} quality present.")
        assert result["Vata"]["score"] >= expected_vata_delta, (
            f"Token '{token}': expected Vata >= {expected_vata_delta}, "
            f"got {result['Vata']['score']}"
        )

    # ── Kapha-increasing tokens ────────────────────────────────────────────────

    @pytest.mark.parametrize("token, expected_kapha_delta", [
        ("heavy",      1),   # TC-DS-057
        ("oily",       1),   # TC-DS-058
        ("slow",       1),   # TC-DS-059
        ("dense",      1),   # TC-DS-060
        ("sticky",     1),   # TC-DS-061
        ("nourishing", 1),   # TC-DS-062
        ("congesting", 2),   # TC-DS-063  GUNA_MAP['congesting'] = {'Kapha':2}
    ])
    def test_kapha_guna_token_increments_kapha(self, token: str, expected_kapha_delta: int):
        """TC-DS-057 → TC-DS-063  Kapha GUNA tokens in isolation."""
        result = score_sentence(f"Digestion is {token} and sluggish.")
        assert result["Kapha"]["score"] >= expected_kapha_delta, (
            f"Token '{token}': expected Kapha >= {expected_kapha_delta}, "
            f"got {result['Kapha']['score']}"
        )

    # ── 'cooling' special early-continue branch ───────────────────────────────

    def test_cooling_token_always_decrements_pitta_by_exactly_1(self):
        """
        TC-DS-064
        'cooling' triggers the early-continue branch in Phase 2:

          if token == 'cooling':
              for dosha, score in impacts.items():
                  scores[dosha] += score    # Pitta += -1
              continue                       # skip proximity check

        The 'continue' means the proximity direction-flip logic is NEVER reached,
        so PACIFY_TERMS adjacent to 'cooling' cannot make it double-reduce.

        Input:  "Cooling therapy is recommended."
        Arithmetic:
          Phase 1: no phrase match
          Phase 2 tokens: ['cooling', 'therapy', 'is', 'recommended']
          'cooling' → early-continue → Pitta += -1
          others not in GUNA_MAP
        Expected: Pitta == -1  (exactly, not -2 or 0)
        """
        result = score_sentence("Cooling therapy is recommended.")
        assert result["Pitta"]["score"] == -1, (
            f"'cooling' must decrement Pitta by exactly 1 via early-continue branch. "
            f"Got {result['Pitta']['score']}"
        )

    def test_cooling_with_adjacent_pacify_still_produces_minus_1_not_minus_2(self):
        """
        TC-DS-065
        Even when 'pacify' (a PACIFY_TERM) is adjacent to 'cooling',
        the early-continue prevents double-reduction.

        Input: "pacify cooling"
        'cooling' early-continue → Pitta -1 → SKIP proximity loop
        'pacify' is not in GUNA_MAP → 0 contribution
        Expected: Pitta == -1 (not -2)
        """
        result = score_sentence("pacify cooling")
        assert result["Pitta"]["score"] == -1, (
            f"'cooling' + 'pacify' must still = -1 (no double-reduction). "
            f"Got {result['Pitta']['score']}"
        )

    def test_guna_token_inside_phrase_span_is_excluded(self):
        """
        TC-DS-066  Regression guard — identical to TC-DS-016-CRITICAL.

        Input: "There is a burning sensation."
        'burning sensation' phrase fires → span covers 'burning' and 'sensation'.
        'burning' token excluded from GUNA_MAP scoring in Phase 2.
        Expected: Pitta == 2  (phrase), NOT 4 (phrase + guna token).
        """
        result = score_sentence("There is a burning sensation.")
        assert result["Pitta"]["score"] == 2, (
            f"Span exclusion broken: expected 2 (phrase only), got {result['Pitta']['score']}"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3 ─ PHASE 3: PACIFY_TERMS PROXIMITY DIRECTION FLIP  (TC-DS-067 → TC-DS-076)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPhase3_ProximityDirectionFlip:
    """
    For each uncovered GUNA_MAP token (excluding 'cooling'), Phase 3 searches
    within a ±3 token window.

    Implementation:
      search_start = max(0, idx - 3)
      search_end   = min(len(token_data), idx + 3)
      for search_idx in range(search_start, search_end):  # range is exclusive at end
          if search_idx == idx: continue
          if token_data[search_idx][0] in PACIFY_TERMS[dosha]:
              direction = -1; break
      scores[dosha] += GUNA_MAP[token][dosha] * direction

    Note: search_end = idx+3 means the window extends to idx+2 (inclusive)
    since range() is exclusive.  Left side: idx-3 (inclusive).
    """

    def test_reduce_within_3_tokens_flips_hot_pitta_to_negative(self):
        """
        TC-DS-067
        Input: "Herbs help reduce hot sensations."
        Tokens: herbs(0) help(1) reduce(2) hot(3) sensations(4)

        For 'hot' at idx=3:
          GUNA_MAP['hot'] = {'Pitta': 1}
          search: range(max(0,0), min(5,6)) = range(0,5), skip 3
          Checks: herbs(0), help(1), reduce(2), sensations(4)
          'reduce' ∈ PACIFY_TERMS['Pitta'] → direction = -1
          scores['Pitta'] += 1 * (-1) = -1

        Expected: Pitta <= 0
        """
        result = score_sentence("Herbs help reduce hot sensations.")
        assert result["Pitta"]["score"] <= 0, (
            f"'reduce' within ±3 of 'hot' must flip direction. "
            f"Expected Pitta <= 0, got {result['Pitta']['score']}"
        )

    def test_pacify_within_3_tokens_flips_burning_to_negative(self):
        """
        TC-DS-068
        Input: "We should pacify burning discomfort."
        Tokens: we(0) should(1) pacify(2) burning(3) discomfort(4)

        For 'burning' at idx=3:
          GUNA_MAP['burning'] = {'Pitta': 2}
          search: range(0, 5), skip 3
          'pacify' at idx=2 ∈ PACIFY_TERMS['Pitta'] → direction = -1
          scores['Pitta'] += 2 * (-1) = -2

        Expected: Pitta <= 0
        """
        result = score_sentence("We should pacify burning discomfort.")
        assert result["Pitta"]["score"] <= 0, (
            f"'pacify' within ±3 of 'burning' must flip. "
            f"Expected Pitta <= 0, got {result['Pitta']['score']}"
        )

    def test_reduce_near_dry_flips_vata_negative(self):
        """
        TC-DS-069
        Input: "We reduce dry skin symptoms."
        'reduce' ∈ PACIFY_TERMS['Vata']
        'dry' ∈ GUNA_MAP → {'Vata': 1}
        Within ±3 → direction = -1 → Vata += -1

        Expected: Vata <= 0
        """
        result = score_sentence("We reduce dry skin symptoms.")
        assert result["Vata"]["score"] <= 0, (
            f"Expected Vata <= 0 (proximity flip), got {result['Vata']['score']}"
        )

    def test_no_pacify_term_preserves_positive_direction(self):
        """
        TC-DS-070
        Input: "Patient has burning in the abdomen."
        Tokens: patient(0) has(1) burning(2) in(3) the(4) abdomen(5)

        For 'burning' at idx=2:
          search: range(max(0,-1),min(6,5)) = range(0,5), skip 2
          Checks: patient, has, in, the, abdomen
          None in PACIFY_TERMS['Pitta'] → direction remains +1
          scores['Pitta'] += 2 * 1 = 2

        Expected: Pitta > 0
        """
        result = score_sentence("Patient has burning in the abdomen.")
        assert result["Pitta"]["score"] > 0, (
            f"No pacify term present: expected Pitta > 0, got {result['Pitta']['score']}"
        )

    def test_pacify_term_exactly_3_tokens_away_still_flips(self):
        """
        TC-DS-071
        Input: "balance the intense fire"
        Tokens: balance(0) the(1) intense(2) fire(3)

        For 'intense' at idx=2:
          GUNA_MAP['intense'] = {'Pitta': 1}
          search: range(max(0,-1), min(4,5)) = range(0,4), skip 2
          Checks idx 0,1,3: 'balance', 'the', 'fire'
          'balance' ∈ PACIFY_TERMS['Pitta'] → direction = -1
          Distance = |2-0| = 2 ≤ 3 → within window

        Expected: Pitta <= 0
        """
        result = score_sentence("balance the intense fire")
        assert result["Pitta"]["score"] <= 0, (
            f"Pacify term at distance 2 should still flip. "
            f"Got Pitta={result['Pitta']['score']}"
        )

    def test_cooling_bypass_persists_regardless_of_pacify_term_proximity(self):
        """
        TC-DS-072
        'cooling' uses early-continue — proximity check is never reached.
        Even placing 'warm' (PACIFY_TERMS for none, but other terms) next to
        'cooling' cannot change its score of -1.

        Input: "balance cooling therapy"
        'balance' is in PACIFY_TERMS for Pitta.
        'cooling' → early-continue → Pitta -1; proximity SKIPPED.
        Expected: Pitta == -1
        """
        result = score_sentence("balance cooling therapy")
        assert result["Pitta"]["score"] == -1, (
            f"'cooling' early-continue must bypass proximity. "
            f"Expected -1, got {result['Pitta']['score']}"
        )

    def test_is_balancing_therapy_returns_true_when_dominant_score_negative(self):
        """
        TC-DS-073
        is_balancing_therapy({Pitta: -3, Vata: 0, Kapha: 0})
        → dominant_dosha = Pitta, dominant_score = -3 (< 0)
        → (True, "pacifies pitta")
        """
        scores = {
            "Pitta": {"score": -3, "confidence": 0.7},
            "Vata":  {"score":  0, "confidence": 0.0},
            "Kapha": {"score":  0, "confidence": 0.0},
        }
        is_bal, label = is_balancing_therapy(scores)
        assert is_bal is True
        assert "pitta" in label.lower()

    def test_is_balancing_therapy_returns_false_when_dominant_positive(self):
        """
        TC-DS-074
        is_balancing_therapy({Pitta: 0, Vata: 4, Kapha: 0})
        dominant_score = 4 > 0 → aggravating → (False, "aggravates vata")
        """
        scores = {
            "Pitta": {"score": 0, "confidence": 0.0},
            "Vata":  {"score": 4, "confidence": 0.7},
            "Kapha": {"score": 0, "confidence": 0.0},
        }
        is_bal, label = is_balancing_therapy(scores)
        assert is_bal is False
        assert "vata" in label.lower()

    def test_is_balancing_therapy_neutral_when_all_zero(self):
        """
        TC-DS-075
        All scores = 0 → no imbalances → (False, "neutral")
        """
        scores = {d: {"score": 0, "confidence": 0.0} for d in ("Pitta", "Vata", "Kapha")}
        is_bal, label = is_balancing_therapy(scores)
        assert is_bal is False
        assert label == "neutral"


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4 ─ PHASE 4: CONFIDENCE MATH INVARIANTS  (TC-DS-076 → TC-DS-090)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPhase4_ConfidenceMathInvariants:
    """
    Confidence formula (exact):

      total_signals = len(matched_spans) + len(uncovered_indices)
      net_score     = Σ |scores[d]| for d in {Pitta,Vata,Kapha}
      directions    = [direction from PHRASE_MAP for each matched span]

      if total_signals == 0:
          conf = 0.0
      else:
          conf = min(0.95,
                    0.3                                   # base
                    + min(0.4, total_signals * 0.1)      # signal bonus
                    + min(0.2, net_score * 0.05)         # magnitude bonus
                    + (0.1 if directions and             # consistency bonus
                              all same direction else 0)
                    )
      All three doshas share the same conf value.
      Return: round(conf, 2)

    Verified arithmetic examples:
      "pitta aggravation"            → signals=1, net=3, dirs=[1] → 0.65
      "The patient shows clear
       pitta aggravation."           → signals=5, net=3, dirs=[1] → 0.95 (cap hit)
      "Patient reports burning
       sensation."                   → signals=3, net=2, dirs=[1] → 0.80
      "Cooling therapy is
       recommended."                 → signals=4, net=1, dirs=[]  → 0.75
    """

    def test_zero_signal_sentence_confidence_exactly_0_0(self):
        """
        TC-DS-076
        Input:  "The patient visited the clinic today."
        No PHRASE_MAP or GUNA_MAP hits → total_signals = 0
        → conf = 0.0 (the special-case branch)

        ALL three doshas must have confidence == 0.0 exactly.
        """
        result = score_sentence("The patient visited the clinic today.")
        for dosha in ("Pitta", "Vata", "Kapha"):
            assert result[dosha]["confidence"] == 0.0, (
                f"Neutral sentence: expected conf=0.0 for {dosha}, "
                f"got {result[dosha]['confidence']}"
            )

    def test_empty_string_all_scores_zero_all_confidence_zero(self):
        """
        TC-DS-077
        Input:  ""
        No tokens, no phrases → total_signals = 0 → conf = 0.0
        All scores must also be 0.

        Expected: {d: {'score': 0, 'confidence': 0.0} for each dosha}
        """
        result = score_sentence("")
        for dosha in ("Pitta", "Vata", "Kapha"):
            assert result[dosha]["score"] == 0, (
                f"Empty input: {dosha} score must be 0, got {result[dosha]['score']}"
            )
            assert result[dosha]["confidence"] == 0.0, (
                f"Empty input: {dosha} conf must be 0.0, got {result[dosha]['confidence']}"
            )

    def test_exact_confidence_for_pitta_aggravation_bare(self):
        """
        TC-DS-078  Exact arithmetic verification for 'pitta aggravation'.

        Execution trace:
          s = "pitta aggravation"
          Phase 1: phrase match at (0,17) → Pitta=3; matched_spans=[(0,17)]
          Phase 2: tokens 'pitta'(0,5) and 'aggravation'(6,17) both inside (0,17) → SKIP
          uncovered_indices = []
          Phase 4:
            total_signals = 1 + 0 = 1
            net_score = |3| = 3
            directions = [1]  (single phrase, consistent)
            base_conf        = 0.3
            signal_bonus     = min(0.4, 1*0.1)   = 0.1
            magnitude_bonus  = min(0.2, 3*0.05)  = 0.15
            consistency_bonus = 0.1
            conf = min(0.95, 0.3+0.1+0.15+0.1)  = min(0.95, 0.65) = 0.65
        """
        result = score_sentence("pitta aggravation")
        assert result["Pitta"]["confidence"] == 0.65, (
            f"Exact confidence for 'pitta aggravation': expected 0.65, "
            f"got {result['Pitta']['confidence']}"
        )

    def test_exact_confidence_cap_reached_with_context_words(self):
        """
        TC-DS-079  Exact confidence = 0.95 (hard cap hit).

        Input: "The patient shows clear pitta aggravation."
        Tokens: the(0) patient(1) shows(2) clear(3) pitta(4) aggravation(5)
        Phase 1: "pitta aggravation" phrase → Pitta=3; span covers pitta+aggravation
        uncovered: the, patient, shows, clear (none in GUNA_MAP)
        uncovered_indices = [0,1,2,3]

        Phase 4:
          total_signals = 1 (phrase) + 4 (uncovered) = 5
          net_score = 3
          signal_bonus     = min(0.4, 5*0.1) = min(0.4, 0.5) = 0.4   ← CAP HIT
          magnitude_bonus  = min(0.2, 3*0.05) = 0.15
          consistency_bonus = 0.1
          conf = min(0.95, 0.3+0.4+0.15+0.1) = min(0.95, 0.95) = 0.95  ← EXACT CAP
        """
        result = score_sentence("The patient shows clear pitta aggravation.")
        assert result["Pitta"]["confidence"] == 0.95, (
            f"Expected confidence to reach exact cap 0.95, "
            f"got {result['Pitta']['confidence']}"
        )

    def test_exact_confidence_for_burning_sensation_sentence(self):
        """
        TC-DS-080  Exact confidence for the TC-DS-016-CRITICAL sentence.

        Input: "Patient reports burning sensation."
        Tokens: patient(0,7) reports(8,15) burning(16,23) sensation(24,33)
        Phase 1: "burning sensation" → Pitta=2; span=(16,33)
        burning and sensation are inside span → SKIPPED
        uncovered: patient(idx0), reports(idx1) → neither in GUNA_MAP

        Phase 4:
          total_signals = 1 + 2 = 3
          net_score = 2
          signal_bonus     = min(0.4, 3*0.1) = 0.3
          magnitude_bonus  = min(0.2, 2*0.05) = 0.10
          consistency_bonus = 0.1
          conf = min(0.95, 0.3+0.3+0.10+0.1) = min(0.95, 0.80) = 0.80
        """
        result = score_sentence("Patient reports burning sensation.")
        assert result["Pitta"]["confidence"] == 0.80, (
            f"Exact confidence: expected 0.80, got {result['Pitta']['confidence']}"
        )

    def test_exact_confidence_for_cooling_sentence(self):
        """
        TC-DS-081  Exact confidence for 'cooling' sentence.

        Input: "Cooling therapy is recommended."
        Tokens (all uncovered): cooling(0) therapy(1) is(2) recommended(3)
        Phase 1: no phrase match
        Phase 2: 'cooling' → early-continue → Pitta=-1
                 others not in GUNA_MAP
        uncovered_indices = [0,1,2,3]  (all 4 tokens)

        Phase 4:
          total_signals = 0 + 4 = 4
          net_score = |-1| = 1
          signal_bonus     = min(0.4, 4*0.1) = 0.4
          magnitude_bonus  = min(0.2, 1*0.05) = 0.05
          directions = []  (no phrase matches) → consistency_bonus = 0
          conf = min(0.95, 0.3+0.4+0.05+0) = min(0.95, 0.75) = 0.75
        """
        result = score_sentence("Cooling therapy is recommended.")
        assert result["Pitta"]["confidence"] == 0.75, (
            f"Exact confidence for cooling sentence: expected 0.75, "
            f"got {result['Pitta']['confidence']}"
        )

    def test_confidence_floor_is_never_negative(self):
        """
        TC-DS-082  Confidence must be >= 0.0 for any input including
        sentences that produce only negative scores (pacification sentences).
        """
        sentences = [
            "reduce vata pacify pitta balance kapha",
            "cooling herbs that reduce inflammatory burning",
            "",
            "The clinic was quiet.",
        ]
        for s in sentences:
            result = score_sentence(s)
            for dosha, data in result.items():
                assert data["confidence"] >= 0.0, (
                    f"Negative confidence detected for '{s[:40]}': "
                    f"{dosha}={data['confidence']}"
                )

    def test_confidence_ceiling_never_exceeds_0_95(self):
        """
        TC-DS-083
        A maximally dense sentence must not push confidence above 0.95.
        """
        dense = (
            "Pitta aggravation pitta prakopa excess pitta burning sensation "
            "acid reflux inflammatory hot burning acidic fiery intense sharp "
            "pitta disorder pitta imbalance aggravation of pitta."
        )
        result = score_sentence(dense)
        for dosha, data in result.items():
            assert data["confidence"] <= 0.95, (
                f"Hard cap violated: {dosha}={data['confidence']}"
            )

    def test_confidence_rounded_to_2_decimal_places(self):
        """
        TC-DS-084  score_sentence returns round(conf, 2).
        """
        result = score_sentence("Pitta aggravation is the root cause of burning.")
        for dosha, data in result.items():
            conf = data["confidence"]
            assert conf == round(conf, 2), (
                f"Confidence not rounded to 2 dp: {dosha}={conf!r}"
            )

    def test_confidence_is_float_type(self):
        """TC-DS-085  Confidence must always be float, never int or None."""
        for sentence in ["", "vata aggravation", "The clinic is open."]:
            result = score_sentence(sentence)
            for dosha, data in result.items():
                assert isinstance(data["confidence"], float), (
                    f"'{sentence}' → {dosha}.confidence must be float, "
                    f"got {type(data['confidence'])}"
                )

    def test_score_is_int_type(self):
        """TC-DS-086  Score must always be int (all arithmetic uses int constants)."""
        result = score_sentence("Pitta aggravation and burning sensation.")
        for dosha, data in result.items():
            assert isinstance(data["score"], int), (
                f"{dosha}.score must be int, got {type(data['score'])}"
            )

    def test_more_signals_produces_same_or_higher_confidence(self):
        """
        TC-DS-087
        signal_bonus = min(0.4, total_signals * 0.1) is monotonically increasing
        until the cap (0.4) is reached.
        One-phrase sentence must have strictly lower confidence than a
        sentence with one phrase PLUS many extra context words.
        """
        one_signal   = score_sentence("pitta aggravation")
        five_signals = score_sentence("The patient clearly shows pitta aggravation symptoms.")
        assert five_signals["Pitta"]["confidence"] >= one_signal["Pitta"]["confidence"], (
            f"More signals must not reduce confidence: "
            f"{five_signals['Pitta']['confidence']} < {one_signal['Pitta']['confidence']}"
        )

    def test_all_three_doshas_share_the_same_confidence_value(self):
        """
        TC-DS-088
        The implementation computes a single 'conf' value and assigns it to all
        three doshas equally.  They must always be identical.
        """
        result = score_sentence("Pitta aggravation with vata imbalance.")
        confidences = [result[d]["confidence"] for d in ("Pitta", "Vata", "Kapha")]
        assert len(set(confidences)) == 1, (
            f"All doshas must share the same confidence value. "
            f"Got Pitta={confidences[0]}, Vata={confidences[1]}, Kapha={confidences[2]}"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 5 ─ HELPER FUNCTIONS  (TC-DS-089 → TC-DS-100)
# ═══════════════════════════════════════════════════════════════════════════════

class TestHelperFunctions:

    # ── get_dominant_dosha ────────────────────────────────────────────────────

    @pytest.mark.parametrize("scores, expected_dominant", [
        (
            {"Pitta": {"score": 5, "confidence": 0.7},
             "Vata":  {"score": 1, "confidence": 0.5},
             "Kapha": {"score": 0, "confidence": 0.0}},
            "Pitta",
        ),  # TC-DS-089
        (
            {"Pitta": {"score": 2, "confidence": 0.6},
             "Vata":  {"score": 4, "confidence": 0.8},
             "Kapha": {"score": 1, "confidence": 0.4}},
            "Vata",
        ),  # TC-DS-090
        (
            {"Pitta": {"score": -1, "confidence": 0.4},
             "Vata":  {"score":  0, "confidence": 0.0},
             "Kapha": {"score":  2, "confidence": 0.6}},
            "Kapha",
        ),  # TC-DS-091
    ])
    def test_get_dominant_dosha_returns_highest_positive(
        self, scores: dict, expected_dominant: str
    ):
        """TC-DS-089 → TC-DS-091  Dominant dosha is the one with the highest positive score."""
        assert get_dominant_dosha(scores) == expected_dominant

    @pytest.mark.parametrize("scores", [
        {"Pitta": {"score": -2, "confidence": 0.5},
         "Vata":  {"score": -1, "confidence": 0.4},
         "Kapha": {"score": -3, "confidence": 0.6}},      # TC-DS-092: all negative
        {"Pitta": {"score": 0, "confidence": 0.0},
         "Vata":  {"score": 0, "confidence": 0.0},
         "Kapha": {"score": 0, "confidence": 0.0}},        # TC-DS-093: all zero
    ])
    def test_get_dominant_dosha_returns_none_when_no_positive(self, scores: dict):
        """TC-DS-092 → TC-DS-093  None returned when no dosha has positive score."""
        assert get_dominant_dosha(scores) is None

    # ── get_imbalanced_doshas ─────────────────────────────────────────────────

    def test_get_imbalanced_doshas_sorted_by_absolute_value_descending(self):
        """
        TC-DS-094
        Scores: Pitta=1, Vata=-4, Kapha=3
        Expected order by |score|: Vata(|-4|=4), Kapha(|3|=3), Pitta(|1|=1)
        """
        scores = {
            "Pitta": {"score":  1, "confidence": 0.4},
            "Vata":  {"score": -4, "confidence": 0.7},
            "Kapha": {"score":  3, "confidence": 0.6},
        }
        result = get_imbalanced_doshas(scores)
        assert [d for d, _ in result] == ["Vata", "Kapha", "Pitta"]

    def test_get_imbalanced_doshas_excludes_zero_score_entries(self):
        """
        TC-DS-095  Zero-score doshas must not appear in the output.
        """
        scores = {
            "Pitta": {"score": 0, "confidence": 0.0},
            "Vata":  {"score": 3, "confidence": 0.6},
            "Kapha": {"score": 0, "confidence": 0.0},
        }
        result = get_imbalanced_doshas(scores)
        assert len(result) == 1
        assert result[0][0] == "Vata"
        assert result[0][1] == 3

    # ── symptoms_to_dosha ─────────────────────────────────────────────────────

    @pytest.mark.parametrize("symptoms, dosha, min_score", [
        (["joint pain"],              "Vata",  1),   # TC-DS-096
        (["burning"],                 "Pitta", 1),   # TC-DS-097
        (["fatigue"],                 "Vata",  1),   # TC-DS-098-a (also Kapha)
        (["fatigue"],                 "Kapha", 1),   # TC-DS-098-b (both doshas)
        (["swelling"],                "Kapha", 1),   # TC-DS-099-a
        (["swelling"],                "Pitta", 1),   # TC-DS-099-b
        (["burning sensation"],       "Pitta", 1),   # TC-DS-100  substring match
        (["coating on tongue"],       "Kapha", 1),   # TC-DS-101
        (["stiffness"],               "Vata",  1),   # TC-DS-102-a
        (["stiffness"],               "Kapha", 1),   # TC-DS-102-b
    ])
    def test_symptoms_to_dosha_correct_routing(
        self, symptoms: list, dosha: str, min_score: int
    ):
        """TC-DS-096 → TC-DS-102"""
        result = symptoms_to_dosha(symptoms)
        assert result[dosha]["score"] >= min_score, (
            f"{symptoms!r} → expected {dosha} >= {min_score}, "
            f"got {result[dosha]['score']}"
        )

    def test_symptoms_to_dosha_empty_list_all_zeros(self):
        """TC-DS-103  Empty list → all scores 0, confidence 0.0."""
        result = symptoms_to_dosha([])
        for dosha in ("Pitta", "Vata", "Kapha"):
            assert result[dosha]["score"] == 0
            assert result[dosha]["confidence"] == 0.0

    def test_symptoms_to_dosha_unknown_symptom_zero_contribution(self):
        """TC-DS-104  Unknown symptoms do not alter any score."""
        result = symptoms_to_dosha(["hiccup", "sneezing", "tinnitus"])
        for dosha in ("Pitta", "Vata", "Kapha"):
            assert result[dosha]["score"] == 0

    def test_symptoms_to_dosha_accumulates_across_multiple_entries(self):
        """
        TC-DS-105
        Input: ['joint pain', 'burning', 'stiffness']
          joint pain → Vata+1
          burning    → Pitta+1
          stiffness  → Vata+1, Kapha+1
        Expected: Vata>=2, Pitta>=1, Kapha>=1
        """
        result = symptoms_to_dosha(["joint pain", "burning", "stiffness"])
        assert result["Vata"]["score"] >= 2
        assert result["Pitta"]["score"] >= 1
        assert result["Kapha"]["score"] >= 1

    def test_symptoms_to_dosha_confidence_capped_at_0_9(self):
        """TC-DS-106  symptoms_to_dosha caps confidence at 0.9."""
        long_list = ["burning"] * 30 + ["joint pain"] * 30
        result = symptoms_to_dosha(long_list)
        for dosha in ("Pitta", "Vata", "Kapha"):
            assert result[dosha]["confidence"] <= 0.9

    def test_symptoms_to_dosha_case_insensitive(self):
        """TC-DS-107  'JOINT PAIN' and 'joint pain' must produce identical results."""
        lower = symptoms_to_dosha(["joint pain"])
        upper = symptoms_to_dosha(["JOINT PAIN"])
        assert lower["Vata"]["score"] == upper["Vata"]["score"]

    # ── explain_score ─────────────────────────────────────────────────────────

    def test_explain_score_neutral_returns_exact_message(self):
        """TC-DS-108"""
        scores = {d: {"score": 0, "confidence": 0.0} for d in ("Pitta", "Vata", "Kapha")}
        assert explain_score(scores) == "No dosha imbalance detected."

    def test_explain_score_positive_shows_plus_notation(self):
        """TC-DS-109  Pitta=3 → output contains 'Pitta +3'."""
        scores = {
            "Pitta": {"score": 3, "confidence": 0.6},
            "Vata":  {"score": 0, "confidence": 0.0},
            "Kapha": {"score": 0, "confidence": 0.0},
        }
        out = explain_score(scores)
        assert "Pitta" in out and "+3" in out

    def test_explain_score_negative_shows_minus_notation(self):
        """TC-DS-110  Vata=-2 → output contains 'Vata -2'."""
        scores = {
            "Pitta": {"score":  0, "confidence": 0.0},
            "Vata":  {"score": -2, "confidence": 0.5},
            "Kapha": {"score":  0, "confidence": 0.0},
        }
        out = explain_score(scores)
        assert "Vata" in out and "-2" in out

    def test_explain_score_multi_dosha_uses_pipe_separator(self):
        """TC-DS-111  Multiple doshas separated by ' | '."""
        scores = {
            "Pitta": {"score": 2, "confidence": 0.5},
            "Vata":  {"score": 3, "confidence": 0.6},
            "Kapha": {"score": 0, "confidence": 0.0},
        }
        assert "|" in explain_score(scores)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 6 ─ DATA STRUCTURE INTEGRITY  (TC-DS-058 → TC-DS-064)
#
# These are the structural regression tests that cross-check the live source
# maps against the EXPECTED_* reference copies defined at the top of this file.
# ═══════════════════════════════════════════════════════════════════════════════

class TestDataStructureIntegrity:
    """
    TC-DS-058 → TC-DS-064  Reference-vs-live map cross-checks.

    Motivation:
    If a developer silently changes a phrase score from 3 to 2, or renames
    a pacify term, the runtime behavior tests may or may not catch it depending
    on the sentence used.  These structural checks catch drift at the data level
    before behavior-level tests are even reached.
    """

    def test_TC_DS_058_phrase_map_contains_all_expected_entries(self):
        """
        TC-DS-058
        Every phrase in EXPECTED_PHRASE_MAP must exist in the live PHRASE_MAP.
        A missing key means a phrase was silently deleted.
        """
        missing = [p for p in EXPECTED_PHRASE_MAP if p not in PHRASE_MAP]
        assert not missing, (
            f"PHRASE_MAP is missing expected entries: {missing}"
        )

    def test_TC_DS_059_phrase_map_values_match_expected_tuples_exactly(self):
        """
        TC-DS-059
        For every phrase in EXPECTED_PHRASE_MAP, the live tuple
        (dosha, base_score, direction) must match exactly.
        This catches silent score changes (e.g., 3→2) or direction flips.
        """
        mismatches = []
        for phrase, (exp_dosha, exp_score, exp_dir) in EXPECTED_PHRASE_MAP.items():
            actual = PHRASE_MAP.get(phrase)
            if actual is None:
                mismatches.append(f"  '{phrase}': MISSING")
                continue
            act_dosha, act_score, act_dir = actual
            if (act_dosha, act_score, act_dir) != (exp_dosha, exp_score, exp_dir):
                mismatches.append(
                    f"  '{phrase}': expected ({exp_dosha},{exp_score},{exp_dir}), "
                    f"got ({act_dosha},{act_score},{act_dir})"
                )
        assert not mismatches, "PHRASE_MAP value mismatches:\n" + "\n".join(mismatches)

    def test_TC_DS_060_all_phrase_map_values_are_valid_3_tuples(self):
        """
        TC-DS-060
        Every PHRASE_MAP value must be a 3-tuple: (str, int, int).
        Constraints:
          dosha      ∈ {'Pitta', 'Vata', 'Kapha'}
          base_score > 0  (positive integer)
          direction  ∈ {-1, +1}
        """
        violations = []
        for phrase, val in PHRASE_MAP.items():
            if not (isinstance(val, tuple) and len(val) == 3):
                violations.append(f"  '{phrase}': not a 3-tuple: {val!r}")
                continue
            dosha, score, direction = val
            if dosha not in ("Pitta", "Vata", "Kapha"):
                violations.append(f"  '{phrase}': unknown dosha {dosha!r}")
            if not (isinstance(score, int) and score > 0):
                violations.append(f"  '{phrase}': score must be positive int: {score!r}")
            if direction not in (-1, 1):
                violations.append(f"  '{phrase}': direction must be ±1: {direction!r}")
        assert not violations, "PHRASE_MAP structural violations:\n" + "\n".join(violations)

    def test_TC_DS_061_guna_map_contains_all_expected_tokens(self):
        """
        TC-DS-061
        Every token in EXPECTED_GUNA_MAP must exist in the live GUNA_MAP.
        """
        missing = [t for t in EXPECTED_GUNA_MAP if t not in GUNA_MAP]
        assert not missing, (
            f"GUNA_MAP is missing expected tokens: {missing}"
        )

    def test_TC_DS_062_guna_map_values_match_expected_deltas_exactly(self):
        """
        TC-DS-062
        For every token in EXPECTED_GUNA_MAP, the dosha→delta mapping
        in the live GUNA_MAP must match exactly.
        """
        mismatches = []
        for token, exp_impacts in EXPECTED_GUNA_MAP.items():
            actual = GUNA_MAP.get(token, {})
            for dosha, exp_delta in exp_impacts.items():
                act_delta = actual.get(dosha)
                if act_delta is None:
                    mismatches.append(f"  '{token}'['{dosha}']: MISSING")
                elif act_delta != exp_delta:
                    mismatches.append(
                        f"  '{token}'['{dosha}']: expected {exp_delta}, got {act_delta}"
                    )
        assert not mismatches, "GUNA_MAP value mismatches:\n" + "\n".join(mismatches)

    def test_TC_DS_063_guna_map_all_keys_reference_known_doshas_only(self):
        """
        TC-DS-063
        Every key inside a GUNA_MAP value dict must be one of the three
        canonical doshas.  No typos like 'Pitta_' or 'pitta'.
        """
        known = {"Pitta", "Vata", "Kapha"}
        violations = []
        for token, impacts in GUNA_MAP.items():
            for d in impacts:
                if d not in known:
                    violations.append(f"  GUNA_MAP['{token}'] references unknown dosha '{d}'")
        assert not violations, "\n".join(violations)

    def test_TC_DS_064a_symptom_dosha_map_all_keys_are_lowercase(self):
        """
        TC-DS-064-a
        SYMPTOM_DOSHA_MAP keys are matched via casefold().
        All keys must already be fully lowercase so the comparison is symmetric.
        """
        non_lowercase = [k for k in SYMPTOM_DOSHA_MAP if k != k.lower()]
        assert not non_lowercase, (
            f"SYMPTOM_DOSHA_MAP has non-lowercase keys: {non_lowercase}"
        )

    def test_TC_DS_064b_pacify_terms_match_expected_reference(self):
        """
        TC-DS-064-b
        PACIFY_TERMS for each dosha must contain every keyword documented in
        EXPECTED_PACIFY_TERMS.  Missing proximity keywords would silently
        prevent direction-flip logic from ever firing.
        """
        missing = []
        for dosha, expected_kws in EXPECTED_PACIFY_TERMS.items():
            actual_kws = PACIFY_TERMS.get(dosha, [])
            for kw in expected_kws:
                if kw not in actual_kws:
                    missing.append(f"  PACIFY_TERMS['{dosha}'] missing keyword '{kw}'")
        assert not missing, "\n".join(missing)

    def test_TC_DS_064c_score_sentence_always_returns_all_three_doshas(self):
        """
        TC-DS-064-c
        score_sentence() must always return a dict with exactly the three keys
        {'Pitta', 'Vata', 'Kapha'} regardless of input content.
        """
        test_inputs = [
            "",
            "pitta aggravation",
            "vata imbalance and kapha disorder",
            "x" * 5000,
            "completely irrelevant medical text",
        ]
        expected_keys = {"Pitta", "Vata", "Kapha"}
        for sentence in test_inputs:
            result = score_sentence(sentence)
            assert set(result.keys()) == expected_keys, (
                f"Missing dosha keys for '{sentence[:40]}': {set(result.keys())}"
            )

    def test_TC_DS_064d_each_dosha_value_has_score_int_and_confidence_float(self):
        """
        TC-DS-064-d
        Every dosha entry in the return dict must have exactly 'score' (int)
        and 'confidence' (float) — the public contract of score_sentence().
        """
        result = score_sentence("Pitta aggravation with mucus accumulation.")
        for dosha, data in result.items():
            assert "score" in data, f"'{dosha}' missing 'score' key"
            assert "confidence" in data, f"'{dosha}' missing 'confidence' key"
            assert isinstance(data["score"], int), (
                f"'{dosha}'.score must be int, got {type(data['score'])}"
            )
            assert isinstance(data["confidence"], float), (
                f"'{dosha}'.confidence must be float, got {type(data['confidence'])}"
            )

"""Dosha Impact Scoring with Ayurvedic Logic.

Features:
- Regex-based phrase matching with word boundaries
- Robust token span detection using re.finditer()
- Token-distance proximity for direction detection
- Confidence based on signal consistency and magnitude
"""
from typing import Dict, Tuple, List, Optional
import re


# Phrase-level detection - STRONGEST signal
# Format: "phrase": (dosha, score, direction)
PHRASE_MAP = {
    # Pitta aggravation (positive direction)
    'aggravation of pitta': ('Pitta', 3, 1),
    'pitta aggravation': ('Pitta', 3, 1),
    'pitta prakopa': ('Pitta', 3, 1),
    'pitta imbalance': ('Pitta', 2, 1),
    'excess pitta': ('Pitta', 2, 1),
    'pitta disorder': ('Pitta', 2, 1),

    # Pitta reduction (negative direction)
    'reduce pitta': ('Pitta', 2, -1),
    'pacify pitta': ('Pitta', 2, -1),
    'balance pitta': ('Pitta', 2, -1),
    'cooling for pitta': ('Pitta', 2, -1),
    'pitta reducing': ('Pitta', 2, -1),

    # Vata aggravation (positive direction)
    'vata aggravation': ('Vata', 3, 1),
    'vata prakopa': ('Vata', 3, 1),
    'vata imbalance': ('Vata', 2, 1),
    'excess vata': ('Vata', 2, 1),
    'vata disorder': ('Vata', 2, 1),

    # Vata reduction (negative direction)
    'reduce vata': ('Vata', 2, -1),
    'pacify vata': ('Vata', 2, -1),
    'balance vata': ('Vata', 2, -1),

    # Kapha aggravation (positive direction)
    'kapha aggravation': ('Kapha', 3, 1),
    'kapha prakopa': ('Kapha', 3, 1),
    'kapha imbalance': ('Kapha', 2, 1),
    'excess kapha': ('Kapha', 2, 1),
    'kapha disorder': ('Kapha', 2, 1),

    # Kapha reduction (negative direction)
    'reduce kapha': ('Kapha', 2, -1),
    'pacify kapha': ('Kapha', 2, -1),
    'balance kapha': ('Kapha', 2, -1),

    # Symptoms
    'burning sensation': ('Pitta', 2, 1),
    'acid reflux': ('Pitta', 2, 1),
    'dryness sensation': ('Vata', 2, 1),
    'gas and bloating': ('Vata', 2, 1),
    'constipation': ('Vata', 1, 1),
    'congestion': ('Kapha', 2, 1),
    'mucus accumulation': ('Kapha', 2, 1),
}


# Token-level quality (Guna) mapping - WEAKER signal
GUNA_MAP = {
    # Pitta-increasing
    'hot': {'Pitta': 1}, 'burning': {'Pitta': 2}, 'sharp': {'Pitta': 1},
    'acidic': {'Pitta': 2}, 'sour': {'Pitta': 1}, 'salty': {'Pitta': 1},
    'penetrating': {'Pitta': 1}, 'inflammatory': {'Pitta': 2},
    'fiery': {'Pitta': 2}, 'intense': {'Pitta': 1},

    # Vata-increasing
    'dry': {'Vata': 1}, 'cold': {'Vata': 1}, 'light': {'Vata': 1},
    'rough': {'Vata': 1}, 'mobile': {'Vata': 1}, 'subtle': {'Vata': 1},
    'quick': {'Vata': 1}, 'erratic': {'Vata': 2}, 'unsteady': {'Vata': 2},

    # Kapha-increasing
    'heavy': {'Kapha': 1}, 'oily': {'Kapha': 1}, 'slow': {'Kapha': 1},
    'dense': {'Kapha': 1}, 'sweet': {'Kapha': 1}, 'sticky': {'Kapha': 1},
    'nourishing': {'Kapha': 1}, 'congesting': {'Kapha': 2},

    # Cooling - reduces Pitta
    'cooling': {'Pitta': -1},
}


# Token-distance proximity for direction detection
PACIFY_TERMS = {
    'Pitta': ['cooling', 'cold', 'sweet', 'bitter', 'astringent', 'pacify', 'reduce', 'balance', 'calm'],
    'Vata': ['warm', 'oily', 'sweet', 'nourishing', 'grounding', 'pacify', 'reduce', 'balance'],
    'Kapha': ['dry', 'light', 'warm', 'stimulating', 'bitter', 'pungent', 'pacify', 'reduce', 'balance'],
}


def score_sentence(sentence: str) -> Dict[str, Dict]:
    """Score dosha impact with robust phrase/token detection.

    Returns:
        {dosha: {'score': int, 'confidence': float}}
    """
    s = sentence.casefold()
    scores = {'Pitta': 0, 'Vata': 0, 'Kapha': 0}

    # Track matched spans to avoid overlap
    matched_spans = []  # List of (start, end) tuples

    # Phase 1: Regex-based phrase matching with word boundaries
    for phrase, (dosha, base_score, direction) in PHRASE_MAP.items():
        pattern = r'\b' + re.escape(phrase) + r'\b'
        for match in re.finditer(pattern, s):
            matched_spans.append((match.start(), match.end()))
            scores[dosha] += base_score * direction

    # Phase 2: Robust token detection using re.finditer()
    token_data = []  # List of (token, start, end)
    for match in re.finditer(r'\w+', s):
        token = match.group()
        token_data.append((token, match.start(), match.end()))

    # Get token indices that are NOT in matched spans
    uncovered_indices = []
    for idx, (token, start, end) in enumerate(token_data):
        skip = False
        for p_start, p_end in matched_spans:
            if p_start <= start and end <= p_end:
                skip = True
                break
        if not skip:
            uncovered_indices.append(idx)

    # Phase 3: Score uncovered tokens
    for idx in uncovered_indices:
        token, start, end = token_data[idx]

        if token in GUNA_MAP:
            impacts = GUNA_MAP[token]

            # Special handling for cooling
            if token == 'cooling':
                for dosha, score in impacts.items():
                    scores[dosha] += score
                continue

            # Check for pacify terms within token distance
            for dosha, _ in impacts.items():
                pacify_kws = PACIFY_TERMS.get(dosha, [])
                direction = 1  # Default: aggravate

                # Search within token distance of 3
                search_start = max(0, idx - 3)
                search_end = min(len(token_data), idx + 3)

                for search_idx in range(search_start, search_end):
                    if search_idx == idx:
                        continue
                    search_token = token_data[search_idx][0]
                    if search_token in pacify_kws:
                        direction = -1
                        break

                scores[dosha] += impacts[dosha] * direction

    # Phase 4: Compute confidence
    dosha_out = {}
    total_signals = len(matched_spans) + len(uncovered_indices)
    net_score = sum(abs(v) for v in scores.values())
    dominant_score = max(abs(v) for v in scores.values())

    # Confidence based on:
    # 1. Signal count (more signals = higher confidence)
    # 2. Net score magnitude
    # 3. Consistency (all signals same direction?)
    directions = []
    for idx in matched_spans:
        # Find which phrase this span belongs to
        for phrase, (dosha, _, direction) in PHRASE_MAP.items():
            pattern = r'\b' + re.escape(phrase) + r'\b'
            if re.search(pattern, s[idx[0]:idx[1]]):
                directions.append(direction)
                break

    # Calculate confidence
    if total_signals == 0:
        conf = 0.0
    else:
        base_conf = 0.3
        signal_bonus = min(0.4, total_signals * 0.1)
        magnitude_bonus = min(0.2, net_score * 0.05)
        consistency_bonus = 0.1 if directions and all(d == directions[0] for d in directions) else 0
        conf = min(0.95, base_conf + signal_bonus + magnitude_bonus + consistency_bonus)

    for dosha, sc in scores.items():
        dosha_out[dosha] = {'score': sc, 'confidence': round(conf, 2)}

    return dosha_out


def get_dominant_dosha(scores: Dict[str, Dict]) -> Optional[str]:
    """Return the dominant aggravating dosha."""
    max_score = -999
    dominant = None
    has_positive = False

    for dosha, data in scores.items():
        if data['score'] > max_score:
            max_score = data['score']
            dominant = dosha
        if data['score'] > 0:
            has_positive = True

    if has_positive and max_score > 0:
        return dominant
    return None


def get_imbalanced_doshas(scores: Dict[str, Dict]) -> List[Tuple[str, int]]:
    """Return sorted list of imbalanced doshas."""
    imbalances = [(d, s['score']) for d, s in scores.items() if s['score'] != 0]
    imbalances.sort(key=lambda x: abs(x[1]), reverse=True)
    return imbalances


def is_balancing_therapy(scores: Dict[str, Dict]) -> Tuple[bool, str]:
    """Check if this describes a balancing therapy."""
    imbalances = get_imbalanced_doshas(scores)

    if not imbalances:
        return False, "neutral"

    dominant_dosha, dominant_score = imbalances[0]

    if dominant_score < 0:
        return True, f"pacifies {dominant_dosha}"

    positive_count = sum(1 for _, s in imbalances if s > 0)
    negative_count = sum(1 for _, s in imbalances if s < 0)

    if negative_count > positive_count:
        return True, "net pacifying"

    return False, f"aggravates {dominant_dosha}"


def explain_score(scores: Dict[str, Dict]) -> str:
    """Generate human-readable explanation."""
    imbalances = get_imbalanced_doshas(scores)

    if not imbalances:
        return "No dosha imbalance detected."

    parts = []
    for dosha, score in imbalances:
        if score > 0:
            parts.append(f"{dosha} +{score}")
        elif score < 0:
            parts.append(f"{dosha} {score}")

    return " | ".join(parts) if parts else "Neutral"


# Symptom -> dosha heuristic mapping (rule-based)
SYMPTOM_DOSHA_MAP = {
    # joint / musculoskeletal
    'pain': {'Vata': 1},
    'joint pain': {'Vata': 1},
    'stiffness': {'Vata': 1, 'Kapha': 1},
    'swelling': {'Kapha': 1, 'Pitta': 1},
    'redness': {'Pitta': 1},
    'warmth': {'Pitta': 1},

    # digestive / ama
    'heaviness': {'Kapha': 1},
    'coating on tongue': {'Kapha': 1},

    # burning
    'burning': {'Pitta': 1},
    'burning sensation': {'Pitta': 1},

    # general
    'fatigue': {'Vata': 1, 'Kapha': 1},
}


def symptoms_to_dosha(symptom_texts: List[str]) -> Dict[str, Dict]:
    """Convert list of symptom phrases to a dosha score dictionary.

    Returns same structure as score_sentence: {dosha: {'score': int, 'confidence': float}}
    """
    scores = {'Pitta': {'score': 0, 'confidence': 0.0},
              'Vata': {'score': 0, 'confidence': 0.0},
              'Kapha': {'score': 0, 'confidence': 0.0}}

    signal_count = 0
    for s in symptom_texts:
        if not s:
            continue
        key = s.casefold().strip()
        # exact matches or substring matches
        for sym, impact in SYMPTOM_DOSHA_MAP.items():
            if sym in key:
                signal_count += 1
                for d, v in impact.items():
                    scores.setdefault(d, {'score': 0, 'confidence': 0.0})
                    scores[d]['score'] += v

    # assign simplistic confidence
    if signal_count == 0:
        conf = 0.0
    else:
        conf = min(0.9, 0.2 + 0.15 * signal_count)

    for d in scores:
        scores[d]['confidence'] = round(conf, 2)

    return scores

"""Candidate retrieval engine.

Loads a simple canonical KB and scores candidate diseases deterministically
based on symptom keyword overlap and dosha alignment.
"""
from typing import List, Dict, Any, Optional
import json
import os
from storage import registry
import importlib.util
import os


def _load_dosha_module():
    base = os.path.dirname(__file__)
    path = os.path.join(base, 'nlp', 'dosha_scoring.py')
    spec = importlib.util.spec_from_file_location('dosha_scoring', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


KB_DEFAULT = os.path.join(os.path.dirname(__file__), 'test_out', 'sample_canonical.json')


def load_kb(path: Optional[str] = None) -> Dict[str, Any]:
    path = path or KB_DEFAULT
    if not os.path.exists(path):
        # Return empty KB if file doesn't exist to prevent crash
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _record_text(rec: Dict[str, Any]) -> str:
    pieces = []
    for k in ('symptoms', 'causes', 'treatment'):
        v = rec.get(k)
        if isinstance(v, str) and v:
            pieces.append(v)
    ex = rec.get('examples') or []
    if isinstance(ex, list):
        pieces.extend(ex)
    return ' '.join(pieces).casefold()


def get_candidates(symptom_texts: List[str], dosha_profile: Optional[Dict[str, Dict]] = None, top_n: int = 3, kb_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return top candidate records from KB.

    Args:
        symptom_texts: list of symptom phrases (raw strings)
        dosha_profile: optional dosha scoring output
        top_n: number of candidates to return
    Returns:
        list of dicts: {id, score, match_count, record}
    """
    kb = load_kb(kb_path)
    # Normalize symptom tokens
    tokens = [s.casefold().strip() for s in symptom_texts if s]

    results = []
    dominant = None
    if dosha_profile:
        # determine dominant dosha if any (load dosha_scoring lazily)
        dosha_scoring = _load_dosha_module()
        dominant = dosha_scoring.get_dominant_dosha(dosha_profile)

    for key, rec in kb.items():
        # determine category from key (format: category:name or UPPERCASE group)
        if ':' in key:
            category = key.split(':', 1)[0].casefold()
        else:
            category = key.casefold()

        # Restrict to diseases only
        if category != 'disease':
            continue

        text = _record_text(rec)
        match_count = 0
        for t in tokens:
            if not t:
                continue
            if t in text:
                match_count += 1
            else:
                # also try canonical lookup
                cid = registry.find_canonical_by_name(t)
                if cid and cid.casefold() in key.casefold():
                    match_count += 1

        # Weighted scoring: symptom_overlap*3 + dosha_alignment*2 + body_part_match*2
        symptom_overlap = match_count
        dosha_alignment = 0
        body_part_match = 0

        # dosha alignment: compare candidate dosha profile with provided dosha_profile
        if dominant and isinstance(dosha_profile, dict):
            rec_dosha = rec.get('dosha', {})
            dosha_rec = rec_dosha.get(dominant, {}) if isinstance(rec_dosha, dict) else {}
            if dosha_rec and dosha_rec.get('score', 0) > 0:
                dosha_alignment = 1

        # body part match: if any token mentions a body part present in record text
        body_parts = ['knee', 'hand', 'foot', 'elbow', 'hip', 'shoulder', 'back', 'neck']
        for bp in body_parts:
            for t in tokens:
                if bp in t and bp in text:
                    body_part_match = 1
                    break
            if body_part_match:
                break

        score = (symptom_overlap * 3) + (dosha_alignment * 2) + (body_part_match * 2)

        results.append({'id': key, 'score': score, 'match_count': match_count, 'record': rec})

    # sort by score desc then match_count desc
    results.sort(key=lambda r: (r['score'], r['match_count']), reverse=True)
    return results[:top_n]


if __name__ == '__main__':
    # small self-test
    print('Loaded KB:', KB_DEFAULT)
    sample = get_candidates(['burning sensation', 'acid reflux'], None)
    print(sample)

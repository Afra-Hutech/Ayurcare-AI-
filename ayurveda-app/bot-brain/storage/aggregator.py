"""Knowledge Base Aggregation Module.

Aggregates sentence-level KB JSONL into canonical-centric JSON using keyword heuristics.
"""
from collections import defaultdict
from typing import Dict, Any, Optional


# Keyword sets for classification
SYMPTOM_KW = [
    'symptom', 'symptoms', 'burn', 'pain', 'ache', 'sensation', 'belching',
    'vomit', 'nausea', 'swelling', 'discomfort'
]
CAUSE_KW = ['cause', 'caused', 'due to', 'aggravation', 'excess', 'intake', 'from']
TREAT_KW = ['treatment', 'treat', 'used for', 'use', 'therapy', 'procedure', 'apply']


def classify_sentence(text: str) -> set:
    """Classify a sentence into categories based on keywords."""
    t = text.lower()
    out = set()
    if any(k in t for k in SYMPTOM_KW):
        out.add('symptoms')
    if any(k in t for k in CAUSE_KW):
        out.add('causes')
    if any(k in t for k in TREAT_KW):
        out.add('treatment')
    return out


def aggregate(kb_jsonl: str, canonical_registry: Optional[Dict] = None) -> Dict[str, Any]:
    """Aggregate KB JSONL records into canonical-centric format."""
    from .json_store import load_jsonl

    agg = defaultdict(lambda: {
        'symptoms': set(),
        'causes': set(),
        'treatment': set(),
        'examples': set(),
        'dosha_stats': defaultdict(lambda: {'weighted_score': 0.0, 'weight': 0.0, 'max_conf': 0.0})
    })

    for rec in load_jsonl(kb_jsonl):
        text = rec.get('text', '')
        ents = rec.get('entities', [])
        dosha = rec.get('dosha', {}) or {}

        for e in ents:
            cid = e.get('canonical_id') or e.get('label') or e.get('text')
            flags = classify_sentence(text)

            if 'symptoms' in flags:
                agg[cid]['symptoms'].add(text)
            if 'causes' in flags:
                agg[cid]['causes'].add(text)
            if 'treatment' in flags:
                agg[cid]['treatment'].add(text)

            agg[cid]['examples'].add(text)

            # Accumulate dosha stats
            for dname, drec in dosha.items():
                try:
                    score = float(drec.get('score', 0.0))
                    conf = float(drec.get('confidence', 0.0))
                except Exception:
                    score = 0.0
                    conf = 0.0
                ds = agg[cid]['dosha_stats'][dname]
                ds['weighted_score'] += score * conf
                ds['weight'] += conf
                ds['max_conf'] = max(ds['max_conf'], conf)

    # Convert to final format
    out = {}
    for cid, fields in agg.items():
        display = cid
        if canonical_registry and cid in canonical_registry:
            label = canonical_registry[cid].get('label')
            if label:
                display = label

        dosha_out = {}
        for dname, stats in fields['dosha_stats'].items():
            if stats['weight'] > 0:
                avg = stats['weighted_score'] / stats['weight']
            else:
                avg = 0.0
            dosha_out[dname] = {'score': avg, 'confidence': stats['max_conf']}

        out[display] = {
            'symptoms': '\n'.join(sorted(fields['symptoms'])) if fields['symptoms'] else '',
            'causes': '\n'.join(sorted(fields['causes'])) if fields['causes'] else '',
            'treatment': '\n'.join(sorted(fields['treatment'])) if fields['treatment'] else '',
            'dosha': dosha_out,
            'examples': list(sorted(fields['examples']))[:10]
        }

    return out

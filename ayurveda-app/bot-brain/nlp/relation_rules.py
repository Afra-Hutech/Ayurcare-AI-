"""Relation Extraction Rules for Ayurveda.

Deterministic regex/pattern rules to extract relations from sentences.
"""
from typing import List, Dict
import re


def extract_relations_from_sentence(sentence: str, entities: List[Dict]) -> List[Dict]:
    """Extract relations from a sentence given entity spans."""
    rels = []
    s_lower = sentence.casefold()

    def left_entity(pos):
        left = [e for e in entities if e['span'][1] <= pos]
        return left[-1] if left else None

    def right_entity(pos):
        right = [e for e in entities if e['span'][0] >= pos]
        return right[0] if right else None

    # Rule: caused_by
    for m in re.finditer(r"\b(is caused by|caused by|due to|secondary to)\b", s_lower):
        subj = left_entity(m.start())
        obj = right_entity(m.end())
        if subj and obj:
            rels.append({
                "subject": subj.get('canonical_id') or subj.get('text'),
                "relation": "caused_by",
                "object": obj.get('canonical_id') or obj.get('text'),
                "confidence": 0.9
            })

    # Rule: used_for
    for m in re.finditer(r"\b(used for|used to treat|indicated for|treats)\b", s_lower):
        subj = left_entity(m.start())
        obj = right_entity(m.end())
        if subj and obj:
            rels.append({
                "subject": subj.get('canonical_id') or subj.get('text'),
                "relation": "used_for",
                "object": obj.get('canonical_id') or obj.get('text'),
                "confidence": 0.85
            })

    # Rule: procedure detection
    if re.search(r"\b(procedure|therapy|cleansing|panchakarma|virechana)\b", s_lower):
        procedures = [e for e in entities if e.get('label') == 'PROCEDURE']
        others = [e for e in entities if e.get('label') in ('DISEASE', 'SYMPTOM')]
        for p in procedures:
            if others:
                others_sorted = sorted(others, key=lambda o: abs(o['span'][0] - p['span'][1]))
                o = others_sorted[0]
                rels.append({
                    "subject": p.get('canonical_id') or p.get('text'),
                    "relation": "procedure_for",
                    "object": o.get('canonical_id') or o.get('text'),
                    "confidence": 0.8
                })

    # Fallback: co-occurrence
    if not rels and len(entities) >= 2:
        for i in range(len(entities) - 1):
            a = entities[i]
            b = entities[i + 1]
            rels.append({
                "subject": a.get('canonical_id') or a.get('text'),
                "relation": "associated_with",
                "object": b.get('canonical_id') or b.get('text'),
                "confidence": 0.5
            })

    return rels

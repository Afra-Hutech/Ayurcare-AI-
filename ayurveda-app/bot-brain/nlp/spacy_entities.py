"""Entity Recognition using spaCy and Gazetteer Matching.

Provides EntityRuler construction and fallback gazetteer matching.
"""
from typing import Dict, List


def build_entity_ruler(nlp, canonical_registry: Dict[str, Dict]):
    """Build spaCy EntityRuler from canonical registry."""
    try:
        from spacy.pipeline import EntityRuler
    except Exception:
        EntityRuler = None

    if EntityRuler is None:
        raise RuntimeError("spaCy not available")

    try:
        ruler = nlp.add_pipe("entity_ruler", config={"overwrite_ents": False})
    except Exception:
        ruler = EntityRuler(nlp, overwrite_ents=False)

    patterns = []
    for cid, rec in canonical_registry.items():
        label = rec.get('label')
        for syn in rec.get('synonyms', []):
            patterns.append({"label": label, "pattern": syn, "id": cid})
    ruler.add_patterns(patterns)
    return ruler


def gazetteer_match(text: str, canonical_registry: Dict[str, Dict]) -> List[Dict]:
    """Fallback: naive substring matching using registry synonyms."""
    out = []
    lower = text.casefold()
    for cid, rec in canonical_registry.items():
        label = rec.get('label')
        for syn in rec.get('synonyms', []):
            syn_l = syn.casefold()
            start = lower.find(syn_l)
            if start != -1:
                end = start + len(syn_l)
                matched = text[start:end]
                out.append({
                    "text": matched,
                    "label": label,
                    "canonical_id": cid,
                    "span": [start, end]
                })
    out.sort(key=lambda x: x['span'][0])
    return out

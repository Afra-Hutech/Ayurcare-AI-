"""Canonical Registry Module.

Provides centralized canonical ID management with synonyms and normalization.
"""
import unicodedata
from typing import Dict, Any, Optional


CANONICAL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "disease:amlapitta": {
        "label": "DISEASE",
        "canonical_name": "Amlapitta",
        "synonyms": ["Amlapitta", "Hyperacidity", "Urdhwaga Amlapitta"],
    },
    "dosha:pitta": {
        "label": "DOSHA",
        "canonical_name": "Pitta",
        "synonyms": ["Pitta"],
    },
}


def _norm(s: str) -> str:
    """Normalize string for comparison."""
    return unicodedata.normalize('NFKC', s).casefold().strip()


def find_canonical_by_name(name: str) -> Optional[str]:
    """Return canonical_id if a synonym matches; else None."""
    if not name:
        return None
    key = _norm(name)
    for cid, rec in CANONICAL_REGISTRY.items():
        for syn in rec.get('synonyms', []):
            if _norm(syn) == key:
                return cid
    return None


def register_canonical(canonical_id: str, label: str, canonical_name: str, synonyms: list) -> None:
    """Register a new canonical entity."""
    CANONICAL_REGISTRY[canonical_id] = {
        "label": label,
        "canonical_name": canonical_name,
        "synonyms": synonyms,
    }

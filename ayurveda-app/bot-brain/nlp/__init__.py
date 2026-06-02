"""NLP Processing Module.

Sub-modules:
- pipeline: Pipeline architecture definitions
- relation_rules: Deterministic relation extraction
- spacy_entities: spaCy EntityRuler and gazetteer matching
- dosha_scoring: Dosha impact scoring with Ayurvedic logic
- embeddings: Sentence embeddings and FAISS index
"""
from .pipeline import PIPELINE_STEPS, ENTITY_CATEGORIES, EXAMPLE_KB_RECORD, get_design_dict
from .relation_rules import extract_relations_from_sentence
from .spacy_entities import build_entity_ruler, gazetteer_match
from .dosha_scoring import (
    score_sentence,
    PHRASE_MAP,
    GUNA_MAP,
    PACIFY_TERMS,
    get_dominant_dosha,
    get_imbalanced_doshas,
    is_balancing_therapy,
    explain_score
)
from .embeddings import encode_paragraphs, build_faiss_index

__all__ = [
    "PIPELINE_STEPS",
    "ENTITY_CATEGORIES",
    "EXAMPLE_KB_RECORD",
    "get_design_dict",
    "extract_relations_from_sentence",
    "build_entity_ruler",
    "gazetteer_match",
    "score_sentence",
    "PHRASE_MAP",
    "GUNA_MAP",
    "PACIFY_TERMS",
    "get_dominant_dosha",
    "get_imbalanced_doshas",
    "is_balancing_therapy",
    "explain_score",
    "encode_paragraphs",
    "build_faiss_index",
]

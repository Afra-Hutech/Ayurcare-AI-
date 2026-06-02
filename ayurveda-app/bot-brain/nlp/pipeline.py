"""NLP Pipeline Design Module.

Documents the Ayurveda-optimized pipeline architecture.
"""
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any
import json


@dataclass
class PipelineStep:
    id: int
    name: str
    description: str
    depends_on: Optional[List[int]] = None
    notes: Optional[str] = None


ENTITY_CATEGORIES = [
    ("DISEASE", "Amlapitta"),
    ("DOSHA", "Vata"),
    ("HERB", "Trikatu"),
    ("PROCEDURE", "Virechana"),
    ("SYMPTOM", "Daha"),
    ("BODY_PART", "Amashaya"),
]


PIPELINE_STEPS: List[PipelineStep] = [
    PipelineStep(1, "PDF Layer (Raw + Clean)",
                 "Keep an immutable raw text copy; produce a cleaned text copy.",
                 None,
                 "Never overwrite raw text; store both raw_text and clean_text."),

    PipelineStep(2, "Sentence & Paragraph Layer",
                 "Produce two chunking granularities: paragraph chunks for RAG and sentence chunks.",
                 [1],
                 "Store offsets and source metadata."),

    PipelineStep(3, "Entity Layer",
                 "Detect and canonicalize entities into predefined categories.",
                 [2],
                 "Use spaCy EntityRuler + matcher + gazetteers."),

    PipelineStep(4, "Canonical Registry",
                 "Centralized registry that maps canonical IDs to labels and synonyms.",
                 [3],
                 "Single source-of-truth for canonical_id, synonyms."),

    PipelineStep(5, "Relation Extraction",
                 "Extract relations between entities (e.g., caused_by, treats).",
                 [2, 3, 4],
                 "Deterministic patterns + lightweight transformers."),

    PipelineStep(6, "Dosha Scoring Layer",
                 "Derive dosha impact scores per sentence/paragraph.",
                 [3, 5],
                 "Produce per-dosha score + confidence."),

    PipelineStep(7, "Structured KB",
                 "Assemble structured facts with provenance.",
                 [3, 5, 6],
                 "Store as JSONL and ingest into MongoDB."),

    PipelineStep(8, "Embeddings for RAG (Local)",
                 "Create paragraph-level embeddings using local models.",
                 [2],
                 "Normalize embeddings (L2) and store in FAISS/Milvus."),
]


EXAMPLE_KB_RECORD: Dict[str, Any] = {
    "doc_id": "doc-123",
    "source": "some_file.pdf",
    "sentence": "Amlapitta is caused by aggravation of Pitta.",
    "entities": [
        {"text": "Amlapitta", "label": "DISEASE", "canonical_id": "disease:amlapitta", "span": [0, 9]},
        {"text": "Pitta", "label": "DOSHA", "canonical_id": "dosha:pitta", "span": [29, 34]},
    ],
    "relations": [
        {"subject": "disease:amlapitta", "relation": "caused_by", "object": "dosha:pitta_aggravation", "confidence": 0.92}
    ],
    "dosha_impact": {
        "Pitta": {"score": 2, "confidence": 0.87},
        "Vata": {"score": 0, "confidence": 0.45},
        "Kapha": {"score": 0, "confidence": 0.66},
    },
    "provenance": {"page": 12, "char_start": 1024, "char_end": 1089},
}


def get_design_dict():
    return {
        "pipeline": [asdict(s) for s in PIPELINE_STEPS],
        "entity_categories": [dict(label=k, example=v) for k, v in ENTITY_CATEGORIES],
        "example_record": EXAMPLE_KB_RECORD,
    }


def write_design_json(path: str):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(get_design_dict(), f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    print(json.dumps(get_design_dict(), indent=2, ensure_ascii=False))

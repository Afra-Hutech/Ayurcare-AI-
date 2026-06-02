"""Storage Module.

Sub-modules:
- json_store: JSON/JSONL file handling
- aggregator: KB aggregation from JSONL to canonical format
- registry: Canonical entity registry and lookup
- kb_assembly: KB record assembly and export
"""

from .json_store import load_jsonl, save_jsonl, load_json, save_json
from .aggregator import aggregate
from .registry import CANONICAL_REGISTRY, find_canonical_by_name, register_canonical
from .kb_assembly import assemble_kb_records, export_jsonl, ingest_to_mongo

__all__ = [
    "load_jsonl",
    "save_jsonl",
    "load_json",
    "save_json",
    "aggregate",
    "CANONICAL_REGISTRY",
    "find_canonical_by_name",
    "register_canonical",
    "assemble_kb_records",
    "export_jsonl",
    "ingest_to_mongo",
]

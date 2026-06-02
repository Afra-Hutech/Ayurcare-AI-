"""JSON Storage Module.

Provides utilities for reading and writing JSON/JSONL files.
"""
import json
from pathlib import Path
from typing import Generator, Any, Dict


def load_jsonl(path: str) -> Generator[Dict[str, Any], None, None]:
    """Yield parsed JSON objects from a JSONL file."""
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def save_jsonl(records: list, path: str, mode: str = 'w') -> None:
    """Write records to a JSONL file."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, mode, encoding='utf-8') as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')


def load_json(path: str) -> Dict[str, Any]:
    """Load a JSON file."""
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(data: Dict[str, Any], path: str, indent: int = 2) -> None:
    """Save data to a JSON file."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)

"""Knowledge Base Assembly and Export Module.

Provides KB record assembly and export to JSONL/MongoDB.
"""
import json
import os
from datetime import datetime
from typing import List, Dict, Any
from uuid import uuid4


def assemble_kb_records(
    doc_id: str,
    sentences: List,
    entities_list: List,
    relations_list: List,
    dosha_list: List,
    source_path: str = None
) -> List[Dict[str, Any]]:
    """Assemble KB records from extracted components."""
    records = []
    ts = datetime.utcnow().isoformat() + 'Z'

    for i, sent in enumerate(sentences):
        record = {
            'id': str(uuid4()),
            'doc_id': doc_id,
            'sentence_index': i,
            'text': sent.get('text') if isinstance(sent, dict) else str(sent),
            'char_start': sent.get('char_start') if isinstance(sent, dict) else None,
            'char_end': sent.get('char_end') if isinstance(sent, dict) else None,
            'entities': entities_list[i] if i < len(entities_list) else [],
            'relations': relations_list[i] if i < len(relations_list) else [],
            'dosha': dosha_list[i] if i < len(dosha_list) else {},
            'provenance': {
                'source': source_path,
                'created_at': ts
            }
        }
        records.append(record)
    return records


def export_jsonl(path: str, records: List[Dict]) -> None:
    """Export records to JSONL format."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def ingest_to_mongo(mongo_uri: str, db_name: str, coll_name: str, records: List[Dict]) -> List[str]:
    """Insert records into MongoDB."""
    try:
        from pymongo import MongoClient
    except Exception as e:
        raise RuntimeError('pymongo is not available: ' + str(e))

    client = MongoClient(mongo_uri)
    db = client[db_name]
    coll = db[coll_name]
    res = coll.insert_many(records)
    return res.inserted_ids

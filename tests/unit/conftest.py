"""
Shared fixtures for unit tests.
No network, no DB, no filesystem beyond local stubs.
"""
import sys
import os
import json
import tempfile
import struct

import pytest

# ── Add bot-brain to sys.path so nlp/ and extraction/ are importable ──────────
BOT_BRAIN = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../ayurveda-app/bot-brain")
)
if BOT_BRAIN not in sys.path:
    sys.path.insert(0, BOT_BRAIN)


# ── Minimal FAISS stub so tests can import retrieval_agent without a real index
@pytest.fixture(scope="session")
def tiny_faiss_store(tmp_path_factory):
    """
    Create a minimal FAISS flat-L2 index (4 vectors, dim=3) and a matching
    metadata.json.  Returns (index_path, metadata_path).
    """
    try:
        import faiss
        import numpy as np

        store_dir = tmp_path_factory.mktemp("vector_store")
        dim = 3
        index = faiss.IndexFlatL2(dim)
        vecs = np.array(
            [
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.0, 1.0],
                [0.5, 0.5, 0.0],
            ],
            dtype="float32",
        )
        index.add(vecs)
        idx_path = store_dir / "index.faiss"
        faiss.write_index(index, str(idx_path))

        metadata = [
            {"text": "Vata dosha governs movement and the nervous system.", "source": "Charaka_Samhita"},
            {"text": "Pitta dosha governs metabolism and transformation.", "source": "Ashtanga_Hridayam"},
            {"text": "Kapha dosha governs structure and lubrication.", "source": "Sushruta_Samhita"},
            {"text": "Tridosha theory is the cornerstone of Ayurvedic medicine.", "source": "Charaka_Samhita"},
        ]
        meta_path = store_dir / "metadata.json"
        meta_path.write_text(json.dumps(metadata), encoding="utf-8")

        return str(idx_path), str(meta_path)
    except ImportError:
        pytest.skip("faiss-cpu not installed — skipping vector store fixtures")


@pytest.fixture
def sample_dosha_sentences():
    return {
        "pitta_aggravation": "The patient presents with burning sensation and pitta aggravation.",
        "vata_dominant": "Vata imbalance is evident with dry skin and gas and bloating.",
        "kapha_excess": "Excess kapha manifests as mucus accumulation and heaviness.",
        "pacifying_pitta": "Cooling herbs are recommended to pacify pitta.",
        "neutral": "The patient visited the clinic today.",
        "multi_dosha": "Vata aggravation and pitta imbalance both present simultaneously.",
        "phrase_plus_token": "Burning sensation is aggravated by hot and acidic foods.",
    }


@pytest.fixture
def sample_symptom_lists():
    return {
        "joint_cluster": ["joint pain", "stiffness", "swelling"],
        "digestive_cluster": ["burning", "heaviness", "coating on tongue"],
        "mixed_cluster": ["fatigue", "redness", "burning sensation", "joint pain"],
        "empty": [],
        "unknown": ["sneezing", "cough", "runny nose"],
    }

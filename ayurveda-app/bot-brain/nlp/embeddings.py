"""NLP embeddings module for RAG.

Provides:
- encode_paragraphs(paragraph_texts, model_name)
- build_faiss_index(embeddings, persist_path=None)
"""
from typing import List, Tuple, Dict
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None

try:
    import faiss
except Exception:
    faiss = None


def encode_paragraphs(paragraph_texts: List[str], model_name: str = "all-MiniLM-L6-v2") -> List[np.ndarray]:
    """Encode paragraphs using sentence-transformers."""
    if SentenceTransformer is None:
        raise RuntimeError("sentence-transformers not installed")
    model = SentenceTransformer(model_name)
    embeddings = model.encode(paragraph_texts, show_progress_bar=False)
    embeddings = np.array(embeddings, dtype='float32')
    # L2-normalize
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    embeddings = embeddings / norms
    return embeddings


def build_faiss_index(embeddings: List[np.ndarray], persist_path: str = None) -> Tuple[object, Dict[int, int]]:
    """Build FAISS index for cosine similarity."""
    if faiss is None:
        raise RuntimeError("faiss not installed")
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)
    if persist_path:
        faiss.write_index(index, persist_path)
    id_map = {i: i for i in range(embeddings.shape[0])}
    return index, id_map

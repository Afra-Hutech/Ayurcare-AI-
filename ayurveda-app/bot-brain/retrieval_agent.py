"""Knowledge Base Retrieval Engine — FAISS + configurable reranker.

Public API (backward compatible):
    get_semantic_context(query_list, top_k) -> SemanticResult
    verify_vector_store()                   -> dict  (health-check)

SemanticResult TypedDict:
    {
        "context":    str,           # formatted passages for the LLM context window
        "sufficient": bool,          # avg_score >= RETRIEVAL_SUFFICIENCY_THRESHOLD
        "avg_score":  float,
        "min_score":  float,
        "evidence":   list[EvidenceItem]
    }

Reranking modes (RERANKER_MODE env var)
---------------------------------------
cross_encoder  — sentence-transformers CrossEncoder; best quality, ~100-300 ms overhead,
                 ~200 MB model in memory.  Falls back to bm25 if the model cannot load.
bm25           — lightweight keyword-overlap scoring; no extra model, ~5 ms overhead,
                 slightly lower quality than cross_encoder.
off            — no reranking; top-k kept by FAISS cosine score.  Fastest, lowest memory,
                 but FAISS alone may surface semantically similar but lexically unrelated chunks.

Startup verification
--------------------
verify_vector_store() is called automatically when this module is imported.
Run standalone:  python retrieval_agent.py --check
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, TypedDict

import numpy as np

_logger = logging.getLogger(__name__)

try:
    import faiss
    from sentence_transformers import SentenceTransformer
except ImportError:
    faiss = None
    SentenceTransformer = None

try:
    from sentence_transformers import CrossEncoder as _CE
    _CrossEncoder = _CE
except ImportError:
    _CrossEncoder = None

# ── env-configurable knobs ────────────────────────────────────────────────────
TOP_K_FAISS        = int(os.getenv("TOP_K_FAISS", "20"))
TOP_K_RERANK       = int(os.getenv("TOP_K_RERANK", "5"))
SUFFICIENCY_THRESH = float(os.getenv("RETRIEVAL_SUFFICIENCY_THRESHOLD", "0.25"))
CONTEXT_BUDGET     = int(os.getenv("RETRIEVAL_CONTEXT_BUDGET_CHARS", "6000"))
CE_MODEL           = os.getenv("CROSS_ENCODER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")

# RERANKER_MODE: "cross_encoder" | "bm25" | "off"
# cross_encoder  — best quality, +~200ms latency, +~200MB RAM
# bm25           — medium quality, +~5ms latency, no extra RAM
# off            — lowest quality, 0ms overhead, purely FAISS cosine scores
RERANKER_MODE = os.getenv("RERANKER_MODE", "cross_encoder").lower()

BASE_DIR         = Path(__file__).resolve().parent
VECTOR_STORE_DIR = BASE_DIR / "vector_store"
INDEX_PATH       = VECTOR_STORE_DIR / "index.faiss"
METADATA_PATH    = VECTOR_STORE_DIR / "metadata.json"


# ── TypedDicts ────────────────────────────────────────────────────────────────
class EvidenceItem(TypedDict):
    id:     str    # e.g. "sem:0:Charaka_Samhita"
    text:   str
    source: str
    score:  float
    rank:   int


class SemanticResult(TypedDict):
    context:    str
    sufficient: bool
    avg_score:  float
    min_score:  float
    evidence:   List[EvidenceItem]


# ── Startup health-check ──────────────────────────────────────────────────────

def verify_vector_store() -> Dict[str, Any]:
    """Check that the FAISS index and metadata are present and internally consistent.

    Returns a dict:
        ok            bool   — True only when all checks pass
        index_path    str
        metadata_path str
        chunk_count   int    — number of metadata entries
        vector_count  int    — number of FAISS vectors (should equal chunk_count)
        error         str | None

    Logs CRITICAL on any failure so it surfaces immediately in production logs.
    Run standalone:  python retrieval_agent.py --check
    """
    report: Dict[str, Any] = {
        "ok":            False,
        "index_path":    str(INDEX_PATH),
        "metadata_path": str(METADATA_PATH),
        "chunk_count":   0,
        "vector_count":  0,
        "error":         None,
    }

    if not INDEX_PATH.exists():
        report["error"] = f"FAISS index missing: {INDEX_PATH}"
        _logger.critical("%s — fix: python vector_db_builder.py", report["error"])
        return report

    if not METADATA_PATH.exists():
        report["error"] = f"Metadata missing: {METADATA_PATH}"
        _logger.critical("%s — fix: python vector_db_builder.py", report["error"])
        return report

    # Validate metadata
    try:
        with open(METADATA_PATH, "r", encoding="utf-8") as fh:
            metadata = json.load(fh)
        if not isinstance(metadata, list) or len(metadata) == 0:
            report["error"] = "metadata.json is empty or not a JSON list"
            _logger.critical(report["error"])
            return report
        report["chunk_count"] = len(metadata)
    except Exception as exc:
        report["error"] = f"Cannot parse metadata.json: {exc}"
        _logger.critical(report["error"])
        return report

    # Validate FAISS index
    if faiss is None:
        report["error"] = "faiss package not installed — pip install faiss-cpu"
        _logger.critical(report["error"])
        return report
    try:
        index = faiss.read_index(str(INDEX_PATH))
        report["vector_count"] = int(index.ntotal)
        if index.ntotal == 0:
            report["error"] = "FAISS index is empty (ntotal=0)"
            _logger.critical(report["error"])
            return report
        if index.ntotal != len(metadata):
            # Mismatch is a warning, not a hard failure — retrieval still works,
            # but some chunks may be unreachable or have stale metadata.
            _logger.warning(
                "Vector store mismatch: FAISS has %d vectors, metadata has %d entries. "
                "Rebuild with vector_db_builder.py to fix.",
                index.ntotal, len(metadata),
            )
    except Exception as exc:
        report["error"] = f"Cannot load FAISS index: {exc}"
        _logger.critical(report["error"])
        return report

    report["ok"] = True
    _logger.info(
        "Vector store OK: %d chunks  index=%s  metadata=%s",
        report["chunk_count"], INDEX_PATH.name, METADATA_PATH.name,
    )
    return report


# ── BM25-like fallback reranker ───────────────────────────────────────────────
_STOPWORDS = frozenset(
    "a an the and or but in on of at to is are was were be been being "
    "have has had do does did for from with by about".split()
)


def _tokenize(text: str) -> List[str]:
    return [t for t in re.findall(r"\w+", text.lower()) if t not in _STOPWORDS]


def _bm25_score(
    query_tokens: List[str],
    doc_tokens: List[str],
    k1: float = 1.5,
    b: float = 0.75,
    avg_dl: float = 80.0,
) -> float:
    tf = Counter(doc_tokens)
    dl = len(doc_tokens)
    score = 0.0
    for qt in query_tokens:
        f = tf.get(qt, 0)
        if f == 0:
            continue
        # Simplified IDF (single-doc context; corpus-level IDF unavailable here)
        idf = math.log(2.0)
        score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / max(avg_dl, 1)))
    return score


# ── VectorDBRetriever ─────────────────────────────────────────────────────────
class VectorDBRetriever:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2") -> None:
        self.index: Any = None
        self.metadata: List[Dict[str, Any]] = []
        self.model: Any = None
        self._ce: Any = None  # cross-encoder; None = uninitialised, False = unavailable

        # Run startup check first so any problem surfaces at import time.
        _vs = verify_vector_store()
        if not _vs["ok"]:
            # Already logged as CRITICAL inside verify_vector_store(); carry on degraded.
            return

        try:
            self.index = faiss.read_index(str(INDEX_PATH))
            with open(METADATA_PATH, "r", encoding="utf-8") as fh:
                self.metadata = json.load(fh)
            if SentenceTransformer:
                self.model = SentenceTransformer(model_name)
                _logger.info(
                    "VectorDBRetriever ready: %d chunks  reranker=%s",
                    len(self.metadata), RERANKER_MODE,
                )
        except Exception as exc:
            _logger.error("Error loading Vector DB: %s", exc)

    # ── cross-encoder (lazy init) ─────────────────────────────────────────────
    def _get_cross_encoder(self) -> Optional[Any]:
        if self._ce is False:
            return None  # previously failed; don't retry
        if self._ce is not None:
            return self._ce
        if _CrossEncoder is None:
            self._ce = False
            return None
        try:
            self._ce = _CrossEncoder(CE_MODEL)
            _logger.info("Cross-encoder loaded: %s", CE_MODEL)
        except Exception as exc:
            _logger.warning("Cross-encoder unavailable (%s) — using BM25 fallback", exc)
            self._ce = False
        return self._ce if self._ce else None

    # ── stage 1: FAISS candidate retrieval ────────────────────────────────────
    def _faiss_search(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        if not self.index or not self.model:
            return []
        emb = self.model.encode([query]).astype("float32")
        norms = np.linalg.norm(emb, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        emb /= norms
        distances, indices = self.index.search(emb, top_k)
        results = []
        for i, idx in enumerate(indices[0]):
            if idx < 0 or idx >= len(self.metadata):
                continue
            chunk = self.metadata[idx]
            results.append({
                "faiss_score": float(distances[0][i]),
                "text":        chunk.get("text", ""),
                "source":      chunk.get("source", "Unknown"),
            })
        return results

    # ── stage 2: rerank ───────────────────────────────────────────────────────
    def _rerank(
        self, query: str, candidates: List[Dict[str, Any]], top_k: int
    ) -> List[Dict[str, Any]]:
        if not candidates:
            return []

        if RERANKER_MODE == "off":
            # No reranking — keep top-k by FAISS cosine score directly.
            # Fastest path; quality depends entirely on the embedding model.
            ranked = sorted(candidates, key=lambda x: x["faiss_score"], reverse=True)
            for c in ranked:
                c["rerank_score"] = c["faiss_score"]
            _logger.debug("Reranking OFF — FAISS scores used directly, top_k=%d", top_k)
            return ranked[:top_k]

        if RERANKER_MODE == "bm25":
            qtoks = _tokenize(query)
            for c in candidates:
                c["rerank_score"] = _bm25_score(qtoks, _tokenize(c["text"]))
            ranked = sorted(candidates, key=lambda x: x["rerank_score"], reverse=True)
            _logger.debug("Reranked %d→%d via BM25", len(candidates), top_k)
            return ranked[:top_k]

        # cross_encoder (default) — fall back to BM25 if model unavailable.
        ce = self._get_cross_encoder()
        if ce:
            pairs  = [(query, c["text"]) for c in candidates]
            scores = ce.predict(pairs)
            for c, s in zip(candidates, scores):
                c["rerank_score"] = float(s)
            ranked = sorted(candidates, key=lambda x: x["rerank_score"], reverse=True)
            _logger.debug("Reranked %d→%d via cross-encoder", len(candidates), top_k)
        else:
            qtoks = _tokenize(query)
            for c in candidates:
                c["rerank_score"] = _bm25_score(qtoks, _tokenize(c["text"]))
            ranked = sorted(candidates, key=lambda x: x["rerank_score"], reverse=True)
            _logger.debug("Reranked %d→%d via BM25 (cross-encoder unavailable)", len(candidates), top_k)
        return ranked[:top_k]

    # ── public search ─────────────────────────────────────────────────────────
    def search(
        self,
        query: str,
        top_k_faiss: int = TOP_K_FAISS,
        top_k_rerank: int = TOP_K_RERANK,
    ) -> SemanticResult:
        candidates = self._faiss_search(query, top_k_faiss)
        reranked   = self._rerank(query, candidates, top_k_rerank)

        if not reranked:
            return SemanticResult(
                context="No relevant information found in the available book database.",
                sufficient=False,
                avg_score=0.0,
                min_score=0.0,
                evidence=[],
            )

        evidence: List[EvidenceItem] = []
        for rank, item in enumerate(reranked):
            src_slug = re.sub(r"\W+", "_", item["source"])[:30]
            evidence.append(EvidenceItem(
                id=f"sem:{rank}:{src_slug}",
                text=item["text"],
                source=item["source"],
                score=item["rerank_score"],
                rank=rank,
            ))

        scores    = [e["score"] for e in evidence]
        avg_score = sum(scores) / len(scores)
        min_score = min(scores)

        # Build context string within budget.
        # retrieval_agent owns the budget enforcement — callers must not re-slice.
        parts  = ["RELEVANT PASSAGES FROM BOOKS:"]
        budget = CONTEXT_BUDGET - len(parts[0])
        for ev in evidence:
            snippet = f"\n[{ev['id']}] Source: {ev['source']}\n{ev['text']}"
            if budget - len(snippet) < 0:
                parts.append(snippet[:max(budget, 0)])
                break
            parts.append(snippet)
            budget -= len(snippet)

        context = "\n".join(parts)

        _logger.info(
            "Retrieval: mode=%s faiss_candidates=%d reranked=%d avg_score=%.3f sufficient=%s",
            RERANKER_MODE, len(candidates), len(reranked), avg_score,
            avg_score >= SUFFICIENCY_THRESH,
        )

        return SemanticResult(
            context=context,
            sufficient=avg_score >= SUFFICIENCY_THRESH,
            avg_score=avg_score,
            min_score=min_score,
            evidence=evidence,
        )


# ── Singleton ─────────────────────────────────────────────────────────────────
retriever = VectorDBRetriever()


# ── Public API ────────────────────────────────────────────────────────────────
def get_semantic_context(query_list: List[str], top_k: int = TOP_K_RERANK) -> SemanticResult:
    """Return a SemanticResult for the combined queries (cached).

    Access result["context"] for the LLM-ready passage text.
    """
    from rag_cache import make_cache_key, retrieval_cache

    query     = " ".join(q for q in query_list if q)
    cache_key = make_cache_key(query, str(top_k))

    cached = retrieval_cache.get(cache_key)
    if cached is not None:
        _logger.debug("Retrieval cache hit (key=%.16s…)", cache_key)
        return cached

    result = retriever.search(query, top_k_rerank=top_k)
    retrieval_cache.put(cache_key, result)
    return result


# ── CLI health-check ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
    parser = argparse.ArgumentParser(description="AyurCare vector-store health check")
    parser.add_argument("--check", action="store_true", help="Verify FAISS index and metadata")
    args = parser.parse_args()

    if args.check:
        report = verify_vector_store()
        print(json.dumps(report, indent=2))
        sys.exit(0 if report["ok"] else 1)
    else:
        parser.print_help()

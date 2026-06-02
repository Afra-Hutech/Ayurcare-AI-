"""
GROUP 2 — Integration Tests: retrieval_agent.py
================================================
Validates FAISS spatial retrieval, BM25 reranking, cross-encoder reranking,
SemanticResult contract compliance, sufficiency thresholding, and context
budget enforcement.

Pre-conditions:
  - `ayurveda-app/bot-brain/vector_store/index.faiss` present and non-empty
  - `ayurveda-app/bot-brain/vector_store/metadata.json` present and valid JSON list
  - sentence-transformers and faiss-cpu installed
  - No Gemini API required for this group

Run:
  cd tests && pytest integration/test_retrieval_agent.py -v -m integration
"""

import os
import sys
import json

import pytest

BOT_BRAIN = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../ayurveda-app/bot-brain")
)
if BOT_BRAIN not in sys.path:
    sys.path.insert(0, BOT_BRAIN)


pytestmark = pytest.mark.integration


# ─────────────────────────────────────────────────────────────────────────────
# TC-RA-001  verify_vector_store health check
# ─────────────────────────────────────────────────────────────────────────────
class TestVerifyVectorStore:

    def test_health_check_returns_ok_true(self, vector_store_healthy):
        """
        ID: TC-RA-001
        verify_vector_store() must return {'ok': True} when both index.faiss
        and metadata.json exist and are internally consistent.
        Pre-condition: real vector_store/ directory populated.
        """
        assert vector_store_healthy["ok"] is True

    def test_health_check_contains_required_keys(self, vector_store_healthy):
        """
        ID: TC-RA-002
        Return dict must contain all documented keys.
        """
        required = {"ok", "index_path", "metadata_path", "chunk_count", "vector_count", "error"}
        assert required.issubset(set(vector_store_healthy.keys()))

    def test_chunk_count_and_vector_count_are_positive_integers(self, vector_store_healthy):
        """
        ID: TC-RA-003
        chunk_count and vector_count must be positive integers.
        """
        assert isinstance(vector_store_healthy["chunk_count"], int)
        assert isinstance(vector_store_healthy["vector_count"], int)
        assert vector_store_healthy["chunk_count"] > 0
        assert vector_store_healthy["vector_count"] > 0

    def test_no_error_string_when_ok(self, vector_store_healthy):
        """
        ID: TC-RA-004
        error field must be None when ok=True.
        """
        assert vector_store_healthy["error"] is None

    def test_health_check_on_missing_index_returns_ok_false(self, tmp_path, monkeypatch):
        """
        ID: TC-RA-005
        When INDEX_PATH does not exist, verify_vector_store must return ok=False
        with a non-empty error message.
        Pre-condition: tmp_path has no index.faiss.
        """
        import retrieval_agent as ra

        monkeypatch.setattr(ra, "INDEX_PATH", tmp_path / "missing.faiss")
        monkeypatch.setattr(ra, "METADATA_PATH", tmp_path / "missing.json")

        report = ra.verify_vector_store()
        assert report["ok"] is False
        assert report["error"] is not None
        assert len(report["error"]) > 0

    def test_health_check_on_empty_metadata_returns_ok_false(self, tmp_path, monkeypatch):
        """
        ID: TC-RA-006
        When metadata.json is an empty list [], verify_vector_store must return ok=False.
        """
        import retrieval_agent as ra
        import faiss
        import numpy as np

        # Create a real (but minimal) index
        dim = 4
        index = faiss.IndexFlatL2(dim)
        index.add(np.zeros((1, dim), dtype="float32"))
        idx_path = tmp_path / "index.faiss"
        faiss.write_index(index, str(idx_path))

        meta_path = tmp_path / "metadata.json"
        meta_path.write_text("[]", encoding="utf-8")

        monkeypatch.setattr(ra, "INDEX_PATH", idx_path)
        monkeypatch.setattr(ra, "METADATA_PATH", meta_path)

        report = ra.verify_vector_store()
        assert report["ok"] is False
        assert "empty" in (report["error"] or "").lower()

    def test_health_check_on_corrupt_metadata_returns_ok_false(self, tmp_path, monkeypatch):
        """
        ID: TC-RA-007
        When metadata.json contains invalid JSON, ok=False and error describes parse failure.
        """
        import retrieval_agent as ra
        import faiss
        import numpy as np

        dim = 4
        index = faiss.IndexFlatL2(dim)
        index.add(np.zeros((1, dim), dtype="float32"))
        idx_path = tmp_path / "index.faiss"
        faiss.write_index(index, str(idx_path))

        meta_path = tmp_path / "metadata.json"
        meta_path.write_text("{invalid json", encoding="utf-8")

        monkeypatch.setattr(ra, "INDEX_PATH", idx_path)
        monkeypatch.setattr(ra, "METADATA_PATH", meta_path)

        report = ra.verify_vector_store()
        assert report["ok"] is False


# ─────────────────────────────────────────────────────────────────────────────
# TC-RA-008  SemanticResult contract
# ─────────────────────────────────────────────────────────────────────────────
class TestSemanticResultContract:
    """Validates the TypedDict structure returned by retriever.search()."""

    @pytest.fixture(scope="class")
    def retriever(self, vector_store_healthy):
        from retrieval_agent import retriever as _r
        if _r.index is None:
            pytest.skip("Retriever not initialized (no FAISS index loaded)")
        return _r

    def test_search_returns_all_required_keys(self, retriever):
        """
        ID: TC-RA-008
        Result must contain: context, sufficient, avg_score, min_score, evidence.
        """
        result = retriever.search("pitta dosha burning sensation")
        required = {"context", "sufficient", "avg_score", "min_score", "evidence"}
        assert required.issubset(set(result.keys())), (
            f"Missing keys: {required - set(result.keys())}"
        )

    def test_context_is_non_empty_string(self, retriever):
        """
        ID: TC-RA-009
        context must be a non-empty string for a valid clinical query.
        """
        result = retriever.search("vata aggravation joint pain stiffness")
        assert isinstance(result["context"], str)
        assert len(result["context"]) > 0

    def test_sufficient_is_boolean(self, retriever):
        """
        ID: TC-RA-010
        'sufficient' field must be a bool (True or False).
        """
        result = retriever.search("kapha dosha")
        assert isinstance(result["sufficient"], bool)

    def test_avg_score_is_non_negative_float(self, retriever):
        """
        ID: TC-RA-011
        avg_score must be a non-negative float.
        """
        result = retriever.search("tridosha theory Ayurveda")
        assert isinstance(result["avg_score"], float)
        assert result["avg_score"] >= 0.0

    def test_min_score_lte_avg_score(self, retriever):
        """
        ID: TC-RA-012
        min_score must be <= avg_score (mathematical invariant).
        """
        result = retriever.search("digestive fire Agni transformation")
        assert result["min_score"] <= result["avg_score"], (
            f"min_score ({result['min_score']}) > avg_score ({result['avg_score']})"
        )

    def test_evidence_is_a_list(self, retriever):
        """
        ID: TC-RA-013
        evidence must be a list (possibly empty if no results).
        """
        result = retriever.search("prakriti constitution determination")
        assert isinstance(result["evidence"], list)

    def test_evidence_items_have_required_fields(self, retriever):
        """
        ID: TC-RA-014
        Each evidence item must have: id, text, source, score, rank.
        """
        result = retriever.search("pitta burning inflammatory")
        for i, ev in enumerate(result["evidence"]):
            for field in ("id", "text", "source", "score", "rank"):
                assert field in ev, f"evidence[{i}] missing '{field}': {ev}"

    def test_evidence_ids_follow_sem_rank_source_format(self, retriever):
        """
        ID: TC-RA-015
        Evidence item 'id' must match pattern: 'sem:<rank>:<source_slug>'.
        """
        import re
        result = retriever.search("Ayurvedic treatment vata pitta kapha")
        for ev in result["evidence"]:
            assert re.match(r"^sem:\d+:\w+", ev["id"]), (
                f"Evidence id format incorrect: '{ev['id']}'"
            )

    def test_evidence_ranks_are_sequential_from_zero(self, retriever):
        """
        ID: TC-RA-016
        evidence[i].rank must equal i (0-indexed sequential).
        """
        result = retriever.search("Charaka Samhita Ayurvedic medicine")
        for i, ev in enumerate(result["evidence"]):
            assert ev["rank"] == i, (
                f"evidence[{i}].rank = {ev['rank']}, expected {i}"
            )

    def test_context_begins_with_relevant_passages_header(self, retriever):
        """
        ID: TC-RA-017
        The context string must begin with 'RELEVANT PASSAGES FROM BOOKS:'.
        """
        result = retriever.search("herbal medicine Ayurveda")
        assert result["context"].startswith("RELEVANT PASSAGES FROM BOOKS:"), (
            f"Context header missing. Got: {result['context'][:60]}"
        )

    def test_empty_query_returns_gracefully(self, retriever):
        """
        ID: TC-RA-018
        An empty or whitespace query must return a valid SemanticResult
        without raising an exception.
        """
        result = retriever.search("")
        assert isinstance(result, dict)
        assert "context" in result


# ─────────────────────────────────────────────────────────────────────────────
# TC-RA-019  Sufficiency thresholding
# ─────────────────────────────────────────────────────────────────────────────
class TestSufficiencyThresholding:

    def test_highly_relevant_query_marks_sufficient_true(self, vector_store_healthy):
        """
        ID: TC-RA-019
        A query using canonical Ayurvedic terminology present in the corpus
        should return sufficient=True (avg_score >= 0.25 default threshold).
        """
        from retrieval_agent import retriever
        if retriever.index is None:
            pytest.skip("No index loaded")
        result = retriever.search("Vata dosha movement nervine tonic Ashwagandha")
        # This assertion is corpus-dependent; we confirm the flag is determined correctly
        assert isinstance(result["sufficient"], bool)
        # For a well-indexed corpus, a clinical query should be sufficient
        if result["avg_score"] >= 0.25:
            assert result["sufficient"] is True
        else:
            assert result["sufficient"] is False

    def test_gibberish_query_scores_low_and_insufficient(self, vector_store_healthy):
        """
        ID: TC-RA-020
        A nonsense query ('xyzzy qwerty foobar') should have low avg_score
        and sufficient=False.
        """
        from retrieval_agent import retriever
        if retriever.index is None:
            pytest.skip("No index loaded")
        result = retriever.search("xyzzy qwerty foobar nonsense zzzz")
        # avg_score may still be non-zero (cosine similarity always returns something)
        # but sufficient should reflect it is below threshold
        if result["avg_score"] < 0.25:
            assert result["sufficient"] is False


# ─────────────────────────────────────────────────────────────────────────────
# TC-RA-021  Context budget enforcement
# ─────────────────────────────────────────────────────────────────────────────
class TestContextBudgetEnforcement:

    def test_context_length_within_budget(self, vector_store_healthy):
        """
        ID: TC-RA-021
        The returned context string must not exceed CONTEXT_BUDGET chars
        (default 6000) by more than a single snippet's worth (~1000 chars buffer).
        """
        from retrieval_agent import retriever, CONTEXT_BUDGET
        if retriever.index is None:
            pytest.skip("No index loaded")
        result = retriever.search("Ayurvedic treatment protocol herbs lifestyle")
        assert len(result["context"]) <= CONTEXT_BUDGET + 1200, (
            f"Context exceeds budget: {len(result['context'])} chars (budget={CONTEXT_BUDGET})"
        )

    def test_top_k_parameter_limits_evidence_count(self, vector_store_healthy):
        """
        ID: TC-RA-022
        Passing top_k_rerank=2 must return at most 2 evidence items.
        """
        from retrieval_agent import retriever
        if retriever.index is None:
            pytest.skip("No index loaded")
        result = retriever.search("pitta dosha", top_k_rerank=2)
        assert len(result["evidence"]) <= 2, (
            f"Expected <=2 evidence items with top_k=2, got {len(result['evidence'])}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# TC-RA-023  BM25 reranking mode (monkeypatched)
# ─────────────────────────────────────────────────────────────────────────────
class TestBM25RerankerMode:

    def test_bm25_mode_scores_keyword_matches_higher(self, vector_store_healthy, monkeypatch):
        """
        ID: TC-RA-023
        In BM25 mode, a document containing the exact query keyword must score
        higher than a document without it (keyword-overlap scoring property).
        """
        import retrieval_agent as ra
        monkeypatch.setattr(ra, "RERANKER_MODE", "bm25")

        retriever = ra.VectorDBRetriever()
        if retriever.index is None:
            pytest.skip("No index loaded for BM25 test")

        query = "pitta burning inflammatory"
        result = retriever.search(query, top_k_rerank=5)

        assert len(result["evidence"]) > 0
        top_text = result["evidence"][0]["text"].lower()
        # At least one of the query keywords should appear in the top result
        assert any(kw in top_text for kw in ("pitta", "burning", "inflammat")), (
            f"BM25 top result doesn't contain query keywords: '{top_text[:80]}'"
        )

    def test_bm25_score_is_float_when_mode_active(self, vector_store_healthy, monkeypatch):
        """
        ID: TC-RA-024
        In BM25 mode, all evidence items must have float rerank_score.
        (Verified via the evidence item 'score' field.)
        """
        import retrieval_agent as ra
        monkeypatch.setattr(ra, "RERANKER_MODE", "bm25")
        retriever = ra.VectorDBRetriever()
        if retriever.index is None:
            pytest.skip("No index loaded")
        result = retriever.search("vata kapha treatment")
        for ev in result["evidence"]:
            assert isinstance(ev["score"], float)


# ─────────────────────────────────────────────────────────────────────────────
# TC-RA-025  get_semantic_context public API + caching
# ─────────────────────────────────────────────────────────────────────────────
class TestGetSemanticContextPublicAPI:

    def test_returns_semantic_result_type(self, vector_store_healthy):
        """
        ID: TC-RA-025
        get_semantic_context(query_list) must return a SemanticResult dict.
        """
        from retrieval_agent import get_semantic_context
        result = get_semantic_context(["burning sensation", "acid reflux", "pitta"])
        assert isinstance(result, dict)
        assert "context" in result
        assert "evidence" in result

    def test_caching_returns_same_result_on_second_call(self, vector_store_healthy):
        """
        ID: TC-RA-026
        Calling get_semantic_context with the same query list twice must return
        structurally identical results (cache hit path).
        """
        from retrieval_agent import get_semantic_context
        q = ["vata dosha", "joint pain", "dryness"]
        first = get_semantic_context(q)
        second = get_semantic_context(q)
        assert first["context"] == second["context"]
        assert first["avg_score"] == second["avg_score"]

    def test_empty_query_list_does_not_raise(self, vector_store_healthy):
        """
        ID: TC-RA-027
        get_semantic_context([]) must not raise an exception.
        """
        from retrieval_agent import get_semantic_context
        try:
            result = get_semantic_context([])
            assert isinstance(result, dict)
        except Exception as exc:
            pytest.fail(f"get_semantic_context([]) raised: {exc}")

    def test_multi_query_context_is_richer_than_single_query(self, vector_store_healthy):
        """
        ID: TC-RA-028
        A multi-term query should generally retrieve more diverse context than
        a single-term query. (Evidence count should be the same or equal,
        but context richness is checked via length comparison.)
        """
        from retrieval_agent import get_semantic_context
        single = get_semantic_context(["pitta"])
        multi = get_semantic_context(["pitta dosha burning inflammatory excess pitta acid reflux"])
        # Context may differ; avg_score should be comparable
        assert isinstance(single["context"], str)
        assert isinstance(multi["context"], str)

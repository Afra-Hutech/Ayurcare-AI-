"""RAG cache layer — in-memory LRU (default) or Redis (when REDIS_URL is set).

Both backends expose the same interface:
    .get(key)           -> Any | None
    .put(key, value)    -> None
    .clear()            -> None
    .hits / .misses     -> int  (local counters; Redis backend resets on restart)

Redis backend serialises values as JSON, so all cached objects must be
JSON-serialisable (SemanticResult TypedDicts are fine — they're plain dicts).

Environment variables
---------------------
REDIS_URL               Redis connection URL, e.g. redis://localhost:6379/0
                        If unset, in-memory LRU is used automatically.
RETRIEVAL_CACHE_TTL     TTL in seconds for retrieval results  (default: 3600)
SPECIALIST_CACHE_TTL    TTL in seconds for specialist reports (default: 1800)
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from collections import OrderedDict
from typing import Any, Optional

_logger = logging.getLogger(__name__)

_PII_STRIP = re.compile(
    r"\b\d{10,12}\b"
    r"|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"
    r"|\b\d{1,3}[,\s]?\d{3}[,\s]?\d{4}\b",
    re.IGNORECASE,
)


# ── In-memory LRU ─────────────────────────────────────────────────────────────

class LRUCache:
    """Best-effort LRU cache — GIL makes individual dict ops safe under CPython threads."""

    def __init__(self, maxsize: int = 256) -> None:
        self._cache: OrderedDict = OrderedDict()
        self.maxsize = maxsize
        self.hits = 0
        self.misses = 0

    def get(self, key: str) -> Optional[Any]:
        if key not in self._cache:
            self.misses += 1
            return None
        self._cache.move_to_end(key)
        self.hits += 1
        return self._cache[key]

    def put(self, key: str, value: Any) -> None:
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = value
        if len(self._cache) > self.maxsize:
            evicted_key, _ = self._cache.popitem(last=False)
            _logger.debug("LRUCache evicted key %.40s", evicted_key)

    def clear(self) -> None:
        self._cache.clear()
        self.hits = 0
        self.misses = 0

    def __len__(self) -> int:
        return len(self._cache)


# ── Redis backend ─────────────────────────────────────────────────────────────

class RedisCache:
    """Redis-backed cache with the same interface as LRUCache.

    Values are JSON-serialised so they survive across process restarts and are
    shared between all worker replicas — the main point of using Redis.
    """

    def __init__(self, client: Any, prefix: str, ttl: int) -> None:
        self._client = client
        self._prefix = prefix
        self._ttl = ttl  # seconds
        self.hits = 0
        self.misses = 0

    def _full_key(self, key: str) -> str:
        return f"{self._prefix}:{key}"

    def get(self, key: str) -> Optional[Any]:
        try:
            raw = self._client.get(self._full_key(key))
        except Exception as exc:
            # Redis blip — treat as a cache miss; never crash the request path.
            _logger.warning("Redis GET error: %s", exc)
            self.misses += 1
            return None
        if raw is None:
            self.misses += 1
            return None
        try:
            self.hits += 1
            return json.loads(raw)
        except json.JSONDecodeError:
            # Corrupted entry; evict it.
            self.misses += 1
            try:
                self._client.delete(self._full_key(key))
            except Exception:
                pass
            return None

    def put(self, key: str, value: Any) -> None:
        try:
            # default=str handles numpy scalars that may creep in from FAISS scores.
            self._client.setex(self._full_key(key), self._ttl, json.dumps(value, default=str))
        except Exception as exc:
            # Non-fatal: next call will just be a cache miss.
            _logger.warning("Redis SET error: %s", exc)

    def clear(self) -> None:
        """Delete all keys belonging to this prefix via SCAN (non-blocking)."""
        try:
            cursor = 0
            pattern = f"{self._prefix}:*"
            while True:
                cursor, keys = self._client.scan(cursor, match=pattern, count=200)
                if keys:
                    self._client.delete(*keys)
                if cursor == 0:
                    break
            self.hits = 0
            self.misses = 0
        except Exception as exc:
            _logger.warning("Redis CLEAR error: %s", exc)

    def __len__(self) -> int:
        try:
            count, cursor = 0, 0
            while True:
                cursor, keys = self._client.scan(cursor, match=f"{self._prefix}:*", count=200)
                count += len(keys)
                if cursor == 0:
                    break
            return count
        except Exception:
            return 0


# ── Factory ───────────────────────────────────────────────────────────────────

def _make_cache(prefix: str, maxsize: int, ttl: int) -> "LRUCache | RedisCache":
    """Return a Redis-backed cache if REDIS_URL is configured and reachable,
    otherwise return an in-memory LRU.  The caller doesn't need to know which."""
    redis_url = os.getenv("REDIS_URL", "").strip()
    if redis_url:
        try:
            import redis as _redis  # optional dependency
            client = _redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            client.ping()  # fail fast if misconfigured
            _logger.info("Cache '%s' → Redis  url=%.40s  ttl=%ds", prefix, redis_url, ttl)
            return RedisCache(client, prefix=prefix, ttl=ttl)
        except ImportError:
            _logger.warning(
                "REDIS_URL is set but the 'redis' package is not installed. "
                "Run: pip install redis   Falling back to in-memory LRU for '%s'.", prefix
            )
        except Exception as exc:
            _logger.warning(
                "Redis unreachable (%s) — falling back to in-memory LRU for '%s'.", exc, prefix
            )
    return LRUCache(maxsize=maxsize)


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_cache_key(*parts: str) -> str:
    """Stable, PII-stripped SHA-256 cache key from arbitrary string parts."""
    combined = "|".join(_PII_STRIP.sub("__PII__", p) for p in parts)
    return hashlib.sha256(combined.encode()).hexdigest()


# ── Module-level singletons ───────────────────────────────────────────────────
# Built once at import time; Redis connection is attempted then, not per-request.

_RETRIEVAL_TTL  = int(os.getenv("RETRIEVAL_CACHE_TTL",  "3600"))
_SPECIALIST_TTL = int(os.getenv("SPECIALIST_CACHE_TTL", "1800"))

retrieval_cache:  "LRUCache | RedisCache" = _make_cache("rag:retrieval",  maxsize=256, ttl=_RETRIEVAL_TTL)
specialist_cache: "LRUCache | RedisCache" = _make_cache("rag:specialist", maxsize=64,  ttl=_SPECIALIST_TTL)

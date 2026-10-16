"""Cross-process slot store: counting semaphore per provider
(`genmedia:inflight:{provider}`) and a simple mutex (the `series_tick`
lock), on Redis. Holders carry a TTL so a worker that dies without releasing
cannot starve a provider forever.

`get_store()` returns a Redis-backed store, or an in-memory one when
`CELERY_TASK_ALWAYS_EAGER` (tests) is on — never in production.
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from typing import Protocol

from app.config import get_settings


class SlotStore(Protocol):
    def acquire(self, name: str, holder: str, limit: int, ttl_s: float) -> bool: ...
    def release(self, name: str, holder: str) -> None: ...
    def count(self, name: str) -> int: ...
    def try_lock(self, name: str, ttl_s: float) -> str | None: ...
    def unlock(self, name: str, token: str) -> None: ...


def inflight_limit(provider_id: str) -> int:
    """`GENMEDIA_MAX_INFLIGHT_<PROVIDER>` overrides the default
    (`GENMEDIA_MAX_INFLIGHT_DEFAULT`, 2)."""
    raw = os.environ.get(f"GENMEDIA_MAX_INFLIGHT_{provider_id.upper()}")
    if raw and raw.strip().isdigit():
        return max(1, int(raw))
    return max(1, get_settings().genmedia_max_inflight_default)


def slot_name(provider_id: str) -> str:
    return f"genmedia:inflight:{provider_id}"


_ACQUIRE_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local holder = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
if redis.call('ZSCORE', key, holder) then
  redis.call('ZADD', key, now + ttl, holder)
  return 1
end
if redis.call('ZCARD', key) < limit then
  redis.call('ZADD', key, now + ttl, holder)
  redis.call('EXPIRE', key, math.ceil(ttl) + 60)
  return 1
end
return 0
"""

_UNLOCK_LUA = """
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
"""


class RedisSlotStore:
    def __init__(self, url: str) -> None:
        import redis

        self._r = redis.Redis.from_url(url)

    def acquire(self, name: str, holder: str, limit: int, ttl_s: float) -> bool:
        return bool(self._r.eval(_ACQUIRE_LUA, 1, name, time.time(), limit, ttl_s, holder))

    def release(self, name: str, holder: str) -> None:
        self._r.zrem(name, holder)

    def count(self, name: str) -> int:
        self._r.zremrangebyscore(name, "-inf", time.time())
        return int(self._r.zcard(name))

    def try_lock(self, name: str, ttl_s: float) -> str | None:
        token = uuid.uuid4().hex
        return token if self._r.set(f"lock:{name}", token, nx=True, ex=max(1, int(ttl_s))) else None

    def unlock(self, name: str, token: str) -> None:
        self._r.eval(_UNLOCK_LUA, 1, f"lock:{name}", token)


class MemorySlotStore:
    """Process-local stand-in with the same semantics (tests only)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._slots: dict[str, dict[str, float]] = {}
        self._locks: dict[str, tuple[str, float]] = {}

    def acquire(self, name: str, holder: str, limit: int, ttl_s: float) -> bool:
        with self._lock:
            now = time.time()
            held = {h: exp for h, exp in self._slots.get(name, {}).items() if exp > now}
            if holder in held or len(held) < limit:
                held[holder] = now + ttl_s
                self._slots[name] = held
                return True
            self._slots[name] = held
            return False

    def release(self, name: str, holder: str) -> None:
        with self._lock:
            self._slots.get(name, {}).pop(holder, None)

    def count(self, name: str) -> int:
        with self._lock:
            now = time.time()
            return len([1 for exp in self._slots.get(name, {}).values() if exp > now])

    def try_lock(self, name: str, ttl_s: float) -> str | None:
        with self._lock:
            now = time.time()
            current = self._locks.get(name)
            if current and current[1] > now:
                return None
            token = uuid.uuid4().hex
            self._locks[name] = (token, now + ttl_s)
            return token

    def unlock(self, name: str, token: str) -> None:
        with self._lock:
            current = self._locks.get(name)
            if current and current[0] == token:
                del self._locks[name]


_memory_store = MemorySlotStore()
_redis_store: RedisSlotStore | None = None


def get_store() -> SlotStore:
    global _redis_store
    settings = get_settings()
    if settings.celery_task_always_eager:
        return _memory_store
    if _redis_store is None:
        _redis_store = RedisSlotStore(settings.redis_url)
    return _redis_store


def reset_memory_store() -> None:
    """Test helper: forget every slot/lock of the in-memory store."""
    global _memory_store
    _memory_store = MemorySlotStore()

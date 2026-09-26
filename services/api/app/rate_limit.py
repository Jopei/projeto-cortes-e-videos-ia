from __future__ import annotations

import time
from collections import defaultdict


class LoginRateLimiter:
    """Simple in-memory sliding-window limiter for POST /api/auth/login.

    Keyed by caller-supplied string (IP + username in practice). Only failed
    attempts count against the limit; a successful login resets the counter.
    In-memory by design (single-process dev/small-scale deployment) — if the
    API ever runs with multiple workers/replicas, move this to Redis (already
    in the stack) instead of trusting per-process state.
    """

    def __init__(self, max_attempts: int = 5, window_seconds: int = 15 * 60) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._failures: dict[str, list[float]] = defaultdict(list)

    def _prune(self, key: str, now: float) -> None:
        cutoff = now - self.window_seconds
        self._failures[key] = [t for t in self._failures[key] if t > cutoff]

    def is_blocked(self, key: str) -> bool:
        now = time.time()
        self._prune(key, now)
        return len(self._failures[key]) >= self.max_attempts

    def register_failure(self, key: str) -> None:
        now = time.time()
        self._prune(key, now)
        self._failures[key].append(now)

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


login_rate_limiter = LoginRateLimiter()

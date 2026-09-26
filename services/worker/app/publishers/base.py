from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class PublishResult:
    post_id: str
    url: str | None = None
    raw: dict[str, Any] | None = None


class Publisher(ABC):
    """Common interface every platform publisher must implement
    (youtube.py, tiktok.py, bilibili.py, meta.py — Fase 5).

    Callers are expected to have already run the clip's Source through
    `check_publishable` in services/api/app/rights/gate.py and gotten
    `ok=True` *before* ever calling `upload`. No Publisher implementation
    should embed its own rights/licensing logic — that decision lives in
    exactly one place.
    """

    platform: str

    @abstractmethod
    def upload(self, *, file_path: str, title: str, description: str, tags: list[str]) -> PublishResult:
        """Upload a rendered clip and return the resulting post id/url."""

    @abstractmethod
    def status(self, post_id: str) -> str:
        """Return the current status of a previously published post."""

    @abstractmethod
    def delete(self, post_id: str) -> None:
        """Remove or privatize a post (used by the takedown feature)."""

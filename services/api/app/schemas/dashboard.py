from __future__ import annotations

from pydantic import BaseModel

from app.schemas.publication import PublicationRead


class DashboardAttention(BaseModel):
    clips_pending_review: int = 0
    episodes_awaiting_script_approval: int = 0
    episodes_pending_review: int = 0
    episodes_needs_attention: int = 0
    series_paused: int = 0
    publications_failed: int = 0
    jobs_failed_recent: int = 0
    total: int = 0


class DashboardSummary(BaseModel):
    uploads_total: int
    jobs_active: int
    clips_by_status: dict[str, int]
    publications_by_status: dict[str, int]
    upcoming_publications: list[PublicationRead]
    attention: DashboardAttention = DashboardAttention()

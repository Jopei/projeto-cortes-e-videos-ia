from __future__ import annotations

from pydantic import BaseModel

from app.schemas.publication import PublicationRead


class DashboardSummary(BaseModel):
    uploads_total: int
    jobs_active: int
    clips_by_status: dict[str, int]
    publications_by_status: dict[str, int]
    upcoming_publications: list[PublicationRead]

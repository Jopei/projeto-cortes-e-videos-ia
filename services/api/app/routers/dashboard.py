from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.analysis_job import AnalysisJob, AnalysisJobStatus
from app.models.clip import Clip, ClipStatus
from app.models.media_asset import MediaAsset
from app.models.publication import Publication, PublicationStatus
from app.scope import Scope, get_scope
from app.schemas.dashboard import DashboardSummary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(get_scope)])

_ACTIVE_JOB_STATUSES = (AnalysisJobStatus.QUEUED, AnalysisJobStatus.RUNNING)


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    channel_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> DashboardSummary:
    uploads_stmt = scope.owned(db.query(func.count()).select_from(MediaAsset), MediaAsset)
    jobs_stmt = scope.owned(
        db.query(func.count()).select_from(AnalysisJob).filter(AnalysisJob.status.in_(_ACTIVE_JOB_STATUSES)),
        AnalysisJob,
    )
    clips_stmt = scope.owned(db.query(Clip.status, func.count()), Clip)
    publications_stmt = scope.owned(db.query(Publication.status, func.count()), Publication)
    # Publication has no channel_id of its own — scope it via its Clip.
    publications_join = scope.owned(db.query(Publication), Publication).join(Clip, Publication.clip_id == Clip.id)

    if channel_id is not None:
        uploads_stmt = uploads_stmt.filter(MediaAsset.channel_id == channel_id)
        jobs_stmt = jobs_stmt.filter(AnalysisJob.channel_id == channel_id)
        clips_stmt = clips_stmt.filter(Clip.channel_id == channel_id)
        publications_stmt = publications_stmt.join(Clip, Publication.clip_id == Clip.id).filter(
            Clip.channel_id == channel_id
        )
        publications_join = publications_join.filter(Clip.channel_id == channel_id)

    uploads_total = uploads_stmt.scalar() or 0
    jobs_active = jobs_stmt.scalar() or 0

    clips_by_status = {status.value: 0 for status in ClipStatus}
    for status, count in clips_stmt.group_by(Clip.status).all():
        clips_by_status[status.value if hasattr(status, "value") else status] = count

    publications_by_status = {status.value: 0 for status in PublicationStatus}
    for status, count in publications_stmt.group_by(Publication.status).all():
        publications_by_status[status.value if hasattr(status, "value") else status] = count

    now = datetime.now(timezone.utc)
    upcoming = (
        publications_join.filter(Publication.status == PublicationStatus.SCHEDULED, Publication.scheduled_at >= now)
        .order_by(Publication.scheduled_at.asc())
        .limit(10)
        .all()
    )

    return DashboardSummary(
        uploads_total=uploads_total,
        jobs_active=jobs_active,
        clips_by_status=clips_by_status,
        publications_by_status=publications_by_status,
        upcoming_publications=list(upcoming),
    )

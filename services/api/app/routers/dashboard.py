from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.analysis_job import AnalysisJob, AnalysisJobStatus
from app.models.clip import Clip, ClipStatus
from app.models.media_asset import MediaAsset
from app.models.publication import Publication, PublicationStatus
from app.scope import Scope, get_scope
from app.models.story import EpisodeStatus, SeriesStatus, StoryEpisode, StorySeries
from app.schemas.dashboard import DashboardAttention, DashboardSummary

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

    attention = _attention(db, scope, channel_id, now)

    return DashboardSummary(
        uploads_total=uploads_total,
        jobs_active=jobs_active,
        clips_by_status=clips_by_status,
        publications_by_status=publications_by_status,
        upcoming_publications=list(upcoming),
        attention=attention,
    )


def _attention(db: Session, scope: Scope, channel_id: uuid.UUID | None, now: datetime) -> DashboardAttention:
    """Actionable counters (one grouped query per table), scoped by owner and channel."""
    # Cut clips only (episode clips are reviewed through their episode).
    clips_q = scope.owned(db.query(func.count()).select_from(Clip), Clip).filter(
        Clip.episode_id.is_(None), Clip.status == ClipStatus.PENDING_REVIEW
    )
    if channel_id is not None:
        clips_q = clips_q.filter(Clip.channel_id == channel_id)

    # Episodes have no channel_id of their own — scope via their series.
    ep_q = scope.owned(db.query(StoryEpisode.status, func.count()), StoryEpisode).filter(
        StoryEpisode.status.in_(
            (
                EpisodeStatus.AWAITING_SCRIPT_APPROVAL,
                EpisodeStatus.PENDING_REVIEW,
                EpisodeStatus.NEEDS_ATTENTION,
            )
        )
    )
    if channel_id is not None:
        ep_q = ep_q.join(StorySeries, StoryEpisode.series_id == StorySeries.id).filter(
            StorySeries.channel_id == channel_id
        )
    ep_counts = {
        (st.value if hasattr(st, "value") else st): n for st, n in ep_q.group_by(StoryEpisode.status).all()
    }

    series_q = scope.owned(db.query(func.count()).select_from(StorySeries), StorySeries).filter(
        StorySeries.status == SeriesStatus.PAUSED,
        or_(StorySeries.pause_reason.is_(None), StorySeries.pause_reason != "user"),
    )
    if channel_id is not None:
        series_q = series_q.filter(StorySeries.channel_id == channel_id)

    pub_q = scope.owned(db.query(func.count()).select_from(Publication), Publication).filter(
        Publication.status == PublicationStatus.FAILED
    )
    if channel_id is not None:
        pub_q = pub_q.join(Clip, Publication.clip_id == Clip.id).filter(Clip.channel_id == channel_id)

    jobs_q = scope.owned(db.query(func.count()).select_from(AnalysisJob), AnalysisJob).filter(
        AnalysisJob.status == AnalysisJobStatus.FAILED,
        AnalysisJob.created_at >= now - timedelta(hours=24),
    )
    if channel_id is not None:
        jobs_q = jobs_q.filter(AnalysisJob.channel_id == channel_id)

    result = DashboardAttention(
        clips_pending_review=clips_q.scalar() or 0,
        episodes_awaiting_script_approval=ep_counts.get(EpisodeStatus.AWAITING_SCRIPT_APPROVAL.value, 0),
        episodes_pending_review=ep_counts.get(EpisodeStatus.PENDING_REVIEW.value, 0),
        episodes_needs_attention=ep_counts.get(EpisodeStatus.NEEDS_ATTENTION.value, 0),
        series_paused=series_q.scalar() or 0,
        publications_failed=pub_q.scalar() or 0,
        jobs_failed_recent=jobs_q.scalar() or 0,
    )
    result.total = sum(v for k, v in result.model_dump().items() if k != "total")
    return result

"""Per-user quota accounting and enforcement (storage / analyses-per-day /
channel count). Admins are always exempt — callers check `user.is_admin`
before calling the `assert_*` helpers (or just don't call them).

Kept as a single module (like `app.rights.gate` for the rights gate) so the
"what counts against a quota" rules live in one place instead of being
reimplemented at each call site (tusd hook, `POST /media-assets/{id}/analyze`,
`POST /channels`, `GET /api/me/usage`, `GET /api/admin/users`).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.analysis_job import AnalysisJob
from app.models.channel import Channel
from app.models.clip import Clip
from app.models.media_asset import MediaAsset
from app.models.user import User

ANALYSIS_QUOTA_TZ = ZoneInfo("America/Sao_Paulo")


def storage_used_bytes(db: Session, owner_id: uuid.UUID) -> int:
    """Sum of `media_assets.size_bytes` + `clips.size_bytes` for `owner_id`.
    Rows with a NULL `size_bytes` (not yet known, e.g. render still running)
    count as 0 — never blocks on missing data, only on confirmed usage."""
    media_sum = (
        db.query(func.coalesce(func.sum(MediaAsset.size_bytes), 0)).filter(MediaAsset.owner_id == owner_id).scalar()
        or 0
    )
    clip_sum = (
        db.query(func.coalesce(func.sum(Clip.size_bytes), 0)).filter(Clip.owner_id == owner_id).scalar() or 0
    )
    return int(media_sum) + int(clip_sum)


def _analysis_day_bounds_utc(now: datetime | None = None) -> tuple[datetime, datetime]:
    """[start, end) of "today" in America/Sao_Paulo, expressed in UTC —
    matches the wording in CLAUDE.md ("fuso America/Sao_Paulo")."""
    now = now or datetime.now(timezone.utc)
    now_local = now.astimezone(ANALYSIS_QUOTA_TZ)
    start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def analyses_today_count(db: Session, owner_id: uuid.UUID, *, now: datetime | None = None) -> int:
    start_utc, end_utc = _analysis_day_bounds_utc(now)
    return (
        db.query(func.count())
        .select_from(AnalysisJob)
        .filter(AnalysisJob.owner_id == owner_id, AnalysisJob.created_at >= start_utc, AnalysisJob.created_at < end_utc)
        .scalar()
        or 0
    )


def channels_count(db: Session, owner_id: uuid.UUID) -> int:
    return db.query(func.count()).select_from(Channel).filter(Channel.owner_id == owner_id).scalar() or 0


def assert_storage_quota(db: Session, user: User, owner_id: uuid.UUID, additional_bytes: int) -> None:
    """Raise HTTP 413 if `additional_bytes` more usage would exceed
    `user.storage_quota_bytes`. No-op for admins or an unlimited (`None`)
    quota, or when `additional_bytes` isn't known yet (0/None)."""
    if user.is_admin or user.storage_quota_bytes is None or not additional_bytes:
        return
    used = storage_used_bytes(db, owner_id)
    if used + additional_bytes > user.storage_quota_bytes:
        raise HTTPException(
            status_code=413,
            detail=(
                "Cota de armazenamento excedida: "
                f"{used + additional_bytes} bytes excederiam o limite de {user.storage_quota_bytes} bytes."
            ),
        )


def assert_analysis_quota(db: Session, user: User, owner_id: uuid.UUID) -> None:
    """Raise HTTP 429 if the owner already reached `daily_analysis_quota`
    analyses today (America/Sao_Paulo). No-op for admins or an unlimited
    quota."""
    if user.is_admin or user.daily_analysis_quota is None:
        return
    used = analyses_today_count(db, owner_id)
    if used >= user.daily_analysis_quota:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Cota diária de análises excedida: {used}/{user.daily_analysis_quota} "
                "análises já criadas hoje. Tente novamente amanhã."
            ),
        )


def assert_channel_quota(db: Session, user: User, owner_id: uuid.UUID) -> None:
    """Raise HTTP 409 if creating one more channel would exceed
    `max_channels`. No-op for admins or an unlimited quota."""
    if user.is_admin or user.max_channels is None:
        return
    used = channels_count(db, owner_id)
    if used >= user.max_channels:
        raise HTTPException(
            status_code=409,
            detail=f"Limite de canais atingido: {used}/{user.max_channels} canais já criados.",
        )

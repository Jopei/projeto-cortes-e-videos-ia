"""Admin-only user management (`is_admin=True` required for every endpoint
here — see `app.scope.require_admin`). Regular users manage their own
password/usage via `app/routers/auth.py::change_password` and
`app/routers/me.py::my_usage`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import record_action
from app.config import get_settings
from app.db import get_db
from app.models.analysis_job import AnalysisJob
from app.models.audit_log import AuditLog
from app.models.channel import Channel
from app.models.clip import Clip
from app.models.media_asset import MediaAsset
from app.models.platform_account import PlatformAccount
from app.models.publication import Publication
from app.models.source import Source
from app.models.user import User
from app.quotas import (
    active_series_count,
    ai_spend_month,
    analyses_today_count,
    channels_count,
    storage_used_bytes,
)
from app.scope import require_admin
from app.schemas.user import (
    AdminResetPasswordRequest,
    AdminUserCreate,
    AdminUserRead,
    AdminUserUpdate,
    UsageRead,
    UserRead,
    gb_to_bytes,
)
from app.security import hash_password

router = APIRouter(prefix="/api/admin/users", tags=["admin"], dependencies=[Depends(require_admin)])

_OWNED_MODELS = (Source, MediaAsset, Channel, AnalysisJob, Clip, PlatformAccount, Publication)


def _admin_user_read(db: Session, user: User) -> AdminUserRead:
    usage = UsageRead(
        storage_used_bytes=storage_used_bytes(db, user.id),
        storage_quota_bytes=user.storage_quota_bytes,
        analyses_today=analyses_today_count(db, user.id),
        daily_analysis_quota=user.daily_analysis_quota,
        channels_count=channels_count(db, user.id),
        max_channels=user.max_channels,
        active_series=active_series_count(db, user.id),
        max_active_series=user.max_active_series,
        ai_spend_month_usd=float(ai_spend_month(db, user.id)),
        monthly_ai_budget_usd=float(user.monthly_ai_budget_usd) if user.monthly_ai_budget_usd is not None else None,
    )
    clips_count = db.query(func.count()).select_from(Clip).filter(Clip.owner_id == user.id).scalar() or 0
    publications_count = (
        db.query(func.count()).select_from(Publication).filter(Publication.owner_id == user.id).scalar() or 0
    )
    return AdminUserRead(
        **UserRead.model_validate(user).model_dump(),
        usage=usage,
        clips_count=clips_count,
        publications_count=publications_count,
    )


def _count_active_admins(db: Session, *, exclude_id: uuid.UUID | None = None) -> int:
    stmt = db.query(func.count()).select_from(User).filter(User.is_admin.is_(True), User.is_active.is_(True))
    if exclude_id is not None:
        stmt = stmt.filter(User.id != exclude_id)
    return stmt.scalar() or 0


def _has_any_data(db: Session, user_id: uuid.UUID) -> bool:
    for model in _OWNED_MODELS:
        if db.query(model.id).filter(model.owner_id == user_id).first() is not None:
            return True
    if db.query(AuditLog.id).filter(AuditLog.user_id == user_id).first() is not None:
        return True
    return False


@router.get("", response_model=list[AdminUserRead])
def list_users(db: Session = Depends(get_db)) -> list[AdminUserRead]:
    users = db.query(User).order_by(User.created_at.asc()).all()
    return [_admin_user_read(db, user) for user in users]


@router.post("", response_model=AdminUserRead, status_code=201)
def create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminUserRead:
    if db.query(User).filter(User.username == payload.username).one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Username already exists")
    if payload.email and db.query(User).filter(User.email == payload.email).one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email already in use")

    settings = get_settings()
    fields_set = payload.model_fields_set
    storage_quota_bytes = (
        gb_to_bytes(payload.storage_quota_gb)
        if "storage_quota_gb" in fields_set
        else gb_to_bytes(settings.default_storage_quota_gb)
    )
    daily_analysis_quota = (
        payload.daily_analysis_quota if "daily_analysis_quota" in fields_set else settings.default_daily_analysis_quota
    )
    max_channels = payload.max_channels if "max_channels" in fields_set else settings.default_max_channels
    max_active_series = (
        payload.max_active_series if "max_active_series" in fields_set else settings.default_max_active_series
    )
    monthly_ai_budget_usd = (
        payload.monthly_ai_budget_usd
        if "monthly_ai_budget_usd" in fields_set
        else settings.default_monthly_ai_budget_usd
    )

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        email=payload.email,
        is_admin=payload.is_admin,
        is_active=True,
        must_change_password=payload.must_change_password,
        storage_quota_bytes=storage_quota_bytes,
        daily_analysis_quota=daily_analysis_quota,
        max_channels=max_channels,
        max_active_series=max_active_series,
        monthly_ai_budget_usd=monthly_ai_budget_usd,
    )
    db.add(user)
    db.flush()
    record_action(
        db,
        user_id=admin.id,
        action="user.create",
        entity="user",
        entity_id=user.id,
        details={"username": user.username, "is_admin": user.is_admin},
    )
    db.commit()
    db.refresh(user)
    return _admin_user_read(db, user)


@router.patch("/{user_id}", response_model=AdminUserRead)
def update_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminUserRead:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    updates = payload.model_dump(exclude_unset=True)

    demoting_or_deactivating = ("is_admin" in updates and updates["is_admin"] is False) or (
        "is_active" in updates and updates["is_active"] is False
    )
    # Any change to admin privilege (either direction) or a deactivation
    # revokes every existing session for the target user (see
    # `app/models/user.py::session_version`) — reactivating an already-active
    # user or leaving is_admin unchanged doesn't need it.
    revoke_sessions = ("is_admin" in updates and updates["is_admin"] != target.is_admin) or (
        "is_active" in updates and updates["is_active"] is False
    )
    if demoting_or_deactivating and target.id == admin.id:
        raise HTTPException(status_code=409, detail="Cannot remove your own admin rights or deactivate yourself")

    if target.is_admin and target.is_active and demoting_or_deactivating:
        if _count_active_admins(db, exclude_id=target.id) == 0:
            raise HTTPException(status_code=409, detail="Cannot leave the system without any active admin")

    if "email" in updates and updates["email"]:
        existing = db.query(User).filter(User.email == updates["email"], User.id != target.id).one_or_none()
        if existing is not None:
            raise HTTPException(status_code=409, detail="Email already in use")

    if "storage_quota_gb" in updates:
        target.storage_quota_bytes = gb_to_bytes(updates.pop("storage_quota_gb"))
    for field in ("display_name", "email", "is_admin", "is_active", "daily_analysis_quota", "max_channels", "max_active_series", "monthly_ai_budget_usd"):
        if field in updates:
            setattr(target, field, updates[field])

    if revoke_sessions:
        target.session_version += 1

    record_action(
        db,
        user_id=admin.id,
        action="user.update",
        entity="user",
        entity_id=target.id,
        details=payload.model_dump(exclude_unset=True, mode="json"),
    )
    db.commit()
    db.refresh(target)
    return _admin_user_read(db, target)


@router.post("/{user_id}/reset-password")
def reset_password(
    user_id: uuid.UUID,
    payload: AdminResetPasswordRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict[str, bool]:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    target.password_hash = hash_password(payload.new_password)
    target.must_change_password = True
    # Revoke every session issued to the target before this point — an admin
    # reset means the old password (and any cookie signed while it was
    # active) should stop working immediately.
    target.session_version += 1
    record_action(
        db,
        user_id=admin.id,
        action="user.reset_password",
        entity="user",
        entity_id=target.id,
        details=None,
    )
    db.commit()
    return {"ok": True}


@router.delete("/{user_id}", status_code=204, response_class=Response)
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Response:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=409, detail="Cannot delete your own admin account")

    if _has_any_data(db, target.id):
        if target.is_admin and target.is_active and _count_active_admins(db, exclude_id=target.id) == 0:
            raise HTTPException(status_code=409, detail="Cannot leave the system without any active admin")
        target.is_active = False
        target.session_version += 1
        record_action(
            db,
            user_id=admin.id,
            action="user.deactivate",
            entity="user",
            entity_id=target.id,
            details={"reason": "has_data"},
        )
        db.commit()
        return Response(status_code=204)

    record_action(db, user_id=admin.id, action="user.delete", entity="user", entity_id=target.id, details=None)
    db.commit()
    db.delete(target)
    db.commit()
    return Response(status_code=204)

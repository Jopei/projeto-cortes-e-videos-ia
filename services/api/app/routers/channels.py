from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import record_action
from app.db import get_db
from app.models.channel import Channel
from app.models.clip import Clip, ClipStatus
from app.models.enums import Platform
from app.models.platform_account import PlatformAccount
from app.models.publication import Publication, PublicationStatus
from app.quotas import assert_channel_quota
from app.scope import Scope, get_owned_or_404, get_scope
from app.schemas.channel import (
    ChannelCounts,
    ChannelCreate,
    ChannelRead,
    ChannelUpdate,
    ChannelWithCounts,
)

router = APIRouter(prefix="/api/channels", tags=["channels"], dependencies=[Depends(get_scope)])


def _dump_json_field(value) -> dict | None:
    """`AnalysisParams`/`TemplateParams` -> plain dict for JSON columns, `None`
    passthrough (both are optional on every channel schema)."""
    return value.model_dump(mode="json", exclude_none=True) if value is not None else None


def _counts_for(db: Session, channel_id: uuid.UUID) -> ChannelCounts:
    accounts_by_platform = {platform.value: 0 for platform in Platform}
    for platform, count in (
        db.query(PlatformAccount.platform, func.count())
        .filter(PlatformAccount.channel_id == channel_id)
        .group_by(PlatformAccount.platform)
        .all()
    ):
        accounts_by_platform[platform.value if hasattr(platform, "value") else platform] = count

    clips_pending_review = (
        db.query(func.count())
        .select_from(Clip)
        .filter(Clip.channel_id == channel_id, Clip.status == ClipStatus.PENDING_REVIEW)
        .scalar()
        or 0
    )
    publications_scheduled = (
        db.query(func.count())
        .select_from(Publication)
        .join(Clip, Publication.clip_id == Clip.id)
        .filter(Clip.channel_id == channel_id, Publication.status == PublicationStatus.SCHEDULED)
        .scalar()
        or 0
    )
    publications_published = (
        db.query(func.count())
        .select_from(Publication)
        .join(Clip, Publication.clip_id == Clip.id)
        .filter(Clip.channel_id == channel_id, Publication.status == PublicationStatus.PUBLISHED)
        .scalar()
        or 0
    )
    return ChannelCounts(
        accounts_by_platform=accounts_by_platform,
        clips_pending_review=clips_pending_review,
        publications_scheduled=publications_scheduled,
        publications_published=publications_published,
    )


def _with_counts(db: Session, channel: Channel) -> ChannelWithCounts:
    return ChannelWithCounts(
        **ChannelRead.model_validate(channel).model_dump(),
        counts=_counts_for(db, channel.id),
    )


@router.get("", response_model=list[ChannelWithCounts])
def list_channels(db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> list[ChannelWithCounts]:
    channels = scope.owned(db.query(Channel), Channel).order_by(Channel.created_at.desc()).all()
    return [_with_counts(db, channel) for channel in channels]


@router.post("", response_model=ChannelWithCounts, status_code=201)
def create_channel(
    payload: ChannelCreate,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> ChannelWithCounts:
    owner_id = scope.create_owner_id
    if not scope.actor.is_admin:
        assert_channel_quota(db, scope.actor, owner_id)

    if (
        db.query(Channel)
        .filter(Channel.owner_id == owner_id, Channel.slug == payload.slug)
        .one_or_none()
        is not None
    ):
        raise HTTPException(status_code=409, detail="A channel with this slug already exists")

    channel = Channel(
        owner_id=owner_id,
        name=payload.name,
        slug=payload.slug,
        niche=payload.niche,
        color=payload.color,
        default_preset=payload.default_preset,
        default_params=_dump_json_field(payload.default_params),
        template=_dump_json_field(payload.template),
        is_active=payload.is_active,
    )
    db.add(channel)
    db.flush()
    record_action(
        db,
        user_id=scope.actor.id,
        action="channel.create",
        entity="channel",
        entity_id=channel.id,
        details=scope.audit_details({"name": channel.name, "slug": channel.slug}),
    )
    db.commit()
    db.refresh(channel)
    return _with_counts(db, channel)


@router.get("/{channel_id}", response_model=ChannelWithCounts)
def get_channel(
    channel_id: uuid.UUID, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)
) -> ChannelWithCounts:
    channel = get_owned_or_404(db, Channel, channel_id, scope)
    return _with_counts(db, channel)


@router.patch("/{channel_id}", response_model=ChannelWithCounts)
def update_channel(
    channel_id: uuid.UUID,
    payload: ChannelUpdate,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> ChannelWithCounts:
    channel = get_owned_or_404(db, Channel, channel_id, scope)
    updates = payload.model_dump(exclude_unset=True)

    if "slug" in updates and updates["slug"] != channel.slug:
        if (
            db.query(Channel)
            .filter(Channel.owner_id == channel.owner_id, Channel.slug == updates["slug"], Channel.id != channel_id)
            .one_or_none()
        ):
            raise HTTPException(status_code=409, detail="A channel with this slug already exists")

    for field in ("name", "slug", "niche", "color", "default_preset", "is_active"):
        if field in updates:
            setattr(channel, field, updates[field])
    if "default_params" in updates:
        channel.default_params = _dump_json_field(payload.default_params)
    if "template" in updates:
        channel.template = _dump_json_field(payload.template)

    record_action(
        db,
        user_id=scope.actor.id,
        action="channel.update",
        entity="channel",
        entity_id=channel.id,
        details=scope.audit_details(updates),
    )
    db.commit()
    db.refresh(channel)
    return _with_counts(db, channel)


@router.delete("/{channel_id}", status_code=204, response_class=Response)
def delete_channel(
    channel_id: uuid.UUID,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> Response:
    channel = get_owned_or_404(db, Channel, channel_id, scope)

    has_scheduled = (
        db.query(func.count())
        .select_from(Publication)
        .join(Clip, Publication.clip_id == Clip.id)
        .filter(Clip.channel_id == channel_id, Publication.status == PublicationStatus.SCHEDULED)
        .scalar()
        or 0
    )
    if has_scheduled:
        raise HTTPException(
            status_code=409,
            detail="Channel has scheduled publications; cancel them before deleting the channel",
        )

    record_action(
        db,
        user_id=scope.actor.id,
        action="channel.delete",
        entity="channel",
        entity_id=channel.id,
        details=scope.audit_details({"name": channel.name, "slug": channel.slug}),
    )
    db.delete(channel)
    db.commit()
    return Response(status_code=204)

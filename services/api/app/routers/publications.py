from __future__ import annotations

import io
import uuid
import zipfile
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.audit import record_action
from app.config import get_settings
from app.db import get_db
from app.models.clip import Clip, ClipStatus
from app.models.clip_metadata import ClipMetadata
from app.models.media_asset import MediaAsset
from app.models.platform_account import AccountMode, PlatformAccount
from app.models.publication import Publication, PublicationStatus
from app.models.source import Source
from app.rights.attribution import build_description
from app.rights.gate import check_publishable
from app.scheduling import NoSlotAvailableError, find_next_slot
from app.scope import Scope, get_owned_or_404, get_scope
from app.schemas.publication import PublicationBatchRequest, PublicationBatchResult, PublicationRead
from app.storage import S3Client, get_s3_client
from app.worker.tasks import takedown_publication as takedown_publication_task

router = APIRouter(prefix="/api/publications", tags=["publications"], dependencies=[Depends(get_scope)])


def _resolve_source(db: Session, clip: Clip) -> Source | None:
    media_asset = db.get(MediaAsset, clip.media_asset_id)
    if media_asset is None:
        return None
    return db.get(Source, media_asset.source_id)


@router.post("/batch", response_model=PublicationBatchResult, status_code=201)
def create_publications_batch(
    payload: PublicationBatchRequest,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> PublicationBatchResult:
    # A batch always resolves to ONE owner (see Scope.create_owner_id) —
    # every clip/account it touches must belong to that same owner. This is
    # what makes "publish user A's clip to user B's account" impossible even
    # for an admin acting without `as_user` (their own id is then the owner).
    owner_id = scope.create_owner_id

    clips = {
        c.id: c
        for c in db.query(Clip).filter(Clip.id.in_(payload.clip_ids), Clip.owner_id == owner_id).all()
    }
    missing_clips = [str(i) for i in payload.clip_ids if i not in clips]
    if missing_clips:
        raise HTTPException(status_code=404, detail=f"Clip(s) not found: {', '.join(missing_clips)}")

    # `pairs` is the flattened (clip, account) work list for both modes — see
    # PublicationBatchRequest docstring for what target="accounts"/"channel" mean.
    pairs: list[tuple[Clip, PlatformAccount]] = []
    if payload.target == "channel":
        missing_channel = [str(cid) for cid, clip in clips.items() if clip.channel_id is None]
        if missing_channel:
            raise HTTPException(
                status_code=422,
                detail=f"Clip(s) without a channel_id, cannot use target=\"channel\": {', '.join(missing_channel)}",
            )
        channel_ids = {clip.channel_id for clip in clips.values()}
        accounts_by_channel = {
            cid: db.query(PlatformAccount)
            .filter(PlatformAccount.channel_id == cid, PlatformAccount.owner_id == owner_id)
            .all()
            for cid in channel_ids
        }
        for clip_id in payload.clip_ids:
            clip = clips[clip_id]
            for account in accounts_by_channel[clip.channel_id]:
                pairs.append((clip, account))
    else:
        accounts = {
            a.id: a
            for a in db.query(PlatformAccount)
            .filter(PlatformAccount.id.in_(payload.account_ids), PlatformAccount.owner_id == owner_id)
            .all()
        }
        missing_accounts = [str(i) for i in payload.account_ids if i not in accounts]
        if missing_accounts:
            raise HTTPException(status_code=404, detail=f"Account(s) not found: {', '.join(missing_accounts)}")
        for clip_id in payload.clip_ids:
            clip = clips[clip_id]
            for account_id in payload.account_ids:
                pairs.append((clip, accounts[account_id]))

    now = datetime.now(timezone.utc)
    explicit_schedule: datetime | None = None
    if payload.schedule not in ("auto", "now"):
        explicit_schedule = datetime.fromisoformat(payload.schedule)
        if explicit_schedule.tzinfo is None:
            explicit_schedule = explicit_schedule.replace(tzinfo=timezone.utc)

    extra_counts_by_account: dict[uuid.UUID, dict[date, int]] = {}
    created: list[Publication] = []

    sources_by_clip: dict[uuid.UUID, object] = {}
    for clip_id, clip in clips.items():
        sources_by_clip[clip_id] = _resolve_source(db, clip)

    for clip, account in pairs:
        source = sources_by_clip[clip.id]
        publication = Publication(owner_id=owner_id, clip_id=clip.id, account_id=account.id, platform=account.platform)

        if clip.status != ClipStatus.APPROVED:
            publication.status = PublicationStatus.BLOCKED
            publication.block_reasons = ["clip_not_approved"]
        else:
            ok, reasons = check_publishable(source, account.platform.value, now, monetized=account.monetized)
            if not ok:
                publication.status = PublicationStatus.BLOCKED
                publication.block_reasons = reasons
            elif account.mode == AccountMode.MANUAL:
                publication.status = PublicationStatus.EXPORTED
                publication.privacy = payload.privacy
            else:
                publication.privacy = payload.privacy
                if payload.schedule == "now":
                    publication.status = PublicationStatus.SCHEDULED
                    publication.scheduled_at = now
                elif explicit_schedule is not None:
                    publication.status = PublicationStatus.SCHEDULED
                    publication.scheduled_at = explicit_schedule
                else:
                    extra_counts = extra_counts_by_account.setdefault(account.id, {})
                    try:
                        slot = find_next_slot(
                            db,
                            account_id=account.id,
                            posting_windows=account.posting_windows,
                            daily_limit=account.daily_limit,
                            timezone_name=account.timezone,
                            after=now,
                            extra_counts=extra_counts,
                        )
                    except NoSlotAvailableError as exc:
                        publication.status = PublicationStatus.FAILED
                        publication.error = str(exc)
                    else:
                        publication.status = PublicationStatus.SCHEDULED
                        publication.scheduled_at = slot

        db.add(publication)
        db.flush()
        record_action(
            db,
            user_id=scope.actor.id,
            action="publication.create",
            entity="publication",
            entity_id=publication.id,
            details=scope.audit_details(
                {
                    "clip_id": str(clip.id),
                    "account_id": str(account.id),
                    "status": publication.status.value,
                    "block_reasons": publication.block_reasons,
                }
            ),
        )
        created.append(publication)

    db.commit()
    for publication in created:
        db.refresh(publication)
    return PublicationBatchResult(created=created)


@router.get("", response_model=list[PublicationRead])
def list_publications(
    status: PublicationStatus | None = Query(default=None),
    clip_id: uuid.UUID | None = Query(default=None),
    account_id: uuid.UUID | None = Query(default=None),
    channel_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> list[Publication]:
    stmt = scope.owned(db.query(Publication), Publication)
    if channel_id is not None:
        # Publication has no channel_id of its own — scope it via its Clip.
        stmt = stmt.join(Clip, Publication.clip_id == Clip.id).filter(Clip.channel_id == channel_id)
    if status is not None:
        stmt = stmt.filter(Publication.status == status)
    if clip_id is not None:
        stmt = stmt.filter(Publication.clip_id == clip_id)
    if account_id is not None:
        stmt = stmt.filter(Publication.account_id == account_id)
    return list(stmt.order_by(Publication.created_at.desc()).all())


@router.post("/{publication_id}/cancel", response_model=PublicationRead)
def cancel_publication(
    publication_id: uuid.UUID,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> Publication:
    publication = get_owned_or_404(db, Publication, publication_id, scope)
    if publication.status not in (PublicationStatus.SCHEDULED, PublicationStatus.BLOCKED, PublicationStatus.FAILED):
        raise HTTPException(status_code=409, detail=f"Cannot cancel a publication in status {publication.status.value}")
    publication.status = PublicationStatus.CANCELED
    record_action(
        db,
        user_id=scope.actor.id,
        action="publication.cancel",
        entity="publication",
        entity_id=publication.id,
        details=scope.audit_details(),
    )
    db.commit()
    db.refresh(publication)
    return publication


@router.post("/{publication_id}/takedown", response_model=PublicationRead)
def takedown_publication(
    publication_id: uuid.UUID,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> Publication:
    publication = get_owned_or_404(db, Publication, publication_id, scope)
    if publication.status != PublicationStatus.PUBLISHED:
        raise HTTPException(status_code=409, detail="Only a published Publication can be taken down")
    record_action(
        db,
        user_id=scope.actor.id,
        action="publication.takedown",
        entity="publication",
        entity_id=publication.id,
        details=scope.audit_details(),
    )
    db.commit()
    takedown_publication_task.delay(str(publication.id))
    db.refresh(publication)
    return publication


@router.get("/{publication_id}/export")
def export_publication(
    publication_id: uuid.UUID,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    s3: S3Client = Depends(get_s3_client),
) -> StreamingResponse:
    """Zip package (video.mp4 + metadata.txt) for manual-account publications
    (or any publication someone wants a local copy of)."""
    publication = get_owned_or_404(db, Publication, publication_id, scope)
    clip = db.get(Clip, publication.clip_id)
    if clip is None or not clip.storage_key:
        raise HTTPException(status_code=409, detail="Clip video is not available")

    metadata = (
        db.query(ClipMetadata)
        .filter(ClipMetadata.clip_id == clip.id, ClipMetadata.platform == publication.platform.value)
        .one_or_none()
    )
    source = _resolve_source(db, clip)
    description = build_description(
        metadata.description if metadata else None,
        source.attribution_text if source else None,
    )
    title = metadata.title if metadata else ""
    hashtags = " ".join(metadata.hashtags) if metadata and metadata.hashtags else ""

    # Buffers the whole object (unlike stream_s3_object) since it needs to go inside the zip.
    video_obj = s3.get_object(Bucket=get_settings().s3_bucket, Key=clip.storage_key)
    video_bytes = video_obj["Body"].read()

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("video.mp4", video_bytes)
        zf.writestr(
            "metadata.txt",
            f"Title: {title}\n\nDescription:\n{description}\n\nHashtags: {hashtags}\n",
        )
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="publication-{publication.id}.zip"'},
    )

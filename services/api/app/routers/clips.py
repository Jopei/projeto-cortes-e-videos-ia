from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.audit import record_action
from app.db import get_db
from app.deps import get_current_user
from app.models.clip import Clip, ClipStatus
from app.models.clip_metadata import ClipMetadata
from app.models.enums import Platform
from app.models.user import User
from app.schemas.clip import ClipBulkAction, ClipDetailRead, ClipRead, ClipUpdate
from app.schemas.clip_metadata import ClipMetadataRead, ClipMetadataUpdate
from app.storage import S3Client, get_s3_client, stream_s3_object
from app.worker.tasks import regenerate_metadata as regenerate_metadata_task
from app.worker.tasks import render_clip

router = APIRouter(prefix="/api/clips", tags=["clips"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[ClipRead])
def list_clips(
    status: ClipStatus | None = Query(default=None),
    job_id: uuid.UUID | None = Query(default=None),
    media_asset_id: uuid.UUID | None = Query(default=None),
    channel_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[Clip]:
    stmt = db.query(Clip)
    if status is not None:
        stmt = stmt.filter(Clip.status == status)
    if job_id is not None:
        stmt = stmt.filter(Clip.job_id == job_id)
    if media_asset_id is not None:
        stmt = stmt.filter(Clip.media_asset_id == media_asset_id)
    if channel_id is not None:
        stmt = stmt.filter(Clip.channel_id == channel_id)
    return list(stmt.order_by(Clip.created_at.desc()).offset(offset).limit(limit).all())


def _get_clip_or_404(db: Session, clip_id: uuid.UUID) -> Clip:
    clip = db.get(Clip, clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail="Clip not found")
    return clip


@router.get("/{clip_id}", response_model=ClipDetailRead)
def get_clip(clip_id: uuid.UUID, db: Session = Depends(get_db)) -> Clip:
    return _get_clip_or_404(db, clip_id)


@router.patch("/{clip_id}", response_model=ClipRead)
def update_clip(
    clip_id: uuid.UUID,
    payload: ClipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Clip:
    clip = _get_clip_or_404(db, clip_id)

    if payload.status is not None:
        clip.status = ClipStatus(payload.status)
        record_action(
            db,
            user_id=current_user.id,
            action=f"clip.{payload.status}",
            entity="clip",
            entity_id=clip.id,
            details=None,
        )

    trimmed = payload.start_s is not None or payload.end_s is not None
    if trimmed:
        if payload.start_s is not None:
            clip.start_s = payload.start_s
        if payload.end_s is not None:
            clip.end_s = payload.end_s
        if clip.start_s >= clip.end_s:
            raise HTTPException(status_code=422, detail="start_s must be less than end_s")
        clip.status = ClipStatus.RENDERING
        record_action(
            db,
            user_id=current_user.id,
            action="clip.trim",
            entity="clip",
            entity_id=clip.id,
            details={"start_s": clip.start_s, "end_s": clip.end_s},
        )

    db.commit()
    db.refresh(clip)

    if trimmed:
        render_clip.delay(str(clip.id))

    return clip


@router.post("/bulk", response_model=list[ClipRead])
def bulk_update_clips(
    payload: ClipBulkAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Clip]:
    new_status = ClipStatus.APPROVED if payload.action == "approve" else ClipStatus.REJECTED
    clips = db.query(Clip).filter(Clip.id.in_(payload.ids)).all()
    found_ids = {c.id for c in clips}
    missing = [str(i) for i in payload.ids if i not in found_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"Clip(s) not found: {', '.join(missing)}")

    for clip in clips:
        clip.status = new_status
        record_action(
            db,
            user_id=current_user.id,
            action=f"clip.{payload.action}",
            entity="clip",
            entity_id=clip.id,
            details={"bulk": True},
        )
    db.commit()
    for clip in clips:
        db.refresh(clip)
    return clips


@router.put("/{clip_id}/metadata/{platform}", response_model=ClipMetadataRead)
def upsert_clip_metadata(
    clip_id: uuid.UUID,
    platform: Platform,
    payload: ClipMetadataUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ClipMetadata:
    _get_clip_or_404(db, clip_id)
    entry = (
        db.query(ClipMetadata)
        .filter(ClipMetadata.clip_id == clip_id, ClipMetadata.platform == platform.value)
        .one_or_none()
    )
    if entry is None:
        entry = ClipMetadata(clip_id=clip_id, platform=platform.value, hashtags=[])
        db.add(entry)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    entry.edited = True

    record_action(
        db,
        user_id=current_user.id,
        action="clip_metadata.edit",
        entity="clip_metadata",
        entity_id=clip_id,
        details={"platform": platform.value},
    )
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/{clip_id}/metadata/regenerate")
def regenerate_clip_metadata(
    clip_id: uuid.UUID,
    platform: Platform | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    clip = _get_clip_or_404(db, clip_id)
    record_action(
        db,
        user_id=current_user.id,
        action="clip_metadata.regenerate",
        entity="clip",
        entity_id=clip.id,
        details={"platform": platform.value if platform else "all"},
    )
    db.commit()
    task = regenerate_metadata_task.delay(str(clip_id), platform.value if platform else None)
    return {"task_id": task.id, "status": "queued"}


@router.get("/{clip_id}/video")
def stream_clip_video(
    clip_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    s3: S3Client = Depends(get_s3_client),
) -> StreamingResponse:
    clip = _get_clip_or_404(db, clip_id)
    if not clip.storage_key:
        raise HTTPException(status_code=409, detail="Clip has not finished rendering yet")
    return stream_s3_object(request, s3, clip.storage_key, "video/mp4")


@router.get("/{clip_id}/thumbnail")
def stream_clip_thumbnail(
    clip_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    s3: S3Client = Depends(get_s3_client),
) -> StreamingResponse:
    clip = _get_clip_or_404(db, clip_id)
    if not clip.thumbnail_key:
        raise HTTPException(status_code=409, detail="Clip has no thumbnail yet")
    return stream_s3_object(request, s3, clip.thumbnail_key, "image/jpeg")

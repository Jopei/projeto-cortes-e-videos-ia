from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.audit import record_action
from app.db import get_db
from app.models.clip import Clip, ClipStatus
from app.models.clip_metadata import ClipMetadata
from app.models.enums import Platform
from app.models.story import StoryEpisode, StorySeries
from app.scope import Scope, get_owned_or_404, get_scope
from app.schemas.clip import ClipBulkAction, ClipDetailRead, ClipRead, ClipUpdate
from app.schemas.clip_metadata import ClipMetadataRead, ClipMetadataUpdate
from app.storage import S3Client, get_s3_client, stream_s3_object
from app.story import lifecycle
from app.worker.tasks import regenerate_metadata as regenerate_metadata_task
from app.worker.tasks import render_clip

def _enrich(db: Session, clips: list[Clip]) -> list[Clip]:
    """Attach transient `series_id`/`episode_number` (read by `ClipRead`
    via from_attributes) to Series IA episode clips."""
    episode_ids = [c.episode_id for c in clips if c.episode_id is not None]
    if episode_ids:
        episodes = {e.id: e for e in db.query(StoryEpisode).filter(StoryEpisode.id.in_(episode_ids)).all()}
        for clip in clips:
            ep = episodes.get(clip.episode_id) if clip.episode_id is not None else None
            clip.series_id = ep.series_id if ep else None
            clip.episode_number = ep.number if ep else None
    return clips


def _reject_episode_trim(payload: ClipUpdate) -> None:
    if payload.start_s is not None or payload.end_s is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "episode_clip_managed_by_series",
                "message": "Clip de episódio de série não permite ajustar o trecho (start_s/end_s).",
            },
        )


def _decide_episode_clip(db: Session, clip: Clip, decision: str, scope: Scope) -> None:
    """Approve/reject of a Series IA episode clip = the episode lifecycle
    (sequential rule, publications, character events). A reject from here
    never regenerates (no instructions, no spend); use the series routes to
    regenerate."""
    episode = db.get(StoryEpisode, clip.episode_id)
    series = db.get(StorySeries, episode.series_id) if episode is not None else None
    if episode is None or series is None:
        raise HTTPException(status_code=404, detail="Episódio não encontrado")
    ctx = lifecycle.Ctx.from_scope(scope)
    if decision == "approved":
        lifecycle.approve_episode(db, ctx, series, episode)
    else:
        lifecycle.reject_episode(db, ctx, series, episode, None, False, "script", lifecycle.Outbox())


router = APIRouter(prefix="/api/clips", tags=["clips"], dependencies=[Depends(get_scope)])


@router.get("", response_model=list[ClipRead])
def list_clips(
    status: ClipStatus | None = Query(default=None),
    job_id: uuid.UUID | None = Query(default=None),
    media_asset_id: uuid.UUID | None = Query(default=None),
    channel_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> list[Clip]:
    stmt = scope.owned(db.query(Clip), Clip)
    if status is not None:
        stmt = stmt.filter(Clip.status == status)
    if job_id is not None:
        stmt = stmt.filter(Clip.job_id == job_id)
    if media_asset_id is not None:
        stmt = stmt.filter(Clip.media_asset_id == media_asset_id)
    if channel_id is not None:
        stmt = stmt.filter(Clip.channel_id == channel_id)
    return _enrich(db, list(stmt.order_by(Clip.created_at.desc()).offset(offset).limit(limit).all()))


@router.get("/{clip_id}", response_model=ClipDetailRead)
def get_clip(clip_id: uuid.UUID, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> Clip:
    clip = get_owned_or_404(db, Clip, clip_id, scope)
    _enrich(db, [clip])
    return clip


@router.patch("/{clip_id}", response_model=ClipRead)
def update_clip(
    clip_id: uuid.UUID,
    payload: ClipUpdate,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> Clip:
    clip = get_owned_or_404(db, Clip, clip_id, scope)
    if clip.episode_id is not None:
        _reject_episode_trim(payload)
        _decide_episode_clip(db, clip, payload.status, scope)
        db.commit()
        db.refresh(clip)
        return _enrich(db, [clip])[0]

    if payload.status is not None:
        clip.status = ClipStatus(payload.status)
        record_action(
            db,
            user_id=scope.actor.id,
            action=f"clip.{payload.status}",
            entity="clip",
            entity_id=clip.id,
            details=scope.audit_details(),
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
            user_id=scope.actor.id,
            action="clip.trim",
            entity="clip",
            entity_id=clip.id,
            details=scope.audit_details({"start_s": clip.start_s, "end_s": clip.end_s}),
        )

    db.commit()
    db.refresh(clip)

    if trimmed:
        render_clip.delay(str(clip.id))

    return _enrich(db, [clip])[0]


@router.post("/bulk", response_model=list[ClipRead])
def bulk_update_clips(
    payload: ClipBulkAction,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> list[Clip]:
    new_status = ClipStatus.APPROVED if payload.action == "approve" else ClipStatus.REJECTED
    clips = scope.owned(db.query(Clip), Clip).filter(Clip.id.in_(payload.ids)).all()
    found_ids = {c.id for c in clips}
    missing = [str(i) for i in payload.ids if i not in found_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"Clip(s) not found: {', '.join(missing)}")

    # Episode clips go through the episode lifecycle (in episode order, so a
    # batch "approve 1 and 2" satisfies the sequential rule).
    episode_clips = sorted(
        (c for c in clips if c.episode_id is not None),
        key=lambda c: (db.get(StoryEpisode, c.episode_id).number),
    )
    for clip in episode_clips:
        _decide_episode_clip(db, clip, "approved" if payload.action == "approve" else "rejected", scope)
    for clip in clips:
        if clip.episode_id is not None:
            continue
        clip.status = new_status
        record_action(
            db,
            user_id=scope.actor.id,
            action=f"clip.{payload.action}",
            entity="clip",
            entity_id=clip.id,
            details=scope.audit_details({"bulk": True}),
        )
    db.commit()
    for clip in clips:
        db.refresh(clip)
    return _enrich(db, clips)


@router.put("/{clip_id}/metadata/{platform}", response_model=ClipMetadataRead)
def upsert_clip_metadata(
    clip_id: uuid.UUID,
    platform: Platform,
    payload: ClipMetadataUpdate,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> ClipMetadata:
    get_owned_or_404(db, Clip, clip_id, scope)
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
        user_id=scope.actor.id,
        action="clip_metadata.edit",
        entity="clip_metadata",
        entity_id=clip_id,
        details=scope.audit_details({"platform": platform.value}),
    )
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/{clip_id}/metadata/regenerate")
def regenerate_clip_metadata(
    clip_id: uuid.UUID,
    platform: Platform | None = Query(default=None),
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> dict[str, str]:
    clip = get_owned_or_404(db, Clip, clip_id, scope)
    record_action(
        db,
        user_id=scope.actor.id,
        action="clip_metadata.regenerate",
        entity="clip",
        entity_id=clip.id,
        details=scope.audit_details({"platform": platform.value if platform else "all"}),
    )
    db.commit()
    task = regenerate_metadata_task.delay(str(clip_id), platform.value if platform else None)
    return {"task_id": task.id, "status": "queued"}


@router.get("/{clip_id}/video")
def stream_clip_video(
    clip_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    s3: S3Client = Depends(get_s3_client),
) -> StreamingResponse:
    clip = get_owned_or_404(db, Clip, clip_id, scope)
    if not clip.storage_key:
        raise HTTPException(status_code=409, detail="Clip has not finished rendering yet")
    return stream_s3_object(request, s3, clip.storage_key, "video/mp4")


@router.get("/{clip_id}/thumbnail")
def stream_clip_thumbnail(
    clip_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    s3: S3Client = Depends(get_s3_client),
) -> StreamingResponse:
    clip = get_owned_or_404(db, Clip, clip_id, scope)
    if not clip.thumbnail_key:
        raise HTTPException(status_code=409, detail="Clip has no thumbnail yet")
    return stream_s3_object(request, s3, clip.thumbnail_key, "image/jpeg")

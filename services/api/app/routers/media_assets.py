from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.audit import record_action
from app.channels import effective_analysis_defaults
from app.db import get_db
from app.deps import get_current_user
from app.models.analysis_job import AnalysisJob, Preset
from app.models.channel import Channel
from app.models.media_asset import MediaAsset
from app.models.user import User
from app.schemas.analysis_job import AnalysisJobRead, AnalyzeRequest
from app.schemas.media_asset import MediaAssetRead, MediaAssetUpdate
from app.storage import S3Client, get_s3_client, stream_s3_object
from app.worker.tasks import run_analysis

router = APIRouter(prefix="/api/media-assets", tags=["media-assets"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[MediaAssetRead])
def list_media_assets(
    channel_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[MediaAsset]:
    stmt = db.query(MediaAsset)
    if channel_id is not None:
        stmt = stmt.filter(MediaAsset.channel_id == channel_id)
    return list(stmt.order_by(MediaAsset.created_at.desc()).all())


@router.patch("/{media_asset_id}", response_model=MediaAssetRead)
def update_media_asset(
    media_asset_id: uuid.UUID,
    payload: MediaAssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaAsset:
    media_asset = db.get(MediaAsset, media_asset_id)
    if media_asset is None:
        raise HTTPException(status_code=404, detail="MediaAsset not found")

    updates = payload.model_dump(exclude_unset=True)
    if "channel_id" in updates and updates["channel_id"] is not None:
        if db.get(Channel, updates["channel_id"]) is None:
            raise HTTPException(status_code=404, detail="Channel not found")
    for field, value in updates.items():
        setattr(media_asset, field, value)

    record_action(
        db,
        user_id=current_user.id,
        action="media_asset.update",
        entity="media_asset",
        entity_id=media_asset.id,
        details=payload.model_dump(exclude_unset=True, mode="json"),
    )
    db.commit()
    db.refresh(media_asset)
    return media_asset


@router.get("/{media_asset_id}", response_model=MediaAssetRead)
def get_media_asset(media_asset_id: uuid.UUID, db: Session = Depends(get_db)) -> MediaAsset:
    media_asset = db.get(MediaAsset, media_asset_id)
    if media_asset is None:
        raise HTTPException(status_code=404, detail="MediaAsset not found")
    return media_asset


@router.get("/{media_asset_id}/video")
def stream_media_asset_video(
    media_asset_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    s3: S3Client = Depends(get_s3_client),
) -> StreamingResponse:
    media_asset = db.get(MediaAsset, media_asset_id)
    if media_asset is None:
        raise HTTPException(status_code=404, detail="MediaAsset not found")
    return stream_s3_object(request, s3, media_asset.storage_key, "video/mp4")


@router.post("/{media_asset_id}/analyze", response_model=AnalysisJobRead, status_code=201)
def analyze_media_asset(
    media_asset_id: uuid.UUID,
    payload: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnalysisJob:
    media_asset = db.get(MediaAsset, media_asset_id)
    if media_asset is None:
        raise HTTPException(status_code=404, detail="MediaAsset not found")

    channel_id = payload.channel_id if payload.channel_id is not None else media_asset.channel_id
    channel: Channel | None = None
    if channel_id is not None:
        channel = db.get(Channel, channel_id)
        if channel is None:
            raise HTTPException(status_code=404, detail="Channel not found")

    default_preset_value, default_params = effective_analysis_defaults(channel)

    preset = payload.preset
    if preset is None:
        if default_preset_value is None:
            raise HTTPException(
                status_code=422,
                detail="preset is required (no channel default_preset to fall back to)",
            )
        preset = Preset(default_preset_value)

    params = payload.params.model_dump(mode="json") if payload.params is not None else default_params

    job = AnalysisJob(media_asset_id=media_asset_id, channel_id=channel_id, preset=preset, params=params)
    db.add(job)
    db.flush()
    record_action(
        db,
        user_id=current_user.id,
        action="analysis_job.create",
        entity="analysis_job",
        entity_id=job.id,
        details={"media_asset_id": str(media_asset_id), "preset": preset.value, "channel_id": str(channel_id) if channel_id else None},
    )
    db.commit()
    db.refresh(job)

    run_analysis.delay(str(job.id))
    return job

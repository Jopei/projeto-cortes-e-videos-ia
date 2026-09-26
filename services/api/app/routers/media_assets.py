from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.audit import record_action
from app.db import get_db
from app.deps import get_current_user
from app.models.analysis_job import AnalysisJob
from app.models.media_asset import MediaAsset
from app.models.user import User
from app.schemas.analysis_job import AnalysisJobRead, AnalyzeRequest
from app.schemas.media_asset import MediaAssetRead
from app.storage import S3Client, get_s3_client, stream_s3_object
from app.worker.tasks import run_analysis

router = APIRouter(prefix="/api/media-assets", tags=["media-assets"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[MediaAssetRead])
def list_media_assets(db: Session = Depends(get_db)) -> list[MediaAsset]:
    return list(db.query(MediaAsset).order_by(MediaAsset.created_at.desc()).all())


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

    params = payload.params.model_dump(mode="json") if payload.params else {}
    job = AnalysisJob(media_asset_id=media_asset_id, preset=payload.preset, params=params)
    db.add(job)
    db.flush()
    record_action(
        db,
        user_id=current_user.id,
        action="analysis_job.create",
        entity="analysis_job",
        entity_id=job.id,
        details={"media_asset_id": str(media_asset_id), "preset": payload.preset.value},
    )
    db.commit()
    db.refresh(job)

    run_analysis.delay(str(job.id))
    return job

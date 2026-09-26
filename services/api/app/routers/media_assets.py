from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.media_asset import MediaAsset
from app.schemas.media_asset import MediaAssetRead

router = APIRouter(prefix="/api/media-assets", tags=["media-assets"])


@router.get("", response_model=list[MediaAssetRead])
def list_media_assets(db: Session = Depends(get_db)) -> list[MediaAsset]:
    return list(db.query(MediaAsset).order_by(MediaAsset.created_at.desc()).all())


@router.get("/{media_asset_id}", response_model=MediaAssetRead)
def get_media_asset(media_asset_id: uuid.UUID, db: Session = Depends(get_db)) -> MediaAsset:
    media_asset = db.get(MediaAsset, media_asset_id)
    if media_asset is None:
        raise HTTPException(status_code=404, detail="MediaAsset not found")
    return media_asset

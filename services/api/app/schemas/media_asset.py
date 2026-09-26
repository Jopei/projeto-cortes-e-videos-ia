from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.media_asset import MediaAssetStatus


class MediaAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_id: uuid.UUID
    channel_id: uuid.UUID | None
    filename: str
    storage_key: str
    duration: float | None
    status: MediaAssetStatus
    created_at: datetime


class MediaAssetUpdate(BaseModel):
    channel_id: uuid.UUID | None = None

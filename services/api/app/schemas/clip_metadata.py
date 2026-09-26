from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict

from app.models.enums import Platform


class ClipMetadataRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clip_id: uuid.UUID
    platform: Platform
    title: str | None
    description: str | None
    hashtags: list[str]
    edited: bool


class ClipMetadataUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    hashtags: list[str] | None = None

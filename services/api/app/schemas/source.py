from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.source import LicenseType


class SourceBase(BaseModel):
    title: str
    work_name: str
    license_type: LicenseType
    default_channel_id: uuid.UUID | None = None
    proof_url: str | None = None
    proof_file_key: str | None = None
    allowed_platforms: list[str] = []
    territories: list[str] = []
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    monetization_allowed: bool = False
    attribution_text: str | None = None


class SourceCreate(SourceBase):
    pass


class SourceUpdate(BaseModel):
    title: str | None = None
    work_name: str | None = None
    license_type: LicenseType | None = None
    default_channel_id: uuid.UUID | None = None
    proof_url: str | None = None
    proof_file_key: str | None = None
    allowed_platforms: list[str] | None = None
    territories: list[str] | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    monetization_allowed: bool | None = None
    attribution_text: str | None = None


class SourceRead(SourceBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime

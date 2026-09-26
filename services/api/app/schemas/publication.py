from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import Platform
from app.models.publication import Privacy, PublicationStatus


class PublicationBatchRequest(BaseModel):
    clip_ids: list[uuid.UUID]
    account_ids: list[uuid.UUID]
    schedule: str = "auto"
    """"auto" (next free slot per account), "now", or an ISO-8601 datetime."""
    privacy: Privacy | None = None

    @field_validator("schedule")
    @classmethod
    def _validate_schedule(cls, value: str) -> str:
        if value in ("auto", "now"):
            return value
        from datetime import datetime as _dt

        try:
            _dt.fromisoformat(value)
        except ValueError as exc:
            raise ValueError('schedule must be "auto", "now", or an ISO-8601 datetime') from exc
        return value


class PublicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clip_id: uuid.UUID
    account_id: uuid.UUID
    platform: Platform
    status: PublicationStatus
    scheduled_at: datetime | None
    published_at: datetime | None
    external_post_id: str | None
    external_url: str | None
    privacy: Privacy | None
    error: str | None
    block_reasons: list[str] | None
    created_at: datetime


class PublicationBatchResult(BaseModel):
    created: list[PublicationRead]

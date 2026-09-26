from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.clip import ClipStatus
from app.schemas.clip_metadata import ClipMetadataRead


class ClipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    media_asset_id: uuid.UUID
    channel_id: uuid.UUID | None
    start_s: float
    end_s: float
    score: float | None
    signals: dict | None
    storage_key: str | None
    thumbnail_key: str | None
    subtitles_key: str | None
    transcript: str | None
    status: ClipStatus
    created_at: datetime


class ClipDetailRead(ClipRead):
    # The ORM attribute is `metadata_entries` (SQLAlchemy's DeclarativeBase
    # already owns `.metadata`) but the wire field is the natural `metadata`.
    metadata: list[ClipMetadataRead] = Field(default_factory=list, validation_alias="metadata_entries")


class ClipUpdate(BaseModel):
    """PATCH /api/clips/{id}. `status` only accepts a manual reviewer
    decision (approved/rejected) — the other statuses are pipeline-owned.
    Providing `start_s`/`end_s` re-enqueues a render (`app.worker.tasks.render_clip`)
    and puts the clip back in `rendering` until it finishes.
    """

    status: Literal["approved", "rejected"] | None = None
    start_s: float | None = None
    end_s: float | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "ClipUpdate":
        if self.status is None and self.start_s is None and self.end_s is None:
            raise ValueError("Provide at least one of: status, start_s, end_s")
        return self


class ClipBulkAction(BaseModel):
    ids: list[uuid.UUID]
    action: Literal["approve", "reject"]

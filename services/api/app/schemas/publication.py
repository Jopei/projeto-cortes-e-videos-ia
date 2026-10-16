from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.enums import Platform
from app.models.publication import Privacy, PublicationStatus


class PublicationBatchRequest(BaseModel):
    """Two mutually exclusive modes, picked by `target`:

    - `target="accounts"` (default, backward compatible): publish every clip
      in `clip_ids` to every account in `account_ids` (explicit pairing).
    - `target="channel"`: `account_ids` must be omitted; each clip is
      published to *every* PlatformAccount linked to that clip's own
      `channel_id` (`account_ids` is ignored/forbidden in this mode since the
      account set is derived per clip).

    The rights gate (`app.rights.gate.check_publishable`) still runs for
    every resulting (clip, account) pair in both modes.
    """

    clip_ids: list[uuid.UUID]
    account_ids: list[uuid.UUID] | None = None
    target: Literal["accounts", "channel"] = "accounts"
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

    @model_validator(mode="after")
    def _validate_target(self) -> "PublicationBatchRequest":
        if self.target == "accounts" and not self.account_ids:
            raise ValueError('account_ids is required when target="accounts"')
        if self.target == "channel" and self.account_ids:
            raise ValueError('account_ids must not be provided when target="channel"')
        return self


class PublicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
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
    synthetic_media: bool = False
    created_at: datetime


class PublicationBatchResult(BaseModel):
    created: list[PublicationRead]

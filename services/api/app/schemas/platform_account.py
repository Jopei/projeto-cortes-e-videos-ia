from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import Platform
from app.models.platform_account import AccountMode, AccountStatus


class PlatformAccountCreate(BaseModel):
    """Only `manual` accounts are created this way. OAuth accounts are
    created by the `/api/accounts/{platform}/callback` flow (etapa C)."""

    platform: Platform
    display_name: str


class PlatformAccountUpdate(BaseModel):
    display_name: str | None = None
    daily_limit: int | None = None
    posting_windows: list[dict] | None = None
    timezone: str | None = None
    template: dict | None = None
    monetized: bool | None = None


class PlatformAccountRead(BaseModel):
    """Never exposes `encrypted_access_token`/`encrypted_refresh_token`."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    platform: Platform
    display_name: str
    mode: AccountMode
    external_id: str | None
    token_expires_at: datetime | None
    scopes: list[str] | None
    status: AccountStatus
    daily_limit: int | None
    posting_windows: list[dict]
    timezone: str
    template: dict | None
    monetized: bool
    created_at: datetime


class PlatformInfo(BaseModel):
    id: str
    name: str
    supports_oauth: bool
    configured: bool
    notes: str


class OAuthConnectResponse(BaseModel):
    authorize_url: str

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

MIN_PASSWORD_LENGTH = 10


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=255)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    display_name: str | None
    email: str | None
    is_active: bool
    is_admin: bool
    must_change_password: bool
    storage_quota_bytes: int | None
    daily_analysis_quota: int | None
    max_channels: int | None
    created_at: datetime
    last_login_at: datetime | None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=255)


class UsageRead(BaseModel):
    """`GET /api/me/usage` (own data) and embedded in `AdminUserRead` (admin
    listing everyone's usage)."""

    storage_used_bytes: int
    storage_quota_bytes: int | None
    analyses_today: int
    daily_analysis_quota: int | None
    channels_count: int
    max_channels: int | None


class AdminUserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=255)
    display_name: str | None = None
    email: str | None = Field(default=None, max_length=255)
    is_admin: bool = False
    storage_quota_gb: float | None = Field(default=None, description="null = unlimited")
    daily_analysis_quota: int | None = None
    max_channels: int | None = None
    must_change_password: bool = True

    @field_validator("username")
    @classmethod
    def _strip_username(cls, value: str) -> str:
        return value.strip()


class AdminUserUpdate(BaseModel):
    display_name: str | None = None
    email: str | None = Field(default=None, max_length=255)
    is_admin: bool | None = None
    is_active: bool | None = None
    storage_quota_gb: float | None = None
    daily_analysis_quota: int | None = None
    max_channels: int | None = None


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=255)


class AdminUserRead(UserRead):
    usage: UsageRead
    clips_count: int
    publications_count: int


GB = 1024**3


def gb_to_bytes(value: float | None) -> int | None:
    return None if value is None else round(value * GB)

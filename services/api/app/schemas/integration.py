from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class IntegrationFieldRead(BaseModel):
    key: str
    label: str
    secret: bool
    required: bool


class IntegrationRead(BaseModel):
    id: str
    name: str
    fields: list[IntegrationFieldRead]
    values: dict[str, str | None]
    configured: bool
    source: str | None
    redirect_uri: str | None
    updated_at: datetime | None
    updated_by: str | None


class IntegrationUpdate(BaseModel):
    values: dict[str, str | None]


class IntegrationTestResult(BaseModel):
    ok: bool
    message: str

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.analysis_job import Preset
from app.schemas.analysis_job import AnalysisParams
from app.schemas.template import TemplateParams


class ChannelBase(BaseModel):
    name: str
    slug: str
    niche: str | None = None
    color: str | None = None
    default_preset: Preset | None = None
    default_params: AnalysisParams | None = None
    template: TemplateParams | None = None
    is_active: bool = True


class ChannelCreate(ChannelBase):
    pass


class ChannelUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    niche: str | None = None
    color: str | None = None
    default_preset: Preset | None = None
    default_params: AnalysisParams | None = None
    template: TemplateParams | None = None
    is_active: bool | None = None


class ChannelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    slug: str
    niche: str | None
    color: str | None
    default_preset: Preset | None
    default_params: dict | None
    template: dict | None
    is_active: bool
    created_at: datetime


class ChannelCounts(BaseModel):
    accounts_by_platform: dict[str, int]
    clips_pending_review: int
    publications_scheduled: int
    publications_published: int


class ChannelWithCounts(ChannelRead):
    counts: ChannelCounts

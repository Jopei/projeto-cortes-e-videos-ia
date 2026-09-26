from __future__ import annotations

import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.analysis_job import AnalysisJobStatus, Preset


class ReframeMode(str, enum.Enum):
    AUTO = "auto"
    BLUR = "blur"
    CENTER = "center"


class AnalysisParams(BaseModel):
    """Body of `AnalysisJob.params`. Every field is optional — unset ones
    fall back to the preset's defaults (see `app.presets.PRESET_WEIGHTS`) when
    the pipeline actually runs (etapa B)."""

    weights: dict[str, float] | None = None
    min_duration: float | None = Field(default=None, gt=0)
    max_duration: float | None = Field(default=None, gt=0)
    max_clips: int | None = Field(default=None, gt=0)
    language: str | None = None
    burn_subtitles: bool = True
    reframe_mode: ReframeMode = ReframeMode.AUTO


class AnalyzeRequest(BaseModel):
    """`preset`/`params` are optional when the MediaAsset (or an explicit
    `channel_id` override here) resolves to a Channel with
    `default_preset`/`default_params` set — see
    `app.channels.effective_analysis_defaults` and
    `POST /api/media-assets/{id}/analyze`. If neither a channel default nor
    an explicit `preset` is available, the request is rejected with 422."""

    preset: Preset | None = None
    params: AnalysisParams | None = None
    channel_id: uuid.UUID | None = None


class AnalysisJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    media_asset_id: uuid.UUID
    channel_id: uuid.UUID | None
    status: AnalysisJobStatus
    progress: int
    stage: str | None
    preset: Preset
    params: dict
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class PresetWeights(BaseModel):
    preset: Preset
    weights: dict[str, float]

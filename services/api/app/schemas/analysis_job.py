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
    preset: Preset
    params: AnalysisParams | None = None


class AnalysisJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    media_asset_id: uuid.UUID
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

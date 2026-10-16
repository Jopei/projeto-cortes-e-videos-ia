from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

VisualStrategy = Literal["economy", "hybrid", "full_video"]


class ProviderRead(BaseModel):
    id: str
    name: str
    configured: bool
    fake: bool
    supports_reference_images: bool
    max_reference_images: int
    allowed_durations: list[int] | None = None  # video only
    word_timestamps: bool | None = None  # tts only
    est_cost_usd: float
    est_cost_unit: Literal["per_second", "per_image", "per_1k_chars"]


class ProvidersRead(BaseModel):
    video: list[ProviderRead]
    image: list[ProviderRead]
    tts: list[ProviderRead]


class SeriesEstimateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visual_strategy: VisualStrategy = "hybrid"
    max_video_scenes_per_episode: int = Field(default=1, ge=0, le=6)
    video_provider: str | None = None
    image_provider: str | None = None
    tts_provider: str | None = None


class CostBreakdown(BaseModel):
    video: float
    image: float
    tts: float
    llm: float


class SeriesEstimateRead(BaseModel):
    per_episode_usd: float
    season_usd: float
    breakdown: CostBreakdown
    """Per-episode breakdown (sums to `per_episode_usd`)."""
    assumptions: list[str]

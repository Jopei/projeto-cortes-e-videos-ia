from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.publication import PublicationRead
from app.story.schemas import ArcPhaseT, Bible, CharacterRoleT, EpisodeScript, PlannedStateChange

VisualStrategy = Literal["economy", "hybrid", "full_video"]
PrivacyT = Literal["private", "public", "self_only"]
RegenerateScope = Literal["script", "media", "narration"]
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


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


class LlmStatusRead(BaseModel):
    fake: bool  # fake_llm answers (STORY_FAKE_LLM_ENABLED and no Anthropic key)
    configured: bool  # a real Anthropic key exists, or fake mode is active


class ProvidersRead(BaseModel):
    video: list[ProviderRead]
    image: list[ProviderRead]
    tts: list[ProviderRead]
    llm: LlmStatusRead


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


# ---------------------------------------------------------------- series ----


def _check_hhmm(value: str) -> str:
    if not _HHMM.match(value):
        raise ValueError("publish_time must be HH:MM (24h)")
    return value


def _check_tz(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError, KeyError) as exc:
        raise ValueError("unknown timezone") from exc
    return value


class SeriesCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=120)
    premise: str = Field(min_length=50, max_length=4000)
    genre: str = Field(min_length=1, max_length=60)
    tone: str = Field(min_length=1, max_length=60)
    channel_id: uuid.UUID
    visual_strategy: VisualStrategy = "hybrid"
    max_video_scenes_per_episode: int = Field(default=1, ge=0, le=6)
    video_provider: str | None = None
    image_provider: str
    tts_provider: str
    tts_voice_id: str = Field(min_length=1, max_length=128)
    publish_time: str
    timezone: str = "America/Sao_Paulo"
    lead_days: Literal[1, 2] = 2
    privacy: PrivacyT = "public"
    budget_limit_usd: Decimal | None = Field(default=None, ge=0)
    max_regenerations_per_episode: int = Field(default=3, ge=0, le=10)
    require_script_approval: bool = True
    monetization_allowed: bool = True
    originality_attestation: Literal[True]

    _v_time = field_validator("publish_time")(_check_hhmm)
    _v_tz = field_validator("timezone")(_check_tz)


class SeriesUpdate(BaseModel):
    """Editable subset. `premise` (and anything else) is rejected with 422
    by `extra="forbid"`."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=120)
    genre: str | None = Field(default=None, min_length=1, max_length=60)
    tone: str | None = Field(default=None, min_length=1, max_length=60)
    publish_time: str | None = None
    timezone: str | None = None
    lead_days: Literal[1, 2] | None = None
    privacy: PrivacyT | None = None
    visual_strategy: VisualStrategy | None = None
    max_video_scenes_per_episode: int | None = Field(default=None, ge=0, le=6)
    video_provider: str | None = None
    video_options: dict | None = None
    image_provider: str | None = None
    image_options: dict | None = None
    tts_provider: str | None = None
    tts_voice_id: str | None = Field(default=None, min_length=1, max_length=128)
    tts_options: dict | None = None
    budget_limit_usd: Decimal | None = Field(default=None, ge=0)
    max_regenerations_per_episode: int | None = Field(default=None, ge=0, le=10)
    require_script_approval: bool | None = None

    @field_validator("publish_time")
    @classmethod
    def _t(cls, value: str | None) -> str | None:
        return _check_hhmm(value) if value is not None else None

    @field_validator("timezone")
    @classmethod
    def _z(cls, value: str | None) -> str | None:
        return _check_tz(value) if value is not None else None


class SeriesProgress(BaseModel):
    approved: int = 0
    scheduled: int = 0
    published: int = 0
    pending_review: int = 0
    awaiting_script_approval: int = 0
    failed: int = 0


class NextEpisode(BaseModel):
    number: int
    target_date: date | None
    status: str


class EstimatedCost(BaseModel):
    per_episode_usd: float
    season_usd: float


class SeriesRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    channel_id: uuid.UUID | None
    source_id: uuid.UUID
    title: str | None
    premise: str
    genre: str | None
    tone: str | None
    language: str
    episode_count: int
    episode_duration_s: int
    timezone: str
    publish_time: str
    start_date: date | None
    lead_days: int
    privacy: str
    visual_strategy: str
    max_video_scenes_per_episode: int
    video_provider: str | None
    video_options: dict | None
    image_provider: str | None
    image_options: dict | None
    tts_provider: str | None
    tts_voice_id: str | None
    tts_options: dict | None
    planner_model: str | None
    writer_model: str | None
    bible_version: int
    status: str
    pause_reason: str | None
    error: str | None
    require_script_approval: bool
    max_regenerations_per_episode: int
    budget_limit_usd: float | None
    cost_usd_total: float
    originality_attested_at: datetime
    created_at: datetime
    updated_at: datetime | None
    progress: SeriesProgress = Field(default_factory=SeriesProgress)
    next_episode: NextEpisode | None = None
    estimated_cost: EstimatedCost | None = None


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    episode_number: int
    type: str
    from_status: str | None
    to_status: str | None
    description: str | None
    state: str


class StateEventRead(EventRead):
    character_key: str


class CharacterRead(BaseModel):
    id: uuid.UUID
    key: str
    name: str
    role: str
    description: str
    visual_description: str
    personality: str | None
    status: str
    committed: bool
    introduced_in_episode: int | None
    has_reference_image: bool
    events: list[EventRead] = Field(default_factory=list)


class EpisodeSummary(BaseModel):
    id: uuid.UUID
    number: int
    title: str | None
    arc_phase: str | None
    status: str
    target_date: date | None
    scheduled_at: datetime | None
    clip_id: uuid.UUID | None
    cost_usd: float
    regenerations: int
    error: str | None


class MediaJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    scene_index: int | None
    provider: str
    status: str
    attempts: int
    duration_s: float | None
    cost_usd_estimated: float | None
    cost_usd_actual: float | None
    error: str | None


class EpisodeDetail(EpisodeSummary):
    outline: dict | None
    script: dict | None
    script_revision: int
    user_instructions: str | None
    validation: dict | None
    validation_attempts: int
    media_jobs: list[MediaJobRead] = Field(default_factory=list)
    state_events: list[StateEventRead] = Field(default_factory=list)
    publications: list[PublicationRead] = Field(default_factory=list)


class SeriesDetail(SeriesRead):
    bible: dict | None = None
    characters: list[CharacterRead] = Field(default_factory=list)
    episodes: list[EpisodeSummary] = Field(default_factory=list)


# ------------------------------------------------------------ mutations ----


class BibleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bible_version: int
    bible: Bible


class CharacterUpdate(BaseModel):
    """`status` is deliberately absent: it only changes through events."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1, max_length=500)
    visual_description: str | None = Field(default=None, min_length=1, max_length=400)
    role: CharacterRoleT | None = None
    personality: str | None = None


class OutlineUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=70)
    arc_phase: ArcPhaseT | None = None
    summary: str | None = Field(default=None, max_length=400)
    key_events: list[str] | None = None
    planned_state_changes: list[PlannedStateChange] | None = None
    cliffhanger: str | None = Field(default=None, max_length=140)


class ReplanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instructions: str | None = Field(default=None, max_length=2000)


class StartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_date: date | None = None


class CancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cancel_scheduled_publications: bool = False


class ScriptUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    script_revision: int
    script: EpisodeScript


class RegenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scope: RegenerateScope
    instructions: str | None = Field(default=None, max_length=2000)


class RejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instructions: str | None = Field(default=None, max_length=2000)
    regenerate: bool = True
    scope: RegenerateScope = "script"


class VoiceRead(BaseModel):
    id: str
    name: str
    gender: str | None = None
    preview_url: str | None = None


class UsageByKind(BaseModel):
    llm: float = 0.0
    video: float = 0.0
    image: float = 0.0
    tts: float = 0.0


class EpisodeCost(BaseModel):
    episode_id: uuid.UUID
    number: int
    cost_usd: float


class UsageEventRead(BaseModel):
    id: uuid.UUID
    episode_id: uuid.UUID | None
    kind: str
    provider: str
    model: str | None
    cost_usd: float
    created_at: datetime


class CostsRead(BaseModel):
    total_usd: float
    budget_limit_usd: float | None
    by_kind: UsageByKind
    by_episode: list[EpisodeCost]
    recent: list[UsageEventRead]

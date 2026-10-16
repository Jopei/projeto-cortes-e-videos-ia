from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _enum(cls: type[enum.Enum], name: str) -> Enum:
    """VARCHAR(32) enum (no native Postgres type, no CHECK) — see plano §Decisões."""
    return Enum(
        cls,
        name=name,
        native_enum=False,
        length=32,
        create_constraint=False,
        values_callable=lambda e: [m.value for m in e],
    )


class SeriesStatus(str, enum.Enum):
    PLANNING = "planning"
    PLAN_FAILED = "plan_failed"
    PLANNED = "planned"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELED = "canceled"


class CharacterRole(str, enum.Enum):
    PROTAGONIST = "protagonist"
    ANTAGONIST = "antagonist"
    SUPPORTING = "supporting"
    MINOR = "minor"


class CharacterStatus(str, enum.Enum):
    ALIVE = "alive"
    DEAD = "dead"
    INJURED = "injured"
    MISSING = "missing"
    TRANSFORMED = "transformed"


class CharacterEventType(str, enum.Enum):
    INTRODUCE = "introduce"
    STATUS_CHANGE = "status_change"


class CharacterEventState(str, enum.Enum):
    PROPOSED = "proposed"
    APPLIED = "applied"
    DISCARDED = "discarded"


class ArcPhase(str, enum.Enum):
    SETUP = "setup"
    RISING = "rising"
    MIDPOINT = "midpoint"
    ESCALATION = "escalation"
    CLIMAX = "climax"
    RESOLUTION = "resolution"


class EpisodeStatus(str, enum.Enum):
    PLANNED = "planned"
    SCRIPTING = "scripting"
    VALIDATING = "validating"
    SCRIPT_READY = "script_ready"
    AWAITING_SCRIPT_APPROVAL = "awaiting_script_approval"
    GENERATING_MEDIA = "generating_media"
    ASSEMBLING = "assembling"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    REJECTED = "rejected"
    NEEDS_ATTENTION = "needs_attention"
    STALE = "stale"
    CANCELED = "canceled"


class MediaJobKind(str, enum.Enum):
    VIDEO_CLIP = "video_clip"
    IMAGE = "image"
    TTS = "tts"


class MediaJobStatus(str, enum.Enum):
    QUEUED = "queued"
    SUBMITTED = "submitted"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"


class UsageKind(str, enum.Enum):
    LLM = "llm"
    VIDEO = "video"
    IMAGE = "image"
    TTS = "tts"


class StorySeries(Base):
    """A 20-episode AI-generated story season. `premise` is immutable; the
    mutable creative state lives in `bible` (versioned by `bible_version`).
    Each series owns one `Source` (license_type=ai_generated) so the rights
    gate stays untouched."""

    __tablename__ = "story_series"
    __table_args__ = (
        CheckConstraint("episode_count = 20", name="ck_story_series_episode_count"),
        CheckConstraint("episode_duration_s = 30", name="ck_story_series_episode_duration"),
        CheckConstraint("lead_days BETWEEN 1 AND 2", name="ck_story_series_lead_days"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    channel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("channels.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("sources.id"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    premise: Mapped[str] = mapped_column(Text, nullable=False)
    genre: Mapped[str | None] = mapped_column(String(60), nullable=True)
    tone: Mapped[str | None] = mapped_column(String(60), nullable=True)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="pt-BR", server_default="pt-BR")
    episode_count: Mapped[int] = mapped_column(Integer, nullable=False, default=20, server_default="20")
    episode_duration_s: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default="30")
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, default="America/Sao_Paulo", server_default="America/Sao_Paulo"
    )
    publish_time: Mapped[str] = mapped_column(String(5), nullable=False)  # "HH:MM"
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    lead_days: Mapped[int] = mapped_column(Integer, nullable=False, default=2, server_default="2")
    privacy: Mapped[str] = mapped_column(String(16), nullable=False, default="public", server_default="public")
    visual_strategy: Mapped[str] = mapped_column(
        String(16), nullable=False, default="hybrid", server_default="hybrid"
    )
    max_video_scenes_per_episode: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    video_provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    video_options: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    image_provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    image_options: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    tts_provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tts_voice_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tts_options: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    planner_model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    writer_model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bible: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    bible_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    status: Mapped[SeriesStatus] = mapped_column(
        _enum(SeriesStatus, "series_status"), nullable=False, default=SeriesStatus.PLANNING, index=True
    )
    pause_reason: Mapped[str | None] = mapped_column(String(40), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    require_script_approval: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
    )
    max_regenerations_per_episode: Mapped[int] = mapped_column(
        Integer, nullable=False, default=3, server_default="3"
    )
    budget_limit_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    cost_usd_total: Mapped[Decimal] = mapped_column(
        Numeric(12, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    originality_attested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class StoryCharacter(Base):
    """No owner_id: always reached through its series."""

    __tablename__ = "story_characters"
    __table_args__ = (UniqueConstraint("series_id", "key", name="uq_story_characters_series_key"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    series_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("story_series.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[CharacterRole] = mapped_column(_enum(CharacterRole, "character_role"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    visual_description: Mapped[str] = mapped_column(Text, nullable=False)
    personality: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[CharacterStatus] = mapped_column(
        _enum(CharacterStatus, "character_status"), nullable=False, default=CharacterStatus.ALIVE
    )
    committed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    introduced_in_episode: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reference_image_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StoryEpisode(Base):
    __tablename__ = "story_episodes"
    __table_args__ = (UniqueConstraint("series_id", "number", name="uq_story_episodes_series_number"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    series_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("story_series.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    arc_phase: Mapped[ArcPhase | None] = mapped_column(_enum(ArcPhase, "arc_phase"), nullable=True)
    outline: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    script: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    script_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    user_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    validation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    validation_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    regenerations: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    status: Mapped[EpisodeStatus] = mapped_column(
        _enum(EpisodeStatus, "episode_status"), nullable=False, default=EpisodeStatus.PLANNED, index=True
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cost_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class StoryCharacterEvent(Base):
    __tablename__ = "story_character_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    series_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("story_series.id", ondelete="CASCADE"), nullable=False, index=True
    )
    character_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("story_characters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    episode_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("story_episodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[CharacterEventType] = mapped_column(
        _enum(CharacterEventType, "character_event_type"), nullable=False
    )
    from_status: Mapped[CharacterStatus | None] = mapped_column(
        _enum(CharacterStatus, "character_event_from_status"), nullable=True
    )
    to_status: Mapped[CharacterStatus | None] = mapped_column(
        _enum(CharacterStatus, "character_event_to_status"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    state: Mapped[CharacterEventState] = mapped_column(
        _enum(CharacterEventState, "character_event_state"),
        nullable=False,
        default=CharacterEventState.PROPOSED,
    )
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StoryMediaJob(Base):
    __tablename__ = "story_media_jobs"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_story_media_jobs_idempotency_key"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    episode_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("story_episodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    script_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    kind: Mapped[MediaJobKind] = mapped_column(_enum(MediaJobKind, "media_job_kind"), nullable=False)
    scene_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    params: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[MediaJobStatus] = mapped_column(
        _enum(MediaJobStatus, "media_job_status"), nullable=False, default=MediaJobStatus.QUEUED, index=True
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    next_poll_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    cost_usd_estimated: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    cost_usd_actual: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AiUsageEvent(Base):
    __tablename__ = "ai_usage_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    series_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("story_series.id", ondelete="CASCADE"), nullable=True, index=True
    )
    episode_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("story_episodes.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[UsageKind] = mapped_column(_enum(UsageKind, "usage_kind"), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    units: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    cost_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 4), nullable=False, default=Decimal("0"), server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

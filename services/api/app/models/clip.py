from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, CheckConstraint, DateTime, Enum, Float, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class ClipStatus(str, enum.Enum):
    RENDERING = "rendering"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    FAILED = "failed"


class Clip(Base):
    """One candidate vertical (9:16) cut produced by an AnalysisJob.

    `signals` holds the per-window raw signal values (audio/scenes/motion/
    speech/llm) that produced `score`, kept for debugging/re-scoring without
    re-running the whole pipeline. `storage_key`/`thumbnail_key`/
    `subtitles_key` point at S3 objects (bucket `media`) and are None until
    rendering finishes.
    """

    __tablename__ = "clips"
    __table_args__ = (
        CheckConstraint(
            "(job_id IS NOT NULL AND media_asset_id IS NOT NULL) OR episode_id IS NOT NULL",
            name="ck_clips_origin",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("analysis_jobs.id"), nullable=True, index=True
    )
    media_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id"), nullable=True, index=True
    )
    episode_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("story_episodes.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    synthetic_media: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    channel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("channels.id", ondelete="SET NULL"), nullable=True, index=True
    )
    start_s: Mapped[float] = mapped_column(Float, nullable=False)
    end_s: Mapped[float] = mapped_column(Float, nullable=False)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    signals: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    thumbnail_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    subtitles_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ClipStatus] = mapped_column(
        Enum(ClipStatus, name="clip_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=ClipStatus.RENDERING,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    job: Mapped["AnalysisJob | None"] = relationship(back_populates="clips")  # noqa: F821
    metadata_entries: Mapped[list["ClipMetadata"]] = relationship(  # noqa: F821
        back_populates="clip", cascade="all, delete-orphan"
    )
    publications: Mapped[list["Publication"]] = relationship(back_populates="clip")  # noqa: F821

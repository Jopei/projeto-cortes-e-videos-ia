from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class AnalysisJobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    CANCELED = "canceled"


class Preset(str, enum.Enum):
    ACTION = "action"
    DRAMA = "drama"
    COMEDY = "comedy"
    SUSPENSE = "suspense"
    CUSTOM = "custom"


class AnalysisJob(Base):
    """A run of the intensity-analysis pipeline over one MediaAsset.

    Created by `POST /api/media-assets/{id}/analyze` and enqueued as the
    Celery task `app.worker.tasks.run_analysis`. `params` mirrors the request
    body: `weights` (per-signal override), `min_duration`/`max_duration`,
    `max_clips`, `language`, `burn_subtitles`, `reframe_mode`
    (auto|blur|center) — see app/schemas/analysis_job.py for validation.

    Uses the portable `sqlalchemy.Uuid`/`JSON` types (not the
    postgres-only `ARRAY`/dialect `UUID` used by `Source`/`MediaAsset`) so
    `Base.metadata.create_all()` works directly against SQLite in tests —
    see tests/conftest.py.
    """

    __tablename__ = "analysis_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    media_asset_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id"), nullable=False, index=True
    )
    channel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("channels.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[AnalysisJobStatus] = mapped_column(
        Enum(AnalysisJobStatus, name="analysis_job_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=AnalysisJobStatus.QUEUED,
    )
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stage: Mapped[str | None] = mapped_column(String(255), nullable=True)
    preset: Mapped[Preset] = mapped_column(
        Enum(Preset, name="analysis_preset", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    clips: Mapped[list["Clip"]] = relationship(back_populates="job")  # noqa: F821

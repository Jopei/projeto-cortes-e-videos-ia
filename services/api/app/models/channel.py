from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.analysis_job import Preset


class Channel(Base):
    """One of the user's content channels (e.g. one of several YouTube
    channels, each with a different niche/content type). A channel can also
    have accounts on other platforms — see `PlatformAccount.channel_id`.

    `default_preset`/`default_params` mirror `AnalysisJob.preset`/`.params`
    (see app/schemas/analysis_job.py) and are used by
    `POST /api/media-assets/{id}/analyze` whenever the request doesn't supply
    its own `preset`/`params`. `template` mirrors `PlatformAccount.template`
    (language, tone, fixed_hashtags, title_max, extra_description) — the
    *effective* template for a (channel, account) pair is
    `app.channels.effective_template`, with the account's fields overriding
    the channel's.

    Uses the portable `sqlalchemy.Uuid`/`JSON` types (like `AnalysisJob`/
    `Clip`/etc, not `Source`/`MediaAsset`'s postgres-only types) so it
    survives `Base.metadata.create_all()` on sqlite in tests.
    """

    __tablename__ = "channels"
    __table_args__ = (UniqueConstraint("owner_id", "slug", name="uq_channels_owner_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    niche: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    default_preset: Mapped[Preset | None] = mapped_column(
        Enum(Preset, name="analysis_preset", values_callable=lambda e: [m.value for m in e]),
        nullable=True,
    )
    default_params: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    template: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

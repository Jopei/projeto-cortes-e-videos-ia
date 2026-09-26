from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import Platform, platform_enum


class PublicationStatus(str, enum.Enum):
    BLOCKED = "blocked"
    SCHEDULED = "scheduled"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    FAILED = "failed"
    CANCELED = "canceled"
    TAKEN_DOWN = "taken_down"
    EXPORTED = "exported"


class Privacy(str, enum.Enum):
    PRIVATE = "private"
    PUBLIC = "public"
    SELF_ONLY = "self_only"


class Publication(Base):
    """One (clip, account) publishing attempt, created by
    `POST /api/publications/batch`.

    `platform` is copied from `account.platform` at creation time (kept
    denormalized so a Publication's platform is stable even if the account
    row changes later). `block_reasons` holds the machine-readable codes
    from `app.rights.gate.check_publishable` (e.g. `cc_by_nd_derivative_forbidden`)
    when `status == "blocked"`.
    """

    __tablename__ = "publications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    clip_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("clips.id"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("platform_accounts.id"), nullable=False, index=True
    )
    platform: Mapped[Platform] = mapped_column(platform_enum, nullable=False)
    status: Mapped[PublicationStatus] = mapped_column(
        Enum(PublicationStatus, name="publication_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=PublicationStatus.BLOCKED,
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    external_post_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    privacy: Mapped[Privacy | None] = mapped_column(
        Enum(Privacy, name="publication_privacy", values_callable=lambda e: [m.value for m in e]),
        nullable=True,
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    block_reasons: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    clip: Mapped["Clip"] = relationship(back_populates="publications")  # noqa: F821
    account: Mapped["PlatformAccount"] = relationship(back_populates="publications")  # noqa: F821

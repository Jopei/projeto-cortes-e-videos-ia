from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class LicenseType(str, enum.Enum):
    PUBLIC_DOMAIN = "public_domain"
    CC_BY = "cc_by"
    CC_BY_SA = "cc_by_sa"
    CC_BY_NC = "cc_by_nc"
    CC_BY_ND = "cc_by_nd"
    LICENSED = "licensed"
    OWN = "own"


class Source(Base):
    """A licensing/rights record for a piece of source material.

    Every MediaAsset must be linked to exactly one Source. The `rights.gate`
    module reads these fields to decide whether a clip may be published —
    see app/rights/gate.py, which is the single source of truth for that
    decision and must not be duplicated elsewhere.
    """

    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    default_channel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("channels.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    work_name: Mapped[str] = mapped_column(String(255), nullable=False)
    license_type: Mapped[LicenseType] = mapped_column(Enum(LicenseType, name="license_type", values_callable=lambda e: [m.value for m in e]), nullable=False)
    proof_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    proof_file_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    allowed_platforms: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    territories: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    monetization_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    attribution_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    media_assets: Mapped[list["MediaAsset"]] = relationship(back_populates="source")  # noqa: F821

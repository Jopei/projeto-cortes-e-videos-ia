from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import Platform, platform_enum


class AccountMode(str, enum.Enum):
    OAUTH = "oauth"
    MANUAL = "manual"


class AccountStatus(str, enum.Enum):
    CONNECTED = "connected"
    EXPIRED = "expired"
    ERROR = "error"
    MANUAL = "manual"


class PlatformAccount(Base):
    """A channel/page/account a clip can be published to.

    `mode="manual"` accounts never get OAuth tokens: publishing to them just
    produces an export package (see `Publication.status == "exported"` and
    `GET /api/publications/{id}/export`). `mode="oauth"` accounts store
    tokens encrypted at rest (`app.crypto.encrypt_token`/`decrypt_token`,
    Fernet + TOKEN_ENCRYPTION_KEY) — the plaintext token must never leave
    this process, in particular never through a Pydantic response schema.

    `posting_windows` example: `[{"days": [0, 1, 2, 3, 4], "start": "18:00",
    "end": "22:00"}]` (days are 0=Monday..6=Sunday, ISO weekday-1). Used by
    the "auto" scheduler in `POST /api/publications/batch`.
    """

    __tablename__ = "platform_accounts"
    __table_args__ = (
        UniqueConstraint("channel_id", "platform", name="uq_platform_accounts_channel_platform"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    channel_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("channels.id", ondelete="SET NULL"), nullable=True, index=True
    )
    platform: Mapped[Platform] = mapped_column(platform_enum, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mode: Mapped[AccountMode] = mapped_column(
        Enum(AccountMode, name="account_mode", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=AccountMode.MANUAL,
    )
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    encrypted_access_token: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    encrypted_refresh_token: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scopes: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[AccountStatus] = mapped_column(
        Enum(AccountStatus, name="account_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=AccountStatus.MANUAL,
    )
    daily_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    posting_windows: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/Sao_Paulo")
    template: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    monetized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    publications: Mapped[list["Publication"]] = relationship(back_populates="account")  # noqa: F821

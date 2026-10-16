from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    """A login account for the internal panel (apps/web).

    Passwords are never stored in plaintext, only an argon2 hash (see
    `app/security.py`). Sessions are stateless JWTs kept in an httpOnly
    cookie (`cortes_session`, see `app/security.py` / `app/deps.py`); this
    table is only consulted to look the user up by id on each request and to
    enforce `is_active`.

    Multi-tenant fields (see CLAUDE.md "Multiusuário"): every other
    domain-data model (`Source`, `MediaAsset`, `Channel`, `AnalysisJob`,
    `Clip`, `PlatformAccount`, `Publication`) carries an `owner_id` FK back to
    this table — this is the tenant boundary the whole app scopes on (see
    `app/scope.py::get_scope`). `storage_quota_bytes`/`daily_analysis_quota`/
    `max_channels` are `None` = unlimited; admins are always exempt from
    quota checks regardless of their own values here.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(150), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    storage_quota_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    daily_analysis_quota: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_channels: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_active_series: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_ai_budget_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    session_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    """Bumped to invalidate every JWT already issued for this user (they
    carry the value in the `sv` claim, see `app/security.py` /
    `app/deps.py::resolve_user_from_cookie`) without needing a server-side
    session store. Incremented on: the user's own password change (which
    also re-issues a fresh cookie for that same request, so the user isn't
    logged out by their own action), an admin password reset, deactivation,
    and any change to `is_admin` — see `app/routers/auth.py`/
    `app/routers/admin_users.py`."""
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

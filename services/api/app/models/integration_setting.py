from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class IntegrationSetting(Base):
    """A single `(integration_id, key)` credential value entered by an admin
    through the UI, overriding the equivalent env var (see
    `app/integrations.py::get_integration_value` — the ONE place effective
    values are resolved, DB-then-env). `value_encrypted` is ALWAYS a Fernet
    ciphertext (`app.crypto.encrypt_token`/`decrypt_token`, same
    `TOKEN_ENCRYPTION_KEY` used for OAuth tokens) even for the non-secret
    fields (e.g. `youtube.client_id`) — simplest to reason about, and none
    of these values are large or hot-path enough for that to matter.

    A row is only ever present when a value has actually been set; clearing
    a field (`PUT .../integrations/{id}` with `""`/`null`, or `DELETE
    .../integrations/{id}`) deletes the row entirely rather than storing an
    empty string, so "no row" unambiguously means "fall back to env".

    Uses the portable `sqlalchemy.Uuid`/`Text` types (like `Channel`/
    `AnalysisJob`/etc, not `Source`/`MediaAsset`'s postgres-only types) so it
    survives `Base.metadata.create_all()` on sqlite in tests.
    """

    __tablename__ = "integration_settings"
    __table_args__ = (UniqueConstraint("integration_id", "key", name="uq_integration_settings_integration_key"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    integration_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

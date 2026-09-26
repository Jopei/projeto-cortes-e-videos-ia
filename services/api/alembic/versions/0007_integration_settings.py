"""integration settings (admin-managed API keys)

Lets an admin store OAuth/API credentials for youtube/tiktok/instagram/
facebook/bilibili/anthropic through the UI instead of only via `.env` — see
`app/integrations.py` (effective-value resolution, DB-then-env) and
`app/routers/admin_integrations.py`. Values are Fernet-encrypted at rest
(`app.crypto`, same `TOKEN_ENCRYPTION_KEY` as `PlatformAccount` OAuth
tokens) even for non-secret fields, for a single simple storage model.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-26

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "integration_settings",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("integration_id", sa.String(length=50), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value_encrypted", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_by",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("integration_id", "key", name="uq_integration_settings_integration_key"),
    )
    op.create_index(
        "ix_integration_settings_integration_id", "integration_settings", ["integration_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_integration_settings_integration_id", table_name="integration_settings")
    op.drop_table("integration_settings")

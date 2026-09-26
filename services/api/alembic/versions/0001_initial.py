"""initial schema: sources, media_assets

Revision ID: 0001
Revises:
Create Date: 2026-09-26

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

license_type_enum = postgresql.ENUM(
    "public_domain",
    "cc_by",
    "cc_by_sa",
    "cc_by_nc",
    "cc_by_nd",
    "licensed",
    "own",
    name="license_type",
    create_type=False,
)

media_asset_status_enum = postgresql.ENUM(
    "uploaded",
    "analyzing",
    "ready",
    "failed",
    name="media_asset_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    license_type_enum.create(bind, checkfirst=True)
    media_asset_status_enum.create(bind, checkfirst=True)

    op.create_table(
        "sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("work_name", sa.String(length=255), nullable=False),
        sa.Column("license_type", license_type_enum, nullable=False),
        sa.Column("proof_url", sa.String(length=1024), nullable=True),
        sa.Column("proof_file_key", sa.String(length=1024), nullable=True),
        sa.Column(
            "allowed_platforms",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "territories",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "monetization_allowed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("attribution_text", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "media_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sources.id"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("storage_key", sa.String(length=1024), nullable=False),
        sa.Column("duration", sa.Float(), nullable=True),
        sa.Column(
            "status",
            media_asset_status_enum,
            nullable=False,
            server_default="uploaded",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_media_assets_source_id", "media_assets", ["source_id"])


def downgrade() -> None:
    op.drop_index("ix_media_assets_source_id", table_name="media_assets")
    op.drop_table("media_assets")
    op.drop_table("sources")
    media_asset_status_enum.drop(op.get_bind(), checkfirst=True)
    license_type_enum.drop(op.get_bind(), checkfirst=True)

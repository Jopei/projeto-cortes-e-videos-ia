"""channels: multi-channel support

Adds the `channels` table plus `channel_id`/`default_channel_id` FKs on
`platform_accounts`, `media_assets`, `sources`, `analysis_jobs` and `clips`.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-26

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Same underlying Postgres type as `analysis_jobs.preset` (created in 0003) —
# reused here, not recreated (`create_type=False`).
analysis_preset_enum = postgresql.ENUM(
    "action", "drama", "comedy", "suspense", "custom",
    name="analysis_preset", create_type=False,
)


def upgrade() -> None:
    op.create_table(
        "channels",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("niche", sa.Text(), nullable=True),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.Column("default_preset", analysis_preset_enum, nullable=True),
        sa.Column("default_params", sa.JSON(), nullable=True),
        sa.Column("template", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_unique_constraint("uq_channels_slug", "channels", ["slug"])
    op.create_index("ix_channels_slug", "channels", ["slug"])

    op.add_column(
        "platform_accounts",
        sa.Column("channel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("channels.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_platform_accounts_channel_id", "platform_accounts", ["channel_id"])
    op.create_unique_constraint(
        "uq_platform_accounts_channel_platform", "platform_accounts", ["channel_id", "platform"]
    )

    op.add_column(
        "media_assets",
        sa.Column("channel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("channels.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_media_assets_channel_id", "media_assets", ["channel_id"])

    op.add_column(
        "sources",
        sa.Column(
            "default_channel_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("channels.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_sources_default_channel_id", "sources", ["default_channel_id"])

    op.add_column(
        "analysis_jobs",
        sa.Column("channel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("channels.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_analysis_jobs_channel_id", "analysis_jobs", ["channel_id"])

    op.add_column(
        "clips",
        sa.Column("channel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("channels.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_clips_channel_id", "clips", ["channel_id"])


def downgrade() -> None:
    op.drop_index("ix_clips_channel_id", table_name="clips")
    op.drop_column("clips", "channel_id")

    op.drop_index("ix_analysis_jobs_channel_id", table_name="analysis_jobs")
    op.drop_column("analysis_jobs", "channel_id")

    op.drop_index("ix_sources_default_channel_id", table_name="sources")
    op.drop_column("sources", "default_channel_id")

    op.drop_index("ix_media_assets_channel_id", table_name="media_assets")
    op.drop_column("media_assets", "channel_id")

    op.drop_constraint("uq_platform_accounts_channel_platform", "platform_accounts", type_="unique")
    op.drop_index("ix_platform_accounts_channel_id", table_name="platform_accounts")
    op.drop_column("platform_accounts", "channel_id")

    op.drop_index("ix_channels_slug", table_name="channels")
    op.drop_constraint("uq_channels_slug", "channels", type_="unique")
    op.drop_table("channels")

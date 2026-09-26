"""analysis jobs, clips, clip metadata, platform accounts, publications, audit log

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-26

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

analysis_job_status_enum = postgresql.ENUM(
    "queued", "running", "done", "failed", "canceled",
    name="analysis_job_status", create_type=False,
)
analysis_preset_enum = postgresql.ENUM(
    "action", "drama", "comedy", "suspense", "custom",
    name="analysis_preset", create_type=False,
)
clip_status_enum = postgresql.ENUM(
    "rendering", "pending_review", "approved", "rejected", "failed",
    name="clip_status", create_type=False,
)
platform_enum = postgresql.ENUM(
    "youtube", "tiktok", "bilibili", "instagram", "facebook",
    name="platform", create_type=False,
)
account_mode_enum = postgresql.ENUM(
    "oauth", "manual",
    name="account_mode", create_type=False,
)
account_status_enum = postgresql.ENUM(
    "connected", "expired", "error", "manual",
    name="account_status", create_type=False,
)
publication_status_enum = postgresql.ENUM(
    "blocked", "scheduled", "publishing", "published", "failed", "canceled", "taken_down", "exported",
    name="publication_status", create_type=False,
)
publication_privacy_enum = postgresql.ENUM(
    "private", "public", "self_only",
    name="publication_privacy", create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    analysis_job_status_enum.create(bind, checkfirst=True)
    analysis_preset_enum.create(bind, checkfirst=True)
    clip_status_enum.create(bind, checkfirst=True)
    platform_enum.create(bind, checkfirst=True)
    account_mode_enum.create(bind, checkfirst=True)
    account_status_enum.create(bind, checkfirst=True)
    publication_status_enum.create(bind, checkfirst=True)
    publication_privacy_enum.create(bind, checkfirst=True)

    op.create_table(
        "analysis_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("media_asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("media_assets.id"), nullable=False),
        sa.Column("status", analysis_job_status_enum, nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stage", sa.String(length=255), nullable=True),
        sa.Column("preset", analysis_preset_enum, nullable=False),
        sa.Column("params", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_analysis_jobs_media_asset_id", "analysis_jobs", ["media_asset_id"])

    op.create_table(
        "clips",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("analysis_jobs.id"), nullable=False),
        sa.Column("media_asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("media_assets.id"), nullable=False),
        sa.Column("start_s", sa.Float(), nullable=False),
        sa.Column("end_s", sa.Float(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("signals", sa.JSON(), nullable=True),
        sa.Column("storage_key", sa.String(length=1024), nullable=True),
        sa.Column("thumbnail_key", sa.String(length=1024), nullable=True),
        sa.Column("subtitles_key", sa.String(length=1024), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("status", clip_status_enum, nullable=False, server_default="rendering"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_clips_job_id", "clips", ["job_id"])
    op.create_index("ix_clips_media_asset_id", "clips", ["media_asset_id"])

    op.create_table(
        "clip_metadata",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clips.id"), nullable=False),
        sa.Column("platform", platform_enum, nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("hashtags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("edited", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_clip_metadata_clip_id", "clip_metadata", ["clip_id"])
    op.create_unique_constraint("uq_clip_metadata_clip_platform", "clip_metadata", ["clip_id", "platform"])

    op.create_table(
        "platform_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("platform", platform_enum, nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("mode", account_mode_enum, nullable=False, server_default="manual"),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column("encrypted_access_token", sa.String(length=2048), nullable=True),
        sa.Column("encrypted_refresh_token", sa.String(length=2048), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scopes", sa.JSON(), nullable=True),
        sa.Column("status", account_status_enum, nullable=False, server_default="manual"),
        sa.Column("daily_limit", sa.Integer(), nullable=True),
        sa.Column("posting_windows", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="America/Sao_Paulo"),
        sa.Column("template", sa.JSON(), nullable=True),
        sa.Column("monetized", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "publications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clips.id"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("platform_accounts.id"), nullable=False),
        sa.Column("platform", platform_enum, nullable=False),
        sa.Column("status", publication_status_enum, nullable=False, server_default="blocked"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("external_post_id", sa.String(length=255), nullable=True),
        sa.Column("external_url", sa.String(length=1024), nullable=True),
        sa.Column("privacy", publication_privacy_enum, nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("block_reasons", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_publications_clip_id", "publications", ["clip_id"])
    op.create_index("ix_publications_account_id", "publications", ["account_id"])

    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("entity", sa.String(length=100), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_log_user_id", table_name="audit_log")
    op.drop_table("audit_log")

    op.drop_index("ix_publications_account_id", table_name="publications")
    op.drop_index("ix_publications_clip_id", table_name="publications")
    op.drop_table("publications")

    op.drop_table("platform_accounts")

    op.drop_constraint("uq_clip_metadata_clip_platform", "clip_metadata", type_="unique")
    op.drop_index("ix_clip_metadata_clip_id", table_name="clip_metadata")
    op.drop_table("clip_metadata")

    op.drop_index("ix_clips_media_asset_id", table_name="clips")
    op.drop_index("ix_clips_job_id", table_name="clips")
    op.drop_table("clips")

    op.drop_index("ix_analysis_jobs_media_asset_id", table_name="analysis_jobs")
    op.drop_table("analysis_jobs")

    publication_privacy_enum.drop(op.get_bind(), checkfirst=True)
    publication_status_enum.drop(op.get_bind(), checkfirst=True)
    account_status_enum.drop(op.get_bind(), checkfirst=True)
    account_mode_enum.drop(op.get_bind(), checkfirst=True)
    platform_enum.drop(op.get_bind(), checkfirst=True)
    clip_status_enum.drop(op.get_bind(), checkfirst=True)
    analysis_preset_enum.drop(op.get_bind(), checkfirst=True)
    analysis_job_status_enum.drop(op.get_bind(), checkfirst=True)

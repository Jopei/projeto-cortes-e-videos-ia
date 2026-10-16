"""Series IA: story_* tables, ai_usage_events, clips/publications/users changes

New tables (portable types, enums as VARCHAR(32) — no native Postgres enums):
story_series, story_characters, story_episodes, story_character_events,
story_media_jobs, ai_usage_events.

Altered:
- clips: job_id/media_asset_id nullable; episode_id (FK story_episodes, SET
  NULL, UNIQUE); synthetic_media bool NOT NULL default false; CHECK
  ck_clips_origin ((job_id AND media_asset_id) OR episode_id).
- publications.synthetic_media bool NOT NULL default false.
- users.max_active_series, users.monthly_ai_budget_usd (nullable).

All additive/backward compatible (existing rows satisfy the CHECK: they have
job_id and media_asset_id). Downgrade drops everything; it refuses to run if
any clip is episode-origin (job_id/media_asset_id NULL), since restoring NOT
NULL would fail/lose data — delete those clips first.

Revision ID: 0010
Revises: 0009
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _uuid_pk() -> sa.Column:
    return sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True)


def _fk(name: str, target: str, *, nullable: bool = False, ondelete: str | None = None, index: bool = False):
    return sa.Column(
        name,
        sa.Uuid(as_uuid=True),
        sa.ForeignKey(target, ondelete=ondelete),
        nullable=nullable,
        index=index,
    )


def _ts(name: str, *, nullable: bool = False, default_now: bool = False, index: bool = False) -> sa.Column:
    return sa.Column(
        name,
        sa.DateTime(timezone=True),
        nullable=nullable,
        server_default=sa.func.now() if default_now else None,
        index=index,
    )


def _money(name: str, *, nullable: bool = False, zero: bool = False) -> sa.Column:
    return sa.Column(
        name,
        sa.Numeric(12, 4),
        nullable=nullable,
        server_default="0" if zero else None,
    )


def upgrade() -> None:
    op.create_table(
        "story_series",
        _uuid_pk(),
        _fk("owner_id", "users.id", index=True),
        _fk("channel_id", "channels.id", nullable=True, ondelete="SET NULL", index=True),
        _fk("source_id", "sources.id", index=True),
        sa.Column("title", sa.String(120)),
        sa.Column("premise", sa.Text, nullable=False),
        sa.Column("genre", sa.String(60)),
        sa.Column("tone", sa.String(60)),
        sa.Column("language", sa.String(10), nullable=False, server_default="pt-BR"),
        sa.Column("episode_count", sa.Integer, nullable=False, server_default="20"),
        sa.Column("episode_duration_s", sa.Integer, nullable=False, server_default="30"),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="America/Sao_Paulo"),
        sa.Column("publish_time", sa.String(5), nullable=False),
        sa.Column("start_date", sa.Date),
        sa.Column("lead_days", sa.Integer, nullable=False, server_default="2"),
        sa.Column("privacy", sa.String(16), nullable=False, server_default="public"),
        sa.Column("visual_strategy", sa.String(16), nullable=False, server_default="hybrid"),
        sa.Column("max_video_scenes_per_episode", sa.Integer, nullable=False, server_default="1"),
        sa.Column("video_provider", sa.String(32)),
        sa.Column("video_options", sa.JSON),
        sa.Column("image_provider", sa.String(32)),
        sa.Column("image_options", sa.JSON),
        sa.Column("tts_provider", sa.String(32)),
        sa.Column("tts_voice_id", sa.String(128)),
        sa.Column("tts_options", sa.JSON),
        sa.Column("planner_model", sa.String(64)),
        sa.Column("writer_model", sa.String(64)),
        sa.Column("bible", sa.JSON),
        sa.Column("bible_version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("status", sa.String(32), nullable=False, index=True),
        sa.Column("pause_reason", sa.String(40)),
        sa.Column("error", sa.Text),
        sa.Column("require_script_approval", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("max_regenerations_per_episode", sa.Integer, nullable=False, server_default="3"),
        _money("budget_limit_usd", nullable=True),
        _money("cost_usd_total", zero=True),
        _ts("originality_attested_at"),
        _ts("created_at", default_now=True),
        _ts("updated_at", default_now=True),
        sa.CheckConstraint("episode_count = 20", name="ck_story_series_episode_count"),
        sa.CheckConstraint("episode_duration_s = 30", name="ck_story_series_episode_duration"),
        sa.CheckConstraint("lead_days BETWEEN 1 AND 2", name="ck_story_series_lead_days"),
    )

    op.create_table(
        "story_characters",
        _uuid_pk(),
        _fk("series_id", "story_series.id", ondelete="CASCADE", index=True),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("visual_description", sa.Text, nullable=False),
        sa.Column("personality", sa.Text),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("committed", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("introduced_in_episode", sa.Integer),
        sa.Column("reference_image_key", sa.String(1024)),
        _ts("created_at", default_now=True),
        sa.UniqueConstraint("series_id", "key", name="uq_story_characters_series_key"),
    )

    op.create_table(
        "story_episodes",
        _uuid_pk(),
        _fk("owner_id", "users.id", index=True),
        _fk("series_id", "story_series.id", ondelete="CASCADE", index=True),
        sa.Column("number", sa.Integer, nullable=False),
        sa.Column("title", sa.String(255)),
        sa.Column("arc_phase", sa.String(32)),
        sa.Column("outline", sa.JSON),
        sa.Column("script", sa.JSON),
        sa.Column("script_revision", sa.Integer, nullable=False, server_default="0"),
        sa.Column("user_instructions", sa.Text),
        sa.Column("validation", sa.JSON),
        sa.Column("validation_attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("regenerations", sa.Integer, nullable=False, server_default="0"),
        sa.Column("status", sa.String(32), nullable=False, index=True),
        sa.Column("error", sa.Text),
        sa.Column("target_date", sa.Date, index=True),
        _ts("scheduled_at", nullable=True),
        _money("cost_usd", zero=True),
        _ts("approved_at", nullable=True),
        _fk("approved_by", "users.id", nullable=True, ondelete="SET NULL"),
        _ts("created_at", default_now=True),
        _ts("updated_at", default_now=True),
        sa.UniqueConstraint("series_id", "number", name="uq_story_episodes_series_number"),
    )

    op.create_table(
        "story_character_events",
        _uuid_pk(),
        _fk("series_id", "story_series.id", ondelete="CASCADE", index=True),
        _fk("character_id", "story_characters.id", ondelete="CASCADE", index=True),
        _fk("episode_id", "story_episodes.id", ondelete="CASCADE", index=True),
        sa.Column("episode_number", sa.Integer, nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("from_status", sa.String(32)),
        sa.Column("to_status", sa.String(32)),
        sa.Column("description", sa.Text),
        sa.Column("state", sa.String(32), nullable=False),
        _ts("applied_at", nullable=True),
        _ts("created_at", default_now=True),
    )

    op.create_table(
        "story_media_jobs",
        _uuid_pk(),
        _fk("owner_id", "users.id", index=True),
        _fk("episode_id", "story_episodes.id", ondelete="CASCADE", index=True),
        sa.Column("script_revision", sa.Integer, nullable=False, server_default="0"),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("scene_index", sa.Integer),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("provider_job_id", sa.String(255)),
        sa.Column("prompt", sa.Text),
        sa.Column("params", sa.JSON),
        sa.Column("status", sa.String(32), nullable=False, index=True),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        _ts("next_poll_at", nullable=True, index=True),
        _ts("submitted_at", nullable=True),
        _ts("finished_at", nullable=True),
        sa.Column("storage_key", sa.String(1024)),
        sa.Column("size_bytes", sa.BigInteger),
        sa.Column("duration_s", sa.Float),
        _money("cost_usd_estimated", nullable=True),
        _money("cost_usd_actual", nullable=True),
        sa.Column("error", sa.Text),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        _ts("created_at", default_now=True),
        sa.UniqueConstraint("idempotency_key", name="uq_story_media_jobs_idempotency_key"),
    )

    op.create_table(
        "ai_usage_events",
        _uuid_pk(),
        _fk("owner_id", "users.id", index=True),
        _fk("series_id", "story_series.id", nullable=True, ondelete="CASCADE", index=True),
        _fk("episode_id", "story_episodes.id", nullable=True, ondelete="SET NULL"),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("model", sa.String(64)),
        sa.Column("units", sa.JSON),
        _money("cost_usd", zero=True),
        _ts("created_at", default_now=True, index=True),
    )

    # clips: allow episode-origin rows
    op.alter_column("clips", "job_id", nullable=True)
    op.alter_column("clips", "media_asset_id", nullable=True)
    op.add_column(
        "clips",
        sa.Column(
            "episode_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("story_episodes.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_unique_constraint("uq_clips_episode_id", "clips", ["episode_id"])
    op.add_column(
        "clips", sa.Column("synthetic_media", sa.Boolean, nullable=False, server_default=sa.false())
    )
    op.create_check_constraint(
        "ck_clips_origin",
        "clips",
        "(job_id IS NOT NULL AND media_asset_id IS NOT NULL) OR episode_id IS NOT NULL",
    )

    op.add_column(
        "publications", sa.Column("synthetic_media", sa.Boolean, nullable=False, server_default=sa.false())
    )
    op.add_column("users", sa.Column("max_active_series", sa.Integer, nullable=True))
    op.add_column("users", sa.Column("monthly_ai_budget_usd", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.execute(
        sa.text("SELECT 1 FROM clips WHERE job_id IS NULL OR media_asset_id IS NULL LIMIT 1")
    ).first():
        raise RuntimeError(
            "Cannot downgrade: clips has episode-origin row(s) (job_id/media_asset_id NULL). "
            "Delete those clips (and AI series) before downgrading past 0010."
        )
    op.drop_column("users", "monthly_ai_budget_usd")
    op.drop_column("users", "max_active_series")
    op.drop_column("publications", "synthetic_media")
    op.drop_constraint("ck_clips_origin", "clips", type_="check")
    op.drop_column("clips", "synthetic_media")
    op.drop_constraint("uq_clips_episode_id", "clips", type_="unique")
    op.drop_column("clips", "episode_id")
    op.alter_column("clips", "media_asset_id", nullable=False)
    op.alter_column("clips", "job_id", nullable=False)
    op.drop_table("ai_usage_events")
    op.drop_table("story_media_jobs")
    op.drop_table("story_character_events")
    op.drop_table("story_episodes")
    op.drop_table("story_characters")
    op.drop_table("story_series")

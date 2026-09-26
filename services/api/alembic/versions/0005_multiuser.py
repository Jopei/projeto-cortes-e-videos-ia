"""multi-tenant: per-user ownership, quotas, admin user management

Every domain-data table (`sources`, `media_assets`, `channels`,
`analysis_jobs`, `clips`, `platform_accounts`, `publications`) gets a
NOT NULL `owner_id` FK to `users.id` — this is the tenant boundary the API
scopes every query on (see `app/scope.py::get_scope`). `clip_metadata` does
NOT get its own `owner_id`: it's always reached through its `Clip`
(`clip.owner_id`), same as `audit_log`, which already had `user_id`.

`channels.slug` moves from a globally-unique constraint to unique
per-`(owner_id, slug)` — two different users can now both have a channel
named "principal".

`users` gains display/contact fields, a `must_change_password` flag (set by
admin-driven password resets/creates), and three nullable quota columns
(`NULL` = unlimited): `storage_quota_bytes`, `daily_analysis_quota`,
`max_channels`.

`media_assets.size_bytes` / `clips.size_bytes` back the storage-quota
calculation (sum of both, per owner) — populated by the tusd `post-finish`
hook (`Upload.Size`) and by `render_clip` respectively; both start out NULL
for pre-existing rows (treated as 0 by the quota helper).

Backfill strategy for the new NOT NULL `owner_id` columns: every existing
row is assigned to the oldest admin user (`is_admin=true`, earliest
`created_at`), falling back to the oldest user of any kind if no admin
exists. If a table has rows but there is truly no user at all to backfill
with, the subsequent `ALTER COLUMN ... SET NOT NULL` intentionally fails
loudly rather than fabricate an owner.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-26

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tables that get a new NOT-NULL `owner_id` FK -> users.id.
OWNED_TABLES = [
    "sources",
    "media_assets",
    "channels",
    "analysis_jobs",
    "clips",
    "platform_accounts",
    "publications",
]

_BACKFILL_OWNER_SQL = """
UPDATE {table}
SET owner_id = (
    SELECT id FROM users
    ORDER BY (NOT is_admin), created_at ASC
    LIMIT 1
)
WHERE owner_id IS NULL
"""


def upgrade() -> None:
    # --- users: new profile/quota/password-policy columns ---
    op.add_column("users", sa.Column("display_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("email", sa.String(length=255), nullable=True))
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("users", sa.Column("storage_quota_bytes", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("daily_analysis_quota", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("max_channels", sa.Integer(), nullable=True))

    # --- owner_id: add nullable, backfill, then enforce NOT NULL ---
    for table in OWNED_TABLES:
        op.add_column(
            table,
            sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        )

    bind = op.get_bind()
    for table in OWNED_TABLES:
        bind.execute(sa.text(_BACKFILL_OWNER_SQL.format(table=table)))

    for table in OWNED_TABLES:
        op.alter_column(table, "owner_id", nullable=False)
        op.create_index(f"ix_{table}_owner_id", table, ["owner_id"])

    # --- channels.slug: global unique -> unique per (owner_id, slug) ---
    op.drop_constraint("uq_channels_slug", "channels", type_="unique")
    op.drop_index("ix_channels_slug", table_name="channels")
    op.create_index("ix_channels_slug", "channels", ["slug"])
    op.create_unique_constraint("uq_channels_owner_slug", "channels", ["owner_id", "slug"])

    # --- size_bytes (storage-quota accounting) ---
    op.add_column("media_assets", sa.Column("size_bytes", sa.BigInteger(), nullable=True))
    op.add_column("clips", sa.Column("size_bytes", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("clips", "size_bytes")
    op.drop_column("media_assets", "size_bytes")

    op.drop_constraint("uq_channels_owner_slug", "channels", type_="unique")
    op.drop_index("ix_channels_slug", table_name="channels")
    op.create_index("ix_channels_slug", "channels", ["slug"])
    op.create_unique_constraint("uq_channels_slug", "channels", ["slug"])

    for table in OWNED_TABLES:
        op.drop_index(f"ix_{table}_owner_id", table_name=table)
        op.drop_column(table, "owner_id")

    op.drop_column("users", "max_channels")
    op.drop_column("users", "daily_analysis_quota")
    op.drop_column("users", "storage_quota_bytes")
    op.drop_column("users", "must_change_password")
    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.drop_column("users", "email")
    op.drop_column("users", "display_name")

"""add vimeo to the platform enum

Adds `'vimeo'` as a value of the shared Postgres enum type `platform`
(reused by `clip_metadata.platform`, `platform_accounts.platform` and
`publications.platform` — see `app/models/enums.py::Platform`).

`ALTER TYPE ... ADD VALUE` cannot run inside the transaction block Alembic
wraps migrations in by default (Postgres forbids using a brand-new enum
value in the same transaction that added it, and in older versions even
just adding it inside an explicit transaction was rejected outright) — so
`upgrade()` runs it inside `op.get_context().autocommit_block()`, which
commits the current transaction, runs the ALTER TYPE on its own, and
resumes.

Downgrade: Postgres has no `DROP VALUE` for enums — the only way to truly
remove one is to recreate the type from scratch. We do that here (rename
`platform` -> `platform_old`, create a fresh `platform` without `'vimeo'`,
`ALTER ... USING` each of the three columns across, drop the old type) but
ONLY after checking that no row actually uses `'vimeo'` — if one does, the
downgrade aborts with a clear error instead of silently corrupting data
(there is no safe automatic remap: deleting/reassigning those rows is a
product decision, not something a migration should decide on its own).
This keeps `downgrade()` safe to run in the common case (vimeo was added
but never used) while refusing to run in the unsafe one.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ENUM_COLUMNS = [
    ("clip_metadata", "platform"),
    ("platform_accounts", "platform"),
    ("publications", "platform"),
]


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE platform ADD VALUE IF NOT EXISTS 'vimeo'")


def downgrade() -> None:
    bind = op.get_bind()
    for table, column in _ENUM_COLUMNS:
        in_use = bind.execute(
            sa.text(f"SELECT 1 FROM {table} WHERE {column} = 'vimeo' LIMIT 1")
        ).first()
        if in_use is not None:
            raise RuntimeError(
                f"Cannot downgrade: {table}.{column} has row(s) using the 'vimeo' platform value. "
                "Reassign or delete those rows before downgrading past 0008."
            )

    op.execute("ALTER TYPE platform RENAME TO platform_old")
    op.execute(
        "CREATE TYPE platform AS ENUM ('youtube', 'tiktok', 'bilibili', 'instagram', 'facebook')"
    )
    for table, column in _ENUM_COLUMNS:
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN {column} TYPE platform "
            f"USING {column}::text::platform"
        )
    op.execute("DROP TYPE platform_old")

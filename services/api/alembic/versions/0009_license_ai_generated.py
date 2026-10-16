"""add 'ai_generated' to the license_type enum

Series IA: each AI series owns a `Source` with `license_type = 'ai_generated'`.

`ALTER TYPE ... ADD VALUE` runs inside `autocommit_block()` (same pattern as
0008). Downgrade recreates the type without the value (rename, create, ALTER
... USING, drop old) and aborts with a clear error if any `sources` row still
uses 'ai_generated' — no silent remap/delete.

Revision ID: 0009
Revises: 0008
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE license_type ADD VALUE IF NOT EXISTS 'ai_generated'")


def downgrade() -> None:
    bind = op.get_bind()
    in_use = bind.execute(
        sa.text("SELECT 1 FROM sources WHERE license_type = 'ai_generated' LIMIT 1")
    ).first()
    if in_use is not None:
        raise RuntimeError(
            "Cannot downgrade: sources.license_type has row(s) using 'ai_generated'. "
            "Delete those sources (and their AI series) before downgrading past 0009."
        )
    op.execute("ALTER TYPE license_type RENAME TO license_type_old")
    op.execute(
        "CREATE TYPE license_type AS ENUM "
        "('public_domain', 'cc_by', 'cc_by_sa', 'cc_by_nc', 'cc_by_nd', 'licensed', 'own')"
    )
    op.execute(
        "ALTER TABLE sources ALTER COLUMN license_type TYPE license_type "
        "USING license_type::text::license_type"
    )
    op.execute("DROP TYPE license_type_old")

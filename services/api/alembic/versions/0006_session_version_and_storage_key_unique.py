"""session revocation + upload idempotency

Security audit fixes (see CLAUDE.md "Auth"):

- `users.session_version` (int, not null, default 0): stamped into the
  session JWT's `sv` claim (`app/security.py::create_session_token`) and
  re-checked on every request (`app/deps.py::resolve_user_from_cookie`).
  Bumping it invalidates every cookie issued before that point — done on
  the user's own password change, an admin password reset, deactivation,
  and any change to `is_admin` (see `app/routers/auth.py`/
  `app/routers/admin_users.py`).
- `media_assets.storage_key` gets a unique constraint: `post-finish` (tusd
  hook, `app/routers/uploads.py`) is now idempotent by `storage_key` — a
  replayed/duplicate call for the same finished upload returns the existing
  `MediaAsset` instead of erroring or duplicating. Pre-existing rows are
  assumed already unique in practice (each is tied to a distinct tusd
  upload id or worker-generated key); the constraint would fail loudly on
  upgrade if that's somehow not the case, which is the correct behavior
  (surface the data problem rather than silently constrain around it).

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-26

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_unique_constraint("uq_media_assets_storage_key", "media_assets", ["storage_key"])


def downgrade() -> None:
    op.drop_constraint("uq_media_assets_storage_key", "media_assets", type_="unique")
    op.drop_column("users", "session_version")

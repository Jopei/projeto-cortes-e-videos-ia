"""Small ORM/raw-SQL helpers to build fixtures the built-in `conftest.py`
fixtures don't cover (custom Source license fields, Clip/PlatformAccount
rows). Kept separate from conftest.py so individual tests can pick exactly
what they need instead of stacking indirect fixtures.

Multi-tenant note: every row these helpers create now has an `owner_id`.
Rather than forcing every one of the ~100 pre-existing (single-tenant) call
sites across the test suite to pass `owner_id=...` explicitly, each
`insert_*` function falls back to a module-level "default owner" when
`owner_id` isn't given — set automatically by the `user` fixture in
`conftest.py` (`factories.set_default_owner(user.id)`), so any test that
depends on `user`/`logged_in_client` (directly or transitively) gets
everything scoped to that one user, exactly like before multi-tenancy
existed. Tests that exercise cross-tenant isolation pass `owner_id=...`
explicitly (typically `other_user.id`) to attach a row to a *different*
tenant on purpose.
"""

from __future__ import annotations

import contextvars
import uuid
from datetime import datetime, timezone

from sqlalchemy import text

from app.models.analysis_job import AnalysisJob, Preset
from app.models.channel import Channel
from app.models.clip import Clip, ClipStatus
from app.models.platform_account import AccountMode, AccountStatus, PlatformAccount

_default_owner: contextvars.ContextVar[uuid.UUID | None] = contextvars.ContextVar("default_owner", default=None)


def set_default_owner(owner_id: uuid.UUID) -> None:
    _default_owner.set(owner_id)


def _resolve_owner(owner_id: uuid.UUID | None) -> uuid.UUID:
    if owner_id is not None:
        return owner_id
    resolved = _default_owner.get()
    if resolved is None:
        raise RuntimeError(
            "owner_id not provided and no default owner is set — depend on the `user` fixture "
            "(directly or transitively) or pass owner_id explicitly."
        )
    return resolved


def insert_source(
    session_factory,
    *,
    owner_id: uuid.UUID | None = None,
    license_type: str = "cc_by",
    allowed_platforms: str = "",
    monetization_allowed: bool = False,
) -> uuid.UUID:
    """A Source row via raw SQL (see conftest.SOURCES_TABLE_DDL — Source uses
    postgres-only ARRAY/UUID types that don't survive `create_all` on
    sqlite). `allowed_platforms` is a comma-joined string per the sqlite test
    schema's plain TEXT column; leave empty for "no restriction recorded".
    """
    owner = _resolve_owner(owner_id)
    new_id = uuid.uuid4()
    db = session_factory()
    db.execute(
        text(
            "INSERT INTO sources (id, owner_id, title, work_name, license_type, allowed_platforms, territories,"
            " monetization_allowed, created_at)"
            " VALUES (:id, :owner_id, :title, :work_name, :license_type, :ap, :te, :monetized, :created_at)"
        ),
        {
            "id": new_id.hex,
            "owner_id": owner.hex,
            "title": "Test source",
            "work_name": "Test work",
            "license_type": license_type,
            "ap": allowed_platforms,
            "te": "",
            "monetized": 1 if monetization_allowed else 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.commit()
    db.close()
    return new_id


def insert_media_asset(
    session_factory, source_id: uuid.UUID, *, owner_id: uuid.UUID | None = None, size_bytes: int | None = None
) -> uuid.UUID:
    owner = _resolve_owner(owner_id)
    new_id = uuid.uuid4()
    db = session_factory()
    db.execute(
        text(
            "INSERT INTO media_assets (id, owner_id, source_id, filename, storage_key, size_bytes, status, created_at)"
            " VALUES (:id, :owner_id, :source_id, :filename, :storage_key, :size_bytes, 'ready', :created_at)"
        ),
        {
            "id": new_id.hex,
            "owner_id": owner.hex,
            "source_id": source_id.hex,
            "filename": "t.mp4",
            "storage_key": "media-assets/t.mp4",
            "size_bytes": size_bytes,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.commit()
    db.close()
    return new_id


def insert_clip(
    session_factory,
    *,
    media_asset_id: uuid.UUID,
    owner_id: uuid.UUID | None = None,
    status: ClipStatus = ClipStatus.APPROVED,
    storage_key: str | None = "clips/c.mp4",
    channel_id: uuid.UUID | None = None,
    size_bytes: int | None = None,
) -> uuid.UUID:
    owner = _resolve_owner(owner_id)
    db = session_factory()
    job = AnalysisJob(owner_id=owner, media_asset_id=media_asset_id, channel_id=channel_id, preset=Preset.ACTION, params={})
    db.add(job)
    db.flush()
    clip = Clip(
        owner_id=owner,
        job_id=job.id,
        media_asset_id=media_asset_id,
        channel_id=channel_id,
        start_s=0.0,
        end_s=30.0,
        status=status,
        storage_key=storage_key,
        size_bytes=size_bytes,
    )
    db.add(clip)
    db.commit()
    db.refresh(clip)
    clip_id = clip.id
    db.close()
    return clip_id


def insert_account(
    session_factory,
    *,
    owner_id: uuid.UUID | None = None,
    platform: str = "youtube",
    mode: AccountMode = AccountMode.MANUAL,
    monetized: bool = False,
    daily_limit: int | None = None,
    posting_windows: list[dict] | None = None,
    timezone_name: str = "UTC",
    channel_id: uuid.UUID | None = None,
) -> uuid.UUID:
    owner = _resolve_owner(owner_id)
    db = session_factory()
    account = PlatformAccount(
        owner_id=owner,
        platform=platform,
        display_name="Test Account",
        channel_id=channel_id,
        mode=mode,
        status=AccountStatus.MANUAL if mode == AccountMode.MANUAL else AccountStatus.CONNECTED,
        monetized=monetized,
        daily_limit=daily_limit,
        posting_windows=posting_windows or [],
        timezone=timezone_name,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    account_id = account.id
    db.close()
    return account_id


def insert_channel(
    session_factory,
    *,
    owner_id: uuid.UUID | None = None,
    name: str = "Test Channel",
    slug: str | None = None,
    default_preset: Preset | None = None,
    default_params: dict | None = None,
    template: dict | None = None,
) -> uuid.UUID:
    owner = _resolve_owner(owner_id)
    db = session_factory()
    channel = Channel(
        owner_id=owner,
        name=name,
        slug=slug or f"test-channel-{uuid.uuid4().hex[:8]}",
        default_preset=default_preset,
        default_params=default_params,
        template=template,
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)
    channel_id = channel.id
    db.close()
    return channel_id

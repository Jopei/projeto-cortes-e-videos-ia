"""Small ORM/raw-SQL helpers to build fixtures the built-in `conftest.py`
fixtures don't cover (custom Source license fields, Clip/PlatformAccount
rows). Kept separate from conftest.py so individual tests can pick exactly
what they need instead of stacking indirect fixtures.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import text

from app.models.analysis_job import AnalysisJob, Preset
from app.models.channel import Channel
from app.models.clip import Clip, ClipStatus
from app.models.platform_account import AccountMode, AccountStatus, PlatformAccount


def insert_source(
    session_factory,
    *,
    license_type: str = "cc_by",
    allowed_platforms: str = "",
    monetization_allowed: bool = False,
) -> uuid.UUID:
    """A Source row via raw SQL (see conftest.SOURCES_TABLE_DDL — Source uses
    postgres-only ARRAY/UUID types that don't survive `create_all` on
    sqlite). `allowed_platforms` is a comma-joined string per the sqlite test
    schema's plain TEXT column; leave empty for "no restriction recorded".
    """
    new_id = uuid.uuid4()
    db = session_factory()
    db.execute(
        text(
            "INSERT INTO sources (id, title, work_name, license_type, allowed_platforms, territories,"
            " monetization_allowed, created_at)"
            " VALUES (:id, :title, :work_name, :license_type, :ap, :te, :monetized, :created_at)"
        ),
        {
            "id": new_id.hex,
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


def insert_media_asset(session_factory, source_id: uuid.UUID) -> uuid.UUID:
    new_id = uuid.uuid4()
    db = session_factory()
    db.execute(
        text(
            "INSERT INTO media_assets (id, source_id, filename, storage_key, status, created_at)"
            " VALUES (:id, :source_id, :filename, :storage_key, 'ready', :created_at)"
        ),
        {
            "id": new_id.hex,
            "source_id": source_id.hex,
            "filename": "t.mp4",
            "storage_key": "media-assets/t.mp4",
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
    status: ClipStatus = ClipStatus.APPROVED,
    storage_key: str | None = "clips/c.mp4",
    channel_id: uuid.UUID | None = None,
) -> uuid.UUID:
    db = session_factory()
    job = AnalysisJob(media_asset_id=media_asset_id, channel_id=channel_id, preset=Preset.ACTION, params={})
    db.add(job)
    db.flush()
    clip = Clip(
        job_id=job.id,
        media_asset_id=media_asset_id,
        channel_id=channel_id,
        start_s=0.0,
        end_s=30.0,
        status=status,
        storage_key=storage_key,
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
    platform: str = "youtube",
    mode: AccountMode = AccountMode.MANUAL,
    monetized: bool = False,
    daily_limit: int | None = None,
    posting_windows: list[dict] | None = None,
    timezone_name: str = "UTC",
    channel_id: uuid.UUID | None = None,
) -> uuid.UUID:
    db = session_factory()
    account = PlatformAccount(
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
    name: str = "Test Channel",
    slug: str | None = None,
    default_preset: Preset | None = None,
    default_params: dict | None = None,
    template: dict | None = None,
) -> uuid.UUID:
    db = session_factory()
    channel = Channel(
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

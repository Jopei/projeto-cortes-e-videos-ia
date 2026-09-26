from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app.scheduling import find_next_slot


def test_no_posting_windows_returns_after_as_is(session_factory):
    db = session_factory()
    account_id = uuid.uuid4()
    after = datetime(2026, 1, 5, 10, 0, tzinfo=timezone.utc)  # Monday
    slot = find_next_slot(
        db,
        account_id=account_id,
        posting_windows=[],
        daily_limit=None,
        timezone_name="UTC",
        after=after,
        extra_counts={},
    )
    assert slot == after
    db.close()


def test_slot_pushed_forward_to_next_window_start(session_factory):
    db = session_factory()
    account_id = uuid.uuid4()
    after = datetime(2026, 1, 5, 10, 0, tzinfo=timezone.utc)  # Monday 10:00, before the 18:00 window
    windows = [{"days": [0, 1, 2, 3, 4], "start": "18:00", "end": "22:00"}]
    slot = find_next_slot(
        db,
        account_id=account_id,
        posting_windows=windows,
        daily_limit=None,
        timezone_name="UTC",
        after=after,
        extra_counts={},
    )
    assert slot == datetime(2026, 1, 5, 18, 0, tzinfo=timezone.utc)
    db.close()


def test_slot_skips_to_next_allowed_weekday(session_factory):
    db = session_factory()
    account_id = uuid.uuid4()
    after = datetime(2026, 1, 10, 10, 0, tzinfo=timezone.utc)  # Saturday
    windows = [{"days": [0], "start": "09:00", "end": "10:00"}]  # Mondays only
    slot = find_next_slot(
        db,
        account_id=account_id,
        posting_windows=windows,
        daily_limit=None,
        timezone_name="UTC",
        after=after,
        extra_counts={},
    )
    assert slot == datetime(2026, 1, 12, 9, 0, tzinfo=timezone.utc)  # next Monday
    db.close()


def test_daily_limit_pushes_extra_slot_to_next_day(session_factory):
    db = session_factory()
    account_id = uuid.uuid4()
    after = datetime(2026, 1, 5, 10, 0, tzinfo=timezone.utc)  # Monday
    windows = [{"days": [0, 1, 2, 3, 4, 5, 6], "start": "10:00", "end": "23:00"}]
    extra_counts: dict = {}

    first = find_next_slot(
        db, account_id=account_id, posting_windows=windows, daily_limit=1, timezone_name="UTC",
        after=after, extra_counts=extra_counts,
    )
    second = find_next_slot(
        db, account_id=account_id, posting_windows=windows, daily_limit=1, timezone_name="UTC",
        after=after, extra_counts=extra_counts,
    )
    assert first.date() == after.date()
    assert second.date() == after.date() + timedelta(days=1)
    db.close()

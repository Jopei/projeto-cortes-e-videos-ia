""""auto" scheduling for `POST /api/publications/batch`: finds the next free
slot for an account that respects both its `posting_windows` (account-local
time) and its `daily_limit` (max Publications per local calendar day).

Pure-ish: takes a `Session` to count already-scheduled Publications, but the
actual "what counts as a day/slot" math is plain datetime arithmetic so it's
easy to unit test without spinning up the whole API.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.publication import Publication, PublicationStatus

_OCCUPYING_STATUSES = (PublicationStatus.SCHEDULED, PublicationStatus.PUBLISHING, PublicationStatus.PUBLISHED)

MAX_LOOKAHEAD_DAYS = 60


class NoSlotAvailableError(RuntimeError):
    pass


def _count_scheduled_on_local_day(db: Session, account_id: uuid.UUID, day_start_local: datetime) -> int:
    day_end_local = day_start_local + timedelta(days=1)
    day_start_utc = day_start_local.astimezone(timezone.utc)
    day_end_utc = day_end_local.astimezone(timezone.utc)
    stmt = select(func.count()).select_from(Publication).where(
        Publication.account_id == account_id,
        Publication.status.in_(_OCCUPYING_STATUSES),
        Publication.scheduled_at >= day_start_utc,
        Publication.scheduled_at < day_end_utc,
    )
    return db.execute(stmt).scalar_one()


def find_next_slot(
    db: Session,
    *,
    account_id: uuid.UUID,
    posting_windows: list[dict],
    daily_limit: int | None,
    timezone_name: str,
    after: datetime,
    extra_counts: dict[date, int],
) -> datetime:
    """Return the next UTC datetime >= `after` that fits inside one of
    `posting_windows` (account-local time) and keeps that local day's
    Publication count for this account under `daily_limit`.

    `extra_counts` lets a caller scheduling several clips to the same
    account in one request account for slots it has already handed out but
    not committed yet — mutated in place (day -> extra count).

    No `posting_windows` configured means "no restriction on time of day"
    (daily_limit still applies). Raises `NoSlotAvailableError` if nothing
    fits within `MAX_LOOKAHEAD_DAYS`.
    """
    tz = ZoneInfo(timezone_name or "UTC")
    after_local = after.astimezone(tz)

    windows = posting_windows or []

    for day_offset in range(MAX_LOOKAHEAD_DAYS):
        candidate_date = (after_local + timedelta(days=day_offset)).date()
        day_start_local = datetime.combine(candidate_date, time.min, tzinfo=tz)

        if daily_limit is not None:
            used = _count_scheduled_on_local_day(db, account_id, day_start_local) + extra_counts.get(candidate_date, 0)
            if used >= daily_limit:
                continue

        floor_local = after_local if day_offset == 0 else day_start_local

        if not windows:
            slot_local = floor_local
        else:
            weekday = candidate_date.weekday()  # Monday=0..Sunday=6
            todays_windows = sorted(
                (w for w in windows if weekday in (w.get("days") or [])),
                key=lambda w: w.get("start", "00:00"),
            )
            slot_local = None
            for window in todays_windows:
                start_h, start_m = (int(p) for p in window["start"].split(":"))
                end_h, end_m = (int(p) for p in window["end"].split(":"))
                window_start = datetime.combine(candidate_date, time(start_h, start_m), tzinfo=tz)
                window_end = datetime.combine(candidate_date, time(end_h, end_m), tzinfo=tz)
                candidate_slot = max(window_start, floor_local)
                if candidate_slot < window_end:
                    slot_local = candidate_slot
                    break
            if slot_local is None:
                continue

        extra_counts[candidate_date] = extra_counts.get(candidate_date, 0) + 1
        return slot_local.astimezone(timezone.utc)

    raise NoSlotAvailableError(f"No free slot for account {account_id} within {MAX_LOOKAHEAD_DAYS} days")

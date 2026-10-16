"""Core of publication creation, shared by `POST /api/publications/batch`
and the Series IA episode approval. This is where the rights gate
(`check_publishable`) is invoked for every (clip, account) pair — keep it
the only place that does so for publication creation."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.audit import record_action
from app.clip_source import resolve_clip_source
from app.models.clip import Clip, ClipStatus
from app.models.platform_account import AccountMode, PlatformAccount
from app.models.publication import Publication, PublicationStatus
from app.rights.gate import check_publishable
from app.scheduling import NoSlotAvailableError, find_next_slot


def create_publications(
    db: Session,
    *,
    owner_id: uuid.UUID,
    pairs: list[tuple[Clip, PlatformAccount]],
    schedule: str,
    privacy,
    actor_id: uuid.UUID | None,
    audit_details: dict | None = None,
    after: datetime | None = None,
    synthetic_media: bool = False,
) -> list[Publication]:
    """Create one `Publication` per (clip, account) pair, running the rights
    gate for each. Flushes and records the audit trail but does NOT commit.

    - `schedule`: `"auto"` (next free slot per account), `"now"`, or ISO-8601.
    - `after`: never schedule before this instant (e.g. an episode's
      `target_date + publish_time`): raises "now"/explicit/auto times to it.
    - `synthetic_media`: force the flag on; otherwise copied from each clip.
    - `audit_details`: extra keys merged into every audit entry
      (`Scope.audit_details()` -> `{"as_user": ...}` when impersonating).
    """
    now = datetime.now(timezone.utc)
    earliest = max(now, after) if after is not None else now
    explicit_schedule: datetime | None = None
    if schedule not in ("auto", "now"):
        explicit_schedule = datetime.fromisoformat(schedule)
        if explicit_schedule.tzinfo is None:
            explicit_schedule = explicit_schedule.replace(tzinfo=timezone.utc)
        if after is not None:
            explicit_schedule = max(explicit_schedule, after)

    extra_counts_by_account: dict[uuid.UUID, dict[date, int]] = {}
    sources_by_clip: dict[uuid.UUID, object] = {}
    created: list[Publication] = []

    for clip, account in pairs:
        if clip.id not in sources_by_clip:
            sources_by_clip[clip.id] = resolve_clip_source(db, clip)
        source = sources_by_clip[clip.id]
        publication = Publication(
            owner_id=owner_id,
            clip_id=clip.id,
            account_id=account.id,
            platform=account.platform,
            synthetic_media=bool(synthetic_media or clip.synthetic_media),
        )

        if clip.status != ClipStatus.APPROVED:
            publication.status = PublicationStatus.BLOCKED
            publication.block_reasons = ["clip_not_approved"]
        else:
            ok, reasons = check_publishable(source, account.platform.value, now, monetized=account.monetized)
            if not ok:
                publication.status = PublicationStatus.BLOCKED
                publication.block_reasons = reasons
            elif account.mode == AccountMode.MANUAL:
                publication.status = PublicationStatus.EXPORTED
                publication.privacy = privacy
            else:
                publication.privacy = privacy
                if schedule == "now":
                    publication.status = PublicationStatus.SCHEDULED
                    publication.scheduled_at = earliest
                elif explicit_schedule is not None:
                    publication.status = PublicationStatus.SCHEDULED
                    publication.scheduled_at = explicit_schedule
                else:
                    extra_counts = extra_counts_by_account.setdefault(account.id, {})
                    try:
                        slot = find_next_slot(
                            db,
                            account_id=account.id,
                            posting_windows=account.posting_windows,
                            daily_limit=account.daily_limit,
                            timezone_name=account.timezone,
                            after=earliest,
                            extra_counts=extra_counts,
                        )
                    except NoSlotAvailableError as exc:
                        publication.status = PublicationStatus.FAILED
                        publication.error = str(exc)
                    else:
                        publication.status = PublicationStatus.SCHEDULED
                        publication.scheduled_at = slot

        db.add(publication)
        db.flush()
        record_action(
            db,
            user_id=actor_id,
            action="publication.create",
            entity="publication",
            entity_id=publication.id,
            details={
                **(audit_details or {}),
                "clip_id": str(clip.id),
                "account_id": str(account.id),
                "status": publication.status.value,
                "block_reasons": publication.block_reasons,
            },
        )
        created.append(publication)

    return created

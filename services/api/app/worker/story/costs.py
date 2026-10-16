"""Cost bookkeeping for Series IA: every spend is an `ai_usage_events` row
plus `UPDATE ... SET cost = cost + :c` on the series (and episode) in the
same transaction (plano §1) — never read-modify-write in Python."""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.story import AiUsageEvent, StoryEpisode, StorySeries, UsageKind


def record_usage(
    db: Session,
    *,
    owner_id: uuid.UUID,
    series_id: uuid.UUID | None,
    episode_id: uuid.UUID | None,
    kind: str,
    provider: str,
    model: str | None,
    cost_usd: Decimal | float,
    units: dict | None = None,
) -> AiUsageEvent:
    cost = Decimal(str(cost_usd or 0))
    event = AiUsageEvent(
        owner_id=owner_id,
        series_id=series_id,
        episode_id=episode_id,
        kind=UsageKind(kind),
        provider=provider,
        model=model,
        units=units or {},
        cost_usd=cost,
    )
    db.add(event)
    if cost:
        if series_id is not None:
            db.execute(
                update(StorySeries)
                .where(StorySeries.id == series_id)
                .values(cost_usd_total=StorySeries.cost_usd_total + cost)
                .execution_options(synchronize_session=False)
            )
        if episode_id is not None:
            db.execute(
                update(StoryEpisode)
                .where(StoryEpisode.id == episode_id)
                .values(cost_usd=StoryEpisode.cost_usd + cost)
                .execution_options(synchronize_session=False)
            )
    db.flush()
    return event


def record_llm_usage(
    db: Session, *, owner_id, series_id, episode_id, usage: dict, purpose: str
) -> AiUsageEvent:
    return record_usage(
        db,
        owner_id=owner_id,
        series_id=series_id,
        episode_id=episode_id,
        kind="llm",
        provider="anthropic",
        model=usage.get("model"),
        cost_usd=usage.get("cost_usd", 0),
        units={
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
            "purpose": purpose,
        },
    )

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.quotas import (
    active_series_count,
    ai_spend_month,
    analyses_today_count,
    channels_count,
    storage_used_bytes,
)
from app.schemas.user import UsageRead

router = APIRouter(prefix="/api/me", tags=["me"], dependencies=[Depends(get_current_user)])


@router.get("/usage", response_model=UsageRead)
def my_usage(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> UsageRead:
    """Own usage/quotas — always about the logged-in user, regardless of
    `as_user`/admin status (there is no "view as" for your own usage page)."""
    return UsageRead(
        storage_used_bytes=storage_used_bytes(db, current_user.id),
        storage_quota_bytes=current_user.storage_quota_bytes,
        analyses_today=analyses_today_count(db, current_user.id),
        daily_analysis_quota=current_user.daily_analysis_quota,
        channels_count=channels_count(db, current_user.id),
        max_channels=current_user.max_channels,
        active_series=active_series_count(db, current_user.id),
        max_active_series=current_user.max_active_series,
        ai_spend_month_usd=float(ai_spend_month(db, current_user.id)),
        monthly_ai_budget_usd=(
            float(current_user.monthly_ai_budget_usd) if current_user.monthly_ai_budget_usd is not None else None
        ),
    )

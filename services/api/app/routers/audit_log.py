from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.audit_log import AuditLog
from app.scope import Scope, get_scope
from app.schemas.audit_log import AuditLogRead

router = APIRouter(prefix="/api/audit-log", tags=["audit-log"], dependencies=[Depends(get_scope)])


@router.get("", response_model=list[AuditLogRead])
def list_audit_log(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> list[AuditLog]:
    """A regular user only sees their own actions (`AuditLog.user_id`).
    `AuditLog` has no `owner_id` of its own — it tracks the acting user, not
    a tenant-owned resource — so this filters on `user_id` directly rather
    than going through `Scope.owned()` (which expects an `owner_id`
    column)."""
    stmt = db.query(AuditLog)
    if scope.owner_id is not None:
        stmt = stmt.filter(AuditLog.user_id == scope.owner_id)
    return list(stmt.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all())

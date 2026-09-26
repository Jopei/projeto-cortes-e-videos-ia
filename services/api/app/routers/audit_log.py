from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogRead

router = APIRouter(prefix="/api/audit-log", tags=["audit-log"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[AuditLogRead])
def list_audit_log(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[AuditLog]:
    return list(
        db.query(AuditLog).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    )

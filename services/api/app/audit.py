"""Tiny helper to write an AuditLog row — kept as a single call site so every
router logs actions the same way instead of hand-building the model.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def record_action(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    action: str,
    entity: str,
    entity_id: uuid.UUID | None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    entry = AuditLog(user_id=user_id, action=action, entity=entity, entity_id=entity_id, details=details or {})
    db.add(entry)
    return entry

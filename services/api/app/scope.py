"""Central multi-tenant data-scoping helper.

Every domain-data model (`Source`, `MediaAsset`, `Channel`, `AnalysisJob`,
`Clip`, `PlatformAccount`, `Publication`) carries an `owner_id` FK to
`users.id` (migration `0005`). A regular user only ever sees/creates rows
where `owner_id == self.id`. An admin sees everything by default, or can
narrow down to a single user's view with `?as_user=<uuid>` (query param) or
the `X-As-User: <uuid>` header — a non-admin passing either is silently
ignored (never an error, never a way to see someone else's data).

`get_scope` is the ONE dependency every router should use instead of
`get_current_user` whenever it touches owned data (routers that are pure
admin-management, e.g. `app/routers/admin_users.py`, or that don't touch
owned rows at all, e.g. `app/routers/health.py`, keep using
`get_current_user`/no dependency). Use `Scope.owned(query, Model)` to filter
a query and `get_owned_or_404(db, Model, id, scope)` for single-row lookups
— both return/raise a plain 404 on a cross-tenant access attempt, never 403,
so an unauthorized user can't even tell whether the id exists (see
CLAUDE.md convention note: "todo novo router deve usar o escopo").
"""

from __future__ import annotations

import uuid
from typing import TypeVar

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Query, Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User

ModelT = TypeVar("ModelT")


class Scope:
    """Resolved per-request tenant scope.

    - `actor`: the logged-in User (whoever holds the session cookie).
    - `owner_id`: the effective owner_id to FILTER reads by. `None` means
      "no filter" — only possible for an admin with no `as_user` given (they
      see every owner's data).
    - `create_owner_id`: the owner_id to STAMP on newly created rows. Never
      `None` — defaults to the admin's own id when they aren't impersonating
      anyone via `as_user`.
    - `acting_as_other`: True when an admin is operating on behalf of a
      different user (`as_user` resolved to someone other than themselves) —
      used to add `details["as_user"]` to the audit trail.
    """

    def __init__(self, actor: User, owner_id: uuid.UUID | None, create_owner_id: uuid.UUID) -> None:
        self.actor = actor
        self.owner_id = owner_id
        self.create_owner_id = create_owner_id
        self.acting_as_other = create_owner_id != actor.id

    @property
    def sees_everything(self) -> bool:
        return self.owner_id is None

    def owned(self, query: Query, model: type[ModelT]) -> Query:
        """Apply the tenant filter to `query` (a no-op for an admin with no
        `as_user`, i.e. `owner_id is None`)."""
        if self.owner_id is None:
            return query
        return query.filter(model.owner_id == self.owner_id)

    def audit_details(self, details: dict | None = None) -> dict:
        """Merge `details` with `{"as_user": ...}` when an admin is acting on
        behalf of someone else — see `app.audit.record_action`."""
        merged = dict(details or {})
        if self.acting_as_other:
            merged["as_user"] = str(self.create_owner_id)
        return merged


def _parse_as_user(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except (ValueError, AttributeError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="as_user must be a valid UUID") from exc


def get_scope(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Scope:
    if not current_user.is_admin:
        # A non-admin's `as_user` (query or header) is always ignored.
        return Scope(actor=current_user, owner_id=current_user.id, create_owner_id=current_user.id)

    raw_as_user = request.query_params.get("as_user") or request.headers.get("x-as-user")
    if not raw_as_user:
        return Scope(actor=current_user, owner_id=None, create_owner_id=current_user.id)

    target_id = _parse_as_user(raw_as_user)
    target = db.get(User, target_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    return Scope(actor=current_user, owner_id=target_id, create_owner_id=target_id)


_NOT_FOUND_LABELS = {
    "StorySeries": "Série não encontrada",
    "StoryEpisode": "Episódio não encontrado",
    "Clip": "Clip não encontrado",
    "Channel": "Canal não encontrado",
    "Source": "Fonte não encontrada",
    "MediaAsset": "Mídia não encontrada",
    "AnalysisJob": "Job não encontrado",
}


def _not_found_detail(name: str) -> str:
    # Never the bare "Not Found": the frontend treats that as "route does not exist".
    return _NOT_FOUND_LABELS.get(name, "Recurso não encontrado")


def get_owned_or_404(db: Session, model: type[ModelT], obj_id: uuid.UUID, scope: Scope) -> ModelT:
    """Fetch `model` by primary key, scoped to `scope`. Raises a plain 404
    (never 403) both when the row doesn't exist and when it belongs to a
    different owner — a 403 would leak that the id is valid."""
    obj = db.get(model, obj_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=_not_found_detail(model.__name__))
    if scope.owner_id is not None and getattr(obj, "owner_id", None) != scope.owner_id:
        raise HTTPException(status_code=404, detail=_not_found_detail(model.__name__))
    return obj


def check_same_owner_or_404(obj: object | None, scope: Scope, *, label: str = "Resource") -> None:
    """Like `get_owned_or_404` but for an object already fetched by some
    other means (e.g. resolved via a different lookup) — raises 404 if it
    doesn't belong to `scope`'s effective owner."""
    if obj is None:
        raise HTTPException(status_code=404, detail="Recurso não encontrado")
    if scope.owner_id is not None and getattr(obj, "owner_id", None) != scope.owner_id:
        raise HTTPException(status_code=404, detail="Recurso não encontrado")


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency: 403 unless the current user is an admin. Use for
    `app/routers/admin_users.py` endpoints."""
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user

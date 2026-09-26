from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.channel import Channel
from app.models.source import Source
from app.scope import Scope, get_owned_or_404, get_scope
from app.schemas.source import SourceCreate, SourceRead, SourceUpdate

router = APIRouter(prefix="/api/sources", tags=["sources"], dependencies=[Depends(get_scope)])


def _check_default_channel_owner(db: Session, channel_id: uuid.UUID | None, owner_id: uuid.UUID) -> None:
    """A Source's `default_channel_id` must point at a Channel owned by the
    same tenant this Source belongs to."""
    if channel_id is None:
        return
    channel = db.get(Channel, channel_id)
    if channel is None or channel.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="Channel not found")


@router.post("", response_model=SourceRead, status_code=201)
def create_source(payload: SourceCreate, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> Source:
    _check_default_channel_owner(db, payload.default_channel_id, scope.create_owner_id)
    source = Source(**payload.model_dump(), owner_id=scope.create_owner_id)
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.get("", response_model=list[SourceRead])
def list_sources(db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> list[Source]:
    stmt = scope.owned(db.query(Source), Source)
    return list(stmt.order_by(Source.created_at.desc()).all())


@router.get("/{source_id}", response_model=SourceRead)
def get_source(source_id: uuid.UUID, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> Source:
    return get_owned_or_404(db, Source, source_id, scope)


@router.patch("/{source_id}", response_model=SourceRead)
def update_source(
    source_id: uuid.UUID,
    payload: SourceUpdate,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> Source:
    source = get_owned_or_404(db, Source, source_id, scope)
    updates = payload.model_dump(exclude_unset=True)
    if "default_channel_id" in updates:
        _check_default_channel_owner(db, updates["default_channel_id"], source.owner_id)
    for field, value in updates.items():
        setattr(source, field, value)
    db.commit()
    db.refresh(source)
    return source


@router.delete("/{source_id}", status_code=204, response_class=Response)
def delete_source(source_id: uuid.UUID, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> Response:
    source = get_owned_or_404(db, Source, source_id, scope)
    db.delete(source)
    db.commit()
    return Response(status_code=204)

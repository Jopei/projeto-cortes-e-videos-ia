from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.channel import Channel
from app.models.source import Source
from app.models.story import StorySeries
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


def _assert_not_series_source(db: Session, source: Source) -> None:
    """A Source created for a Series IA (license `ai_generated`) is owned by
    the series: it can't be deleted or have its license changed."""
    if db.query(StorySeries.id).filter(StorySeries.source_id == source.id).first() is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "source_managed_by_series",
                "message": "Esta fonte pertence a uma série de IA e não pode ser excluída nem ter a licença alterada.",
            },
        )


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
    if "license_type" in updates and updates["license_type"] != source.license_type:
        _assert_not_series_source(db, source)
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
    _assert_not_series_source(db, source)
    db.delete(source)
    db.commit()
    return Response(status_code=204)

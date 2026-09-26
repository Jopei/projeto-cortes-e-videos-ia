from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.audit import record_action
from app.db import get_db
from app.integrations import get_integration_def, get_integration_value
from app.models.channel import Channel
from app.models.enums import Platform
from app.models.platform_account import AccountMode, AccountStatus, PlatformAccount
from app.scope import Scope, get_owned_or_404, get_scope
from app.schemas.platform_account import (
    OAuthConnectResponse,
    PlatformAccountCreate,
    PlatformAccountRead,
    PlatformAccountUpdate,
    PlatformInfo,
)

router = APIRouter(prefix="/api", tags=["accounts"], dependencies=[Depends(get_scope)])

PLATFORM_INFO: dict[Platform, dict[str, str | bool]] = {
    Platform.YOUTUBE: {
        "name": "YouTube Shorts",
        "supports_oauth": True,
        "notes": "YouTube Data API v3 (videos.insert). Projetos não auditados publicam só como privado.",
    },
    Platform.TIKTOK: {
        "name": "TikTok",
        "supports_oauth": True,
        "notes": "Content Posting API (Direct Post). Sem auditoria, posts saem SELF_ONLY.",
    },
    Platform.BILIBILI: {
        "name": "Bilibili",
        "supports_oauth": False,
        "notes": "Sem Open Platform aprovada: apenas pacote de exportação para upload manual.",
    },
    Platform.INSTAGRAM: {
        "name": "Instagram Reels",
        "supports_oauth": True,
        "notes": "Graph API, exige conta Business/Creator e app Meta revisado.",
    },
    Platform.FACEBOOK: {
        "name": "Facebook Reels",
        "supports_oauth": True,
        "notes": "Graph API, exige conta Business/Creator e app Meta revisado.",
    },
    Platform.VIMEO: {
        "name": "Vimeo",
        "supports_oauth": True,
        "notes": "Vimeo API (upload via tus). Monetização no Vimeo não é por anúncios.",
    },
}


def _oauth_configured(platform: Platform) -> bool:
    # `Platform` values line up 1:1 with integration ids in app/integrations.py
    # (youtube/tiktok/instagram/facebook/bilibili) — effective value is
    # DB-then-env, see `app.integrations.get_integration_value`.
    definition = get_integration_def(platform.value)
    if definition is None:
        return False
    return all(get_integration_value(platform.value, f.key) for f in definition.fields if f.required)


@router.get("/platforms", response_model=list[PlatformInfo])
def list_platforms() -> list[PlatformInfo]:
    return [
        PlatformInfo(
            id=platform.value,
            name=str(info["name"]),
            supports_oauth=bool(info["supports_oauth"]),
            configured=_oauth_configured(platform) if info["supports_oauth"] else False,
            notes=str(info["notes"]),
        )
        for platform, info in PLATFORM_INFO.items()
    ]


@router.get("/accounts", response_model=list[PlatformAccountRead])
def list_accounts(
    channel_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> list[PlatformAccount]:
    stmt = scope.owned(db.query(PlatformAccount), PlatformAccount)
    if channel_id is not None:
        stmt = stmt.filter(PlatformAccount.channel_id == channel_id)
    return list(stmt.order_by(PlatformAccount.created_at.desc()).all())


def _check_channel_platform_free(
    db: Session,
    channel_id: uuid.UUID | None,
    platform: Platform,
    owner_id: uuid.UUID,
    *,
    exclude_account_id: uuid.UUID | None = None,
) -> None:
    """A channel can have at most one account per platform (`channel_id`
    NULL rows are unconstrained — they just aren't linked to any channel).
    Checked explicitly (rather than only relying on the DB unique
    constraint, `uq_platform_accounts_channel_platform`) so callers get a
    clean 409 instead of a raw IntegrityError/500. Also enforces the channel
    belongs to the same owner as the account (404 if not, hiding existence
    of another tenant's channel)."""
    if channel_id is None:
        return
    channel = db.get(Channel, channel_id)
    if channel is None or channel.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    stmt = db.query(PlatformAccount).filter(
        PlatformAccount.channel_id == channel_id, PlatformAccount.platform == platform
    )
    if exclude_account_id is not None:
        stmt = stmt.filter(PlatformAccount.id != exclude_account_id)
    if stmt.first() is not None:
        raise HTTPException(status_code=409, detail="Channel already has an account for this platform")


@router.post("/accounts", response_model=PlatformAccountRead, status_code=201)
def create_account(
    payload: PlatformAccountCreate,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> PlatformAccount:
    owner_id = scope.create_owner_id
    _check_channel_platform_free(db, payload.channel_id, payload.platform, owner_id)
    account = PlatformAccount(
        owner_id=owner_id,
        platform=payload.platform.value,
        display_name=payload.display_name,
        channel_id=payload.channel_id,
        mode=AccountMode.MANUAL,
        status=AccountStatus.MANUAL,
    )
    db.add(account)
    db.flush()
    record_action(
        db,
        user_id=scope.actor.id,
        action="account.create",
        entity="platform_account",
        entity_id=account.id,
        details=scope.audit_details(
            {"platform": payload.platform.value, "mode": "manual", "channel_id": str(payload.channel_id) if payload.channel_id else None}
        ),
    )
    db.commit()
    db.refresh(account)
    return account


@router.patch("/accounts/{account_id}", response_model=PlatformAccountRead)
def update_account(
    account_id: uuid.UUID,
    payload: PlatformAccountUpdate,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> PlatformAccount:
    account = get_owned_or_404(db, PlatformAccount, account_id, scope)
    updates = payload.model_dump(exclude_unset=True)

    channel_changed = "channel_id" in updates and updates["channel_id"] != account.channel_id
    if channel_changed:
        _check_channel_platform_free(
            db, updates["channel_id"], account.platform, account.owner_id, exclude_account_id=account.id
        )

    for field, value in updates.items():
        setattr(account, field, value)
    record_action(
        db,
        user_id=scope.actor.id,
        action="account.link_channel" if channel_changed else "account.update",
        entity="platform_account",
        entity_id=account.id,
        details=scope.audit_details(payload.model_dump(exclude_unset=True, mode="json")),
    )
    db.commit()
    db.refresh(account)
    return account


@router.delete("/accounts/{account_id}", status_code=204, response_class=Response)
def delete_account(
    account_id: uuid.UUID,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> Response:
    account = get_owned_or_404(db, PlatformAccount, account_id, scope)
    record_action(
        db,
        user_id=scope.actor.id,
        action="account.delete",
        entity="platform_account",
        entity_id=account.id,
        details=scope.audit_details({"platform": account.platform}),
    )
    db.delete(account)
    db.commit()
    return Response(status_code=204)


@router.get("/accounts/{platform}/connect", response_model=OAuthConnectResponse)
def oauth_connect(platform: Platform) -> OAuthConnectResponse:
    """Stub — etapa C implements the real OAuth authorize-URL building."""
    raise HTTPException(status_code=501, detail=f"OAuth connect for {platform.value} not implemented yet")


@router.get("/accounts/{platform}/callback")
def oauth_callback(platform: Platform) -> dict[str, str]:
    """Stub — etapa C implements the real OAuth token exchange."""
    raise HTTPException(status_code=501, detail=f"OAuth callback for {platform.value} not implemented yet")

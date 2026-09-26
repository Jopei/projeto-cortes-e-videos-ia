from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.audit import record_action
from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models.enums import Platform
from app.models.platform_account import AccountMode, AccountStatus, PlatformAccount
from app.models.user import User
from app.schemas.platform_account import (
    OAuthConnectResponse,
    PlatformAccountCreate,
    PlatformAccountRead,
    PlatformAccountUpdate,
    PlatformInfo,
)

router = APIRouter(prefix="/api", tags=["accounts"], dependencies=[Depends(get_current_user)])

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
}


def _oauth_configured(platform: Platform) -> bool:
    settings = get_settings()
    if platform == Platform.YOUTUBE:
        return bool(settings.youtube_client_id and settings.youtube_client_secret)
    if platform == Platform.TIKTOK:
        return bool(settings.tiktok_client_key and settings.tiktok_client_secret)
    return False


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
def list_accounts(db: Session = Depends(get_db)) -> list[PlatformAccount]:
    return list(db.query(PlatformAccount).order_by(PlatformAccount.created_at.desc()).all())


@router.post("/accounts", response_model=PlatformAccountRead, status_code=201)
def create_account(
    payload: PlatformAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlatformAccount:
    account = PlatformAccount(
        platform=payload.platform.value,
        display_name=payload.display_name,
        mode=AccountMode.MANUAL,
        status=AccountStatus.MANUAL,
    )
    db.add(account)
    db.flush()
    record_action(
        db,
        user_id=current_user.id,
        action="account.create",
        entity="platform_account",
        entity_id=account.id,
        details={"platform": payload.platform.value, "mode": "manual"},
    )
    db.commit()
    db.refresh(account)
    return account


def _get_account_or_404(db: Session, account_id: uuid.UUID) -> PlatformAccount:
    account = db.get(PlatformAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="PlatformAccount not found")
    return account


@router.patch("/accounts/{account_id}", response_model=PlatformAccountRead)
def update_account(
    account_id: uuid.UUID,
    payload: PlatformAccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlatformAccount:
    account = _get_account_or_404(db, account_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    record_action(
        db,
        user_id=current_user.id,
        action="account.update",
        entity="platform_account",
        entity_id=account.id,
        details=payload.model_dump(exclude_unset=True),
    )
    db.commit()
    db.refresh(account)
    return account


@router.delete("/accounts/{account_id}", status_code=204, response_class=Response)
def delete_account(
    account_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    account = _get_account_or_404(db, account_id)
    record_action(
        db,
        user_id=current_user.id,
        action="account.delete",
        entity="platform_account",
        entity_id=account.id,
        details={"platform": account.platform},
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

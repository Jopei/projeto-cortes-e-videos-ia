from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.audit import record_action
from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.rate_limit import login_rate_limiter
from app.schemas.user import ChangePasswordRequest, LoginRequest, UserRead
from app.security import clear_session_cookie, create_session_token, hash_password, set_session_cookie, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Deliberately generic: never reveal whether the username exists.
GENERIC_LOGIN_ERROR = "Invalid username or password"


@router.post("/login", response_model=UserRead)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> User:
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{payload.username.lower()}"

    if login_rate_limiter.is_blocked(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts, try again later",
        )

    user = db.query(User).filter(User.username == payload.username).one_or_none()
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        login_rate_limiter.register_failure(rate_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    login_rate_limiter.reset(rate_key)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    token = create_session_token(user.id, user.username)
    set_session_cookie(response, token)
    return user


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, bool]:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    record_action(
        db,
        user_id=current_user.id,
        action="password.change",
        entity="user",
        entity_id=current_user.id,
        details=None,
    )
    db.commit()
    return {"ok": True}

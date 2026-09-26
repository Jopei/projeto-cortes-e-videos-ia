from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.user import User
from app.security import decode_session_token


def resolve_user_from_cookie(request: Request, db: Session) -> User | None:
    """Look up the User behind the `cortes_session` cookie on `request`, if any.

    Returns None (never raises) so callers can decide how to react — used by
    both the `get_current_user` dependency (raises 401) and the tusd
    `pre-create` hook (rejects the upload with a 401 in `HTTPResponse`).
    """
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    payload = decode_session_token(token)
    if not payload:
        return None
    raw_user_id = payload.get("sub")
    if not raw_user_id:
        return None
    try:
        user_id = uuid.UUID(str(raw_user_id))
    except (ValueError, AttributeError, TypeError):
        return None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """FastAPI dependency: require a valid session cookie, 401 otherwise.

    Add `dependencies=[Depends(get_current_user)]` to a router to protect an
    entire resource, or use it as a parameter to also get the User instance
    (see `app/routers/auth.py::me`).
    """
    user = resolve_user_from_cookie(request, db)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user

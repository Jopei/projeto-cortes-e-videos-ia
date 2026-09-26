from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from fastapi import Response

from app.config import get_settings

_password_hasher = PasswordHasher()

JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time-ish verify; never raises, just returns False on mismatch."""
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, ValueError):
        return False


def create_session_token(user_id: uuid.UUID, username: str, session_version: int) -> str:
    """`session_version` is stamped into the `sv` claim and re-checked against
    `User.session_version` on every request (see
    `app/deps.py::resolve_user_from_cookie`) — bumping the column value
    revokes every JWT issued before that point, without a server-side
    session store. Always pass the CURRENT `user.session_version`."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "username": username,
        "sv": session_version,
        "iat": now,
        "exp": now + timedelta(days=settings.session_ttl_days),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=JWT_ALGORITHM)


def decode_session_token(token: str) -> dict | None:
    """Decode+verify the session JWT. Returns None on any invalid/expired token."""
    settings = get_settings()
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
        max_age=settings.session_ttl_days * 24 * 3600,
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )

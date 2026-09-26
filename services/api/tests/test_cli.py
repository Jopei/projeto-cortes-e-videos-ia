from __future__ import annotations

from app.cli import ensure_admin_user
from app.security import verify_password


def test_ensure_admin_user_creates_when_missing(session_factory):
    db = session_factory()
    user, created = ensure_admin_user(db, "admin", "s3cret-password")
    assert created is True
    assert user.is_admin is True
    assert verify_password("s3cret-password", user.password_hash)


def test_ensure_admin_user_does_not_overwrite_existing_password(session_factory):
    db = session_factory()
    ensure_admin_user(db, "admin", "first-password")

    user, created = ensure_admin_user(db, "admin", "second-password")
    assert created is False
    assert verify_password("first-password", user.password_hash)
    assert not verify_password("second-password", user.password_hash)


def test_ensure_admin_user_reset_overwrites_password(session_factory):
    db = session_factory()
    ensure_admin_user(db, "admin", "first-password")

    user, _created = ensure_admin_user(db, "admin", "second-password", reset=True)
    assert verify_password("second-password", user.password_hash)

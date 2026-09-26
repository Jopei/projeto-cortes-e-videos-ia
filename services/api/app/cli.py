"""Operational CLI for the API service.

Usage (inside the `api` container or any environment with DATABASE_URL set):

    python -m app.cli create-admin           # create if missing, never touches an existing password
    python -m app.cli create-admin --reset   # also reset the password of an existing admin user

Reads credentials from ADMIN_USERNAME / ADMIN_PASSWORD (see .env). Never
logs or prints the password.
"""
from __future__ import annotations

import argparse
import sys

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models.user import User
from app.security import hash_password


def ensure_admin_user(db: Session, username: str, password: str, *, reset: bool = False) -> tuple[User, bool]:
    """Create the admin user if it doesn't exist yet, or reset its password.

    Never overwrites an existing password unless `reset=True`. Returns
    `(user, created)`, where `created` is False when the user already existed.
    """
    user = db.query(User).filter(User.username == username).one_or_none()
    if user is None:
        user = User(username=username, password_hash=hash_password(password), is_admin=True, is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user, True

    if reset:
        user.password_hash = hash_password(password)
        user.is_admin = True
        user.is_active = True
        db.commit()
        db.refresh(user)
    return user, False


def create_admin(reset: bool = False) -> None:
    settings = get_settings()
    if not settings.admin_username or not settings.admin_password:
        print("ADMIN_USERNAME/ADMIN_PASSWORD not set in the environment; skipping.", file=sys.stderr)
        raise SystemExit(1)

    db = SessionLocal()
    try:
        user, created = ensure_admin_user(db, settings.admin_username, settings.admin_password, reset=reset)
        if created:
            print(f"Created admin user '{user.username}'.")
        elif reset:
            print(f"Reset password for existing admin user '{user.username}'.")
        else:
            print(f"Admin user '{user.username}' already exists; left untouched (use --reset to change the password).")
    finally:
        db.close()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_admin_parser = subparsers.add_parser(
        "create-admin",
        help="Create or update the admin user from ADMIN_USERNAME/ADMIN_PASSWORD",
    )
    create_admin_parser.add_argument(
        "--reset",
        action="store_true",
        help="Overwrite the password of an existing admin user",
    )

    args = parser.parse_args(argv)
    if args.command == "create-admin":
        create_admin(reset=args.reset)


if __name__ == "__main__":
    main()

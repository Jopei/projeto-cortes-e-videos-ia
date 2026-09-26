from __future__ import annotations

# Test env vars MUST be set before any `app.*` module is imported, since
# `app.config.get_settings()` validates SECRET_KEY eagerly (see
# app/config.py) and `app.db` calls it at import time.
import os

os.environ.setdefault("SECRET_KEY", "test-only-secret-key-0123456789-abcdefgh")
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password-not-real")
os.environ.setdefault("COOKIE_SECURE", "false")

import uuid  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402
from app.rate_limit import login_rate_limiter  # noqa: E402
from app.security import hash_password  # noqa: E402

# tusd's HTTP hook protocol stores metadata as base64 in real requests, but
# our hook only reads `payload["Event"]["Upload"]["MetaData"]` as plain
# strings (see app/routers/uploads.py) — that's what tusd hands the hook
# process after decoding, so tests build the JSON body directly.

SOURCES_TABLE_DDL = """
CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    work_name TEXT NOT NULL,
    license_type TEXT NOT NULL,
    proof_url TEXT,
    proof_file_key TEXT,
    allowed_platforms TEXT,
    territories TEXT,
    valid_from TEXT,
    valid_until TEXT,
    monetization_allowed INTEGER NOT NULL DEFAULT 0,
    attribution_text TEXT,
    created_at TEXT
)
"""


@pytest.fixture()
def db_engine():
    """A throwaway sqlite DB per test — Source/MediaAsset use postgres-only
    types (ARRAY, dialect UUID) that don't survive `create_all` on sqlite, so
    only the `users` table is created via the ORM; `sources` is created with
    a plain-SQL schema (see module docstring) which is enough for the
    ORM `db.get(Source, id)` lookup the upload hook performs.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    User.__table__.create(engine)
    with engine.begin() as conn:
        conn.execute(text(SOURCES_TABLE_DDL))
    yield engine
    engine.dispose()


@pytest.fixture()
def session_factory(db_engine):
    return sessionmaker(bind=db_engine, autoflush=False, autocommit=False)


@pytest.fixture()
def client(session_factory):
    def _override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    login_rate_limiter._failures.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def user_password() -> str:
    return "correct-horse-battery-staple"


@pytest.fixture()
def user(session_factory, user_password) -> User:
    db = session_factory()
    created = User(username="alice", password_hash=hash_password(user_password), is_active=True, is_admin=False)
    db.add(created)
    db.commit()
    db.refresh(created)
    db.close()
    return created


@pytest.fixture()
def source_id(session_factory) -> uuid.UUID:
    new_id = uuid.uuid4()
    db = session_factory()
    db.execute(
        text(
            "INSERT INTO sources (id, title, work_name, license_type, allowed_platforms, territories, monetization_allowed)"
            " VALUES (:id, :title, :work_name, :license_type, :ap, :te, 0)"
        ),
        {
            "id": new_id.hex,
            "title": "Test source",
            "work_name": "Test work",
            "license_type": "cc_by",
            "ap": "",
            "te": "",
        },
    )
    db.commit()
    db.close()
    return new_id

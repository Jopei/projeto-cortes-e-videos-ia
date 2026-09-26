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
os.environ.setdefault("TOKEN_ENCRYPTION_KEY", "ASJwV0_SSFwawWjGMraqF4cZ5HfxIf7UD7sVB6h0WfU=")
# Runs Celery tasks synchronously in-process instead of publishing to a real
# broker — see app/worker/celery_app.py. No test in this suite is expected
# to actually exercise task *logic* against these tables (that's for a
# dedicated worker test suite in a later phase); this just keeps an
# accidental `.delay()` call from hanging/erroring for lack of Redis.
os.environ.setdefault("CELERY_TASK_ALWAYS_EAGER", "true")

import uuid  # noqa: E402
from datetime import datetime, timezone  # noqa: E402

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
from tests import factories  # noqa: E402

# tusd's HTTP hook protocol stores metadata as base64 in real requests, but
# our hook only reads `payload["Event"]["Upload"]["MetaData"]` as plain
# strings (see app/routers/uploads.py) — that's what tusd hands the hook
# process after decoding, so tests build the JSON body directly.

SOURCES_TABLE_DDL = """
CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    default_channel_id TEXT,
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

# Also postgres-only-free by hand, for the same reason as `sources` above —
# `MediaAsset.source_id`/`.id` use the dialect UUID type. `duration` and
# `status` aren't needed by any fixture yet.
MEDIA_ASSETS_TABLE_DDL = """
CREATE TABLE media_assets (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    channel_id TEXT,
    filename TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    duration REAL,
    size_bytes INTEGER,
    status TEXT NOT NULL DEFAULT 'uploaded',
    created_at TEXT
)
"""

# AnalysisJob/Clip/ClipMetadata/PlatformAccount/Publication/AuditLog/Channel
# (etapa A/multiusuário) use the portable `sqlalchemy.Uuid`/`JSON` types
# instead, specifically so they DO survive `Base.metadata.create_all()` on
# sqlite — no hand-written DDL needed for these (their `owner_id` columns
# ride along automatically since they're declared on the ORM model).
from app.models.analysis_job import AnalysisJob  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.channel import Channel  # noqa: E402
from app.models.clip import Clip  # noqa: E402
from app.models.clip_metadata import ClipMetadata  # noqa: E402
from app.models.platform_account import PlatformAccount  # noqa: E402
from app.models.publication import Publication  # noqa: E402

NEW_MODEL_TABLES = [
    Channel.__table__,
    AnalysisJob.__table__,
    Clip.__table__,
    ClipMetadata.__table__,
    PlatformAccount.__table__,
    Publication.__table__,
    AuditLog.__table__,
]


@pytest.fixture()
def db_engine():
    """A throwaway sqlite DB per test — Source/MediaAsset use postgres-only
    types (ARRAY, dialect UUID) that don't survive `create_all` on sqlite, so
    only the `users` table (plus the etapa-A/multiusuário tables, which use
    portable types) is created via the ORM; `sources`/`media_assets` are
    created with a plain-SQL schema (see module docstring) which is enough
    for the simple lookups/inserts the API and these fixtures perform.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    User.__table__.create(engine)
    for table in NEW_MODEL_TABLES:
        table.create(engine)
    with engine.begin() as conn:
        conn.execute(text(SOURCES_TABLE_DDL))
        conn.execute(text(MEDIA_ASSETS_TABLE_DDL))
    yield engine
    engine.dispose()


@pytest.fixture()
def session_factory(db_engine):
    return sessionmaker(bind=db_engine, autoflush=False, autocommit=False)


@pytest.fixture()
def client(session_factory, monkeypatch):
    def _override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db

    # Celery tasks run eagerly (CELERY_TASK_ALWAYS_EAGER) and open their own
    # session via `app.db.SessionLocal` (looked up dynamically, see
    # app/worker/tasks.py) rather than the request-scoped `get_db` override
    # above — point it at this test's engine too, so an eager task (e.g.
    # `run_analysis` from `POST /media-assets/{id}/analyze`) sees the same
    # tables/rows instead of a throwaway `sqlite://` of its own.
    import app.db as db_module

    monkeypatch.setattr(db_module, "SessionLocal", session_factory)
    login_rate_limiter._failures.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def user_password() -> str:
    return "correct-horse-battery-staple"


@pytest.fixture()
def user(session_factory, user_password) -> User:
    """The "primary" test user. Also registered as the default `owner_id`
    for `tests.factories.insert_*` helpers that don't get an explicit
    `owner_id` — see `tests/factories.py` module docstring — so the ~100
    pre-existing single-tenant tests keep working unmodified: everything
    they create is implicitly scoped to this one user, exactly like before
    multi-tenancy existed.
    """
    db = session_factory()
    created = User(username="alice", password_hash=hash_password(user_password), is_active=True, is_admin=False)
    db.add(created)
    db.commit()
    db.refresh(created)
    db.close()
    factories.set_default_owner(created.id)
    return created


@pytest.fixture()
def other_password() -> str:
    return "other-horse-battery-staple"


@pytest.fixture()
def other_user(session_factory, other_password) -> User:
    """A second, unrelated tenant — used by isolation tests. Does NOT change
    the factories' default owner (see `user` fixture); pass
    `owner_id=other_user.id` explicitly when building fixtures for this
    user."""
    db = session_factory()
    created = User(username="bob", password_hash=hash_password(other_password), is_active=True, is_admin=False)
    db.add(created)
    db.commit()
    db.refresh(created)
    db.close()
    return created


@pytest.fixture()
def admin_password() -> str:
    return "admin-horse-battery-staple"


@pytest.fixture()
def admin_user(session_factory, admin_password) -> User:
    db = session_factory()
    created = User(username="root-admin", password_hash=hash_password(admin_password), is_active=True, is_admin=True)
    db.add(created)
    db.commit()
    db.refresh(created)
    db.close()
    return created


@pytest.fixture()
def source_id(session_factory, user) -> uuid.UUID:
    new_id = uuid.uuid4()
    db = session_factory()
    db.execute(
        text(
            "INSERT INTO sources (id, owner_id, title, work_name, license_type, allowed_platforms, territories,"
            " monetization_allowed, created_at)"
            " VALUES (:id, :owner_id, :title, :work_name, :license_type, :ap, :te, 0, :created_at)"
        ),
        {
            "id": new_id.hex,
            "owner_id": user.id.hex,
            "title": "Test source",
            "work_name": "Test work",
            "license_type": "cc_by",
            "ap": "",
            "te": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.commit()
    db.close()
    return new_id


@pytest.fixture()
def media_asset_id(session_factory, source_id, user) -> uuid.UUID:
    new_id = uuid.uuid4()
    db = session_factory()
    db.execute(
        text(
            "INSERT INTO media_assets (id, owner_id, source_id, filename, storage_key, status, created_at)"
            " VALUES (:id, :owner_id, :source_id, :filename, :storage_key, 'ready', :created_at)"
        ),
        {
            "id": new_id.hex,
            "owner_id": user.id.hex,
            "source_id": source_id.hex,
            "filename": "test.mp4",
            "storage_key": "media-assets/test.mp4",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.commit()
    db.close()
    return new_id


@pytest.fixture()
def logged_in_client(client, user, user_password):
    """The shared `client` fixture, already carrying a valid session cookie."""
    resp = client.post("/api/auth/login", json={"username": user.username, "password": user_password})
    assert resp.status_code == 200
    return client


def _second_client(client: TestClient) -> TestClient:
    """A second `TestClient` (own cookie jar) against the same `app`, used
    together with `logged_in_client`/`admin_client` to simulate two
    concurrently-logged-in sessions in one test (a single `TestClient` only
    has one cookie jar, so it can't hold two sessions at once).

    Deliberately does NOT `with TestClient(app) as tc: ...` (which would
    start a brand new anyio blocking portal/thread per extra client, on top
    of the one the primary `client` fixture already started) — instead it
    reuses `client`'s already-running portal (`TestClient._portal_factory`
    happily reuses `self.portal` when set). Spinning up several independent
    portals per test turned out to be flaky under the full suite's fixture
    load (intermittent, unrelated-looking failures — a request on one
    TestClient occasionally observing another's in-flight state), so every
    extra client in a test shares the one portal the first `client` opened.
    """
    tc = TestClient(app)
    tc.portal = client.portal
    return tc


@pytest.fixture()
def other_client(client):
    tc = _second_client(client)
    yield tc
    tc.close()


@pytest.fixture()
def other_logged_in_client(other_client, other_user, other_password):
    resp = other_client.post("/api/auth/login", json={"username": other_user.username, "password": other_password})
    assert resp.status_code == 200
    return other_client


@pytest.fixture()
def admin_client_raw(client):
    tc = _second_client(client)
    yield tc
    tc.close()


@pytest.fixture()
def admin_client(admin_client_raw, admin_user, admin_password):
    resp = admin_client_raw.post("/api/auth/login", json={"username": admin_user.username, "password": admin_password})
    assert resp.status_code == 200
    return admin_client_raw

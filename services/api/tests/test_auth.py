from __future__ import annotations

import uuid

from app.rate_limit import login_rate_limiter


def _hook_payload(hook_type: str, metadata: dict | None = None) -> dict:
    return {"Type": hook_type, "Event": {"Upload": {"MetaData": metadata or {}}}}


# --- login ---


def test_login_with_correct_credentials_returns_user_and_sets_cookie(client, user, user_password):
    resp = client.post("/api/auth/login", json={"username": user.username, "password": user_password})
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == user.username
    assert "password" not in body
    assert "password_hash" not in body
    assert "cortes_session" in resp.cookies


def test_login_with_wrong_password_is_rejected_generically(client, user, user_password):
    resp = client.post("/api/auth/login", json={"username": user.username, "password": "wrong-password"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid username or password"


def test_login_with_unknown_username_gives_same_generic_error(client):
    resp = client.post("/api/auth/login", json={"username": "nobody", "password": "whatever"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid username or password"


# --- protected routes ---


def test_me_without_cookie_is_401(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_with_valid_cookie_is_200(client, user, user_password):
    client.post("/api/auth/login", json={"username": user.username, "password": user_password})
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json()["username"] == user.username


def test_logout_clears_cookie_and_me_becomes_401(client, user, user_password):
    client.post("/api/auth/login", json={"username": user.username, "password": user_password})
    assert client.get("/api/auth/me").status_code == 200

    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_health_and_login_do_not_require_auth(client):
    assert client.get("/api/health").status_code == 200


def test_sources_router_requires_auth(client):
    # Router-level dependency rejects before ever touching the DB, so this
    # doesn't need a real `sources` table with data.
    assert client.get("/api/sources").status_code == 401


def test_media_assets_router_requires_auth(client):
    assert client.get("/api/media-assets").status_code == 401


# --- rate limiting ---


def test_login_rate_limited_after_too_many_failed_attempts(client, user):
    login_rate_limiter._failures.clear()
    for _ in range(login_rate_limiter.max_attempts):
        resp = client.post("/api/auth/login", json={"username": user.username, "password": "wrong"})
        assert resp.status_code == 401

    blocked = client.post("/api/auth/login", json={"username": user.username, "password": "wrong"})
    assert blocked.status_code == 429


def test_successful_login_resets_rate_limit_counter(client, user, user_password):
    login_rate_limiter._failures.clear()
    for _ in range(login_rate_limiter.max_attempts - 1):
        client.post("/api/auth/login", json={"username": user.username, "password": "wrong"})

    ok = client.post("/api/auth/login", json={"username": user.username, "password": user_password})
    assert ok.status_code == 200

    # counter was reset by the success, so a fresh run of failures doesn't
    # immediately trip the limiter
    resp = client.post("/api/auth/login", json={"username": user.username, "password": "wrong"})
    assert resp.status_code == 401


# --- tusd pre-create hook ---


def test_hook_pre_create_without_cookie_is_rejected(client, source_id):
    resp = client.post(
        "/api/uploads/tusd-hook",
        json=_hook_payload("pre-create", {"source_id": str(source_id)}),
    )
    assert resp.status_code == 200  # tusd hook endpoint always answers 200
    body = resp.json()
    assert body["RejectUpload"] is True
    assert body["HTTPResponse"]["StatusCode"] == 401


def test_hook_pre_create_with_valid_cookie_and_source_is_accepted(client, user, user_password, source_id):
    client.post("/api/auth/login", json={"username": user.username, "password": user_password})

    resp = client.post(
        "/api/uploads/tusd-hook",
        json=_hook_payload("pre-create", {"source_id": str(source_id)}),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "RejectUpload" not in body
    assert body["HTTPResponse"]["StatusCode"] == 200


def test_hook_pre_create_with_valid_cookie_but_missing_source_is_rejected(client, user, user_password):
    client.post("/api/auth/login", json={"username": user.username, "password": user_password})

    resp = client.post("/api/uploads/tusd-hook", json=_hook_payload("pre-create", {}))
    assert resp.status_code == 200
    body = resp.json()
    assert body["RejectUpload"] is True
    assert body["HTTPResponse"]["StatusCode"] == 400


def test_hook_pre_create_with_valid_cookie_but_unknown_source_is_rejected(client, user, user_password):
    client.post("/api/auth/login", json={"username": user.username, "password": user_password})

    resp = client.post(
        "/api/uploads/tusd-hook",
        json=_hook_payload("pre-create", {"source_id": str(uuid.uuid4())}),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["RejectUpload"] is True
    assert body["HTTPResponse"]["StatusCode"] == 404

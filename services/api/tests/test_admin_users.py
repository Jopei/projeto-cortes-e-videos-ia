from __future__ import annotations

from app.models.user import User
from tests.factories import insert_channel


def test_admin_endpoints_require_admin(logged_in_client):
    assert logged_in_client.get("/api/admin/users").status_code == 403
    assert logged_in_client.post("/api/admin/users", json={"username": "x", "password": "x" * 12}).status_code == 403


def test_admin_endpoints_require_auth(client):
    assert client.get("/api/admin/users").status_code == 401


def test_admin_create_user_applies_env_defaults_and_forces_password_change(admin_client):
    resp = admin_client.post("/api/admin/users", json={"username": "newbie", "password": "a-strong-password"})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["must_change_password"] is True
    assert body["storage_quota_bytes"] == 50 * 1024**3
    assert body["daily_analysis_quota"] == 10
    assert body["max_channels"] == 4
    assert body["usage"]["storage_used_bytes"] == 0
    assert body["clips_count"] == 0


def test_admin_create_user_explicit_unlimited_quota(admin_client):
    resp = admin_client.post(
        "/api/admin/users",
        json={"username": "vip", "password": "a-strong-password", "storage_quota_gb": None, "must_change_password": False},
    )
    assert resp.status_code == 201
    assert resp.json()["storage_quota_bytes"] is None
    assert resp.json()["must_change_password"] is False


def test_admin_create_user_password_too_short_is_422(admin_client):
    resp = admin_client.post("/api/admin/users", json={"username": "short", "password": "short"})
    assert resp.status_code == 422


def test_admin_create_user_duplicate_username_is_409(admin_client, user):
    resp = admin_client.post("/api/admin/users", json={"username": user.username, "password": "a-strong-password"})
    assert resp.status_code == 409


def test_admin_list_users_includes_usage(admin_client, user):
    users = admin_client.get("/api/admin/users").json()
    [entry] = [u for u in users if u["id"] == str(user.id)]
    assert "usage" in entry
    assert entry["clips_count"] == 0


def test_admin_patch_user_quota_and_is_active(admin_client, user):
    resp = admin_client.patch(f"/api/admin/users/{user.id}", json={"storage_quota_gb": 5, "is_active": False})
    assert resp.status_code == 200
    body = resp.json()
    assert body["storage_quota_bytes"] == 5 * 1024**3
    assert body["is_active"] is False


def test_admin_cannot_remove_own_admin_or_deactivate_self(admin_client, admin_user):
    assert admin_client.patch(f"/api/admin/users/{admin_user.id}", json={"is_admin": False}).status_code == 409
    assert admin_client.patch(f"/api/admin/users/{admin_user.id}", json={"is_active": False}).status_code == 409


def test_admin_can_demote_another_admin_while_staying_active_themselves(admin_client, admin_user, session_factory):
    """With two active admins, demoting the OTHER one is fine — the acting
    admin (required to be active+admin to even call this endpoint) always
    keeps the system with at least one active admin in this case."""
    db = session_factory()
    second_admin = User(
        username="second-admin", password_hash=admin_user.password_hash, is_active=True, is_admin=True
    )
    db.add(second_admin)
    db.commit()
    db.refresh(second_admin)
    second_admin_id = second_admin.id
    db.close()

    resp_ok = admin_client.patch(f"/api/admin/users/{second_admin_id}", json={"is_admin": False})
    assert resp_ok.status_code == 200


def test_last_admin_guard_helper_detects_zero_remaining_admins(admin_user, session_factory):
    """Unit-level check of the guard `update_user`/`delete_user` rely on
    (`_count_active_admins`) — HTTP-level, this branch is only reachable via
    the (separately-tested, unconditional) self-protection rule, since the
    acting admin must themselves be active+admin to call the endpoint at
    all; this test exercises the helper directly instead of contriving an
    impossible-via-API state."""
    from app.routers.admin_users import _count_active_admins

    db = session_factory()
    try:
        assert _count_active_admins(db, exclude_id=admin_user.id) == 0

        second_admin = User(
            username="second-admin", password_hash=admin_user.password_hash, is_active=True, is_admin=True
        )
        db.add(second_admin)
        db.commit()
        db.refresh(second_admin)

        assert _count_active_admins(db, exclude_id=admin_user.id) == 1
        assert _count_active_admins(db, exclude_id=second_admin.id) == 1
    finally:
        db.close()


def test_admin_reset_password_forces_change_and_new_login_works(admin_client, user, session_factory, client):
    resp = admin_client.post(f"/api/admin/users/{user.id}/reset-password", json={"new_password": "brand-new-password"})
    assert resp.status_code == 200

    db = session_factory()
    refreshed = db.get(User, user.id)
    assert refreshed.must_change_password is True
    db.close()

    login = client.post("/api/auth/login", json={"username": user.username, "password": "brand-new-password"})
    assert login.status_code == 200
    me = client.get("/api/auth/me").json()
    assert me["must_change_password"] is True


def test_admin_delete_empty_user_is_hard_deleted(admin_client, session_factory):
    resp = admin_client.post("/api/admin/users", json={"username": "throwaway", "password": "a-strong-password"})
    user_id = resp.json()["id"]

    delete_resp = admin_client.delete(f"/api/admin/users/{user_id}")
    assert delete_resp.status_code == 204

    db = session_factory()
    assert db.get(User, __import__("uuid").UUID(user_id)) is None
    db.close()


def test_admin_delete_user_with_data_is_soft_deactivated(admin_client, session_factory, user):
    insert_channel(session_factory, owner_id=user.id, slug="tem-dados")

    resp = admin_client.delete(f"/api/admin/users/{user.id}")
    assert resp.status_code == 204

    db = session_factory()
    refreshed = db.get(User, user.id)
    assert refreshed is not None
    assert refreshed.is_active is False
    db.close()


def test_admin_cannot_delete_self(admin_client, admin_user):
    assert admin_client.delete(f"/api/admin/users/{admin_user.id}").status_code == 409


# --- self-service: change-password, deactivated session ---------------------


def test_change_password_requires_correct_current_password(logged_in_client):
    resp = logged_in_client.post(
        "/api/auth/change-password", json={"current_password": "wrong", "new_password": "a-new-password-1"}
    )
    assert resp.status_code == 401


def test_change_password_success_clears_must_change_flag(logged_in_client, user_password, user):
    resp = logged_in_client.post(
        "/api/auth/change-password",
        json={"current_password": user_password, "new_password": "a-new-password-1"},
    )
    assert resp.status_code == 200
    me = logged_in_client.get("/api/auth/me").json()
    assert me["must_change_password"] is False


def test_deactivated_user_session_stops_working_immediately(logged_in_client, session_factory, user):
    assert logged_in_client.get("/api/auth/me").status_code == 200

    db = session_factory()
    target = db.get(User, user.id)
    target.is_active = False
    db.commit()
    db.close()

    assert logged_in_client.get("/api/auth/me").status_code == 401
    assert logged_in_client.get("/api/channels").status_code == 401


def test_my_usage_endpoint(logged_in_client, user):
    resp = logged_in_client.get("/api/me/usage")
    assert resp.status_code == 200
    body = resp.json()
    assert body["storage_used_bytes"] == 0
    assert body["channels_count"] == 0


# --- session_version bumps (see tests/test_auth.py for the cookie-level behavior) ---


def _session_version(session_factory, user_id) -> int:
    db = session_factory()
    value = db.get(User, user_id).session_version
    db.close()
    return value


def test_reset_password_bumps_session_version(admin_client, user, session_factory):
    before = _session_version(session_factory, user.id)
    resp = admin_client.post(f"/api/admin/users/{user.id}/reset-password", json={"new_password": "brand-new-password-1"})
    assert resp.status_code == 200
    assert _session_version(session_factory, user.id) == before + 1


def test_patch_is_admin_change_bumps_session_version(admin_client, user, session_factory):
    before = _session_version(session_factory, user.id)
    resp = admin_client.patch(f"/api/admin/users/{user.id}", json={"is_admin": True})
    assert resp.status_code == 200
    assert _session_version(session_factory, user.id) == before + 1


def test_patch_is_active_false_bumps_session_version(admin_client, user, session_factory):
    before = _session_version(session_factory, user.id)
    resp = admin_client.patch(f"/api/admin/users/{user.id}", json={"is_active": False})
    assert resp.status_code == 200
    assert _session_version(session_factory, user.id) == before + 1


def test_patch_unrelated_field_does_not_bump_session_version(admin_client, user, session_factory):
    before = _session_version(session_factory, user.id)
    resp = admin_client.patch(f"/api/admin/users/{user.id}", json={"display_name": "New Name"})
    assert resp.status_code == 200
    assert _session_version(session_factory, user.id) == before


def test_soft_delete_bumps_session_version(admin_client, session_factory, user):
    insert_channel(session_factory, owner_id=user.id, slug="tem-dados-sv")
    before = _session_version(session_factory, user.id)

    resp = admin_client.delete(f"/api/admin/users/{user.id}")
    assert resp.status_code == 204
    assert _session_version(session_factory, user.id) == before + 1

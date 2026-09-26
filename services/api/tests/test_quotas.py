"""Storage (413) / daily-analysis (429) / channel-count (409) quota
enforcement — see app/quotas.py. Admins are always exempt.
"""

from __future__ import annotations

from app.models.user import User
from tests.factories import insert_media_asset, insert_source


def _set_user_field(session_factory, user_id, **fields):
    db = session_factory()
    target = db.get(User, user_id)
    for field, value in fields.items():
        setattr(target, field, value)
    db.commit()
    db.close()


def _hook_payload(hook_type: str, metadata: dict, size: int | None = None) -> dict:
    upload: dict = {"MetaData": metadata}
    if size is not None:
        upload["Size"] = size
    return {"Type": hook_type, "Event": {"Upload": upload}}


# --- storage quota (413) ---------------------------------------------------


def test_upload_pre_create_rejected_when_storage_quota_exceeded(logged_in_client, session_factory, user, source_id):
    _set_user_field(session_factory, user.id, storage_quota_bytes=100)

    resp = logged_in_client.post(
        "/api/uploads/tusd-hook",
        json=_hook_payload("pre-create", {"source_id": str(source_id)}, size=1000),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["RejectUpload"] is True
    assert body["HTTPResponse"]["StatusCode"] == 413


def test_upload_pre_create_allowed_within_storage_quota(logged_in_client, session_factory, user, source_id):
    _set_user_field(session_factory, user.id, storage_quota_bytes=10_000_000)

    resp = logged_in_client.post(
        "/api/uploads/tusd-hook",
        json=_hook_payload("pre-create", {"source_id": str(source_id)}, size=1000),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "RejectUpload" not in body


def test_admin_exempt_from_storage_quota(admin_client, session_factory, admin_user):
    _set_user_field(session_factory, admin_user.id, storage_quota_bytes=1)
    source_id = insert_source(session_factory, owner_id=admin_user.id)

    resp = admin_client.post(
        "/api/uploads/tusd-hook",
        json=_hook_payload("pre-create", {"source_id": str(source_id)}, size=10_000_000),
    )
    body = resp.json()
    assert "RejectUpload" not in body


# --- daily analysis quota (429) --------------------------------------------


def test_analyze_rejected_after_daily_quota_reached(logged_in_client, session_factory, user, media_asset_id):
    _set_user_field(session_factory, user.id, daily_analysis_quota=1)

    first = logged_in_client.post(f"/api/media-assets/{media_asset_id}/analyze", json={"preset": "action"})
    assert first.status_code == 201, first.text

    second = logged_in_client.post(f"/api/media-assets/{media_asset_id}/analyze", json={"preset": "action"})
    assert second.status_code == 429


def test_admin_exempt_from_analysis_quota(admin_client, session_factory, admin_user):
    _set_user_field(session_factory, admin_user.id, daily_analysis_quota=0)
    source_id = insert_source(session_factory, owner_id=admin_user.id)
    media_asset_id = insert_media_asset(session_factory, source_id, owner_id=admin_user.id)

    resp = admin_client.post(f"/api/media-assets/{media_asset_id}/analyze", json={"preset": "action"})
    assert resp.status_code == 201


# --- channel count quota (409) ---------------------------------------------


def test_create_channel_rejected_after_max_channels_reached(logged_in_client, session_factory, user):
    _set_user_field(session_factory, user.id, max_channels=1)

    first = logged_in_client.post("/api/channels", json={"name": "A", "slug": "quota-a"})
    assert first.status_code == 201

    second = logged_in_client.post("/api/channels", json={"name": "B", "slug": "quota-b"})
    assert second.status_code == 409


def test_admin_exempt_from_channel_quota(admin_client, session_factory, admin_user):
    _set_user_field(session_factory, admin_user.id, max_channels=0)
    resp = admin_client.post("/api/channels", json={"name": "Admin channel", "slug": "admin-quota"})
    assert resp.status_code == 201

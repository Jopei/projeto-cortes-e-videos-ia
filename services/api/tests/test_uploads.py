"""Regression tests for the tusd hook's cross-tenant IDOR fix (see
CLAUDE.md "Auth" and app/uploads_security.py).

`pre-create` requires a session (already covered in tests/test_auth.py);
these tests focus on `post-finish`/`post-terminate`, which are reachable
without a cookie by design (tusd doesn't forward one to those events) and
therefore must stand on their own: the HMAC "upload ticket" minted in
`pre-create` — not the caller-supplied `owner_id`/`source_id`/`Storage.Key`
— is what post-finish actually trusts.
"""

from __future__ import annotations

import uuid

from app.main import app
from app.models.media_asset import MediaAsset
from app.storage import get_s3_client
from app.uploads_security import compute_upload_ticket, new_upload_object_id
from tests.fake_s3 import FakeS3Client
from tests.factories import insert_source


def _override_s3(objects: dict[str, bytes]) -> None:
    app.dependency_overrides[get_s3_client] = lambda: FakeS3Client(objects)


def _clear_s3_override() -> None:
    app.dependency_overrides.pop(get_s3_client, None)


def _pre_create(client, *, source_id, channel_id=None, filename="movie.mp4"):
    metadata = {"source_id": str(source_id), "filename": filename}
    if channel_id is not None:
        metadata["channel_id"] = str(channel_id)
    resp = client.post(
        "/api/uploads/tusd-hook",
        json={"Type": "pre-create", "Event": {"Upload": {"MetaData": metadata, "Size": 12345}}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "RejectUpload" not in body, body
    return body["ChangeFileInfo"]


def _finish_payload(*, object_id: str, metadata: dict, storage_key: str | None = None, multipart_id: str = "mpid123"):
    upload = {
        "ID": f"{object_id}+{multipart_id}",
        "MetaData": metadata,
        "Size": 999999,  # deliberately wrong — real size must come from S3 head_object, not this
    }
    if storage_key is not None:
        upload["Storage"] = {"Key": storage_key}
    return {"Type": "post-finish", "Event": {"Upload": upload}}


# --- pre-create: server-chosen id + ticket ----------------------------------


def test_pre_create_assigns_owner_prefixed_id_and_ticket(logged_in_client, user, source_id):
    change = _pre_create(logged_in_client, source_id=source_id)
    assert change["ID"].startswith(f"users/{user.id}/")
    assert change["MetaData"]["owner_id"] == str(user.id)
    assert change["MetaData"]["upload_ticket"]
    assert change["MetaData"]["filename"] == "movie.mp4"


def test_pre_create_ignores_client_supplied_owner_id_and_ticket(logged_in_client, user, source_id):
    resp = logged_in_client.post(
        "/api/uploads/tusd-hook",
        json={
            "Type": "pre-create",
            "Event": {
                "Upload": {
                    "MetaData": {
                        "source_id": str(source_id),
                        "owner_id": str(uuid.uuid4()),
                        "upload_ticket": "attacker-supplied",
                    }
                }
            },
        },
    )
    body = resp.json()
    assert body["ChangeFileInfo"]["MetaData"]["owner_id"] == str(user.id)
    assert body["ChangeFileInfo"]["MetaData"]["upload_ticket"] != "attacker-supplied"


# --- post-finish: legitimate flow -------------------------------------------


def test_post_finish_legitimate_flow_creates_media_asset_with_prefixed_key(
    logged_in_client, session_factory, user, source_id
):
    change = _pre_create(logged_in_client, source_id=source_id)
    object_id = change["ID"]
    data = b"real video bytes"
    _override_s3({object_id: data})
    try:
        resp = logged_in_client.post(
            "/api/uploads/tusd-hook",
            json=_finish_payload(object_id=object_id, metadata=change["MetaData"], storage_key=object_id),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "media_asset_id" in body, body

        db = session_factory()
        media_asset = db.get(MediaAsset, uuid.UUID(body["media_asset_id"]))
        assert media_asset is not None
        assert media_asset.owner_id == user.id
        assert media_asset.storage_key == object_id
        assert media_asset.storage_key.startswith(f"users/{user.id}/")
        # Real object size from S3 head_object, NOT the (deliberately wrong)
        # Upload.Size in the payload.
        assert media_asset.size_bytes == len(data)
        db.close()
    finally:
        _clear_s3_override()


def test_post_finish_is_idempotent_on_replay(logged_in_client, session_factory, user, source_id):
    change = _pre_create(logged_in_client, source_id=source_id)
    object_id = change["ID"]
    _override_s3({object_id: b"data"})
    try:
        payload = _finish_payload(object_id=object_id, metadata=change["MetaData"], storage_key=object_id)
        first = logged_in_client.post("/api/uploads/tusd-hook", json=payload)
        second = logged_in_client.post("/api/uploads/tusd-hook", json=payload)
        assert first.json()["media_asset_id"] == second.json()["media_asset_id"]

        db = session_factory()
        count = db.query(MediaAsset).filter(MediaAsset.storage_key == object_id).count()
        assert count == 1
        db.close()
    finally:
        _clear_s3_override()


# --- post-finish: forged/direct calls (the audited PoC) ---------------------


def test_post_finish_forged_storage_key_of_another_users_object_is_ignored(
    logged_in_client, other_logged_in_client, session_factory, user, other_user, source_id
):
    """The audited PoC: attacker (B) has their own valid owner_id/source_id/
    ticket (from their own legitimate pre-create) but points `Storage.Key`
    at the victim's (A's) real object. Since `post-finish` derives
    `storage_key` from `Upload.ID` alone — never from `Storage.Key` — B ends
    up (at most) with their own object, never A's."""
    victim_source = source_id  # owned by `user` (A)
    victim_change = _pre_create(logged_in_client, source_id=victim_source)
    victim_object_id = victim_change["ID"]
    victim_data = b"victim's private video bytes"

    attacker_source = insert_source(session_factory, owner_id=other_user.id)
    attacker_change = _pre_create(other_logged_in_client, source_id=attacker_source)
    attacker_object_id = attacker_change["ID"]

    _override_s3({victim_object_id: victim_data, attacker_object_id: b"attacker's own bytes"})
    try:
        # B's own legitimate Upload.ID/MetaData/ticket, but Storage.Key forged
        # to point at the victim's object.
        resp = other_logged_in_client.post(
            "/api/uploads/tusd-hook",
            json=_finish_payload(
                object_id=attacker_object_id,
                metadata=attacker_change["MetaData"],
                storage_key=victim_object_id,
            ),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "media_asset_id" in body, body

        db = session_factory()
        media_asset = db.get(MediaAsset, uuid.UUID(body["media_asset_id"]))
        assert media_asset.owner_id == other_user.id
        # Never the victim's key/content — always the id-derived one.
        assert media_asset.storage_key == attacker_object_id
        assert media_asset.storage_key != victim_object_id
        assert db.query(MediaAsset).filter(MediaAsset.storage_key == victim_object_id).count() == 0
        db.close()
    finally:
        _clear_s3_override()


def test_post_finish_forged_upload_id_of_another_users_object_is_rejected(
    other_logged_in_client, session_factory, user, other_user, source_id
):
    """A stronger forgery attempt: B sets `Upload.ID` itself to A's real
    (already-finished) object id, with B's own owner_id/source_id in
    metadata. The HMAC ticket was signed for A's owner_id/source_id, so it
    can't validate against B's claimed identity — no MediaAsset is created."""
    victim_change = _pre_create_as_victim = None  # noqa: F841 - readability marker
    db = session_factory()
    victim_object_id = new_upload_object_id(user.id)
    db.add(
        MediaAsset(
            owner_id=user.id,
            source_id=source_id,
            filename="victim.mp4",
            storage_key=victim_object_id,
            size_bytes=10,
        )
    )
    db.commit()
    db.close()

    attacker_source = insert_source(session_factory, owner_id=other_user.id)
    forged_ticket = compute_upload_ticket(victim_object_id, other_user.id, attacker_source, None)

    resp = other_logged_in_client.post(
        "/api/uploads/tusd-hook",
        json=_finish_payload(
            object_id=victim_object_id,
            metadata={
                "source_id": str(attacker_source),
                "owner_id": str(other_user.id),
                "upload_ticket": forged_ticket,
            },
            storage_key=victim_object_id,
        ),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "media_asset_id" not in body

    db = session_factory()
    # Still exactly the one (pre-seeded) row for that key — nothing new.
    assert db.query(MediaAsset).filter(MediaAsset.storage_key == victim_object_id).count() == 1
    db.close()


def test_post_finish_missing_ticket_is_rejected(logged_in_client, session_factory, user, source_id):
    change = _pre_create(logged_in_client, source_id=source_id)
    object_id = change["ID"]
    metadata_without_ticket = {k: v for k, v in change["MetaData"].items() if k != "upload_ticket"}

    resp = logged_in_client.post(
        "/api/uploads/tusd-hook",
        json=_finish_payload(object_id=object_id, metadata=metadata_without_ticket, storage_key=object_id),
    )
    body = resp.json()
    assert "media_asset_id" not in body

    db = session_factory()
    assert db.query(MediaAsset).filter(MediaAsset.storage_key == object_id).count() == 0
    db.close()


def test_post_finish_tampered_ticket_is_rejected(logged_in_client, session_factory, user, source_id):
    change = _pre_create(logged_in_client, source_id=source_id)
    object_id = change["ID"]
    tampered_metadata = {**change["MetaData"], "upload_ticket": change["MetaData"]["upload_ticket"][:-4] + "0000"}

    resp = logged_in_client.post(
        "/api/uploads/tusd-hook",
        json=_finish_payload(object_id=object_id, metadata=tampered_metadata, storage_key=object_id),
    )
    body = resp.json()
    assert "media_asset_id" not in body

    db = session_factory()
    assert db.query(MediaAsset).filter(MediaAsset.storage_key == object_id).count() == 0
    db.close()


def test_post_finish_rejects_when_object_missing_from_storage(logged_in_client, session_factory, source_id):
    change = _pre_create(logged_in_client, source_id=source_id)
    object_id = change["ID"]
    _override_s3({})  # nothing actually uploaded
    try:
        resp = logged_in_client.post(
            "/api/uploads/tusd-hook",
            json=_finish_payload(object_id=object_id, metadata=change["MetaData"], storage_key=object_id),
        )
        body = resp.json()
        assert "media_asset_id" not in body

        db = session_factory()
        assert db.query(MediaAsset).filter(MediaAsset.storage_key == object_id).count() == 0
        db.close()
    finally:
        _clear_s3_override()


def test_post_terminate_with_mismatched_ticket_is_a_harmless_noop(logged_in_client):
    resp = logged_in_client.post(
        "/api/uploads/tusd-hook",
        json={
            "Type": "post-terminate",
            "Event": {
                "Upload": {
                    "ID": "users/does-not-matter/abc+mpid",
                    "MetaData": {"owner_id": str(uuid.uuid4()), "source_id": str(uuid.uuid4())},
                }
            },
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

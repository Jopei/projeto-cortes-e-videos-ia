from __future__ import annotations

from app.models.clip import ClipStatus
from app.models.platform_account import AccountMode
from tests.factories import insert_account, insert_channel, insert_clip, insert_media_asset, insert_source


def _create_channel(client, **overrides):
    body = {"name": "Ação Diária", "slug": "acao-diaria"}
    body.update(overrides)
    return client.post("/api/channels", json=body)


def test_channels_require_auth(client):
    assert client.get("/api/channels").status_code == 401
    assert client.post("/api/channels", json={"name": "x", "slug": "x"}).status_code == 401


def test_create_and_get_channel_with_counts(logged_in_client):
    resp = _create_channel(
        logged_in_client,
        niche="Ação",
        color="#ff0000",
        default_preset="action",
        default_params={"max_clips": 5, "language": "pt"},
        template={"language": "pt-BR", "fixed_hashtags": ["#shorts"]},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["slug"] == "acao-diaria"
    assert body["default_preset"] == "action"
    assert body["default_params"]["max_clips"] == 5
    assert body["template"]["fixed_hashtags"] == ["#shorts"]
    assert body["counts"] == {
        "accounts_by_platform": {p: 0 for p in ("youtube", "tiktok", "bilibili", "instagram", "facebook", "vimeo")},
        "clips_pending_review": 0,
        "publications_scheduled": 0,
        "publications_published": 0,
    }

    channel_id = body["id"]
    get_resp = logged_in_client.get(f"/api/channels/{channel_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == channel_id


def test_create_channel_duplicate_slug_conflicts(logged_in_client):
    assert _create_channel(logged_in_client, slug="dup").status_code == 201
    resp = _create_channel(logged_in_client, name="Outro", slug="dup")
    assert resp.status_code == 409


def test_list_channels_includes_counts(logged_in_client, session_factory):
    channel_id = insert_channel(session_factory, name="Comédia", slug="comedia")
    source_id = insert_source(session_factory)
    media_asset_id = insert_media_asset(session_factory, source_id)
    insert_clip(session_factory, media_asset_id=media_asset_id, status=ClipStatus.PENDING_REVIEW, channel_id=channel_id)
    insert_account(session_factory, platform="youtube", channel_id=channel_id)

    resp = logged_in_client.get("/api/channels")
    assert resp.status_code == 200
    [entry] = [c for c in resp.json() if c["id"] == str(channel_id)]
    assert entry["counts"]["clips_pending_review"] == 1
    assert entry["counts"]["accounts_by_platform"]["youtube"] == 1


def test_update_channel(logged_in_client):
    channel_id = _create_channel(logged_in_client, slug="editavel").json()["id"]
    resp = logged_in_client.patch(f"/api/channels/{channel_id}", json={"name": "Novo nome", "is_active": False})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Novo nome"
    assert resp.json()["is_active"] is False


def test_delete_channel_ok_when_no_scheduled_publications(logged_in_client):
    channel_id = _create_channel(logged_in_client, slug="deletavel").json()["id"]
    resp = logged_in_client.delete(f"/api/channels/{channel_id}")
    assert resp.status_code == 204
    assert logged_in_client.get(f"/api/channels/{channel_id}").status_code == 404


def test_delete_channel_conflicts_when_publication_scheduled(logged_in_client, session_factory):
    channel_id = insert_channel(session_factory, slug="com-agenda")
    source_id = insert_source(session_factory, license_type="cc_by", monetization_allowed=True)
    media_asset_id = insert_media_asset(session_factory, source_id)
    clip_id = insert_clip(
        session_factory, media_asset_id=media_asset_id, status=ClipStatus.APPROVED, channel_id=channel_id
    )
    account_id = insert_account(session_factory, platform="youtube", mode=AccountMode.OAUTH, channel_id=channel_id)

    batch_resp = logged_in_client.post(
        "/api/publications/batch",
        json={"clip_ids": [str(clip_id)], "account_ids": [str(account_id)], "schedule": "now"},
    )
    assert batch_resp.status_code == 201
    assert batch_resp.json()["created"][0]["status"] == "scheduled"

    resp = logged_in_client.delete(f"/api/channels/{channel_id}")
    assert resp.status_code == 409


# --- one-account-per-platform-per-channel ---------------------------------


def test_account_unique_per_channel_and_platform(logged_in_client, session_factory):
    channel_id = insert_channel(session_factory, slug="unico")
    resp1 = logged_in_client.post(
        "/api/accounts", json={"platform": "youtube", "display_name": "Canal A", "channel_id": str(channel_id)}
    )
    assert resp1.status_code == 201

    resp2 = logged_in_client.post(
        "/api/accounts", json={"platform": "youtube", "display_name": "Canal A (dup)", "channel_id": str(channel_id)}
    )
    assert resp2.status_code == 409


def test_multiple_null_channel_accounts_allowed_same_platform(logged_in_client):
    r1 = logged_in_client.post("/api/accounts", json={"platform": "tiktok", "display_name": "A"})
    r2 = logged_in_client.post("/api/accounts", json={"platform": "tiktok", "display_name": "B"})
    assert r1.status_code == 201
    assert r2.status_code == 201


def test_account_can_be_linked_to_channel_via_patch(logged_in_client, session_factory):
    channel_id = insert_channel(session_factory, slug="link-patch")
    account_id = insert_account(session_factory, platform="instagram")

    resp = logged_in_client.patch(f"/api/accounts/{account_id}", json={"channel_id": str(channel_id)})
    assert resp.status_code == 200
    assert resp.json()["channel_id"] == str(channel_id)


# --- analyze inherits channel defaults ------------------------------------


def test_analyze_uses_channel_defaults_when_not_provided(logged_in_client, session_factory):
    channel_id = insert_channel(
        session_factory,
        slug="defaults",
        default_preset="drama",
        default_params={"max_clips": 3, "language": "pt", "burn_subtitles": False},
    )
    source_id = insert_source(session_factory)
    media_asset_id = insert_media_asset(session_factory, source_id)

    # Link the media asset to the channel first via PATCH.
    patch_resp = logged_in_client.patch(f"/api/media-assets/{media_asset_id}", json={"channel_id": str(channel_id)})
    assert patch_resp.status_code == 200

    resp = logged_in_client.post(f"/api/media-assets/{media_asset_id}/analyze", json={})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["preset"] == "drama"
    assert body["params"]["max_clips"] == 3
    assert body["channel_id"] == str(channel_id)


def test_analyze_channel_id_override_beats_media_asset_channel(logged_in_client, session_factory):
    channel_a = insert_channel(session_factory, slug="a", default_preset="action")
    channel_b = insert_channel(session_factory, slug="b", default_preset="comedy")
    source_id = insert_source(session_factory)
    media_asset_id = insert_media_asset(session_factory, source_id)
    logged_in_client.patch(f"/api/media-assets/{media_asset_id}", json={"channel_id": str(channel_a)})

    resp = logged_in_client.post(
        f"/api/media-assets/{media_asset_id}/analyze", json={"channel_id": str(channel_b)}
    )
    assert resp.status_code == 201
    assert resp.json()["preset"] == "comedy"
    assert resp.json()["channel_id"] == str(channel_b)


def test_analyze_without_preset_and_without_channel_defaults_is_422(logged_in_client, session_factory):
    source_id = insert_source(session_factory)
    media_asset_id = insert_media_asset(session_factory, source_id)
    resp = logged_in_client.post(f"/api/media-assets/{media_asset_id}/analyze", json={})
    assert resp.status_code == 422


def test_analyze_explicit_preset_overrides_channel_default(logged_in_client, session_factory):
    channel_id = insert_channel(session_factory, slug="override-preset", default_preset="drama")
    source_id = insert_source(session_factory)
    media_asset_id = insert_media_asset(session_factory, source_id)
    logged_in_client.patch(f"/api/media-assets/{media_asset_id}", json={"channel_id": str(channel_id)})

    resp = logged_in_client.post(
        f"/api/media-assets/{media_asset_id}/analyze", json={"preset": "suspense"}
    )
    assert resp.status_code == 201
    assert resp.json()["preset"] == "suspense"


# --- publications batch target=channel ------------------------------------


def test_batch_target_channel_publishes_to_every_channel_account(logged_in_client, session_factory):
    channel_id = insert_channel(session_factory, slug="multi-conta")
    source_id = insert_source(session_factory, license_type="cc_by", monetization_allowed=True)
    media_asset_id = insert_media_asset(session_factory, source_id)
    clip_id = insert_clip(
        session_factory, media_asset_id=media_asset_id, status=ClipStatus.APPROVED, channel_id=channel_id
    )
    account1 = insert_account(session_factory, platform="youtube", mode=AccountMode.MANUAL, channel_id=channel_id)
    account2 = insert_account(session_factory, platform="tiktok", mode=AccountMode.MANUAL, channel_id=channel_id)
    # An unrelated account on a different (null) channel must NOT receive a publication.
    insert_account(session_factory, platform="instagram", mode=AccountMode.MANUAL)

    resp = logged_in_client.post(
        "/api/publications/batch", json={"clip_ids": [str(clip_id)], "target": "channel"}
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()["created"]
    assert len(created) == 2
    account_ids = {p["account_id"] for p in created}
    assert account_ids == {str(account1), str(account2)}
    assert all(p["status"] == "exported" for p in created)


def test_batch_target_channel_requires_clip_channel_id(logged_in_client, session_factory):
    source_id = insert_source(session_factory)
    media_asset_id = insert_media_asset(session_factory, source_id)
    clip_id = insert_clip(session_factory, media_asset_id=media_asset_id, status=ClipStatus.APPROVED)

    resp = logged_in_client.post(
        "/api/publications/batch", json={"clip_ids": [str(clip_id)], "target": "channel"}
    )
    assert resp.status_code == 422


def test_batch_target_channel_rejects_account_ids(logged_in_client):
    resp = logged_in_client.post(
        "/api/publications/batch",
        json={"clip_ids": [], "target": "channel", "account_ids": ["00000000-0000-0000-0000-000000000000"]},
    )
    assert resp.status_code == 422


# --- channel_id filters -----------------------------------------------------


def test_filters_by_channel_id(logged_in_client, session_factory):
    channel_id = insert_channel(session_factory, slug="filtro")
    other_channel_id = insert_channel(session_factory, slug="outro-filtro")
    source_id = insert_source(session_factory)
    media_asset_id = insert_media_asset(session_factory, source_id)
    logged_in_client.patch(f"/api/media-assets/{media_asset_id}", json={"channel_id": str(channel_id)})
    insert_clip(session_factory, media_asset_id=media_asset_id, channel_id=channel_id)
    insert_account(session_factory, platform="youtube", channel_id=channel_id)
    insert_account(session_factory, platform="tiktok", channel_id=other_channel_id)

    assert len(logged_in_client.get(f"/api/media-assets?channel_id={channel_id}").json()) == 1
    assert len(logged_in_client.get(f"/api/media-assets?channel_id={other_channel_id}").json()) == 0
    assert len(logged_in_client.get(f"/api/clips?channel_id={channel_id}").json()) == 1
    assert len(logged_in_client.get(f"/api/accounts?channel_id={channel_id}").json()) == 1
    assert len(logged_in_client.get(f"/api/accounts?channel_id={other_channel_id}").json()) == 1

    summary = logged_in_client.get(f"/api/dashboard/summary?channel_id={channel_id}").json()
    assert summary["uploads_total"] == 1

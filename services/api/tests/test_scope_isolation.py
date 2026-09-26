"""Per-router multi-tenant isolation: a regular user (B) must get a plain
404 — never a 403, see app/scope.py — for every read/write/stream endpoint
touching another user's (A) data; an admin sees everything by default and
can narrow down with `as_user`; a non-admin's own `as_user` is ignored.
"""

from __future__ import annotations

from app.models.clip import ClipStatus
from app.models.platform_account import AccountMode
from tests.factories import insert_account, insert_channel, insert_clip, insert_media_asset, insert_source


def _full_chain(session_factory, owner_id):
    """A (source, media_asset, channel, clip, account) tuple all owned by
    `owner_id`, wired together like a real user's data would be."""
    channel_id = insert_channel(session_factory, owner_id=owner_id)
    source_id = insert_source(session_factory, owner_id=owner_id, license_type="cc_by", monetization_allowed=True)
    media_asset_id = insert_media_asset(session_factory, source_id, owner_id=owner_id)
    clip_id = insert_clip(
        session_factory, media_asset_id=media_asset_id, owner_id=owner_id, status=ClipStatus.APPROVED, channel_id=channel_id
    )
    account_id = insert_account(session_factory, owner_id=owner_id, mode=AccountMode.MANUAL, channel_id=channel_id)
    return {
        "channel_id": channel_id,
        "source_id": source_id,
        "media_asset_id": media_asset_id,
        "clip_id": clip_id,
        "account_id": account_id,
    }


# --- sources -----------------------------------------------------------


def test_source_isolated_between_owners(logged_in_client, other_logged_in_client, session_factory, user):
    # Created via the raw-SQL factory (like every other Source fixture in
    # this suite — see tests/factories.py::insert_source docstring: Source's
    # ARRAY-typed columns don't round-trip through the ORM against sqlite's
    # hand-rolled TEXT columns, so `SourceRead` response validation of a
    # *populated* row only works against real Postgres — never asserted
    # here, consistent with the rest of the suite; see
    # test_publications_batch.py's similar note). The isolation check itself
    # (404 raised by `get_owned_or_404` before any serialization happens)
    # goes through the real API.
    source_id = insert_source(session_factory, owner_id=user.id)

    assert other_logged_in_client.get(f"/api/sources/{source_id}").status_code == 404
    assert other_logged_in_client.patch(f"/api/sources/{source_id}", json={"title": "hacked"}).status_code == 404
    assert other_logged_in_client.delete(f"/api/sources/{source_id}").status_code == 404
    assert other_logged_in_client.get("/api/sources").json() == []


# --- channels ------------------------------------------------------------


def test_channel_isolated_between_owners(logged_in_client, other_logged_in_client, session_factory, other_user):
    other_channel_id = insert_channel(session_factory, owner_id=other_user.id, slug="principal")

    # Same slug, different owner: allowed (unique is per-owner now).
    resp = logged_in_client.post("/api/channels", json={"name": "Meu canal", "slug": "principal"})
    assert resp.status_code == 201, resp.text

    assert other_logged_in_client.get(f"/api/channels/{resp.json()['id']}").status_code == 404
    assert logged_in_client.get(f"/api/channels/{other_channel_id}").status_code == 404
    assert logged_in_client.patch(f"/api/channels/{other_channel_id}", json={"name": "x"}).status_code == 404
    assert logged_in_client.delete(f"/api/channels/{other_channel_id}").status_code == 404
    channel_ids = {c["id"] for c in logged_in_client.get("/api/channels").json()}
    assert str(other_channel_id) not in channel_ids


# --- media assets ----------------------------------------------------------


def test_media_asset_isolated_between_owners(logged_in_client, other_logged_in_client, session_factory, user):
    chain = _full_chain(session_factory, user.id)
    media_asset_id = chain["media_asset_id"]

    assert other_logged_in_client.get(f"/api/media-assets/{media_asset_id}").status_code == 404
    assert other_logged_in_client.get(f"/api/media-assets/{media_asset_id}/video").status_code == 404
    assert (
        other_logged_in_client.patch(f"/api/media-assets/{media_asset_id}", json={"channel_id": None}).status_code
        == 404
    )
    assert (
        other_logged_in_client.post(f"/api/media-assets/{media_asset_id}/analyze", json={"preset": "action"}).status_code
        == 404
    )
    assert str(media_asset_id) not in [
        m["id"] for m in other_logged_in_client.get("/api/media-assets").json()
    ]


def test_media_asset_patch_rejects_cross_owner_channel(logged_in_client, session_factory, user, other_user):
    source_id = insert_source(session_factory, owner_id=user.id)
    media_asset_id = insert_media_asset(session_factory, source_id, owner_id=user.id)
    foreign_channel_id = insert_channel(session_factory, owner_id=other_user.id)

    resp = logged_in_client.patch(f"/api/media-assets/{media_asset_id}", json={"channel_id": str(foreign_channel_id)})
    assert resp.status_code == 404


def test_analyze_rejects_cross_owner_channel_override(logged_in_client, session_factory, user, other_user):
    source_id = insert_source(session_factory, owner_id=user.id)
    media_asset_id = insert_media_asset(session_factory, source_id, owner_id=user.id)
    foreign_channel_id = insert_channel(session_factory, owner_id=other_user.id)

    resp = logged_in_client.post(
        f"/api/media-assets/{media_asset_id}/analyze",
        json={"preset": "action", "channel_id": str(foreign_channel_id)},
    )
    assert resp.status_code == 404


# --- jobs / clips ----------------------------------------------------------


def test_job_and_clip_isolated_between_owners(logged_in_client, other_logged_in_client, session_factory, user):
    chain = _full_chain(session_factory, user.id)
    clip_id = chain["clip_id"]
    # The job is whatever insert_clip created — fetch it back via the owner's list.
    job_id = logged_in_client.get(f"/api/jobs?media_asset_id={chain['media_asset_id']}").json()[0]["id"]

    assert other_logged_in_client.get(f"/api/jobs/{job_id}").status_code == 404
    assert other_logged_in_client.post(f"/api/jobs/{job_id}/cancel").status_code == 404

    assert other_logged_in_client.get(f"/api/clips/{clip_id}").status_code == 404
    assert other_logged_in_client.patch(f"/api/clips/{clip_id}", json={"status": "rejected"}).status_code == 404
    assert (
        other_logged_in_client.post("/api/clips/bulk", json={"ids": [str(clip_id)], "action": "approve"}).status_code
        == 404
    )
    assert (
        other_logged_in_client.put(f"/api/clips/{clip_id}/metadata/youtube", json={"title": "x"}).status_code == 404
    )
    assert other_logged_in_client.post(f"/api/clips/{clip_id}/metadata/regenerate").status_code == 404
    assert other_logged_in_client.get(f"/api/clips/{clip_id}/video").status_code == 404
    assert other_logged_in_client.get(f"/api/clips/{clip_id}/thumbnail").status_code == 404
    assert str(clip_id) not in [c["id"] for c in other_logged_in_client.get("/api/clips").json()]


# --- accounts ----------------------------------------------------------


def test_account_isolated_between_owners(logged_in_client, other_logged_in_client, session_factory, user):
    account_id = insert_account(session_factory, owner_id=user.id, platform="youtube")

    assert other_logged_in_client.patch(f"/api/accounts/{account_id}", json={"display_name": "x"}).status_code == 404
    assert other_logged_in_client.delete(f"/api/accounts/{account_id}").status_code == 404
    assert str(account_id) not in [a["id"] for a in other_logged_in_client.get("/api/accounts").json()]


def test_account_create_rejects_cross_owner_channel(logged_in_client, session_factory, other_user):
    foreign_channel_id = insert_channel(session_factory, owner_id=other_user.id)
    resp = logged_in_client.post(
        "/api/accounts", json={"platform": "youtube", "display_name": "x", "channel_id": str(foreign_channel_id)}
    )
    assert resp.status_code == 404


def test_account_update_rejects_cross_owner_channel(logged_in_client, session_factory, user, other_user):
    account_id = insert_account(session_factory, owner_id=user.id, platform="youtube")
    foreign_channel_id = insert_channel(session_factory, owner_id=other_user.id)
    resp = logged_in_client.patch(f"/api/accounts/{account_id}", json={"channel_id": str(foreign_channel_id)})
    assert resp.status_code == 404


# --- publications ----------------------------------------------------------


def test_publication_isolated_between_owners(logged_in_client, other_logged_in_client, session_factory, user):
    chain = _full_chain(session_factory, user.id)
    resp = logged_in_client.post(
        "/api/publications/batch",
        json={"clip_ids": [str(chain["clip_id"])], "account_ids": [str(chain["account_id"])], "schedule": "now"},
    )
    assert resp.status_code == 201
    publication_id = resp.json()["created"][0]["id"]

    assert publication_id not in [p["id"] for p in other_logged_in_client.get("/api/publications").json()]
    assert other_logged_in_client.post(f"/api/publications/{publication_id}/cancel").status_code == 404
    assert other_logged_in_client.get(f"/api/publications/{publication_id}/export").status_code == 404
    # The owner's own request at least gets past the ownership check (a
    # manual-account publication is "exported", not cancelable — 409 is the
    # expected business-rule outcome here, never a 404).
    assert logged_in_client.post(f"/api/publications/{publication_id}/cancel").status_code != 404


# --- dashboard / audit-log ---------------------------------------------


def test_dashboard_scoped_per_owner(logged_in_client, session_factory, user, other_user):
    insert_source(session_factory, owner_id=other_user.id)
    other_media = insert_media_asset(session_factory, insert_source(session_factory, owner_id=other_user.id), owner_id=other_user.id)
    assert other_media  # sanity: row exists for the other tenant

    my_source = insert_source(session_factory, owner_id=user.id)
    insert_media_asset(session_factory, my_source, owner_id=user.id)

    summary = logged_in_client.get("/api/dashboard/summary").json()
    assert summary["uploads_total"] == 1


def test_audit_log_scoped_to_own_actions(logged_in_client, other_logged_in_client):
    logged_in_client.post("/api/channels", json={"name": "A", "slug": "a-audit"})
    other_logged_in_client.post("/api/channels", json={"name": "B", "slug": "b-audit"})

    mine = logged_in_client.get("/api/audit-log").json()
    theirs = other_logged_in_client.get("/api/audit-log").json()
    assert all(entry["details"].get("slug") != "b-audit" for entry in mine)
    assert all(entry["details"].get("slug") != "a-audit" for entry in theirs)


# --- admin: sees everything, as_user narrows, non-admin as_user ignored ----


def test_admin_sees_everything_and_as_user_narrows(admin_client, session_factory, user, other_user):
    channel_a = insert_channel(session_factory, owner_id=user.id, slug="canal-a")
    channel_b = insert_channel(session_factory, owner_id=other_user.id, slug="canal-b")

    all_ids = {c["id"] for c in admin_client.get("/api/channels").json()}
    assert {str(channel_a), str(channel_b)}.issubset(all_ids)

    only_a = {c["id"] for c in admin_client.get(f"/api/channels?as_user={user.id}").json()}
    assert only_a == {str(channel_a)}

    only_b = {c["id"] for c in admin_client.get("/api/channels", headers={"X-As-User": str(other_user.id)}).json()}
    assert only_b == {str(channel_b)}


def test_non_admin_as_user_is_ignored(logged_in_client, session_factory, other_user):
    insert_channel(session_factory, owner_id=other_user.id, slug="nao-deveria-aparecer")

    resp = logged_in_client.get(f"/api/channels?as_user={other_user.id}")
    assert resp.status_code == 200
    assert resp.json() == []

    # Creating while impersonating (as a non-admin) still creates for self.
    create_resp = logged_in_client.post(
        f"/api/channels?as_user={other_user.id}", json={"name": "Meu", "slug": "sempre-meu"}
    )
    assert create_resp.status_code == 201
    assert create_resp.json()["owner_id"] != str(other_user.id)


def test_admin_as_user_unknown_user_is_404(admin_client):
    resp = admin_client.get("/api/channels?as_user=00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_admin_create_on_behalf_of_as_user_stamps_target_owner(admin_client, user):
    resp = admin_client.post(f"/api/channels?as_user={user.id}", json={"name": "Para o usuário", "slug": "para-user"})
    assert resp.status_code == 201
    assert resp.json()["owner_id"] == str(user.id)

    # The audit trail records the ADMIN as the actor (AuditLog.user_id), with
    # `details.as_user` naming who they acted on behalf of — admin sees
    # everything unfiltered.
    audit = admin_client.get("/api/audit-log").json()
    matching = [e for e in audit if e["details"].get("slug") == "para-user"]
    assert matching
    assert matching[0]["details"].get("as_user") == str(user.id)

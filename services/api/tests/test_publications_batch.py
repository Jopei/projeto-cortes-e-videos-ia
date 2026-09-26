from __future__ import annotations

from app.models.clip import ClipStatus
from app.models.platform_account import AccountMode
from app.rights.gate import (
    CC_BY_NC_MONETIZATION_FORBIDDEN,
    CC_BY_ND_DERIVATIVE_FORBIDDEN,
    PLATFORM_NOT_ALLOWED,
)
from tests.factories import insert_account, insert_clip, insert_media_asset, insert_source

# NOTE: the "outside validity window" block reason is intentionally NOT
# re-tested through the full HTTP stack here — Source.valid_from/valid_until
# are tz-aware DateTime columns and sqlite (used for these tests, see
# conftest.py) doesn't round-trip timezone-aware datetimes the way real
# Postgres does. It's already exhaustively covered by the pure unit tests in
# test_rights_gate.py, which is the single source of truth for that logic
# anyway (app/rights/gate.py).


def _batch(client, clip_ids, account_ids, **kwargs):
    body = {"clip_ids": [str(i) for i in clip_ids], "account_ids": [str(i) for i in account_ids]}
    body.update(kwargs)
    return client.post("/api/publications/batch", json=body)


def test_batch_requires_auth(client, source_id, media_asset_id):
    resp = _batch(client, [], [])
    assert resp.status_code == 401


def test_batch_blocks_when_clip_not_approved(logged_in_client, session_factory, source_id, media_asset_id):
    clip_id = insert_clip(session_factory, media_asset_id=media_asset_id, status=ClipStatus.PENDING_REVIEW)
    account_id = insert_account(session_factory, platform="youtube", mode=AccountMode.MANUAL)

    resp = _batch(logged_in_client, [clip_id], [account_id])
    assert resp.status_code == 201
    [pub] = resp.json()["created"]
    assert pub["status"] == "blocked"
    assert pub["block_reasons"] == ["clip_not_approved"]


def test_batch_blocks_cc_by_nd_always(logged_in_client, session_factory):
    source_id = insert_source(session_factory, license_type="cc_by_nd")
    media_asset_id = insert_media_asset(session_factory, source_id)
    clip_id = insert_clip(session_factory, media_asset_id=media_asset_id, status=ClipStatus.APPROVED)
    account_id = insert_account(session_factory, platform="youtube", mode=AccountMode.MANUAL, monetized=False)

    resp = _batch(logged_in_client, [clip_id], [account_id])
    assert resp.status_code == 201
    [pub] = resp.json()["created"]
    assert pub["status"] == "blocked"
    assert CC_BY_ND_DERIVATIVE_FORBIDDEN in pub["block_reasons"]


def test_batch_blocks_cc_by_nc_when_account_monetized(logged_in_client, session_factory):
    source_id = insert_source(session_factory, license_type="cc_by_nc", monetization_allowed=True)
    media_asset_id = insert_media_asset(session_factory, source_id)
    clip_id = insert_clip(session_factory, media_asset_id=media_asset_id, status=ClipStatus.APPROVED)
    account_id = insert_account(session_factory, platform="youtube", mode=AccountMode.MANUAL, monetized=True)

    resp = _batch(logged_in_client, [clip_id], [account_id])
    assert resp.status_code == 201
    [pub] = resp.json()["created"]
    assert pub["status"] == "blocked"
    assert CC_BY_NC_MONETIZATION_FORBIDDEN in pub["block_reasons"]


def test_batch_blocks_platform_not_allowed(logged_in_client, session_factory):
    # allowed_platforms round-trips as a raw string on sqlite (Source.allowed_platforms
    # is a postgres-only ARRAY type — see tests/factories.py::insert_source), so any
    # non-empty value here restricts to something that will never equal a whole
    # platform name; enough to exercise the "not allowed" branch end-to-end.
    source_id = insert_source(session_factory, license_type="cc_by", allowed_platforms="x")
    media_asset_id = insert_media_asset(session_factory, source_id)
    clip_id = insert_clip(session_factory, media_asset_id=media_asset_id, status=ClipStatus.APPROVED)
    account_id = insert_account(session_factory, platform="youtube", mode=AccountMode.MANUAL, monetized=False)

    resp = _batch(logged_in_client, [clip_id], [account_id])
    assert resp.status_code == 201
    [pub] = resp.json()["created"]
    assert pub["status"] == "blocked"
    assert PLATFORM_NOT_ALLOWED in pub["block_reasons"]


def test_batch_manual_account_exports_directly_when_gate_passes(logged_in_client, session_factory):
    source_id = insert_source(session_factory, license_type="cc_by", monetization_allowed=True)
    media_asset_id = insert_media_asset(session_factory, source_id)
    clip_id = insert_clip(session_factory, media_asset_id=media_asset_id, status=ClipStatus.APPROVED)
    account_id = insert_account(session_factory, platform="youtube", mode=AccountMode.MANUAL, monetized=False)

    resp = _batch(logged_in_client, [clip_id], [account_id])
    assert resp.status_code == 201
    [pub] = resp.json()["created"]
    assert pub["status"] == "exported"
    assert pub["block_reasons"] is None


def test_batch_oauth_account_now_is_scheduled_immediately(logged_in_client, session_factory):
    source_id = insert_source(session_factory, license_type="cc_by", monetization_allowed=True)
    media_asset_id = insert_media_asset(session_factory, source_id)
    clip_id = insert_clip(session_factory, media_asset_id=media_asset_id, status=ClipStatus.APPROVED)
    account_id = insert_account(session_factory, platform="youtube", mode=AccountMode.OAUTH, monetized=False)

    resp = _batch(logged_in_client, [clip_id], [account_id], schedule="now")
    assert resp.status_code == 201
    [pub] = resp.json()["created"]
    assert pub["status"] == "scheduled"
    assert pub["scheduled_at"] is not None

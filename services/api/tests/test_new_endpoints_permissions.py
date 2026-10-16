from __future__ import annotations

import uuid

import pytest

_RANDOM_ID = uuid.uuid4()

GET_ENDPOINTS = [
    "/api/presets",
    "/api/jobs",
    f"/api/jobs/{_RANDOM_ID}",
    "/api/clips",
    f"/api/clips/{_RANDOM_ID}",
    "/api/platforms",
    "/api/accounts",
    "/api/publications",
    "/api/audit-log",
    "/api/dashboard/summary",
    "/api/channels",
    f"/api/channels/{_RANDOM_ID}",
    "/api/series",
    "/api/series/providers",
    f"/api/series/providers/tts/fake_tts/voices",
    f"/api/series/{_RANDOM_ID}",
    f"/api/series/{_RANDOM_ID}/episodes",
    f"/api/series/{_RANDOM_ID}/episodes/1",
    f"/api/series/{_RANDOM_ID}/costs",
    f"/api/series/{_RANDOM_ID}/characters/{_RANDOM_ID}/reference-image",
]

POST_ENDPOINTS = [
    f"/api/media-assets/{_RANDOM_ID}/analyze",
    f"/api/jobs/{_RANDOM_ID}/cancel",
    "/api/clips/bulk",
    f"/api/clips/{_RANDOM_ID}/metadata/regenerate",
    "/api/accounts",
    "/api/publications/batch",
    f"/api/publications/{_RANDOM_ID}/cancel",
    f"/api/publications/{_RANDOM_ID}/takedown",
    "/api/channels",
    "/api/series",
    "/api/series/estimate",
    f"/api/series/{_RANDOM_ID}/replan",
    f"/api/series/{_RANDOM_ID}/start",
    f"/api/series/{_RANDOM_ID}/pause",
    f"/api/series/{_RANDOM_ID}/resume",
    f"/api/series/{_RANDOM_ID}/cancel",
    f"/api/series/{_RANDOM_ID}/episodes/1/regenerate",
    f"/api/series/{_RANDOM_ID}/episodes/1/approve-script",
    f"/api/series/{_RANDOM_ID}/episodes/1/approve",
    f"/api/series/{_RANDOM_ID}/episodes/1/reject",
    f"/api/series/{_RANDOM_ID}/episodes/1/unapprove",
]

PUT_ENDPOINTS = [
    f"/api/series/{_RANDOM_ID}/bible",
    f"/api/series/{_RANDOM_ID}/outline/1",
    f"/api/series/{_RANDOM_ID}/episodes/1/script",
    f"/api/series/{_RANDOM_ID}/characters/{_RANDOM_ID}/reference-image",
]

PATCH_ENDPOINTS = [
    f"/api/series/{_RANDOM_ID}",
    f"/api/series/{_RANDOM_ID}/characters/{_RANDOM_ID}",
]

DELETE_ENDPOINTS = [
    f"/api/series/{_RANDOM_ID}",
    f"/api/series/{_RANDOM_ID}/characters/{_RANDOM_ID}/reference-image",
]


@pytest.mark.parametrize("path", GET_ENDPOINTS)
def test_get_endpoint_requires_auth(client, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", POST_ENDPOINTS)
def test_post_endpoint_requires_auth(client, path):
    assert client.post(path, json={}).status_code == 401


@pytest.mark.parametrize("path", PUT_ENDPOINTS)
def test_put_endpoint_requires_auth(client, path):
    assert client.put(path, json={}).status_code == 401


@pytest.mark.parametrize("path", PATCH_ENDPOINTS)
def test_patch_endpoint_requires_auth(client, path):
    assert client.patch(path, json={}).status_code == 401


@pytest.mark.parametrize("path", DELETE_ENDPOINTS)
def test_delete_endpoint_requires_auth(client, path):
    assert client.delete(path).status_code == 401

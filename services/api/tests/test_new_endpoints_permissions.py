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
]


@pytest.mark.parametrize("path", GET_ENDPOINTS)
def test_get_endpoint_requires_auth(client, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", POST_ENDPOINTS)
def test_post_endpoint_requires_auth(client, path):
    assert client.post(path, json={}).status_code == 401

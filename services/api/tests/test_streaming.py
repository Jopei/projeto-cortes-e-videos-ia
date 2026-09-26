from __future__ import annotations

from app.main import app
from app.storage import get_s3_client
from tests.fake_s3 import FakeS3Client


def _override_s3(data: bytes, key: str):
    def _factory():
        return FakeS3Client({key: data})

    app.dependency_overrides[get_s3_client] = _factory


def test_media_asset_video_requires_auth(client, source_id, media_asset_id):
    resp = client.get(f"/api/media-assets/{media_asset_id}/video")
    assert resp.status_code == 401


def test_media_asset_video_full_body_without_range(logged_in_client, source_id, media_asset_id):
    data = b"0123456789" * 10
    _override_s3(data, "media-assets/test.mp4")
    try:
        resp = logged_in_client.get(f"/api/media-assets/{media_asset_id}/video")
        assert resp.status_code == 200
        assert resp.content == data
        assert resp.headers["accept-ranges"] == "bytes"
    finally:
        app.dependency_overrides.pop(get_s3_client, None)


def test_media_asset_video_range_returns_206_partial_content(logged_in_client, source_id, media_asset_id):
    data = bytes(range(256)) * 4  # 1024 bytes, distinct content per byte
    _override_s3(data, "media-assets/test.mp4")
    try:
        resp = logged_in_client.get(
            f"/api/media-assets/{media_asset_id}/video",
            headers={"Range": "bytes=10-19"},
        )
        assert resp.status_code == 206
        assert resp.content == data[10:20]
        assert resp.headers["content-range"] == f"bytes 10-19/{len(data)}"
        assert resp.headers["content-length"] == "10"
    finally:
        app.dependency_overrides.pop(get_s3_client, None)


def test_media_asset_video_missing_object_is_404(logged_in_client, source_id, media_asset_id):
    _override_s3(b"data", "some-other-key.mp4")
    try:
        resp = logged_in_client.get(f"/api/media-assets/{media_asset_id}/video")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_s3_client, None)

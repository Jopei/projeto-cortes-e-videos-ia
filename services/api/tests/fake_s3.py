"""Minimal in-memory stand-in for the boto3 S3 client, used to test
`app.storage.stream_s3_object` (HTTP Range support) without a real S3/
SeaweedFS endpoint. Override `app.storage.get_s3_client` with an instance of
`FakeS3Client` via `app.dependency_overrides` in a test.
"""

from __future__ import annotations

from collections.abc import Iterator


class FakeClientError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class _FakeBody:
    def __init__(self, data: bytes) -> None:
        self._data = data
        self.closed = False

    def iter_chunks(self, chunk_size: int = 256 * 1024) -> Iterator[bytes]:
        for i in range(0, len(self._data), chunk_size):
            yield self._data[i : i + chunk_size]

    def read(self) -> bytes:
        return self._data

    def close(self) -> None:
        self.closed = True


class FakeS3Client:
    def __init__(self, objects: dict[str, bytes]) -> None:
        self._objects = objects

    def get_object(self, Bucket: str, Key: str, Range: str | None = None) -> dict:
        if Key not in self._objects:
            raise FakeClientError("NoSuchKey")
        data = self._objects[Key]
        total = len(data)

        if not Range:
            return {"Body": _FakeBody(data), "ContentLength": total}

        spec = Range.split("=", 1)[1]
        start_s, _, end_s = spec.partition("-")
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else total - 1
        if start >= total:
            raise FakeClientError("InvalidRange")
        end = min(end, total - 1)
        chunk = data[start : end + 1]
        return {
            "Body": _FakeBody(chunk),
            "ContentLength": len(chunk),
            "ContentRange": f"bytes {start}-{end}/{total}",
        }

    def head_object(self, Bucket: str, Key: str) -> dict:
        if Key not in self._objects:
            raise FakeClientError("404")
        return {"ContentLength": len(self._objects[Key])}

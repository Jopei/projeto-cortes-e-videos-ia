"""S3 (SeaweedFS) access for the API: streaming clip/media-asset video and
thumbnails to the browser with HTTP Range support (so a plain `<video>` tag
can seek — the browser issues ranged GETs and expects 206 + Content-Range).

`get_s3_client` is a FastAPI dependency on purpose (not a module-level
singleton) so tests can override it with a fake in `app.dependency_overrides`
instead of hitting a real S3 endpoint — see tests/test_streaming.py.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, Protocol

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import get_settings


class S3Body(Protocol):
    def iter_chunks(self, chunk_size: int) -> Iterator[bytes]: ...
    def close(self) -> None: ...


class S3Client(Protocol):
    def get_object(self, **kwargs: Any) -> dict[str, Any]: ...
    def head_object(self, **kwargs: Any) -> dict[str, Any]: ...


class S3ClientError(Exception):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


def get_s3_client() -> S3Client:
    import boto3
    from botocore.config import Config

    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )


def stream_s3_object(request: Request, client: S3Client, storage_key: str, media_type: str) -> StreamingResponse:
    range_header = request.headers.get("range")
    extra_args: dict[str, str] = {}
    if range_header and range_header.startswith("bytes="):
        extra_args["Range"] = range_header

    try:
        obj = client.get_object(Bucket=get_settings().s3_bucket, Key=storage_key, **extra_args)
    except Exception as exc:  # noqa: BLE001 - both boto3 ClientError and our fake test error
        code = getattr(exc, "code", None) or getattr(exc, "response", {}).get("Error", {}).get("Code")  # type: ignore[union-attr]
        if code in {"NoSuchKey", "404"}:
            raise HTTPException(status_code=404, detail="File not found in storage") from exc
        if code == "InvalidRange":
            raise HTTPException(status_code=416, detail="Requested range not satisfiable") from exc
        raise HTTPException(status_code=502, detail="Storage backend error") from exc

    body = obj["Body"]
    headers = {"Accept-Ranges": "bytes"}
    status_code = 200

    content_range = obj.get("ContentRange")
    if content_range:
        headers["Content-Range"] = content_range
        status_code = 206
    if "ContentLength" in obj:
        headers["Content-Length"] = str(obj["ContentLength"])

    def _iter() -> Iterator[bytes]:
        try:
            yield from body.iter_chunks(chunk_size=256 * 1024)
        finally:
            body.close()

    return StreamingResponse(_iter(), status_code=status_code, media_type=media_type, headers=headers)

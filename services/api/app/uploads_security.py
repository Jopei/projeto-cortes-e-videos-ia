"""Server-side identity for tusd uploads: a per-owner-prefixed `Upload.ID`
plus an HMAC "ticket" binding it to the `(owner_id, source_id, channel_id)`
decided by the `pre-create` hook.

Why this exists (see CLAUDE.md "Auth" / audit finding #1, IDOR via
`post-finish`): `post-finish`/`post-terminate` are reachable directly against
the API, without a session cookie (tusd doesn't forward `Cookie` to those
events, and there is no shared secret between tusd and the API in the tusd
version in use). Before this module, `post-finish` trusted whatever
`owner_id`/`source_id`/`Storage.Key` a caller supplied in the request body
(as long as `owner_id` matched `source_id`'s real owner) — a direct POST to
`/api/uploads/tusd-hook` with your OWN owner_id/source_id but SOMEONE ELSE'S
`Storage.Key` created a `MediaAsset` you owned pointing at their video.

The fix: `pre-create` (which DOES require a valid session, see
`app/routers/uploads.py`) is the only place that ever decides the object id
and mints a ticket for it. `post-finish`/`post-terminate` then re-derive
`storage_key` from `Upload.ID` (never from the caller-supplied `Storage.Key`)
and refuse to act unless the ticket verifies — a forged direct call can't
produce a valid ticket without knowing the server's secret.
"""

from __future__ import annotations

import hashlib
import hmac
import uuid

from app.config import get_settings

UPLOAD_ID_PREFIX = "users"


def _hook_secret() -> bytes:
    """The HMAC key for upload tickets.

    Uses `TUSD_HOOK_SECRET` when set (see .env.example); otherwise derives a
    dedicated key from `SECRET_KEY` (never reuses `SECRET_KEY` bytes
    directly for a different purpose) so there's no extra required env var
    for existing deployments.
    """
    settings = get_settings()
    if settings.tusd_hook_secret:
        return settings.tusd_hook_secret.encode()
    return hmac.new(settings.secret_key.encode(), b"tusd-upload-ticket-v1", hashlib.sha256).digest()


def new_upload_object_id(owner_id: uuid.UUID) -> str:
    """A fresh server-chosen tusd `Upload.ID`, to be returned as
    `ChangeFileInfo.ID` from the `pre-create` hook.

    tusd's s3store uses this verbatim as the S3 object key and then appends
    `+<multipartUploadId>` to form the *final* `Upload.ID` reported in later
    events (see `pkg/s3store/s3store.go::NewUpload` in tusd v2.10+) — so the
    value returned here (without the `+...` suffix) is what
    `split_upload_id` recovers as `object_id` from that final id, and is
    exactly the S3 key of the finished object.
    """
    return f"{UPLOAD_ID_PREFIX}/{owner_id}/{uuid.uuid4().hex}"


def compute_upload_ticket(
    object_id: str,
    owner_id: uuid.UUID,
    source_id: uuid.UUID,
    channel_id: uuid.UUID | None,
) -> str:
    message = f"{object_id}|{owner_id}|{source_id}|{channel_id or ''}".encode()
    return hmac.new(_hook_secret(), message, hashlib.sha256).hexdigest()


def verify_upload_ticket(
    ticket: str | None,
    object_id: str,
    owner_id: uuid.UUID,
    source_id: uuid.UUID,
    channel_id: uuid.UUID | None,
) -> bool:
    if not ticket:
        return False
    expected = compute_upload_ticket(object_id, owner_id, source_id, channel_id)
    return hmac.compare_digest(ticket, expected)


def split_upload_id(upload_id: str) -> tuple[str, str] | None:
    """Mirror tusd s3store's `splitIds`: the object id is everything before
    the LAST `+` (a multipart-upload id follows it). Returns `None` if
    `upload_id` doesn't have that shape (not one of our own ids)."""
    if not upload_id or "+" not in upload_id:
        return None
    object_id, _, multipart_id = upload_id.rpartition("+")
    if not object_id or not multipart_id:
        return None
    return object_id, multipart_id


def owner_owns_object_id(object_id: str, owner_id: uuid.UUID) -> bool:
    return object_id.startswith(f"{UPLOAD_ID_PREFIX}/{owner_id}/")

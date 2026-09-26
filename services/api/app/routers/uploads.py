from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import resolve_user_from_cookie
from app.models.channel import Channel
from app.models.media_asset import MediaAsset
from app.models.source import Source
from app.models.user import User
from app.quotas import storage_used_bytes
from app.storage import S3Client, get_s3_client
from app.uploads_security import (
    compute_upload_ticket,
    new_upload_object_id,
    owner_owns_object_id,
    split_upload_id,
    verify_upload_ticket,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# Metadata keys the server owns exclusively — any value a client sends for
# these in the original tus upload metadata is dropped before we add our own
# (see `pre-create` below). Without this, a client could pre-seed a bogus
# `upload_ticket` hoping it survives untouched; it never does, but stripping
# it up front makes that explicit rather than relying on dict-merge order.
_RESERVED_METADATA_KEYS = {"owner_id", "upload_ticket"}


def _reject(message: str, status_code: int = 400) -> JSONResponse:
    """Build a tusd HTTP-hook rejection response.

    tusd's HTTP hooks protocol accepts a JSON body with `RejectUpload` (for
    `pre-create`) plus an `HTTPResponse` describing what tusd should return
    to the uploading client. The hook endpoint itself must answer 200: tusd v2
    treats any other status as a hook failure and returns 500 to the client.
    """
    return JSONResponse(
        status_code=200,
        content={
            "RejectUpload": True,
            "HTTPResponse": {"StatusCode": status_code, "Body": message},
        },
    )


def _parse_uuid(raw: str | None) -> uuid.UUID | None:
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


def _verify_signed_upload(
    *,
    upload: dict[str, Any],
    metadata: dict[str, Any],
    owner_id_raw: str | None,
    source_id_raw: str | None,
    channel_id_raw: str | None,
    db: Session,
) -> tuple[str, uuid.UUID, uuid.UUID, Source] | None:
    """Shared validation for `post-finish`/`post-terminate`: confirms this
    event really is the one our own `pre-create` authorized, and returns
    `(object_id, owner_uuid, source_uuid, source)` on success or `None` (with
    a logged reason) otherwise.

    `object_id` is derived from `Upload.ID` alone — it is the actual S3 key
    tusd wrote the object to (see `app/uploads_security.py`), and the caller
    MUST use it instead of any `Storage.Key` echoed in the payload.
    """
    raw_upload_id = upload.get("ID") or ""

    owner_uuid = _parse_uuid(owner_id_raw)
    if owner_uuid is None:
        logger.warning("tusd hook without a valid owner_id metadata; ignoring upload %r", raw_upload_id)
        return None

    if not source_id_raw:
        logger.warning("tusd hook without metadata.source_id; ignoring upload %r", raw_upload_id)
        return None
    source_uuid = _parse_uuid(source_id_raw)
    source = db.get(Source, source_uuid) if source_uuid else None
    if source is None or source.owner_id != owner_uuid:
        logger.warning("tusd hook owner_id/source_id mismatch (upload %r); ignoring", raw_upload_id)
        return None

    split = split_upload_id(raw_upload_id)
    if split is None:
        logger.warning("tusd hook with malformed Upload.ID %r; ignoring", raw_upload_id)
        return None
    object_id, _multipart_id = split

    if not owner_owns_object_id(object_id, owner_uuid):
        logger.warning(
            "tusd hook Upload.ID %r does not belong to claimed owner_id %s; ignoring "
            "(forged hook call outside the tus flow?)",
            raw_upload_id,
            owner_uuid,
        )
        return None

    channel_uuid_signed = _parse_uuid(channel_id_raw) if channel_id_raw else None
    if not verify_upload_ticket(
        metadata.get("upload_ticket"), object_id, owner_uuid, source_uuid, channel_uuid_signed
    ):
        logger.warning(
            "tusd hook with invalid/missing upload_ticket for upload %r; ignoring "
            "(forged hook call outside the tus flow?)",
            raw_upload_id,
        )
        return None

    return object_id, owner_uuid, source_uuid, source


@router.post("/tusd-hook")
async def tusd_hook(
    request: Request,
    db: Session = Depends(get_db),
    s3: S3Client = Depends(get_s3_client),
) -> Any:
    """HTTP hook consumed by tusd (see tusd's HTTP hooks documentation).

    - `pre-create`: requires a valid `cortes_session` cookie (tusd forwards
      the client's `Cookie` header here via `-hooks-http-forward-headers`,
      see docker-compose.yml), a `metadata.source_id` naming an existing
      Source **owned by the caller** (or any Source when the caller is an
      admin — the upload is then attributed to that Source's own owner, not
      the admin), an optional `metadata.channel_id` owned by that same
      owner, and enough storage quota headroom for `Upload.Size` (when
      known). On success the response sets `ChangeFileInfo.ID` to a
      server-chosen, per-owner-prefixed id (`users/{owner_id}/{uuid4hex}`,
      see `app/uploads_security.py::new_upload_object_id`) — this becomes the
      literal S3 object key tusd writes to — and `ChangeFileInfo.MetaData`
      adds `owner_id` plus an `upload_ticket` (HMAC over
      `object_id|owner_id|source_id|channel_id`). Any client-supplied
      `owner_id`/`upload_ticket` in the original metadata is dropped first.
    - `post-finish`: creates the MediaAsset row once the upload is complete.
      Trusts NOTHING from the request except by first recomputing the
      `upload_ticket` from `Upload.ID` + `Upload.MetaData` and comparing it
      with `hmac.compare_digest` (see `_verify_signed_upload` /
      `app/uploads_security.py`) — a mismatch (forged/replayed/tampered
      call, e.g. someone else's `Storage.Key` with your own owner_id/
      source_id) is silently ignored, never creates a row. `storage_key` is
      always derived from `Upload.ID` itself (never trusted from the
      payload's `Storage.Key`), its existence is confirmed with a real S3
      `head_object` (also the source of `size_bytes`, never `Upload.Size`
      from the payload), and the call is idempotent: a `storage_key` that
      already has a `MediaAsset` returns the existing one instead of
      duplicating (backed by a DB unique constraint, migration `0006`).
    - `post-terminate`: same ticket verification as `post-finish`, logged
      only — there's no MediaAsset row to clean up at this stage (it's only
      ever created in `post-finish`), so a failed/forged verification here
      has no state to protect beyond the log signal.
    - any other hook type: acknowledged as a no-op (HTTP 200).

    This endpoint is otherwise unauthenticated by necessity (tusd is the
    caller, on the internal docker network) — see CLAUDE.md "Auth" for the
    residual network-level risk (post-finish/post-terminate reachable
    without a cookie), which the upload-ticket check above closes for the
    *cross-tenant data* risk specifically: a forged call can no longer make
    the API create a `MediaAsset` over content it didn't itself authorize.
    """
    payload = await request.json()
    hook_type = payload.get("Type")
    upload = payload.get("Event", {}).get("Upload", {})
    metadata = upload.get("MetaData") or {}
    source_id_raw = metadata.get("source_id")
    channel_id_raw = metadata.get("channel_id")

    if hook_type == "pre-create":
        user = resolve_user_from_cookie(request, db)
        if user is None:
            return _reject("Authentication required", status_code=401)
        if not source_id_raw:
            return _reject("metadata.source_id is required to start an upload")
        source_uuid = _parse_uuid(source_id_raw)
        if source_uuid is None:
            return _reject("metadata.source_id must be a valid UUID")
        source = db.get(Source, source_uuid)
        if source is None:
            return _reject("metadata.source_id does not match an existing Source", status_code=404)

        # A non-admin can only upload against their own Source. An admin can
        # upload against any Source, but the resulting MediaAsset is owned
        # by that Source's owner (never by the admin) — uploads always
        # belong to the tenant whose rights record they're attached to.
        if not user.is_admin and source.owner_id != user.id:
            return _reject("metadata.source_id does not match an existing Source", status_code=404)
        owner_id = source.owner_id

        channel_uuid = _parse_uuid(channel_id_raw) if channel_id_raw else None
        if channel_id_raw and channel_uuid is None:
            return _reject("metadata.channel_id must be a valid UUID")
        if channel_uuid is not None:
            channel = db.get(Channel, channel_uuid)
            if channel is None or channel.owner_id != owner_id:
                return _reject("metadata.channel_id does not match an existing Channel", status_code=404)

        owner = user if owner_id == user.id else db.get(User, owner_id)
        upload_size = upload.get("Size")
        if owner is not None and not owner.is_admin and owner.storage_quota_bytes is not None and upload_size:
            used = storage_used_bytes(db, owner_id)
            if used + int(upload_size) > owner.storage_quota_bytes:
                return _reject(
                    "Cota de armazenamento excedida: este upload ultrapassaria o limite disponível.",
                    status_code=413,
                )

        object_id = new_upload_object_id(owner_id)
        upload_ticket = compute_upload_ticket(object_id, owner_id, source_uuid, channel_uuid)
        sanitized_metadata = {k: v for k, v in metadata.items() if k not in _RESERVED_METADATA_KEYS}

        return {
            "HTTPResponse": {"StatusCode": 200},
            "ChangeFileInfo": {
                "ID": object_id,
                "MetaData": {**sanitized_metadata, "owner_id": str(owner_id), "upload_ticket": upload_ticket},
            },
        }

    if hook_type == "post-finish":
        verified = _verify_signed_upload(
            upload=upload,
            metadata=metadata,
            owner_id_raw=metadata.get("owner_id"),
            source_id_raw=source_id_raw,
            channel_id_raw=channel_id_raw,
            db=db,
        )
        if verified is None:
            return {"ok": False, "reason": "invalid_or_unsigned_upload"}
        object_id, owner_uuid, source_uuid, source = verified

        reported_key = (upload.get("Storage") or {}).get("Key")
        if reported_key and reported_key != object_id:
            logger.warning(
                "tusd post-finish Storage.Key %r does not match the id-derived key %r for upload %s; "
                "using the derived key (Storage.Key from the payload is never trusted)",
                reported_key,
                object_id,
                upload.get("ID"),
            )
        storage_key = object_id

        existing = db.query(MediaAsset).filter(MediaAsset.storage_key == storage_key).one_or_none()
        if existing is not None:
            return {"media_asset_id": str(existing.id)}

        settings = get_settings()
        try:
            head = s3.head_object(Bucket=settings.s3_bucket, Key=storage_key)
        except Exception as exc:  # noqa: BLE001 - boto3 ClientError or a test fake
            logger.warning(
                "tusd post-finish: object %r not found in storage for upload %s: %s",
                storage_key,
                upload.get("ID"),
                exc,
            )
            return {"ok": False, "reason": "object_missing_in_storage"}
        size_bytes = head.get("ContentLength")

        channel_uuid = _parse_uuid(channel_id_raw) if channel_id_raw else None
        if channel_uuid is not None:
            channel = db.get(Channel, channel_uuid)
            if channel is None or channel.owner_id != owner_uuid:
                channel_uuid = None
        if channel_uuid is None:
            channel_uuid = source.default_channel_id

        media_asset = MediaAsset(
            owner_id=owner_uuid,
            source_id=source_uuid,
            channel_id=channel_uuid,
            filename=metadata.get("filename") or upload.get("ID"),
            storage_key=storage_key,
            duration=None,
            size_bytes=int(size_bytes) if size_bytes is not None else None,
        )
        db.add(media_asset)
        try:
            db.commit()
        except IntegrityError:
            # Lost a race against a concurrent/replayed post-finish for the
            # same (unique) storage_key — fall back to the idempotent path.
            db.rollback()
            existing = db.query(MediaAsset).filter(MediaAsset.storage_key == storage_key).one_or_none()
            if existing is not None:
                return {"media_asset_id": str(existing.id)}
            raise
        db.refresh(media_asset)
        return {"media_asset_id": str(media_asset.id)}

    if hook_type == "post-terminate":
        # Nothing to clean up here (a MediaAsset only ever gets created in
        # post-finish, above) — this is verification for the audit log only,
        # so a forged/mismatched call is just noted, not acted upon.
        _verify_signed_upload(
            upload=upload,
            metadata=metadata,
            owner_id_raw=metadata.get("owner_id"),
            source_id_raw=source_id_raw,
            channel_id_raw=channel_id_raw,
            db=db,
        )
        return {"ok": True}

    return {"ok": True}

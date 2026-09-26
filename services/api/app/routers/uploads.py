from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import resolve_user_from_cookie
from app.models.channel import Channel
from app.models.media_asset import MediaAsset
from app.models.source import Source
from app.models.user import User
from app.quotas import storage_used_bytes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


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


@router.post("/tusd-hook")
async def tusd_hook(request: Request, db: Session = Depends(get_db)) -> Any:
    """HTTP hook consumed by tusd (see tusd's HTTP hooks documentation).

    - `pre-create`: requires a valid `cortes_session` cookie (tusd forwards
      the client's `Cookie` header here via `-hooks-http-forward-headers`,
      see docker-compose.yml), a `metadata.source_id` naming an existing
      Source **owned by the caller** (or any Source when the caller is an
      admin — the upload is then attributed to that Source's own owner, not
      the admin), an optional `metadata.channel_id` owned by that same
      owner, and enough storage quota headroom for `Upload.Size` (when
      known). On success the response's `ChangeFileInfo.MetaData` adds
      `owner_id` — this is how `post-finish` (below) learns who the upload
      belongs to without re-deriving it from a cookie tusd doesn't forward
      to that event (see CLAUDE.md "Auth" residual-risk note).
    - `post-finish`: creates the MediaAsset row once the upload is complete,
      trusting ONLY the `owner_id` tusd echoes back in `Upload.MetaData`
      (set by `pre-create`'s `ChangeFileInfo`, not attacker-controlled input)
      and cross-checking it against `metadata.source_id`'s actual owner —
      a mismatch (or missing `owner_id`) silently skips MediaAsset creation
      instead of creating an "orphan" row.
    - any other hook type: acknowledged as a no-op (HTTP 200).

    This endpoint is otherwise unauthenticated by necessity (tusd is the
    caller, on the internal docker network) — see CLAUDE.md "Auth" section
    for the residual-risk note on `post-finish`/`post-terminate`.
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

        return {
            "HTTPResponse": {"StatusCode": 200},
            "ChangeFileInfo": {"MetaData": {**metadata, "owner_id": str(owner_id)}},
        }

    if hook_type == "post-finish":
        owner_id_raw = metadata.get("owner_id")
        owner_uuid = _parse_uuid(owner_id_raw)
        if owner_uuid is None:
            logger.warning("tusd post-finish without a valid owner_id metadata; ignoring upload %s", upload.get("ID"))
            return {"ok": False, "reason": "missing_owner_id"}

        if not source_id_raw:
            logger.warning("tusd post-finish without metadata.source_id; ignoring upload %s", upload.get("ID"))
            return {"ok": False, "reason": "missing_source_id"}
        source_uuid = _parse_uuid(source_id_raw)
        source = db.get(Source, source_uuid) if source_uuid else None
        if source is None or source.owner_id != owner_uuid:
            logger.warning(
                "tusd post-finish owner_id/source_id mismatch (upload %s); ignoring", upload.get("ID")
            )
            return {"ok": False, "reason": "owner_source_mismatch"}

        channel_uuid = _parse_uuid(channel_id_raw) if channel_id_raw else None
        if channel_uuid is not None:
            channel = db.get(Channel, channel_uuid)
            if channel is None or channel.owner_id != owner_uuid:
                channel_uuid = None
        if channel_uuid is None:
            channel_uuid = source.default_channel_id

        storage_key = (upload.get("Storage") or {}).get("Key") or upload.get("ID")
        size_bytes = upload.get("Size")
        media_asset = MediaAsset(
            owner_id=owner_uuid,
            source_id=source_uuid,
            channel_id=channel_uuid,
            filename=metadata.get("filename") or upload.get("ID"),
            storage_key=storage_key,
            duration=None,
            size_bytes=int(size_bytes) if size_bytes else None,
        )
        db.add(media_asset)
        db.commit()
        db.refresh(media_asset)
        return {"media_asset_id": str(media_asset.id)}

    return {"ok": True}

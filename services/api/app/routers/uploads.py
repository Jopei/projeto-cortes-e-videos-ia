from __future__ import annotations

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


@router.post("/tusd-hook")
async def tusd_hook(request: Request, db: Session = Depends(get_db)) -> Any:
    """HTTP hook consumed by tusd (see tusd's HTTP hooks documentation).

    - `pre-create`: requires a valid `cortes_session` cookie (tusd forwards
      the client's `Cookie` header here via `-hooks-http-forward-headers`,
      see docker-compose.yml) *and* rejects the upload unless
      `metadata.source_id` names an existing Source. This is what makes
      "upload without a rights record" (or without being logged in)
      impossible at the transport level, not just discouraged by convention.
    - `post-finish`: creates the MediaAsset row once the upload is complete.
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
        if resolve_user_from_cookie(request, db) is None:
            return _reject("Authentication required", status_code=401)
        if not source_id_raw:
            return _reject("metadata.source_id is required to start an upload")
        try:
            source_uuid = uuid.UUID(source_id_raw)
        except ValueError:
            return _reject("metadata.source_id must be a valid UUID")
        if db.get(Source, source_uuid) is None:
            return _reject("metadata.source_id does not match an existing Source", status_code=404)
        if channel_id_raw:
            try:
                channel_uuid = uuid.UUID(channel_id_raw)
            except ValueError:
                return _reject("metadata.channel_id must be a valid UUID")
            if db.get(Channel, channel_uuid) is None:
                return _reject("metadata.channel_id does not match an existing Channel", status_code=404)
        return {"HTTPResponse": {"StatusCode": 200}}

    if hook_type == "post-finish":
        if not source_id_raw:
            return _reject("metadata.source_id is required")
        source_uuid = uuid.UUID(source_id_raw)
        source = db.get(Source, source_uuid)
        channel_uuid = uuid.UUID(channel_id_raw) if channel_id_raw else (source.default_channel_id if source else None)
        storage_key = (upload.get("Storage") or {}).get("Key") or upload.get("ID")
        media_asset = MediaAsset(
            source_id=source_uuid,
            channel_id=channel_uuid,
            filename=metadata.get("filename") or upload.get("ID"),
            storage_key=storage_key,
            duration=None,
        )
        db.add(media_asset)
        db.commit()
        db.refresh(media_asset)
        return {"media_asset_id": str(media_asset.id)}

    return {"ok": True}

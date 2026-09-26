"""Vimeo publisher — placeholder for Fase 5 (OAuth connect/callback and the
real upload flow are not implemented yet; `GET/POST /api/accounts/vimeo/
connect|callback` still answer 501, same as every other platform at this
stage).

Planned flow, once implemented:

1. OAuth: standard authorization-code grant against
   `https://api.vimeo.com/oauth/authorize` with
   `scope=public private upload edit delete` (space-separated), redirecting
   back to `{PUBLIC_API_URL}/api/accounts/vimeo/callback`. The exchanged
   access token gets encrypted (`app.crypto.encrypt_token`) and stored on
   `PlatformAccount`, same as every other OAuth platform — never persisted
   in clear, never returned by any schema.
2. Upload: create the video resource first via
   `POST https://api.vimeo.com/me/videos` with
   `{"upload": {"approach": "tus", "size": <bytes>}, "name": title,
   "description": description, "privacy": {"view": "nobody" | "anybody"}}`
   (`"nobody"` for unreviewed/testing accounts, `"anybody"` once a channel
   is trusted — mirrors the "unaudited app -> private/self-only" pattern
   already used for YouTube/TikTok). The response includes an
   `upload.upload_link`; the actual bytes are then sent as one or more
   `PATCH` requests against that link per the tus resumable-upload protocol
   (`Tus-Resumable`, `Upload-Offset` headers) — NOT a single POST like
   YouTube's `videos.insert`.
3. Tags: Vimeo's video resource takes a plain `tags` list (no `#` prefix),
   unlike the `hashtags` produced by `app.worker.metadata.pipeline`
   (`#`-prefixed, shared shape for every platform — see that module's
   docstring). This publisher's `upload()` is the place that must strip the
   leading `#` (and any platform-illegal characters) before sending
   `tags` — do not push that conversion upstream into the metadata
   pipeline.
4. Status/delete: `status()` reads `GET /videos/{id}` (e.g. transcode
   status); `delete()` (used by the takedown feature) calls
   `DELETE /videos/{id}`.

Like every Publisher, this class must NOT embed any rights/licensing
check — callers are required to have already gotten `ok=True` from
`app.rights.gate.check_publishable` before ever calling `upload()`.
"""

from __future__ import annotations

from app.worker.publishers.base import Publisher, PublishResult


class VimeoPublisher(Publisher):
    platform = "vimeo"

    def upload(self, *, file_path: str, title: str, description: str, tags: list[str]) -> PublishResult:
        raise NotImplementedError("Vimeo publishing is not implemented yet (Fase 5)")

    def status(self, post_id: str) -> str:
        raise NotImplementedError("Vimeo publishing is not implemented yet (Fase 5)")

    def delete(self, post_id: str) -> None:
        raise NotImplementedError("Vimeo publishing is not implemented yet (Fase 5)")

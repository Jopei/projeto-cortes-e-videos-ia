"""Small helpers shared by the channel-related routers/worker steps.

Kept as a single call site (like `app.audit.record_action`) so the
"effective template" merge rule doesn't get reimplemented ad hoc wherever a
channel+account pair needs one — today that's the metadata generation step
(`app.worker.metadata`, still a stub) and potentially the export package.
"""

from __future__ import annotations

from app.models.channel import Channel
from app.models.platform_account import PlatformAccount


def effective_template(channel: Channel | None, account: PlatformAccount | None) -> dict:
    """Merge a channel's `template` with an account's `template`, the
    account's fields winning on key collisions.

    Both `template` JSON blobs share the same shape: `language`, `tone`,
    `fixed_hashtags`, `title_max`, `extra_description` (see
    `PlatformAccount.template` / `Channel.template`). Neither side is
    required to set all (or any) keys.
    """
    merged: dict = {}
    if channel is not None and channel.template:
        merged.update(channel.template)
    if account is not None and account.template:
        merged.update(account.template)
    return merged


def effective_analysis_defaults(channel: Channel | None) -> tuple[str | None, dict]:
    """Return `(default_preset_value, default_params)` for a channel, used by
    `POST /api/media-assets/{id}/analyze` when the request doesn't supply its
    own `preset`/`params`. Both are `None`/`{}` when there's no channel or the
    channel hasn't set them.
    """
    if channel is None:
        return None, {}
    preset_value = channel.default_preset.value if channel.default_preset else None
    return preset_value, dict(channel.default_params or {})

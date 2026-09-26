from __future__ import annotations

from pydantic import BaseModel


class TemplateParams(BaseModel):
    """Shape shared by `Channel.template` and `PlatformAccount.template`.

    Every field is optional; the *effective* template for a (channel,
    account) pair is `app.channels.effective_template` — the account's
    fields win on key collisions with the channel's.
    """

    language: str | None = None
    tone: str | None = None
    fixed_hashtags: list[str] | None = None
    title_max: int | None = None
    extra_description: str | None = None

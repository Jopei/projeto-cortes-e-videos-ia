"""Registry + effective-value resolution for admin-managed integration
credentials (`GET/PUT/DELETE /api/admin/integrations`, see
`app/routers/admin_integrations.py`).

Every place in the codebase that today reads `settings.youtube_client_id`/
`.tiktok_client_key`/`.anthropic_api_key`/etc for one of the integrations
below MUST instead call `get_integration_value(integration_id, key)` — that
function is the ONE source of truth for "what value is actually in effect",
checking the DB (`IntegrationSetting`, admin-entered via the UI) first and
falling back to the env var (`app/config.py::Settings`) only when no DB row
exists. This is deliberately NOT cached beyond the lifetime of a single
call: the worker is a long-running separate process from the API, so an
admin saving a new key must be visible to the next Celery task without a
restart — a query against `integration_settings` is cheap and infrequent
enough (once per analyze/render/publish job, not a hot per-request path)
that no caching is needed for that guarantee to hold.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import app.db as db_module
from app.config import get_settings
from app.crypto import decrypt_token
from app.models.integration_setting import IntegrationSetting


@dataclass(frozen=True)
class IntegrationField:
    key: str
    label: str
    secret: bool
    required: bool = True


@dataclass(frozen=True)
class IntegrationDef:
    id: str
    name: str
    fields: list[IntegrationField] = field(default_factory=list)
    has_redirect: bool = True
    """Whether this integration exposes an OAuth `redirect_uri` in
    `GET /api/admin/integrations` (false only for `anthropic`, which isn't
    an OAuth flow)."""


INTEGRATIONS: dict[str, IntegrationDef] = {
    "youtube": IntegrationDef(
        id="youtube",
        name="YouTube",
        fields=[
            IntegrationField("client_id", "Client ID", secret=False, required=True),
            IntegrationField("client_secret", "Client Secret", secret=True, required=True),
        ],
    ),
    "tiktok": IntegrationDef(
        id="tiktok",
        name="TikTok",
        fields=[
            IntegrationField("client_key", "Client Key", secret=False, required=True),
            IntegrationField("client_secret", "Client Secret", secret=True, required=True),
        ],
    ),
    "instagram": IntegrationDef(
        id="instagram",
        name="Instagram",
        fields=[
            IntegrationField("app_id", "App ID", secret=False, required=True),
            IntegrationField("app_secret", "App Secret", secret=True, required=True),
        ],
    ),
    "facebook": IntegrationDef(
        id="facebook",
        name="Facebook",
        fields=[
            IntegrationField("app_id", "App ID", secret=False, required=True),
            IntegrationField("app_secret", "App Secret", secret=True, required=True),
        ],
    ),
    "bilibili": IntegrationDef(
        id="bilibili",
        name="Bilibili",
        fields=[
            # Optional/futuro: Bilibili has no approved Open Platform OAuth
            # app yet (see PLATFORM_INFO in app/routers/accounts.py) — the
            # fields exist so a future integration has somewhere to live,
            # but nothing here is required for `configured` to be true.
            IntegrationField("client_id", "Client ID", secret=False, required=False),
            IntegrationField("client_secret", "Client Secret", secret=True, required=False),
        ],
    ),
    "anthropic": IntegrationDef(
        id="anthropic",
        name="Anthropic",
        fields=[
            IntegrationField("api_key", "API Key", secret=True, required=True),
        ],
        has_redirect=False,
    ),
}


# (integration_id, key) -> attribute name on `Settings`, for the env fallback.
_ENV_ATTRS: dict[tuple[str, str], str] = {
    ("youtube", "client_id"): "youtube_client_id",
    ("youtube", "client_secret"): "youtube_client_secret",
    ("tiktok", "client_key"): "tiktok_client_key",
    ("tiktok", "client_secret"): "tiktok_client_secret",
    ("instagram", "app_id"): "instagram_app_id",
    ("instagram", "app_secret"): "instagram_app_secret",
    ("facebook", "app_id"): "facebook_app_id",
    ("facebook", "app_secret"): "facebook_app_secret",
    ("bilibili", "client_id"): "bilibili_client_id",
    ("bilibili", "client_secret"): "bilibili_client_secret",
    ("anthropic", "api_key"): "anthropic_api_key",
}


def list_integrations() -> list[IntegrationDef]:
    return list(INTEGRATIONS.values())


def get_integration_def(integration_id: str) -> IntegrationDef | None:
    return INTEGRATIONS.get(integration_id)


def _env_value(integration_id: str, key: str) -> str | None:
    attr = _ENV_ATTRS.get((integration_id, key))
    if attr is None:
        return None
    return getattr(get_settings(), attr, None)


def get_integration_value(integration_id: str, key: str) -> str | None:
    """The effective value for `(integration_id, key)`: whatever's saved in
    the DB, else the env var, else `None`. Opens and closes its own short
    session — safe to call from anywhere (routers, Celery tasks) without a
    `Session` on hand.
    """
    db = db_module.SessionLocal()
    try:
        row = (
            db.query(IntegrationSetting)
            .filter(IntegrationSetting.integration_id == integration_id, IntegrationSetting.key == key)
            .one_or_none()
        )
        if row is not None:
            return decrypt_token(row.value_encrypted)
    finally:
        db.close()
    return _env_value(integration_id, key)


def get_effective_field(integration_id: str, key: str) -> tuple[str | None, str | None]:
    """Like `get_integration_value` but also reports where the value came
    from: `(value, source)` with `source` in `"db"`/`"env"`/`None` (nothing
    configured either way)."""
    db = db_module.SessionLocal()
    try:
        row = (
            db.query(IntegrationSetting)
            .filter(IntegrationSetting.integration_id == integration_id, IntegrationSetting.key == key)
            .one_or_none()
        )
        if row is not None:
            return decrypt_token(row.value_encrypted), "db"
    finally:
        db.close()
    env_value = _env_value(integration_id, key)
    if env_value:
        return env_value, "env"
    return None, None


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    tail = value[-4:] if len(value) >= 4 else value
    return f"••••{tail}"

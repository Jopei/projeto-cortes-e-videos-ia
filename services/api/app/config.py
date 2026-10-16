from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, read from the environment (see .env.example).

    Most fields have a sane local-dev default so importing this module never
    fails when a real .env is absent (unit tests, one-off scripts, etc). The
    exception is `secret_key`, which signs session cookies/JWTs: the app
    refuses to start without a real one (see `_require_secret_key` below).
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://cortes:cortes@localhost:15432/cortes"
    redis_url: str = "redis://localhost:16379/0"

    s3_endpoint: str = "http://localhost:19000"
    s3_access_key: str = "cortesadmin"
    s3_secret_key: str = "cortesadmin"
    s3_bucket: str = "media"
    s3_region: str = "us-east-1"

    anthropic_api_key: str | None = None

    youtube_client_id: str | None = None
    youtube_client_secret: str | None = None
    tiktok_client_key: str | None = None
    tiktok_client_secret: str | None = None
    instagram_app_id: str | None = None
    instagram_app_secret: str | None = None
    facebook_app_id: str | None = None
    facebook_app_secret: str | None = None
    bilibili_client_id: str | None = None
    bilibili_client_secret: str | None = None
    vimeo_client_id: str | None = None
    vimeo_client_secret: str | None = None
    elevenlabs_api_key: str | None = None
    elevenlabs_model_id: str | None = None
    openai_api_key: str | None = None
    """Env fallback for the fields managed by `app/integrations.py` (see
    `GET/PUT /api/admin/integrations`) — a value saved in the
    `integration_settings` table always takes precedence over these; a
    given deployment can keep using plain env vars and never touch the UI
    at all."""

    token_encryption_key: str | None = None

    public_api_url: str = "http://localhost:18000"
    """Base URL used to build OAuth `redirect_uri`s surfaced by
    `GET /api/admin/integrations` (see app/integrations.py) — must match
    whatever the platform's OAuth app has registered as an allowed
    redirect."""

    celery_task_always_eager: bool = False
    """Run Celery tasks synchronously in-process, no broker needed. Only for
    tests (see tests/conftest.py) — never set true in a real deployment."""

    cors_origins: list[str] = ["http://localhost:13000"]

    # --- Auth (session cookie / JWT) ---
    secret_key: str = ""
    """HS256 signing key for the `cortes_session` cookie JWT. Required, >=32 chars."""
    cookie_secure: bool = False
    """Set the `Secure` flag on the session cookie. Enable in production (HTTPS)."""
    session_cookie_name: str = "cortes_session"
    session_ttl_days: int = 7

    tusd_hook_secret: str | None = None
    """Optional dedicated HMAC key for tusd upload tickets (see
    app/uploads_security.py). When unset, a key is derived from `secret_key`
    instead — this is only here so a deployment CAN rotate the upload-ticket
    secret independently of the session-signing one, not because one is
    required."""

    # --- Initial admin account (see `python -m app.cli create-admin`) ---
    admin_username: str | None = None
    admin_password: str | None = None

    # --- Analysis/render engine (app/worker/analysis, app/worker/render) ---
    whisper_enabled: bool = True
    """Turn speech transcription (faster-whisper) off entirely — used for
    fast local iteration or when a video has no dialogue. When False, the
    `speech`/`llm` signals are all zero and no transcript/subtitles exist."""
    whisper_model: str = "small"
    """faster-whisper model size (tiny|base|small|medium|large-v3, ...). Runs
    on CPU with int8 compute (see app/worker/analysis/speech.py) — bigger
    models are slower but more accurate; `small` is the default trade-off."""
    worker_tmp_dir: str = "/tmp/cortes-worker"
    """Scratch directory for downloads/intermediate ffmpeg output. Always
    cleaned up per-task (see app/worker/analysis/pipeline.py, app/worker/
    render/pipeline.py) — nothing here is meant to survive a task."""

    # --- Multi-tenant defaults (see CLAUDE.md "Multiusuário") ---
    # Applied by `POST /api/admin/users` whenever the admin doesn't set a
    # given quota explicitly (an explicit `null` means "unlimited" and is
    # respected as-is, it is NOT replaced by these defaults).
    default_storage_quota_gb: int = 50
    default_daily_analysis_quota: int = 10
    default_max_channels: int = 4

    # --- Series IA (see CLAUDE.md "Series IA: fundacao") ---
    story_planner_model: str = "claude-opus-5-5"
    story_writer_model: str = "claude-sonnet-5"
    story_fake_providers_enabled: bool = False
    """Expose the `fake_*` media providers (cost 0). Dev/tests only."""
    story_max_validation_attempts: int = 3
    story_worker_concurrency: int = 4
    genmedia_max_inflight_default: int = 2
    genmedia_poll_initial_s: int = 15
    genmedia_poll_max_s: int = 120
    genmedia_job_timeout_s: int = 1800
    default_max_active_series: int | None = 1
    default_series_budget_usd: float | None = None
    default_monthly_ai_budget_usd: float | None = None
    story_stuck_minutes: int = 20
    """A story episode/media job sitting in a transient state longer than
    this is considered stuck and re-driven by `series_tick`."""
    story_tick_lock_s: int = 540
    genmedia_download_max_mb: int = 200
    claude_prices_per_mtok: str = (
        '{"claude-opus": [15.0, 75.0], "claude-sonnet": [3.0, 15.0], "claude-haiku": [1.0, 5.0], "default": [3.0, 15.0]}'
    )
    """JSON `{model-id-prefix: [input_usd_per_mtok, output_usd_per_mtok]}`
    used to price Claude calls (longest matching prefix wins, `default` is
    the fallback). Override via CLAUDE_PRICES_PER_MTOK."""
    elevenlabs_base_url: str = "https://api.elevenlabs.io"
    elevenlabs_default_model: str = "eleven_multilingual_v2"
    """Used when the `elevenlabs.model_id` integration field is empty."""
    elevenlabs_output_format: str = "mp3_44100_128"
    elevenlabs_tts_path: str = "/v1/text-to-speech/{voice_id}/with-timestamps"
    elevenlabs_voices_path: str = "/v1/voices"

    @field_validator("default_max_active_series", "default_series_budget_usd", "default_monthly_ai_budget_usd", mode="before")
    @classmethod
    def _blank_is_none(cls, value):
        # `DEFAULT_SERIES_BUDGET_USD=` (empty in .env) means "unlimited".
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def _require_secret_key(self) -> "Settings":
        if not self.secret_key or len(self.secret_key) < 32:
            raise ValueError(
                "SECRET_KEY is missing or shorter than 32 characters. Set a "
                "long random value in .env (see .env.example) before starting the API."
            )
        if self.secret_key.startswith("gere-um-valor"):
            # The .env.example placeholder is long enough to pass the length
            # check, and it is public — signing sessions with it is unsafe.
            raise ValueError(
                "SECRET_KEY still has the .env.example placeholder. Generate a "
                "random value: python3 -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

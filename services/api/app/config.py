from __future__ import annotations

from functools import lru_cache

from pydantic import model_validator
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

    token_encryption_key: str | None = None

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

    @model_validator(mode="after")
    def _require_secret_key(self) -> "Settings":
        if not self.secret_key or len(self.secret_key) < 32:
            raise ValueError(
                "SECRET_KEY is missing or shorter than 32 characters. Set a "
                "long random value in .env (see .env.example) before starting the API."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

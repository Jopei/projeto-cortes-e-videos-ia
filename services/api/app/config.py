from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, read from the environment (see .env.example).

    Every field has a sane local-dev default so importing this module never
    fails when a real .env is absent (unit tests, one-off scripts, etc.).
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

    cors_origins: list[str] = ["http://localhost:13000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()

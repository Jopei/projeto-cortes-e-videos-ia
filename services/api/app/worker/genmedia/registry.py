"""Builds provider adapters by id, per call (no cache): credentials come from
`get_integration_value` every time so a key saved in the admin UI is seen by
the next task without restarting the worker. Fakes are refused unless
`STORY_FAKE_PROVIDERS_ENABLED` (same rule as `app.genmedia_catalog`)."""

from __future__ import annotations

from app.config import get_settings
from app.integrations import get_integration_value
from app.worker.genmedia.base import ImageGenProvider, ProviderError, TTSProvider, VideoGenProvider


def _require_fakes(provider_id: str) -> None:
    if not get_settings().story_fake_providers_enabled:
        raise ProviderError(f"Provedor {provider_id} indisponível (providers fake desativados).")


def get_video_provider(provider_id: str) -> VideoGenProvider:
    if provider_id == "fake_video":
        _require_fakes(provider_id)
        from app.worker.genmedia.fake_video import FakeVideoProvider

        return FakeVideoProvider()
    raise ProviderError(f"Provedor de vídeo desconhecido: {provider_id}")


def get_image_provider(provider_id: str) -> ImageGenProvider:
    if provider_id == "fake_image":
        _require_fakes(provider_id)
        from app.worker.genmedia.fake_image import FakeImageProvider

        return FakeImageProvider()
    raise ProviderError(f"Provedor de imagem desconhecido: {provider_id}")


def get_tts_provider(provider_id: str) -> TTSProvider:
    if provider_id == "fake_tts":
        _require_fakes(provider_id)
        from app.worker.genmedia.fake_tts import FakeTTSProvider

        return FakeTTSProvider()
    if provider_id == "elevenlabs":
        from app.worker.genmedia.elevenlabs import ElevenLabsTTS

        api_key = get_integration_value("elevenlabs", "api_key")
        if not api_key:
            raise ProviderError("Chave da ElevenLabs não configurada.")
        return ElevenLabsTTS(api_key, model_id=get_integration_value("elevenlabs", "model_id") or None)
    raise ProviderError(f"Provedor de voz desconhecido: {provider_id}")


def get_provider_for(kind: str, provider_id: str):
    """kind: `video_clip` | `image` | `tts` (StoryMediaJob kinds)."""
    if kind == "video_clip":
        return get_video_provider(provider_id)
    if kind == "image":
        return get_image_provider(provider_id)
    if kind == "tts":
        return get_tts_provider(provider_id)
    raise ProviderError(f"Tipo de mídia desconhecido: {kind}")

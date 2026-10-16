"""TTS voice listing for the Series IA wizard (`GET /api/series/providers/tts/{id}/voices`).

Kept in the API process (no SDKs, `urllib` only) and separate from the
worker adapters. Credentials via `get_integration_value` (DB then env)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from fastapi import HTTPException

from app.genmedia_catalog import get_provider
from app.integrations import get_integration_value

ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices"

_FAKE_VOICES = [
    {"id": "fake_voice_f", "name": "Voz falsa feminina", "gender": "female", "preview_url": None},
    {"id": "fake_voice_m", "name": "Voz falsa masculina", "gender": "male", "preview_url": None},
]


def list_voices(provider_id: str, language: str) -> list[dict]:
    spec = get_provider(provider_id, "tts")
    if spec is None:
        raise HTTPException(status_code=404, detail="TTS provider not found")
    if spec.id == "fake_tts":
        return list(_FAKE_VOICES)
    if spec.id == "elevenlabs":
        return _elevenlabs_voices()
    return []


def _elevenlabs_voices() -> list[dict]:
    api_key = get_integration_value("elevenlabs", "api_key")
    if not api_key:
        raise HTTPException(
            status_code=422,
            detail={"code": "provider_not_configured", "message": "ElevenLabs não está configurado (api_key ausente)."},
        )
    request = urllib.request.Request(ELEVENLABS_VOICES_URL, headers={"xi-api-key": api_key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - fixed https URL
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "provider_error", "message": f"ElevenLabs respondeu HTTP {exc.code} ao listar vozes."},
        ) from exc
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise HTTPException(
            status_code=502, detail={"code": "provider_error", "message": "Falha ao consultar vozes do ElevenLabs."}
        ) from exc
    voices = []
    for item in data.get("voices", []):
        labels = item.get("labels") or {}
        voices.append(
            {
                "id": item.get("voice_id"),
                "name": item.get("name") or item.get("voice_id"),
                "gender": labels.get("gender"),
                "preview_url": item.get("preview_url"),
            }
        )
    return [v for v in voices if v["id"]]

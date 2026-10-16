"""ElevenLabs TTS adapter (plano §5), stdlib HTTP only.

Endpoints (per the ElevenLabs API reference as of this implementation; all
configurable via Settings — `ELEVENLABS_BASE_URL`, `ELEVENLABS_TTS_PATH`,
`ELEVENLABS_VOICES_PATH`, `ELEVENLABS_DEFAULT_MODEL`,
`ELEVENLABS_OUTPUT_FORMAT` — because ids/paths change over time):

- `POST {base}/v1/text-to-speech/{voice_id}/with-timestamps?output_format=...`
  body `{text, model_id, [language_code], [voice_settings]}`, header
  `xi-api-key`. Responds JSON `{audio_base64, alignment: {characters,
  character_start_times_seconds, character_end_times_seconds},
  normalized_alignment}` — the alignment is PER CHARACTER, so words are
  rebuilt by grouping characters between whitespace (`group_words`).
- `GET {base}/v1/voices` -> `{voices: [{voice_id, name, labels, preview_url}]}`.

NOTE: not exercised against the live API in this repo's tests (HTTP is
mocked through the injectable `transport`); the first real call with a key
should be eyeballed. `model_id` precedence: `options["model_id"]` >
integration field `elevenlabs.model_id` > `ELEVENLABS_DEFAULT_MODEL`
(`eleven_multilingual_v2`). `language_code` is only sent if
`options["language_code"]` is set (the multilingual_v2 model rejects it).
Cost = characters/1000 * `GENMEDIA_PRICE_ELEVENLABS_USD` (catalog).
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable

from app.worker.genmedia.base import CALL_LOG, ProviderError, TTSProvider, TTSResult

Transport = Callable[[str, str, dict, bytes | None, float], tuple[int, dict, bytes]]


def _urllib_transport(method: str, url: str, headers: dict, body: bytes | None, timeout: float) -> tuple[int, dict, bytes]:
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - fixed https base URL from settings
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers or {}), exc.read()
    except Exception as exc:  # noqa: BLE001 - network/timeout -> retryable provider error
        raise ProviderError(f"Falha de rede ao chamar a ElevenLabs: {exc}", retryable=True) from exc


def group_words(characters: list[str], starts: list[float], ends: list[float]) -> list[dict]:
    """Per-character alignment -> `[{word, start, end}]`, splitting on
    whitespace characters. A word's start is its first character's start,
    its end the last character's end."""
    words: list[dict] = []
    current: list[int] = []

    def flush() -> None:
        if current:
            words.append(
                {
                    "word": "".join(characters[i] for i in current),
                    "start": float(starts[current[0]]),
                    "end": float(ends[current[-1]]),
                }
            )
            current.clear()

    for i, ch in enumerate(characters):
        if ch.isspace():
            flush()
        else:
            current.append(i)
    flush()
    return words


class ElevenLabsTTS(TTSProvider):
    id = "elevenlabs"
    supports_word_timestamps = True
    file_extension = "mp3"

    def __init__(
        self,
        api_key: str,
        *,
        model_id: str | None = None,
        base_url: str | None = None,
        tts_path: str | None = None,
        voices_path: str | None = None,
        output_format: str | None = None,
        price_per_1k_chars: float | None = None,
        transport: Transport | None = None,
        timeout: float = 120.0,
    ) -> None:
        from app.config import get_settings
        from app.genmedia_catalog import get_provider, price_usd

        settings = get_settings()
        self.api_key = api_key
        self.model_id = model_id or settings.elevenlabs_default_model
        self.base_url = (base_url or settings.elevenlabs_base_url).rstrip("/")
        self.tts_path = tts_path or settings.elevenlabs_tts_path
        self.voices_path = voices_path or settings.elevenlabs_voices_path
        self.output_format = output_format or settings.elevenlabs_output_format
        if price_per_1k_chars is None:
            spec = get_provider("elevenlabs", "tts")
            price_per_1k_chars = price_usd(spec) if spec is not None else 0.30
        self.price_per_1k_chars = price_per_1k_chars
        self._transport = transport or _urllib_transport
        self._timeout = timeout

    def _headers(self) -> dict:
        return {"xi-api-key": self.api_key, "Accept": "application/json", "Content-Type": "application/json"}

    @staticmethod
    def _raise_for(status: int, headers: dict, body: bytes) -> None:
        if 200 <= status < 300:
            return
        detail = body[:300].decode("utf-8", errors="replace")
        retry_after = None
        raw = headers.get("retry-after") or headers.get("Retry-After")
        if raw:
            try:
                retry_after = float(raw)
            except ValueError:
                pass
        if status in (401, 403):
            raise ProviderError(f"ElevenLabs recusou a chave ({status}).")
        if status == 429 or status >= 500:
            raise ProviderError(f"ElevenLabs indisponível ({status}).", retryable=True, retry_after=retry_after)
        if "content" in detail.lower() and "policy" in detail.lower():
            raise ProviderError("ElevenLabs recusou o texto por política de conteúdo.", safety=True)
        raise ProviderError(f"Erro da ElevenLabs ({status}): {detail}")

    def list_voices(self, language: str) -> list[dict]:
        status, headers, body = self._transport("GET", self.base_url + self.voices_path, self._headers(), None, 30.0)
        self._raise_for(status, headers, body)
        data = json.loads(body)
        voices = []
        for voice in data.get("voices", []):
            labels = voice.get("labels") or {}
            voices.append(
                {
                    "id": voice.get("voice_id"),
                    "name": voice.get("name"),
                    "gender": labels.get("gender"),
                    "preview_url": voice.get("preview_url"),
                }
            )
        return sorted(voices, key=lambda v: (v["name"] or "").lower())

    def estimate_cost(self, text: str) -> float:
        return round(len(text) / 1000.0 * self.price_per_1k_chars, 6)

    def synthesize(self, text, voice_id, language, dest_path, options=None) -> TTSResult:
        options = options or {}
        CALL_LOG.calls.append(("tts.synthesize", text))
        body: dict = {"text": text, "model_id": options.get("model_id") or self.model_id}
        if options.get("language_code"):
            body["language_code"] = options["language_code"]
        if options.get("voice_settings"):
            body["voice_settings"] = options["voice_settings"]
        url = (
            self.base_url
            + self.tts_path.format(voice_id=urllib.parse.quote(voice_id, safe=""))
            + "?"
            + urllib.parse.urlencode({"output_format": self.output_format})
        )
        status, headers, raw = self._transport("POST", url, self._headers(), json.dumps(body).encode(), self._timeout)
        self._raise_for(status, headers, raw)
        try:
            payload = json.loads(raw)
            audio = base64.b64decode(payload["audio_base64"])
        except Exception as exc:  # noqa: BLE001
            raise ProviderError(f"Resposta inesperada da ElevenLabs: {exc}", retryable=True) from exc
        with open(dest_path, "wb") as fh:
            fh.write(audio)

        alignment = payload.get("alignment") or payload.get("normalized_alignment")
        words: list[dict] | None = None
        duration = 0.0
        if alignment and alignment.get("characters"):
            words = group_words(
                alignment["characters"],
                alignment["character_start_times_seconds"],
                alignment["character_end_times_seconds"],
            )
            duration = float(alignment["character_end_times_seconds"][-1])
        if duration <= 0:
            duration = _probe_duration(dest_path)
        return TTSResult(
            duration_s=duration,
            words=words,
            cost_usd=self.estimate_cost(text),
            size_bytes=os.path.getsize(dest_path),
        )


def _probe_duration(path: str) -> float:
    from app.worker.analysis.ffmpeg_utils import probe_duration_seconds

    return probe_duration_seconds(path)

"""Fake TTS provider (cost 0): a quiet sine tone (WAV, stdlib `wave`) whose
duration is words / 2.5 per second, with uniform word timestamps. Only
registered when STORY_FAKE_PROVIDERS_ENABLED."""

from __future__ import annotations

import math
import os
import struct
import wave

from app.worker.genmedia.base import CALL_LOG, TTSProvider, TTSResult

WORDS_PER_SECOND = 2.5
SAMPLE_RATE = 16000


class FakeTTSProvider(TTSProvider):
    id = "fake_tts"
    supports_word_timestamps = True
    file_extension = "wav"

    def list_voices(self, language: str) -> list[dict]:
        return [{"id": "fake-voice", "name": "Voz falsa", "gender": None, "preview_url": None}]

    def estimate_cost(self, text: str) -> float:
        return 0.0

    def synthesize(self, text, voice_id, language, dest_path, options=None) -> TTSResult:
        CALL_LOG.calls.append(("tts.synthesize", text))
        tokens = text.split()
        step = 1.0 / WORDS_PER_SECOND
        duration = max(len(tokens) * step, 0.5)
        frames = int(duration * SAMPLE_RATE)
        with wave.open(dest_path, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(
                b"".join(struct.pack("<h", int(3000 * math.sin(2 * math.pi * 220 * i / SAMPLE_RATE))) for i in range(frames))
            )
        words = [
            {"word": word, "start": round(i * step, 3), "end": round((i + 1) * step - 0.05, 3)}
            for i, word in enumerate(tokens)
        ]
        return TTSResult(duration_s=duration, words=words, cost_usd=0.0, size_bytes=os.path.getsize(dest_path))

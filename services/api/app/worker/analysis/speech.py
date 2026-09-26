"""Speech transcription (faster-whisper, CPU/int8) with word-level
timestamps: source of the `speech` signal (word density per second) and of
the words/segments used later to snap clip edges and burn subtitles
(app/worker/analysis/scorer.py, app/worker/render/subtitles.py).

Fully optional: `Settings.whisper_enabled=False` (or the model failing to
load) returns an empty transcript rather than raising — the pipeline just
runs with `speech`/`llm` signals at zero and no subtitles.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_MODEL_CACHE: dict[str, object] = {}


def _get_model(model_size: str):
    if model_size not in _MODEL_CACHE:
        from faster_whisper import WhisperModel

        _MODEL_CACHE[model_size] = WhisperModel(model_size, device="cpu", compute_type="int8")
    return _MODEL_CACHE[model_size]


def transcribe(
    wav_path: str,
    *,
    model_size: str = "small",
    language: str | None = None,
) -> tuple[list[dict], list[dict], str | None]:
    """Returns `(words, segments, detected_language)`.

    `words`: `[{"start": float, "end": float, "word": str}, ...]`.
    `segments`: `[{"start": float, "end": float, "text": str}, ...]`.
    """
    model = _get_model(model_size)
    segments_iter, info = model.transcribe(
        wav_path,
        language=language,
        word_timestamps=True,
        vad_filter=True,
    )

    words: list[dict] = []
    segments: list[dict] = []
    for segment in segments_iter:
        segments.append({"start": float(segment.start), "end": float(segment.end), "text": segment.text.strip()})
        for word in segment.words or []:
            words.append({"start": float(word.start), "end": float(word.end), "word": word.word.strip()})

    detected_language = getattr(info, "language", None)
    return words, segments, detected_language


def speech_density_signal(words: list[dict], num_windows: int) -> list[float]:
    """Per-second count of words whose midpoint falls in that second."""
    values = [0.0] * num_windows
    for word in words:
        mid = (word["start"] + word["end"]) / 2.0
        idx = int(mid)
        if 0 <= idx < num_windows:
            values[idx] += 1.0
    return values

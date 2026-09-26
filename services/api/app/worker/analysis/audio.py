"""Per-second loudness signal: mono PCM RMS in dBFS.

No librosa: the audio track is decoded once to a 16kHz mono WAV via ffmpeg
(`extract_mono_wav`) and then read window-by-window with the stdlib `wave`
module, so a 1-3h movie's audio (~200MB of 16-bit PCM at 16kHz) never sits
fully in memory — only one 1-second window (32000 bytes) at a time.
"""

from __future__ import annotations

import array
import math
import wave


def compute_loudness_signal(wav_path: str, num_windows: int) -> list[float]:
    """Returns `num_windows` RMS-in-dBFS values, one per 1-second window."""
    values: list[float] = []
    with wave.open(wav_path, "rb") as wav_file:
        sample_rate = wav_file.getframerate()
        sample_width = wav_file.getsampwidth()
        if sample_width != 2:
            raise ValueError(f"expected 16-bit PCM, got sampwidth={sample_width}")
        frames_per_window = sample_rate  # 1 second

        for _ in range(num_windows):
            raw = wav_file.readframes(frames_per_window)
            if not raw:
                values.append(-90.0)
                continue
            samples = array.array("h")
            samples.frombytes(raw[: len(raw) - (len(raw) % 2)])
            if not samples:
                values.append(-90.0)
                continue
            mean_square = sum(s * s for s in samples) / len(samples)
            if mean_square <= 0:
                values.append(-90.0)
                continue
            rms = math.sqrt(mean_square) / 32768.0
            dbfs = 20 * math.log10(rms) if rms > 0 else -90.0
            values.append(max(dbfs, -90.0))
    return values

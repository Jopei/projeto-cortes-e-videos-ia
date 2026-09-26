"""Small subprocess wrappers around the `ffmpeg`/`ffprobe` CLIs, shared by
the analysis and render pipelines. Deliberately thin (no `ffmpeg-python`
dependency) — every call here is one purpose-built command line.
"""

from __future__ import annotations

import json
import logging
import subprocess

logger = logging.getLogger(__name__)


class FfmpegError(RuntimeError):
    pass


def run(cmd: list[str], *, timeout: float | None = None) -> subprocess.CompletedProcess:
    logger.debug("running: %s", " ".join(cmd))
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise FfmpegError(f"command timed out after {timeout}s: {' '.join(cmd)}") from exc
    if proc.returncode != 0:
        stderr_tail = proc.stderr.decode("utf-8", errors="replace")[-4000:]
        raise FfmpegError(f"command failed ({proc.returncode}): {' '.join(cmd)}\n{stderr_tail}")
    return proc


def probe_duration_seconds(path: str, *, timeout: float = 60.0) -> float:
    proc = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            path,
        ],
        timeout=timeout,
    )
    data = json.loads(proc.stdout.decode("utf-8"))
    return float(data["format"]["duration"])


def probe_resolution(path: str, *, timeout: float = 60.0) -> tuple[int, int]:
    proc = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
            path,
        ],
        timeout=timeout,
    )
    data = json.loads(proc.stdout.decode("utf-8"))
    stream = data["streams"][0]
    return int(stream["width"]), int(stream["height"])


def extract_mono_wav(src_path: str, dst_path: str, *, sample_rate: int = 16000, timeout: float = 3600.0) -> None:
    """Decode the audio track of `src_path` to a mono 16-bit PCM WAV at
    `dst_path`. Streaming-friendly on the read side: callers process the
    output with `wave`/window-at-a-time, never loading the whole file into
    memory (see app/worker/analysis/audio.py).
    """
    run(
        [
            "ffmpeg",
            "-y",
            "-i",
            src_path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(sample_rate),
            "-f",
            "wav",
            dst_path,
        ],
        timeout=timeout,
    )

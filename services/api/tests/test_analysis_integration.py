"""Integration test: generates a synthetic ~60s video (ffmpeg `testsrc2` +
`sine`, with a few abrupt color/scene changes and loud bursts — NOT real
copyrighted content) and runs the full `analyze_video` pipeline against it
with whisper/LLM disabled.

Skipped unless explicitly requested (`pytest -m integration`) because it
needs the real `ffmpeg`/`ffprobe` binaries — not installed in the plain
`services/api/.venv` dev venv, only in the `worker`/`beat` Docker image (see
Dockerfile's `worker` stage). Run it there, e.g.:

    docker compose exec worker sh -c "pip install pytest && cd /app && python -m pytest -m integration -q"
"""

from __future__ import annotations

import shutil
import subprocess

import pytest

from app.worker.analysis.pipeline import analyze_video

pytestmark = pytest.mark.integration

FFMPEG_AVAILABLE = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


@pytest.fixture()
def synthetic_video(tmp_path):
    """~60s, 1280x720, 25fps video: `testsrc2` (a moving test pattern) with
    a hard color-bar cut halfway through (for scene detection) and a sine
    wave audio track with two loud 3s bursts (for the audio signal)."""
    path = tmp_path / "synthetic.mp4"
    filter_complex = (
        "[0:v]trim=0:30,setpts=PTS-STARTPTS[v0];"
        "[1:v]trim=0:30,setpts=PTS-STARTPTS[v1];"
        "[v0][v1]concat=n=2:v=1:a=0[v];"
        "[2:a]atrim=0:60,volume='if(between(t,10,13)+between(t,40,43),1.0,0.05)':eval=frame[a]"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=1280x720:rate=25:duration=30",
        "-f",
        "lavfi",
        "-i",
        "smptebars=size=1280x720:rate=25:duration=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=220:duration=60",
        "-filter_complex",
        filter_complex,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        str(path),
    ]
    subprocess.run(cmd, check=True, capture_output=True, timeout=120)
    return str(path)


@pytest.mark.skipif(not FFMPEG_AVAILABLE, reason="ffmpeg/ffprobe not installed in this environment")
def test_full_pipeline_on_synthetic_video_without_whisper_or_llm(synthetic_video):
    result = analyze_video(
        synthetic_video,
        weights={"audio": 0.4, "scenes": 0.3, "motion": 0.3, "speech": 0.0, "llm": 0.0},
        min_duration=5.0,
        max_duration=15.0,
        max_clips=3,
        whisper_enabled=False,
        anthropic_api_key=None,
    )

    assert 55.0 <= result.duration <= 65.0
    assert result.words == []
    assert result.segments == []
    assert len(result.clips) >= 1
    for clip in result.clips:
        assert 5.0 <= clip.duration <= 15.0
        assert 0.0 <= clip.start < clip.end <= result.duration
        assert "audio" in clip.signals

    # The loud bursts are around t=10-13 and t=40-43 — at least one selected
    # clip should overlap one of them (that's where the composite score
    # should peak given these weights).
    assert any(
        (clip.start <= 11.5 <= clip.end) or (clip.start <= 41.5 <= clip.end) for clip in result.clips
    )

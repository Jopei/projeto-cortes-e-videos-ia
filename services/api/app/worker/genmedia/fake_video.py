"""Fake video provider (cost 0): ffmpeg `testsrc2` + `drawtext` with the
scene index. Submit/poll are instantaneous; `download` renders the file.
Only registered when STORY_FAKE_PROVIDERS_ENABLED."""

from __future__ import annotations

import os

from app.worker.analysis.ffmpeg_utils import FfmpegError, probe_duration_seconds, run
from app.worker.genmedia.base import (
    CALL_LOG,
    DownloadResult,
    PollResult,
    SubmitResult,
    VideoCapabilities,
    VideoGenProvider,
)


class FakeVideoProvider(VideoGenProvider):
    id = "fake_video"
    capabilities = VideoCapabilities(allowed_durations=(4, 5, 6, 8, 10))

    def estimate_cost(self, duration_s: float) -> float:
        return 0.0

    def submit(self, req: dict, idempotency_key: str) -> SubmitResult:
        CALL_LOG.calls.append(("video.submit", idempotency_key))
        duration = int(round(float(req.get("duration_s") or 5)))
        scene = (req.get("options") or {}).get("scene_index", 0)
        return SubmitResult(provider_job_id=f"fake-{idempotency_key[:12]}-{duration}-{scene}", estimated_cost_usd=0.0)

    def poll(self, provider_job_id: str):
        from app.worker.genmedia.base import PollResult

        return PollResult(state="succeeded", progress=1.0)

    def download(self, provider_job_id: str, dest_path: str) -> DownloadResult:
        _, _, duration, scene = provider_job_id.rsplit("-", 3)
        base = ["ffmpeg", "-y", "-f", "lavfi", "-i", f"testsrc2=size=720x1280:rate=24:duration={duration}"]
        tail = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-an", dest_path]
        drawtext = f"drawtext=text='scene {scene}':fontsize=96:fontcolor=white:x=(w-text_w)/2:y=h*0.1"
        try:
            run(base + ["-vf", drawtext] + tail, timeout=120)
        except FfmpegError:  # no usable font in this ffmpeg build
            run(base + tail, timeout=120)
        return DownloadResult(
            duration_s=probe_duration_seconds(dest_path), size_bytes=os.path.getsize(dest_path), actual_cost_usd=0.0
        )

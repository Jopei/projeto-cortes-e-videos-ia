"""Turns `[start_s, end_s]` of a local source video into the final 9:16
clip: precise cut + re-encode, reframe (auto/blur/center), optional burned
subtitles, -14 LUFS loudness normalization, plus a thumbnail JPEG.

Kept independent of S3/DB — app/worker/tasks.py downloads the source,
calls `render_clip_file`/`extract_thumbnail`, and uploads the results.
"""

from __future__ import annotations

import logging
import os
import tempfile

from app.worker.analysis.ffmpeg_utils import probe_resolution, run
from app.worker.render.reframe import build_reframe_filter, detect_face_center_x
from app.worker.render.subtitles import build_ass, build_srt

logger = logging.getLogger(__name__)


def _escape_filter_path(path: str) -> str:
    # ffmpeg filtergraph argument escaping: ':' separates filter options,
    # '\' and "'" need escaping too. Simple and sufficient for our own
    # /tmp/... paths (no untrusted input reaches this).
    return path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def render_clip_file(
    source_path: str,
    start_s: float,
    end_s: float,
    output_video_path: str,
    *,
    reframe_mode: str = "auto",
    burn_subtitles: bool = True,
    words_in_clip: list[dict] | None = None,
    timeout: float = 1800.0,
) -> None:
    """`words_in_clip` timestamps must already be relative to `start_s`
    (i.e. word 0 starts near 0.0), matching the cut clip's own timeline.
    """
    width, height = probe_resolution(source_path)
    duration = max(0.01, end_s - start_s)

    face_center_x = None
    if reframe_mode == "auto":
        try:
            face_center_x = detect_face_center_x(source_path, start_s, end_s)
        except Exception:
            logger.exception("face detection failed; falling back to center crop")

    filter_str = build_reframe_filter(reframe_mode, width, height, face_center_x=face_center_x)

    ass_tmp = None
    try:
        if burn_subtitles and words_in_clip:
            ass_fd, ass_tmp = tempfile.mkstemp(suffix=".ass")
            os.close(ass_fd)
            with open(ass_tmp, "w", encoding="utf-8") as fh:
                fh.write(build_ass(words_in_clip))
            filter_str = f"{filter_str},ass={_escape_filter_path(ass_tmp)}"

        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{start_s:.3f}",
            "-i",
            source_path,
            "-t",
            f"{duration:.3f}",
            "-vf",
            filter_str,
            "-af",
            "loudnorm=I=-14:TP=-1.5:LRA=11",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            output_video_path,
        ]
        run(cmd, timeout=timeout)
    finally:
        if ass_tmp and os.path.exists(ass_tmp):
            os.remove(ass_tmp)


def build_subtitle_files(words_in_clip: list[dict]) -> tuple[str, str]:
    """Returns `(ass_text, srt_text)` for uploading `.srt` as `subtitles_key`
    (the `.ass` is only ever a burn-in intermediate, not stored)."""
    return build_ass(words_in_clip), build_srt(words_in_clip)


def extract_thumbnail(source_path: str, at_seconds: float, output_path: str, *, timeout: float = 60.0) -> None:
    run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{max(0.0, at_seconds):.3f}",
            "-i",
            source_path,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            output_path,
        ],
        timeout=timeout,
    )

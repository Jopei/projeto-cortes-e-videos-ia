"""Per-second motion signal: mean absolute frame difference sampled at a low
frame rate/resolution via OpenCV (headless build, no GUI deps).

Uses `CAP_PROP_POS_FRAMES` seeks instead of decoding every frame, so a 1-3h
movie only costs decoding ~4 frames/second of *sampled* video, not the
source's native frame rate.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

SAMPLE_FPS = 4.0
SAMPLE_WIDTH = 320


def compute_motion_signal(video_path: str, num_windows: int, *, sample_fps: float = SAMPLE_FPS) -> list[float]:
    import cv2
    import numpy as np

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"OpenCV could not open video: {video_path}")

    native_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step_frames = max(1, round(native_fps / sample_fps))

    # per-second bucket -> list of per-sampled-frame diff scores
    buckets: list[list[float]] = [[] for _ in range(num_windows)]
    prev_gray = None

    try:
        frame_idx = 0
        while total_frames <= 0 or frame_idx < total_frames:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ok, frame = cap.read()
            if not ok:
                break
            timestamp = frame_idx / native_fps
            bucket_idx = int(timestamp)
            if bucket_idx >= num_windows:
                break

            height, width = frame.shape[:2]
            scale = SAMPLE_WIDTH / width if width > SAMPLE_WIDTH else 1.0
            small = cv2.resize(frame, (int(width * scale), int(height * scale)))
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

            if prev_gray is not None and prev_gray.shape == gray.shape:
                diff = cv2.absdiff(gray, prev_gray)
                score = float(np.mean(diff))
                buckets[bucket_idx].append(score)
            prev_gray = gray
            frame_idx += step_frames
    finally:
        cap.release()

    return [sum(b) / len(b) if b else 0.0 for b in buckets]

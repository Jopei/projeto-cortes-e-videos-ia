"""9:16 reframe: face-center detection (OpenCV Haar cascade — no mediapipe,
see requirements-worker.txt for why) plus the ffmpeg filter strings for the
three `reframe_mode`s (`auto`, `center`, `blur`).

Face tracking here is intentionally simple: a handful of frames are sampled
across the clip's time range, a static average face-center offset is
computed, and the crop uses that one fixed x-offset for the whole clip
(the plan explicitly allows "crop estático pelo centro médio + fallback"
instead of frame-by-frame tracking).
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

TARGET_WIDTH = 1080
TARGET_HEIGHT = 1920
TARGET_ASPECT = TARGET_WIDTH / TARGET_HEIGHT  # 9/16


def detect_face_center_x(video_path: str, start_s: float, end_s: float, *, samples: int = 5) -> float | None:
    """Returns the median detected-face x-center as a fraction of frame
    width (0..1), or `None` if no face was found in any sampled frame.
    """
    import cv2

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(cascade_path)
    if cascade.empty():
        logger.warning("could not load Haar cascade from %s", cascade_path)
        return None

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None

    centers: list[float] = []
    try:
        span = max(0.001, end_s - start_s)
        for i in range(samples):
            t = start_s + span * (i + 0.5) / samples
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
            ok, frame = cap.read()
            if not ok:
                continue
            height, width = frame.shape[:2]
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(40, 40))
            if len(faces) == 0:
                continue
            # Largest detected face wins (closest to camera / main subject).
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            center_x = (x + w / 2.0) / width
            centers.append(center_x)
    finally:
        cap.release()

    if not centers:
        return None
    centers.sort()
    return centers[len(centers) // 2]


def build_reframe_filter(
    mode: str,
    src_width: int,
    src_height: int,
    *,
    face_center_x: float | None = None,
) -> str:
    """Returns an ffmpeg `-vf`/part-of-`-filter_complex` fragment that turns
    a `src_width`x`src_height` input into exactly `1080x1920`.

    - `center`: scale to cover 1080x1920, crop centered.
    - `auto`: same, but the crop's x-offset is biased towards
      `face_center_x` (fraction of width) when a face was detected, else
      falls back to `center` behavior.
    - `blur`: original video centered over a blurred, zoomed-in copy of
      itself filling the whole 1080x1920 frame (letterbox-free fallback for
      subjects a face detector can't find, e.g. wide action shots).
    """
    if mode == "blur":
        return (
            "split=2[bg][fg];"
            f"[bg]scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=increase,"
            f"crop={TARGET_WIDTH}:{TARGET_HEIGHT},gblur=sigma=20[bg];"
            f"[fg]scale={TARGET_WIDTH}:-2:force_original_aspect_ratio=decrease[fg];"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1"
        )

    # center / auto: scale to cover the target box, then crop.
    scale = f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=increase"

    x_expr = "(iw-ow)/2"
    if mode == "auto" and face_center_x is not None:
        # iw/ih inside the crop filter refer to the *scaled* frame here.
        x_expr = f"min(max(iw*{face_center_x:.4f}-ow/2,0),iw-ow)"

    return f"{scale},crop={TARGET_WIDTH}:{TARGET_HEIGHT}:{x_expr}:(ih-oh)/2,setsar=1"

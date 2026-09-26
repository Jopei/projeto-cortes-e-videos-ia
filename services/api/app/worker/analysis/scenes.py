"""Scene-cut detection (PySceneDetect, ContentDetector) and the derived
per-second "edit density" signal.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def detect_scene_cuts(video_path: str, *, threshold: float = 27.0) -> list[float]:
    """Returns the list of cut timestamps (seconds) — the boundary between
    scene N and N+1, i.e. `len(result) == len(scenes) - 1` for a video with
    at least one cut, `[]` if PySceneDetect finds no cuts at all.
    """
    from scenedetect import SceneManager, open_video
    from scenedetect.detectors import ContentDetector

    video = open_video(video_path)
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=threshold))
    scene_manager.detect_scenes(video, show_progress=False)
    cut_list = scene_manager.get_cut_list()
    return [cut.get_seconds() for cut in cut_list]


def scene_density_signal(scene_cuts: list[float], num_windows: int, *, window_radius: float = 5.0) -> list[float]:
    """Per-second density of cuts in a sliding `+/- window_radius` window
    around each second — a rough "how fast is this being edited" signal."""
    values = []
    for i in range(num_windows):
        center = i + 0.5
        count = sum(1 for c in scene_cuts if abs(c - center) <= window_radius)
        values.append(float(count))
    return values

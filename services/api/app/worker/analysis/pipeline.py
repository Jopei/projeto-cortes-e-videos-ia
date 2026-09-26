"""Orchestrates the full intensity-analysis pipeline over a local video file:
audio/scenes/motion/speech signals -> optional LLM pass -> scoring ->
clip selection. Pure "given a file on disk, return clip candidates" — S3
download/upload and DB/job bookkeeping stay in app/worker/tasks.py so this
module has no dependency on the DB/session machinery and stays easy to
exercise from a script or a test.
"""

from __future__ import annotations

import logging
import os
import tempfile
from collections.abc import Callable
from dataclasses import dataclass, field

from app.worker.analysis import llm as llm_module
from app.worker.analysis.audio import compute_loudness_signal
from app.worker.analysis.ffmpeg_utils import extract_mono_wav, probe_duration_seconds
from app.worker.analysis.motion import compute_motion_signal
from app.worker.analysis.scenes import detect_scene_cuts, scene_density_signal
from app.worker.analysis.scorer import ClipCandidate, select_clips
from app.worker.analysis.speech import speech_density_signal
from app.worker.analysis.speech import transcribe as whisper_transcribe

logger = logging.getLogger(__name__)


class AnalysisCanceled(Exception):
    """Raised when `is_canceled()` returns True between pipeline stages."""


@dataclass
class AnalysisResult:
    duration: float
    clips: list[ClipCandidate]
    words: list[dict] = field(default_factory=list)
    segments: list[dict] = field(default_factory=list)
    language: str | None = None


ProgressCb = Callable[[int, str], None]
CancelCb = Callable[[], bool]


def _noop_progress(progress: int, stage: str) -> None:
    return None


def _noop_cancel() -> bool:
    return False


def analyze_video(
    video_path: str,
    *,
    weights: dict[str, float],
    min_duration: float,
    max_duration: float,
    max_clips: int,
    language: str | None = None,
    whisper_enabled: bool = True,
    whisper_model: str = "small",
    anthropic_api_key: str | None = None,
    on_progress: ProgressCb = _noop_progress,
    is_canceled: CancelCb = _noop_cancel,
) -> AnalysisResult:
    def _check_canceled() -> None:
        if is_canceled():
            raise AnalysisCanceled()

    on_progress(2, "probe")
    duration = probe_duration_seconds(video_path)
    num_windows = max(1, int(duration))
    _check_canceled()

    on_progress(10, "audio")
    with tempfile.TemporaryDirectory(prefix="cortes-audio-") as tmp_dir:
        wav_path = os.path.join(tmp_dir, "audio.wav")
        try:
            extract_mono_wav(video_path, wav_path)
            audio_signal = compute_loudness_signal(wav_path, num_windows)
        except Exception:
            logger.exception("audio signal extraction failed; continuing with a flat signal")
            audio_signal = [0.0] * num_windows
    _check_canceled()

    on_progress(30, "scenes")
    try:
        scene_cuts = detect_scene_cuts(video_path)
    except Exception:
        logger.exception("scene detection failed; continuing with no cuts")
        scene_cuts = []
    scenes_signal = scene_density_signal(scene_cuts, num_windows)
    _check_canceled()

    on_progress(50, "motion")
    try:
        motion_signal = compute_motion_signal(video_path, num_windows)
    except Exception:
        logger.exception("motion signal extraction failed; continuing with a flat signal")
        motion_signal = [0.0] * num_windows
    _check_canceled()

    words: list[dict] = []
    segments: list[dict] = []
    detected_language: str | None = None
    speech_signal = [0.0] * num_windows
    if whisper_enabled:
        on_progress(65, "speech")
        try:
            with tempfile.TemporaryDirectory(prefix="cortes-whisper-") as tmp_dir:
                wav_path = os.path.join(tmp_dir, "audio.wav")
                extract_mono_wav(video_path, wav_path, sample_rate=16000)
                words, segments, detected_language = whisper_transcribe(
                    wav_path, model_size=whisper_model, language=language
                )
            speech_signal = speech_density_signal(words, num_windows)
        except Exception:
            logger.exception("speech transcription failed; continuing with no transcript")
    _check_canceled()

    signals_without_llm = {
        "audio": audio_signal,
        "scenes": scenes_signal,
        "motion": motion_signal,
        "speech": speech_signal,
    }

    llm_signal = [0.0] * num_windows
    if anthropic_api_key:
        on_progress(80, "llm")
        weights_without_llm = {k: v for k, v in weights.items() if k != "llm"}
        shortlist = select_clips(
            signals_without_llm,
            weights_without_llm,
            duration=duration,
            min_duration=min_duration,
            max_duration=max_duration,
            max_clips=20,
            scene_cuts=scene_cuts,
            words=words,
        )
        llm_scores = llm_module.score_candidates(shortlist, segments, api_key=anthropic_api_key)
        for idx, candidate in enumerate(shortlist):
            score = llm_scores.get(idx)
            if score is None:
                continue
            start_idx = max(0, int(candidate.start))
            end_idx = min(num_windows, int(candidate.end) + 1)
            for i in range(start_idx, end_idx):
                llm_signal[i] = score
    _check_canceled()

    on_progress(90, "scoring")
    all_signals = dict(signals_without_llm)
    all_signals["llm"] = llm_signal
    clips = select_clips(
        all_signals,
        weights,
        duration=duration,
        min_duration=min_duration,
        max_duration=max_duration,
        max_clips=max_clips,
        scene_cuts=scene_cuts,
        words=words,
    )

    return AnalysisResult(duration=duration, clips=clips, words=words, segments=segments, language=detected_language)

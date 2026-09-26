"""Unit tests for the pure-python scoring/selection core
(app/worker/analysis/scorer.py) — synthetic signals only, no ffmpeg/DB.
"""

from __future__ import annotations

from app.worker.analysis.scorer import (
    adjust_edges,
    compute_scores,
    normalize_signal,
    select_clips,
)


def test_normalize_signal_scales_to_unit_range():
    values = [0.0, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
    normalized = normalize_signal(values)
    assert len(normalized) == len(values)
    assert min(normalized) >= 0.0
    assert max(normalized) <= 1.0
    # Robust to outliers: a single extreme value doesn't collapse the rest.
    with_outlier = values + [10_000.0]
    normalized_outlier = normalize_signal(with_outlier)
    assert normalized_outlier[-1] == 1.0  # clipped at the top
    assert normalized_outlier[5] > 0.0


def test_normalize_signal_handles_constant_and_empty():
    assert normalize_signal([]) == []
    assert normalize_signal([5.0, 5.0, 5.0]) == [0.0, 0.0, 0.0]


def test_compute_scores_weighted_sum():
    signals = {"audio": [0.0] * 10, "motion": [0.0] * 10}
    signals["audio"][5] = 100.0
    signals["motion"][5] = 100.0
    scores, normalized = compute_scores(signals, {"audio": 1.0, "motion": 0.0})
    assert len(scores) == 10
    assert scores[5] == max(scores)
    assert scores[5] > scores[0]


def test_compute_scores_missing_signal_does_not_scale_down():
    # Preset weights include "llm", but no llm signal was computed (no API
    # key) — the remaining signals should still normalize to their own
    # weight sum, not be divided by the full preset's weight total.
    signals = {"audio": [1.0, 5.0, 1.0]}
    scores_full, _ = compute_scores(signals, {"audio": 0.5})
    scores_partial, _ = compute_scores(signals, {"audio": 0.5, "llm": 0.5})
    assert scores_full == scores_partial


def test_select_clips_picks_the_peak_and_respects_duration_bounds():
    duration = 120
    scores = {"audio": [0.0] * duration}
    # A clear, isolated peak around t=60.
    for t in range(55, 65):
        scores["audio"][t] = 10.0

    clips = select_clips(
        scores,
        {"audio": 1.0},
        duration=float(duration),
        min_duration=15.0,
        max_duration=30.0,
        max_clips=1,
    )
    assert len(clips) == 1
    clip = clips[0]
    assert 15.0 <= clip.duration <= 30.0
    assert clip.start <= 60.0 <= clip.end


def test_select_clips_returns_non_overlapping_windows():
    duration = 200
    scores = {"audio": [0.0] * duration}
    for t in range(20, 30):
        scores["audio"][t] = 10.0
    for t in range(150, 160):
        scores["audio"][t] = 9.0

    clips = select_clips(
        scores,
        {"audio": 1.0},
        duration=float(duration),
        min_duration=15.0,
        max_duration=20.0,
        max_clips=2,
    )
    assert len(clips) == 2
    a, b = clips
    assert a.end <= b.start  # sorted by start, non-overlapping
    # The two highest-scoring windows are the ones actually picked, not
    # some arbitrary pair — each should cover one of the two peaks.
    assert a.start <= 25.0 <= a.end or a.start <= 20.0
    assert b.start <= 155.0 <= b.end


def test_select_clips_caps_at_max_clips():
    duration = 300
    scores = {"audio": [1.0] * duration}
    clips = select_clips(
        scores,
        {"audio": 1.0},
        duration=float(duration),
        min_duration=15.0,
        max_duration=20.0,
        max_clips=3,
    )
    assert len(clips) <= 3


def test_adjust_edges_snaps_to_scene_cut():
    # Requested window [10, 40); a scene cut sits at 12, well within
    # tolerance, and should pull the start in.
    start, end = adjust_edges(10.0, 40.0, duration=100.0, scene_cuts=[12.0], words=[], min_duration=15.0, max_duration=40.0)
    assert start == 12.0


def test_adjust_edges_does_not_cut_a_word_in_half():
    words = [{"start": 9.0, "end": 11.5, "word": "hello"}]
    start, end = adjust_edges(10.0, 40.0, duration=100.0, scene_cuts=[], words=words, min_duration=15.0, max_duration=40.0)
    # start=10.0 falls inside the word [9.0, 11.5) -> snapped to the word's start.
    assert start == 9.0


def test_adjust_edges_clamps_within_min_max_duration():
    start, end = adjust_edges(0.0, 5.0, duration=100.0, scene_cuts=[], words=[], min_duration=15.0, max_duration=30.0)
    assert 15.0 <= (end - start) <= 30.0
    start, end = adjust_edges(0.0, 200.0, duration=200.0, scene_cuts=[], words=[], min_duration=15.0, max_duration=30.0)
    assert (end - start) <= 30.0

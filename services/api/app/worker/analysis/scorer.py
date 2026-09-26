"""Pure-python scoring/selection core of the analysis pipeline — no ffmpeg,
no OpenCV, no whisper here on purpose, so it's fully unit-testable with
synthetic signals (see tests/test_scorer.py).

Pipeline (see app/worker/analysis/pipeline.py for the part that actually
produces `signals_by_name`/`scene_cuts`/`words` from a real video):

1. Each raw per-second signal (`audio`, `scenes`, `motion`, `speech`, `llm`)
   is normalized independently to [0, 1] with a robust 5th/95th percentile
   clip (`normalize_signal`) — a handful of extreme seconds (a single loud
   bang, a freeze-frame) shouldn't blow out the whole video's scale.
2. `score = sum(weight * normalized_signal)` per second (`compute_scores`).
3. `select_clips` greedily picks the highest-average-score non-overlapping
   windows (duration between `min_duration`/`max_duration`), snaps their
   edges to the nearest scene cut and to word boundaries (never cutting a
   word/scene in half), and returns at most `max_clips`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field


def normalize_signal(values: list[float]) -> list[float]:
    """Min-max normalize `values` to [0, 1] after clipping to the 5th/95th
    percentile (robust to a few outlier seconds). Returns all-zero for an
    empty/constant input rather than raising.
    """
    if not values:
        return []
    sorted_vals = sorted(values)
    n = len(sorted_vals)

    def _percentile(p: float) -> float:
        if n == 1:
            return sorted_vals[0]
        idx = p * (n - 1)
        lo = math.floor(idx)
        hi = math.ceil(idx)
        if lo == hi:
            return sorted_vals[int(idx)]
        frac = idx - lo
        return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac

    p5 = _percentile(0.05)
    p95 = _percentile(0.95)
    span = p95 - p5
    if span <= 1e-9:
        lo, hi = sorted_vals[0], sorted_vals[-1]
        span = hi - lo
        if span <= 1e-9:
            return [0.0 for _ in values]
        return [min(1.0, max(0.0, (v - lo) / span)) for v in values]
    return [min(1.0, max(0.0, (v - p5) / span)) for v in values]


def compute_scores(signals_by_name: dict[str, list[float]], weights: dict[str, float]) -> tuple[list[float], dict[str, list[float]]]:
    """Returns `(scores, normalized_signals)`. `scores[i]` is the weighted
    sum of the normalized signals at second `i`, divided by the sum of the
    weights actually present (so a preset missing a signal, e.g. no
    transcript, doesn't silently scale everything down).
    """
    normalized = {name: normalize_signal(values) for name, values in signals_by_name.items() if values}
    if not normalized:
        return [], {}
    n = max(len(values) for values in normalized.values())
    weight_sum = sum(weights.get(name, 0.0) for name in normalized) or 1.0
    scores = []
    for i in range(n):
        total = 0.0
        for name, values in normalized.items():
            if i < len(values):
                total += weights.get(name, 0.0) * values[i]
        scores.append(total / weight_sum)
    return scores, normalized


@dataclass
class ClipCandidate:
    start: float
    end: float
    score: float
    signals: dict[str, float] = field(default_factory=dict)
    peak_time: float = 0.0
    """Absolute second (in the source video) where the composite score is
    highest within `[start, end]` — used to pick the thumbnail frame (see
    app/worker/render/pipeline.py)."""

    @property
    def duration(self) -> float:
        return self.end - self.start


def _prefix_sums(values: list[float]) -> list[float]:
    prefix = [0.0] * (len(values) + 1)
    for i, v in enumerate(values):
        prefix[i + 1] = prefix[i] + v
    return prefix


def _window_avg(prefix: list[float], t0: float, t1: float, n: int) -> float:
    i0 = max(0, min(n, int(math.floor(t0))))
    i1 = max(0, min(n, int(math.ceil(t1))))
    if i1 <= i0:
        return 0.0
    return (prefix[i1] - prefix[i0]) / (i1 - i0)


def _overlaps(a: tuple[float, float], b: tuple[float, float]) -> bool:
    return not (a[1] <= b[0] or b[1] <= a[0])


def _snap_to_scene(t: float, scene_cuts: list[float], tolerance: float = 3.0) -> float:
    if not scene_cuts:
        return t
    best = None
    for c in scene_cuts:
        d = abs(c - t)
        if d <= tolerance and (best is None or d < abs(best - t)):
            best = c
    return best if best is not None else t


def _snap_to_word_boundary(t: float, words: list[dict], edge: str) -> float:
    """`words`: list of `{"start": float, "end": float, ...}`. If `t` falls
    strictly inside a word, move it to that word's start (edge="start") or
    end (edge="end") so the cut never lands mid-word. Landing in a silence
    gap between words is left untouched — that's a perfectly fine cut point.
    """
    for w in words:
        if w["start"] < t < w["end"]:
            return w["start"] if edge == "start" else w["end"]
    return t


def adjust_edges(
    start: float,
    end: float,
    duration: float,
    scene_cuts: list[float],
    words: list[dict],
    min_duration: float,
    max_duration: float,
) -> tuple[float, float]:
    """Snap `[start, end)` to the nearest scene cut, then to word boundaries,
    then clamp back into `[0, duration]` and `[min_duration, max_duration]`.
    Word/scene boundaries are prioritized over hitting the duration target
    exactly; only if that's impossible do we clamp the length.
    """
    start = _snap_to_scene(start, scene_cuts)
    end = _snap_to_scene(end, scene_cuts)
    start = _snap_to_word_boundary(start, words, "start")
    end = _snap_to_word_boundary(end, words, "end")

    start = max(0.0, start)
    end = min(duration, end)
    if end <= start:
        end = min(duration, start + min_duration)

    length = end - start
    if length < min_duration:
        end = min(duration, start + min_duration)
        length = end - start
        if length < min_duration:
            start = max(0.0, end - min_duration)
    elif length > max_duration:
        end = start + max_duration

    return start, end


def select_clips(
    signals_by_name: dict[str, list[float]],
    weights: dict[str, float],
    *,
    duration: float,
    min_duration: float,
    max_duration: float,
    max_clips: int,
    scene_cuts: list[float] | None = None,
    words: list[dict] | None = None,
    step: float = 1.0,
) -> list[ClipCandidate]:
    """Pick up to `max_clips` non-overlapping high-score windows.

    Candidate windows are generated at every `step`-second offset for a
    handful of representative lengths (min/mid/max of the allowed range) —
    an approximation of the true "best window of any length" search that
    stays O(n) instead of O(n^2), good enough given `min_duration`/
    `max_duration` are close together in practice (15-60s, per the plan).
    """
    scene_cuts = scene_cuts or []
    words = words or []
    scores, normalized = compute_scores(signals_by_name, weights)
    n = len(scores)
    if n == 0 or duration <= 0:
        return []
    duration = min(duration, float(n))
    prefix = _prefix_sums(scores)
    normalized_prefix = {name: _prefix_sums(values) for name, values in normalized.items()}

    lengths = sorted({min_duration, max_duration, (min_duration + max_duration) / 2.0})
    lengths = [length_ for length_ in lengths if length_ > 0]

    candidates: list[tuple[float, float, float]] = []
    for length in lengths:
        if length > duration:
            continue
        t = 0.0
        while t + length <= duration + 1e-9:
            end = min(duration, t + length)
            candidates.append((t, end, _window_avg(prefix, t, end, n)))
            t += step

    candidates.sort(key=lambda c: c[2], reverse=True)

    selected: list[ClipCandidate] = []
    for start, end, avg_score in candidates:
        if len(selected) >= max_clips:
            break
        window = (start, end)
        if any(_overlaps(window, (s.start, s.end)) for s in selected):
            continue

        adj_start, adj_end = adjust_edges(start, end, duration, scene_cuts, words, min_duration, max_duration)
        adj_window = (adj_start, adj_end)
        if adj_end - adj_start <= 0:
            continue
        if any(_overlaps(adj_window, (s.start, s.end)) for s in selected):
            continue

        sub_scores = {
            name: _window_avg(normalized_prefix[name], adj_start, adj_end, len(normalized[name]))
            for name in normalized
        }
        final_score = _window_avg(prefix, adj_start, adj_end, n)
        i0 = max(0, int(adj_start))
        i1 = min(n, max(i0 + 1, int(math.ceil(adj_end))))
        peak_idx = max(range(i0, i1), key=lambda i: scores[i])
        peak_time = peak_idx + 0.5
        selected.append(
            ClipCandidate(start=adj_start, end=adj_end, score=final_score, signals=sub_scores, peak_time=peak_time)
        )

    selected.sort(key=lambda c: c.start)
    return selected

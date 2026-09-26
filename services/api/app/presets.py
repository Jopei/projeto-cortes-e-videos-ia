"""Default per-signal weights for each built-in preset (see the plan doc,
"Calibração de intensidade"). `score = sum(weight * signal)` for the five
normalized signals: audio, scenes, motion, speech, llm.

`custom` has no default weights — the caller must supply
`AnalyzeRequest.params.weights` themselves, so it's intentionally absent
from `PRESET_WEIGHTS` (and from `GET /api/presets`).
"""

from __future__ import annotations

from app.models.analysis_job import Preset

PRESET_WEIGHTS: dict[Preset, dict[str, float]] = {
    Preset.ACTION: {"audio": 0.30, "scenes": 0.25, "motion": 0.35, "speech": 0.05, "llm": 0.05},
    Preset.DRAMA: {"audio": 0.15, "scenes": 0.10, "motion": 0.05, "speech": 0.40, "llm": 0.30},
    Preset.COMEDY: {"audio": 0.20, "scenes": 0.15, "motion": 0.15, "speech": 0.30, "llm": 0.20},
    Preset.SUSPENSE: {"audio": 0.25, "scenes": 0.20, "motion": 0.20, "speech": 0.20, "llm": 0.15},
}

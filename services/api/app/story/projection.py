"""Pure helpers over plain dicts (no DB): the *projected* character state an
episode is validated against, the open narrative threads, and the visual
mode assignment per scene (plano §6, "visual_mode ajustado em código").

"Projected" state for episode N = what the characters' rows say today
(`status` already reflects every APPLIED event, i.e. approved episodes) +
the PROPOSED events of earlier episodes (N-1, N-2... scripted but not yet
approved), applied in episode order. DISCARDED events never count.
"""

from __future__ import annotations

import copy
from typing import Any

INTENSE_MOODS = (
    "tens", "fear", "medo", "terror", "dread", "panic", "panico", "urgen", "intens", "climax", "clima",
    "chaos", "caos", "desper", "shock", "choque", "danger", "perigo", "epic", "dramat", "furi", "fury", "rage",
    "suspens", "horror", "ameaç", "threat",
)


def project_characters(characters: list[dict], events: list[dict], episode_number: int) -> dict[str, dict]:
    """`characters`: dicts with `key, name, role, description, visual_description,
    status, committed`; `events`: dicts with `character_key, episode_number,
    type, to_status, state`. Returns `{key: {..., "status": projected}}`."""
    introduced_before = {
        e["character_key"]
        for e in events
        if e.get("type") == "introduce" and e.get("state") != "discarded" and e["episode_number"] < episode_number
    }
    projected: dict[str, dict] = {}
    for char in characters:
        if char.get("committed") or char["key"] in introduced_before:
            projected[char["key"]] = dict(char)
    pending = sorted(
        (e for e in events if e.get("state") == "proposed" and e["episode_number"] < episode_number),
        key=lambda e: e["episode_number"],
    )
    for event in pending:
        target = projected.get(event["character_key"])
        if target is not None and event.get("to_status"):
            target["status"] = event["to_status"]
    return projected


def open_thread_keys(bible: dict | None, previous_scripts: list[tuple[int, dict]]) -> set[str]:
    """Thread keys still open before the current episode: the bible's open
    threads + `threads_opened` of earlier scripts - their `threads_closed`
    (in episode order)."""
    open_keys = {t["key"] for t in ((bible or {}).get("open_threads") or []) if t.get("closed_in") in (None, 0)}
    for _, script in sorted(previous_scripts, key=lambda item: item[0]):
        for thread in script.get("threads_opened") or []:
            open_keys.add(thread["key"])
        for key in script.get("threads_closed") or []:
            open_keys.discard(key)
    return open_keys


def _impact(scene: dict, position: int, total: int, event_scene_keys: set[str]) -> float:
    score = 0.0
    mood = (scene.get("mood") or "").lower()
    if any(token in mood for token in INTENSE_MOODS):
        score += 3.0
    if position == total - 1:
        score += 2.0  # cliffhanger scene
    elif position == total - 2:
        score += 1.0  # climax of the episode usually sits right before it
    if event_scene_keys & set(scene.get("characters_on_screen") or []):
        score += 1.5  # a character changes state in this episode
    if scene.get("visual_mode") == "video":
        score += 1.0  # the writer's own suggestion
    if scene.get("is_flashback"):
        score -= 1.0
    return score


def assign_visual_modes(
    script: dict, strategy: str, max_video_scenes: int, *, video_available: bool = True
) -> dict:
    """Return a copy of `script` whose scenes' `visual_mode` follows the
    series strategy: economy = all image; full_video = all video;
    hybrid = at most `max_video_scenes` videos, the highest-impact scenes
    (climax/cliffhanger/intense mood/state change). Without a video
    provider everything is image."""
    result = copy.deepcopy(script)
    scenes: list[dict[str, Any]] = result.get("scenes") or []
    if strategy == "full_video" and video_available:
        for scene in scenes:
            scene["visual_mode"] = "video"
        return result
    for scene in scenes:
        scene["visual_mode"] = scene.get("visual_mode", "image")
    video_slots = 0
    if strategy == "hybrid" and video_available:
        video_slots = max(0, min(max_video_scenes, len(scenes)))
    event_keys = {
        e.get("character_key")
        for e in result.get("state_events") or []
        if e.get("type") == "status_change" and e.get("character_key")
    }
    ranked = sorted(
        range(len(scenes)),
        key=lambda i: (_impact(scenes[i], i, len(scenes), event_keys), i),
        reverse=True,
    )
    chosen = set(ranked[:video_slots])
    for i, scene in enumerate(scenes):
        scene["visual_mode"] = "video" if i in chosen else "image"
    return result

"""Pure tests of the deterministic script validator, plan checks, projection
and visual-mode assignment (no DB, no ffmpeg)."""

from __future__ import annotations

import copy

from app.story.plan_checks import check_season_plan
from app.story.projection import assign_visual_modes, open_thread_keys, project_characters
from app.story.validator import has_blocker, merge_with_llm_report, validate_script
from tests.story_helpers import make_plan, make_script

CHARS = {"lia": {"status": "alive"}, "tomas": {"status": "alive"}, "vera": {"status": "dead"}}
BIBLE = {"open_threads": [{"key": "chave", "closed_in": None}], "style_guide": {"banned_elements": []}}


def codes(issues, severity=None):
    return [i.code for i in issues if severity is None or i.severity == severity]


def run(script, chars=CHARS, number=2, caps=None, **kw):
    return validate_script(script, chars, BIBLE, number, caps, **kw)


def test_valid_script_has_no_blocker():
    assert not has_blocker(run(make_script(2)))


def test_missing_script_blocks():
    assert codes(validate_script(None, CHARS, BIBLE, 1)) == ["script_missing"]


def test_scene_count_bounds():
    script = make_script(2)
    script["scenes"] = script["scenes"][:2]
    assert "scene_count" in codes(run(script), "blocker")
    script = make_script(2)
    script["scenes"] += copy.deepcopy(script["scenes"][:2])
    assert "scene_count" in codes(run(script), "blocker")


def test_total_duration_window():
    script = make_script(2)
    for s in script["scenes"]:
        s["duration_s"] = 3.0
    assert "duration" in codes(run(script), "blocker")
    for s in script["scenes"]:
        s["duration_s"] = 9.0
    assert "duration" in codes(run(script), "blocker")


def test_video_scene_longer_than_provider_max():
    script = make_script(2)
    script["scenes"][4]["duration_s"] = 12.0
    script["scenes"][0]["duration_s"] = 0.0 + 4.0
    issues = run(script, caps={"allowed_durations": [4, 5, 6, 8, 10]})
    assert any(i.code == "duration" and i.scene_index == 4 for i in issues)


def test_word_count_and_pacing():
    script = make_script(2)
    for s in script["scenes"]:
        s["narration"] = "um dois"
    assert "word_count" in codes(run(script), "blocker")
    script = make_script(2)
    script["scenes"][0]["narration"] = " ".join(["palavra"] * 40)
    got = codes(run(script), "blocker")
    assert "pacing_overload" in got


def test_unknown_character_in_scene_is_blocker_unless_introduced():
    script = make_script(2, characters_on_screen=("lia", "fantasma"))
    assert "unresolved_reference" in codes(run(script), "blocker")
    introduced = make_script(2, characters_on_screen=("lia", "novo"), state_events=[{
        "type": "introduce", "character_key": "novo", "from_status": None, "to_status": "alive", "description": "chega",
        "new_character": {"name": "Novo", "role": "minor", "description": "d", "visual_description": "v" * 90},
    }])
    assert not has_blocker(run(introduced))


def test_dead_character_outside_flashback_blocks_but_flashback_is_ok():
    assert "dead_character_appears" in codes(run(make_script(2, characters_on_screen=("vera",))), "blocker")
    assert not has_blocker(run(make_script(2, characters_on_screen=("vera",), flashback=True)))


def test_missing_character_is_only_a_warning():
    chars = {**CHARS, "tomas": {"status": "missing"}}
    issues = run(make_script(2, characters_on_screen=("tomas",)), chars=chars)
    assert not has_blocker(issues)
    assert "status_contradiction" in codes(issues, "warning")


def event(key, frm, to):
    return {"type": "status_change", "character_key": key, "from_status": frm, "to_status": to, "description": "x"}


def test_from_status_must_match_projection():
    script = make_script(2, state_events=[event("lia", "injured", "dead")])
    assert "status_contradiction" in codes(run(script), "blocker")
    assert not has_blocker(run(make_script(2, state_events=[event("lia", "alive", "injured")])))


def test_leaving_dead_is_blocked():
    script = make_script(2, characters_on_screen=("lia",), state_events=[event("vera", "dead", "alive")])
    assert "status_contradiction" in codes(run(script), "blocker")


def test_more_than_two_deaths_blocks():
    chars = {k: {"status": "alive"} for k in ("lia", "tomas", "vera")}
    script = make_script(2, state_events=[event("lia", "alive", "dead"), event("tomas", "alive", "dead"), event("vera", "alive", "dead")])
    assert "pacing_overload" in codes(run(script, chars=chars), "blocker")


def test_second_introduction_after_episode_4_is_warning():
    def intro(key):
        return {"type": "introduce", "character_key": key, "from_status": None, "to_status": "alive", "description": "",
                "new_character": {"name": key, "role": "minor", "description": "d", "visual_description": "v" * 90}}

    script = make_script(6, state_events=[intro("aa"), intro("bb")])
    issues = run(script, number=6)
    assert not has_blocker(issues) and "pacing_overload" in codes(issues, "warning")


def test_cliffhanger_required_before_episode_20():
    script = make_script(2)
    script["cliffhanger"] = ""
    assert "weak_hook" in codes(run(script), "blocker")
    last = make_script(20)
    assert not has_blocker(validate_script(last, CHARS, BIBLE, 20))


def test_threads_closed_must_be_open():
    assert "unresolved_reference" in codes(run(make_script(2, threads_closed=["inexistente"])), "blocker")
    assert not has_blocker(run(make_script(2, threads_closed=["chave"])))
    # a thread opened by this very script can be closed by it
    script = make_script(2, threads_closed=["novo_fio"])
    script["threads_opened"] = [{"key": "novo_fio", "description": "d"}]
    assert not has_blocker(run(script))


def test_ip_blocklist_blocks_in_any_text():
    script = make_script(2)
    script["scenes"][1]["visual_prompt"] = "Harry Potter walking in a flooded street"
    assert "ip_infringement" in codes(run(script), "blocker")
    script = make_script(2)
    script["title"] = "A volta de Batman"
    assert "ip_infringement" in codes(run(script), "blocker")


def test_banned_elements_from_bible_are_enforced():
    bible = {**BIBLE, "style_guide": {"banned_elements": ["sangue"]}}
    script = make_script(2)
    script["scenes"][0]["narration"] += " sangue"
    assert "ip_infringement" in codes(validate_script(script, CHARS, bible, 2), "blocker")


def test_merge_with_llm_report():
    ok = merge_with_llm_report([], {"scores": {"premise_fidelity": 0.9, "coherence": 0.9}, "issues": []})
    assert ok["ok"]
    low = merge_with_llm_report([], {"scores": {"premise_fidelity": 0.5, "coherence": 0.9}, "issues": []})
    assert not low["ok"] and low["issues"][0]["code"] == "premise_drift"
    ip = merge_with_llm_report([], {"scores": {"premise_fidelity": 1, "coherence": 1},
                                    "issues": [{"code": "real_person", "severity": "warning", "message": "m"}]})
    assert not ip["ok"]
    det = validate_script(make_script(2, characters_on_screen=("vera",)), CHARS, BIBLE, 2)
    assert not merge_with_llm_report(det, None)["ok"]


# ---------------------------------------------------------- plan checks ----


def test_plan_checks():
    assert check_season_plan(make_plan()) == []
    plan = make_plan()
    plan["episodes"] = plan["episodes"][:19]
    assert any("20 episódios" in p for p in check_season_plan(plan))
    plan = make_plan()
    plan["episodes"][0]["arc_phase"] = "rising"
    assert any("episódio 1" in p for p in check_season_plan(plan))
    plan = make_plan()
    plan["episodes"][9]["arc_phase"] = "rising"
    assert any("midpoint" in p for p in check_season_plan(plan))
    plan = make_plan()
    plan["episodes"][17]["arc_phase"] = "escalation"
    plan["episodes"][18]["arc_phase"] = "escalation"
    assert any("climax" in p for p in check_season_plan(plan))
    plan = make_plan()
    plan["episodes"][19]["arc_phase"] = "climax"
    assert any("resolution" in p for p in check_season_plan(plan))
    plan = make_plan()
    plan["characters"][1]["key"] = "lia"
    assert any("únicas" in p for p in check_season_plan(plan))
    plan = make_plan()
    plan["episodes"][4]["planned_state_changes"] = [{"character_key": "ninguem", "to_status": "dead", "note": ""}]
    assert any("ninguem" in p for p in check_season_plan(plan))
    plan = make_plan()
    plan["episodes"][2]["summary"] = "Chega Darth Vader."
    assert any("protegidos" in p for p in check_season_plan(plan))


# ------------------------------------------------------- projection ----


def test_projection_applies_proposed_events_of_earlier_episodes_only():
    chars = [
        {"key": "lia", "status": "alive", "committed": True},
        {"key": "novo", "status": "alive", "committed": False},
        {"key": "ghost", "status": "alive", "committed": False},
    ]
    events = [
        {"character_key": "lia", "episode_number": 2, "type": "status_change", "to_status": "injured", "state": "proposed"},
        {"character_key": "lia", "episode_number": 3, "type": "status_change", "to_status": "dead", "state": "proposed"},
        {"character_key": "lia", "episode_number": 1, "type": "status_change", "to_status": "missing", "state": "discarded"},
        {"character_key": "novo", "episode_number": 2, "type": "introduce", "to_status": "alive", "state": "proposed"},
        {"character_key": "ghost", "episode_number": 5, "type": "introduce", "to_status": "alive", "state": "proposed"},
    ]
    projected = project_characters(chars, events, 3)
    assert projected["lia"]["status"] == "injured"  # ep 3's own event and the discarded one are ignored
    assert "novo" in projected and "ghost" not in projected


def test_open_thread_keys():
    bible = {"open_threads": [{"key": "a", "closed_in": None}, {"key": "b", "closed_in": 2}]}
    prev = [(1, {"threads_opened": [{"key": "c"}], "threads_closed": []}), (2, {"threads_opened": [], "threads_closed": ["a"]})]
    assert open_thread_keys(bible, prev) == {"c"}


def video_count(script):
    return sum(1 for s in script["scenes"] if s["visual_mode"] == "video")


def test_visual_strategy_assignment():
    script = make_script(2)
    for s in script["scenes"]:
        s["visual_mode"] = "video"
    assert video_count(assign_visual_modes(script, "economy", 3)) == 0
    assert video_count(assign_visual_modes(script, "full_video", 0)) == 5
    assert video_count(assign_visual_modes(script, "hybrid", 2)) == 2
    assert video_count(assign_visual_modes(script, "hybrid", 1, video_available=False)) == 0
    assert video_count(assign_visual_modes(script, "hybrid", 99)) == 5  # capped by the scene count
    assert script["scenes"][0]["visual_mode"] == "video"  # input is not mutated


def test_hybrid_picks_highest_impact_scene():
    script = make_script(2)
    for s in script["scenes"]:
        s["visual_mode"] = "image"
        s["mood"] = "calmo"
    script["scenes"][1]["mood"] = "pânico intenso"
    adjusted = assign_visual_modes(script, "hybrid", 1)
    assert [s["visual_mode"] for s in adjusted["scenes"]].index("video") == 1
    script["scenes"][1]["mood"] = "calmo"  # no intense mood: cliffhanger (last) scene wins
    adjusted = assign_visual_modes(script, "hybrid", 1)
    assert adjusted["scenes"][4]["visual_mode"] == "video"

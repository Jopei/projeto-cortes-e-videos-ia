"""Deterministic checks of a season plan (plano §6) — pure. Returns a list
of human-readable problems (PT-BR) that is fed back to the planner on retry;
an empty list means the plan is acceptable."""

from __future__ import annotations

import json

from app.story.blocklist import find_blocked_terms


def check_season_plan(plan: dict) -> list[str]:
    problems: list[str] = []
    episodes = plan.get("episodes") or []
    by_number = {e.get("number"): e for e in episodes}

    if len(episodes) != 20 or sorted(by_number) != list(range(1, 21)):
        problems.append("O plano precisa ter exatamente 20 episódios numerados de 1 a 20, sem repetição.")
    else:
        for n in (1, 2, 3):
            if by_number[n].get("arc_phase") != "setup":
                problems.append(f"O episódio {n} deve estar na fase setup.")
        if not any(by_number[n].get("arc_phase") == "midpoint" for n in (10, 11)):
            problems.append("A fase midpoint deve ocorrer no episódio 10 ou 11.")
        if not any(by_number[n].get("arc_phase") == "climax" for n in (18, 19)):
            problems.append("A fase climax deve ocorrer no episódio 18 ou 19.")
        if by_number[20].get("arc_phase") != "resolution":
            problems.append("O episódio 20 deve estar na fase resolution.")
        for n in range(1, 20):
            if not (by_number[n].get("cliffhanger") or "").strip():
                problems.append(f"O episódio {n} precisa de um cliffhanger.")

    characters = plan.get("characters") or []
    keys = [c.get("key") for c in characters]
    if len(set(keys)) != len(keys):
        problems.append("As keys dos personagens precisam ser únicas.")
    key_set = set(keys)
    for ep in episodes:
        for change in ep.get("planned_state_changes") or []:
            if change.get("character_key") not in key_set:
                problems.append(
                    f"Episódio {ep.get('number')}: planned_state_changes cita '{change.get('character_key')}', que não existe."
                )
    for rel in plan.get("relationships") or []:
        for end in (rel.get("a"), rel.get("b")):
            if end not in key_set:
                problems.append(f"Relacionamento cita '{end}', que não é um personagem do plano.")
    locations = [loc.get("key") for loc in (plan.get("world") or {}).get("locations") or []]
    if len(set(locations)) != len(locations):
        problems.append("As keys dos locais precisam ser únicas.")
    for thread in plan.get("open_threads") or []:
        if thread.get("planned_resolution_in", 0) < thread.get("introduced_in", 0):
            problems.append(f"O fio '{thread.get('key')}' é resolvido antes de ser aberto.")

    hits = find_blocked_terms(json.dumps(plan, ensure_ascii=False))
    if hits:
        problems.append(
            "O plano menciona nomes/universos protegidos (" + ", ".join(hits) + "); use apenas elementos originais."
        )
    return problems

"""Deterministic stand-in for Claude (dev/tests only, `STORY_FAKE_LLM_ENABLED`
and no Anthropic key). Returns tool payloads that pass the Pydantic schemas,
the plan checks and the deterministic script validator, so the whole Series
IA pipeline can run locally at cost 0. Context is recovered from the prompt
text built by `app/story/prompts.py` (premise block, outline, characters)."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata

_NAMES = ["Helena", "Tomás", "Irene", "Caio", "Marta", "Davi", "Lúcia", "Rui", "Nina", "Otávio"]
_MIDDLE_DEATH_EPISODE = 12


def _between(text: str, start: str, end: str) -> str:
    i = text.find(start)
    if i < 0:
        return ""
    i += len(start)
    j = text.find(end, i)
    return text[i:j if j >= 0 else len(text)].strip()


def _user_text(messages: list[dict]) -> str:
    return "\n\n".join(str(m.get("content", "")) for m in messages if m.get("role") == "user")


def _premise(text: str) -> str:
    return _between(text, "<premissa>", "</premissa>") or "uma história original"


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()).strip("_")


def _snippet(premise: str, n: int = 6) -> str:
    words = re.sub(r"[^\wÀ-ÿ'-]+", " ", premise).split()
    words = (words + ["no", "mar", "e", "no", "tempo", "perdido"])[:n] if len(words) < n else words[:n]
    return " ".join(words).lower()


def _names(premise: str) -> list[str]:
    start = int(hashlib.sha256(premise.encode()).hexdigest(), 16) % len(_NAMES)
    return [_NAMES[(start + i) % len(_NAMES)] for i in range(4)]


def _phase(n: int) -> str:
    if n <= 3:
        return "setup"
    if n <= 9:
        return "rising"
    if n == 10:
        return "midpoint"
    if n <= 17:
        return "escalation"
    if n == 18:
        return "climax"
    if n == 19:
        return "escalation"
    return "resolution"


def screen_premise(text: str) -> dict:
    premise = _premise(text)
    elems = [w for w in re.findall(r"\w{5,}", premise.lower())][:4]
    return {"allowed": True, "reasons": [], "core_elements": (elems + ["mistério", "coragem", "segredo"])[:4]}


def season_plan(text: str) -> dict:
    premise = _premise(text)
    names = _names(premise)
    snippet = _snippet(premise, 8)
    keys = ["protagonista", "aliado", "mentor", "rival"]
    roles = ["protagonist", "supporting", "supporting", "antagonist"]
    looks = [
        "woman in her thirties, weathered face, short dark hair, wearing a faded yellow raincoat and heavy boots",
        "young man in his twenties, curly brown hair, round glasses, wearing a green wool sweater and canvas pants",
        "elderly man with a white beard and deep wrinkles, wearing a navy captain's coat and a grey woolen cap",
        "tall woman in her forties, sharp features, silver-streaked black hair tied back, wearing a long charcoal coat",
    ]
    characters = [
        {
            "key": keys[i], "name": names[i], "role": roles[i],
            "description": f"{names[i]} é {['a protagonista', 'um aliado', 'um mentor', 'uma rival'][i]} desta história: {snippet}.",
            "visual_description": looks[i], "personality": "Determinada e curiosa" if i == 0 else "Reservado e leal",
            "goal": "Descobrir a verdade por trás do mistério", "arc": "Da dúvida à coragem",
        }
        for i in range(4)
    ]
    titles = [f"Capítulo {n}: {t}" for n, t in zip(range(1, 21), [
        "O primeiro sinal", "Algo no horizonte", "A decisão", "Pistas na névoa", "O aliado", "Segredos antigos",
        "A tempestade", "Desconfiança", "O mapa", "A virada", "A perda", "O luto", "Sombras", "A rival age",
        "A verdade parcial", "Contagem regressiva", "O plano final", "O confronto", "A escolha", "Um novo amanhecer",
    ])]
    episodes = []
    for n in range(1, 21):
        changes = []
        if n == _MIDDLE_DEATH_EPISODE:
            changes = [{"character_key": "mentor", "to_status": "dead", "note": "O mentor se sacrifica."}]
        episodes.append({
            "number": n, "title": titles[n - 1][:70], "arc_phase": _phase(n),
            "summary": f"Episódio {n} da série ({snippet}): a trama avança e novas pistas surgem."[:400],
            "key_events": [f"Evento principal do episódio {n}"], "planned_state_changes": changes,
            "cliffhanger": "" if n == 20 else f"Uma revelação inesperada muda tudo no fim do episódio {n}."[:140],
        })
    return {
        "title": f"{snippet.capitalize()}"[:80], "logline": f"Série original baseada em: {premise}"[:300],
        "genre": "mistério", "tone": "intimista",
        "style_guide": {
            "narration_voice": "Narrador calmo e envolvente, em português do Brasil",
            "visual_style": "cinematic painterly illustration, muted teal and amber palette, soft volumetric light",
            "banned_elements": [],
        },
        "world": {
            "setting": f"O mundo da história: {snippet}", "era": "atualidade", "rules": ["Nada é totalmente o que parece."],
            "locations": [
                {"key": "cenario_principal", "name": "Cenário principal",
                 "visual_description": "A remote coastal place at dusk, wind-swept cliffs, grey sea, low clouds"},
                {"key": "cenario_secundario", "name": "Cenário secundário",
                 "visual_description": "A small cluttered room with maps, lanterns and old wooden furniture"},
            ],
        },
        "characters": characters,
        "relationships": [{"a": "protagonista", "b": "mentor", "type": "mentoria", "description": "Ele a guia no início."}],
        "season_arc": {"theme": "Coragem diante do desconhecido", "central_question": "O que se esconde por trás do mistério?",
                       "ending_summary": "A protagonista descobre a verdade e escolhe seu destino."},
        "episodes": episodes,
        "open_threads": [
            {"key": "misterio_central", "description": "A origem do mistério central.", "introduced_in": 1,
             "planned_resolution_in": 20},
            {"key": "segredo_do_mentor", "description": "O que o mentor esconde.", "introduced_in": 2, "planned_resolution_in": 15},
        ],
    }


def _json_after(text: str, header: str):
    raw = _between(text, header, "\n\n")
    # headers are followed by an indented JSON block that may contain blank lines? (indent=1 never does)
    try:
        return json.loads(raw)
    except ValueError:
        return None


def episode_script(text: str) -> dict:
    premise = _premise(text)
    m = re.search(r"roteiro do episódio (\d+)", text)
    n = int(m.group(1)) if m else 1
    outline = _json_after(text, "Outline deste episódio (siga-o):\n") or {}
    characters = _json_after(text, "Personagens e estado atual (use exatamente estes status em from_status):\n") or []
    bible = _json_after(text, "Bíblia da série:\n") or {}
    status = {c["key"]: c.get("status", "alive") for c in characters}
    alive = [k for k, st in status.items() if st != "dead"]
    hero = "protagonista" if "protagonista" in alive else (alive[0] if alive else None)

    events = []
    for ch in outline.get("planned_state_changes") or []:
        key, to = ch.get("character_key"), ch.get("to_status")
        if key in status and status[key] != "dead" and status[key] != to:
            events.append({"type": "status_change", "character_key": key, "from_status": status[key], "to_status": to,
                           "description": ch.get("note") or ""})

    snippet = _snippet(premise, 6)
    sc = [
        f"No episódio {n}, {snippet}, a história ganha um novo capítulo de mistério e tensão.",
        "Pistas escondidas aparecem aos poucos e ninguém imagina o quanto aquela descoberta pode custar caro.",
        "A coragem de quem decide continuar a busca é testada diante de segredos que preferiam ficar enterrados.",
        "Quando tudo parece perdido, uma revelação inesperada surge e deixa todos sem fôlego, esperando o próximo passo.",
    ]
    target = 68
    total = sum(len(s.split()) for s in sc)
    if total < target:
        sc[3] += " " + " ".join(["agora"] * (target - total))
    elif total > target:
        words = sc[3].split()
        sc[3] = " ".join(words[: max(8, len(words) - (total - target))])
    loc_keys = [loc["key"] for loc in ((bible.get("world") or {}).get("locations") or [])] or [None]
    camera = ["wide shot", "medium shot", "close-up", "low angle"]
    moods = ["mysterious", "tense", "determined", "suspenseful"]
    scenes = [
        {
            "index": i, "duration_s": 7.5, "narration": sc[i],
            "visual_prompt": f"Episode {n}, scene {i + 1}: dramatic cinematic moment, moody lighting, detailed environment",
            "visual_mode": "image", "characters_on_screen": [hero] if hero else [],
            "location_key": loc_keys[i % len(loc_keys)], "camera": camera[i], "mood": moods[i], "is_flashback": False,
        }
        for i in range(4)
    ]
    cliff = "" if n == 20 else ((outline.get("cliffhanger") or f"Uma revelação inesperada muda tudo no episódio {n}.")[:140])
    opened = [{"key": "pista_do_mar", "description": "Uma pista misteriosa surgiu."}] if n == 3 else []
    closed = ["pista_do_mar"] if n == 6 else []
    if n == 15:
        closed.append("segredo_do_mentor")
    if n == 20:
        closed.append("misterio_central")
    return {
        "number": n, "title": f"Episódio {n}", "on_screen_title": f"Ep. {n}", "scenes": scenes, "cliffhanger": cliff,
        "state_events": events, "threads_opened": opened, "threads_closed": closed,
        "continuity_notes": f"Continuidade fake do episódio {n}.",
    }


def validation_report(text: str) -> dict:
    return {"ok": True, "scores": {"premise_fidelity": 0.9, "coherence": 0.9, "interest": 0.8, "outline_adherence": 0.9},
            "issues": []}


def fake_tool_result(tool_name: str, messages: list[dict]) -> dict:
    text = _user_text(messages)
    if tool_name == "screen_premise":
        return screen_premise(text)
    if tool_name == "submit_season_plan":
        return season_plan(text)
    if tool_name == "submit_episode_script":
        return episode_script(text)
    if tool_name == "submit_validation":
        return validation_report(text)
    raise ValueError(f"fake_llm: unknown tool {tool_name}")

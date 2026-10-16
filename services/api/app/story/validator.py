"""Deterministic script validator (plano §6) — PURE: no DB, no HTTP, no LLM.

`validate_script(...)` returns the list of `Issue`s found; the episode passes
if the union of these issues and the LLM report (`merge_with_llm_report`)
contains no blocker. Issue codes reuse the LLM `IssueCodeT` vocabulary where
it applies (`dead_character_appears`, `status_contradiction`,
`unresolved_reference`, `ip_infringement`, `weak_hook`, `pacing_overload`)
plus a few purely structural codes (`scene_count`, `duration`, `word_count`,
`script_missing`, ...).

`projected_characters` is `{key: {"status": "alive|dead|..."}}` — the state
*before* this episode (applied events + the proposed ones of earlier
episodes, see `app.story.projection`). `open_threads` is the set of thread
keys still open before this episode.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any

from app.story.blocklist import find_blocked_terms
from app.story.schemas import KEY_PATTERN

MIN_SCENES, MAX_SCENES = 3, 6
MIN_TOTAL_S, MAX_TOTAL_S = 26.0, 34.0
MIN_WORDS, MAX_WORDS = 55, 85
MAX_WORDS_PER_SECOND = 3.0
MAX_DEATHS_PER_EPISODE = 2
NO_NEW_CHARACTERS_BEFORE = 4  # from this episode on, at most 1 `introduce`
FINAL_EPISODE = 20


@dataclass(frozen=True)
class Issue:
    code: str
    severity: str  # "blocker" | "warning"
    message: str
    scene_index: int | None = None
    suggestion: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def has_blocker(issues: list[Issue] | list[dict]) -> bool:
    return any((i.severity if isinstance(i, Issue) else i.get("severity")) == "blocker" for i in issues)


def _words(text: str) -> int:
    return len((text or "").split())


def _script_texts(script: dict) -> list[str]:
    texts = [script.get("title") or "", script.get("on_screen_title") or "", script.get("cliffhanger") or ""]
    for scene in script.get("scenes") or []:
        texts.append(scene.get("narration") or "")
        texts.append(scene.get("visual_prompt") or "")
    for event in script.get("state_events") or []:
        new = event.get("new_character") or {}
        texts.extend([new.get("name") or "", new.get("description") or "", new.get("visual_description") or ""])
        texts.append(event.get("description") or "")
    return texts


def validate_script(
    script: dict | None,
    projected_characters: dict[str, dict],
    bible: dict | None,
    episode_number: int,
    provider_caps: dict | None = None,
    target_s: float = 30.0,
    *,
    open_threads: set[str] | None = None,
) -> list[Issue]:
    issues: list[Issue] = []
    if not script:
        return [Issue("script_missing", "blocker", "O roteiro não foi gerado.")]

    def add(code: str, severity: str, message: str, scene_index: int | None = None, suggestion: str = "") -> None:
        issues.append(Issue(code, severity, message, scene_index, suggestion))

    scenes = script.get("scenes") or []
    events = script.get("state_events") or []

    # --- structure: scenes / durations / words -------------------------
    if not (MIN_SCENES <= len(scenes) <= MAX_SCENES):
        add("scene_count", "blocker", f"O roteiro tem {len(scenes)} cenas; o esperado é {MIN_SCENES} a {MAX_SCENES}.",
            suggestion="Reorganize em 4 a 5 cenas.")

    total = sum(float(s.get("duration_s") or 0) for s in scenes)
    if not (MIN_TOTAL_S <= total <= MAX_TOTAL_S):
        add("duration", "blocker",
            f"A soma das durações é {total:.1f}s; precisa ficar entre {MIN_TOTAL_S:.0f}s e {MAX_TOTAL_S:.0f}s (alvo {target_s:.0f}s).",
            suggestion=f"Ajuste as durações das cenas para somar ~{target_s:.0f}s.")

    allowed = (provider_caps or {}).get("allowed_durations") or []
    if allowed:
        longest = max(allowed)
        for scene in scenes:
            if scene.get("visual_mode") == "video" and float(scene.get("duration_s") or 0) > longest:
                add("duration", "blocker",
                    f"Cena em vídeo com {scene.get('duration_s')}s excede o máximo do provedor ({longest}s).",
                    scene.get("index"), "Divida a cena ou use uma cena em imagem.")

    total_words = sum(_words(s.get("narration") or "") for s in scenes)
    if not (MIN_WORDS <= total_words <= MAX_WORDS):
        add("word_count", "blocker",
            f"A narração tem {total_words} palavras; o esperado é {MIN_WORDS} a {MAX_WORDS}.",
            suggestion="Ajuste a narração para 60-80 palavras.")
    for scene in scenes:
        duration = float(scene.get("duration_s") or 0)
        words = _words(scene.get("narration") or "")
        if duration > 0 and words > duration * MAX_WORDS_PER_SECOND:
            add("pacing_overload", "blocker",
                f"Cena {scene.get('index')}: {words} palavras em {duration:.1f}s é rápido demais para narrar.",
                scene.get("index"), "Encurte a narração da cena ou aumente sua duração.")

    # --- characters ------------------------------------------------------
    introduced_keys = {
        e.get("character_key") for e in events if e.get("type") == "introduce" and e.get("character_key")
    }
    status = {key: (value or {}).get("status", "alive") for key, value in projected_characters.items()}
    known = set(status) | introduced_keys

    for event in events:
        if event.get("type") == "introduce" and event.get("character_key") in projected_characters:
            add("status_contradiction", "blocker",
                f"O personagem '{event.get('character_key')}' já existe e não pode ser introduzido de novo.",
                suggestion="Use um evento status_change ou outra key para um personagem realmente novo.")
        if event.get("type") == "introduce" and not re.fullmatch(KEY_PATTERN, event.get("character_key") or ""):
            add("unresolved_reference", "blocker",
                f"Key inválida para o novo personagem: '{event.get('character_key')}'.",
                suggestion="Use apenas letras minúsculas, números e _ (2 a 32 caracteres).")
        if event.get("type") == "introduce" and not event.get("new_character"):
            add("unresolved_reference", "blocker",
                f"Evento introduce de '{event.get('character_key')}' sem new_character.",
                suggestion="Descreva o novo personagem em new_character.")

    for scene in scenes:
        idx = scene.get("index")
        for key in scene.get("characters_on_screen") or []:
            if key not in known:
                add("unresolved_reference", "blocker", f"Cena {idx}: personagem '{key}' não existe nem é introduzido.",
                    idx, "Use uma key existente ou introduza o personagem via state_events.")
                continue
            current = status.get(key)
            if current == "dead" and not scene.get("is_flashback"):
                add("dead_character_appears", "blocker",
                    f"Cena {idx}: '{key}' está morto e aparece fora de flashback.", idx,
                    "Marque a cena como flashback ou remova o personagem.")
            elif current == "missing":
                add("status_contradiction", "warning",
                    f"Cena {idx}: '{key}' está desaparecido; confirme se a aparição é coerente.", idx)

    # --- state events (applied in order on a working copy of the status) -
    deaths = 0
    for event in events:
        key = event.get("character_key")
        if event.get("type") != "status_change":
            continue
        if key not in known:
            add("unresolved_reference", "blocker", f"Evento de estado para '{key}', que não existe.")
            continue
        current = status.get(key, "alive")
        declared = event.get("from_status")
        to = event.get("to_status")
        if current == "dead":
            add("status_contradiction", "blocker", f"'{key}' está morto e não pode mudar de estado.",
                suggestion="Remova o evento (personagens mortos não voltam).")
            continue
        if declared != current:
            add("status_contradiction", "blocker",
                f"Evento de '{key}' declara from_status={declared}, mas o estado projetado é {current}.",
                suggestion=f"Use from_status={current}.")
        if to == "dead":
            deaths += 1
        if to:
            status[key] = to
    if deaths > MAX_DEATHS_PER_EPISODE:
        add("pacing_overload", "blocker", f"{deaths} mortes no mesmo episódio; o máximo é {MAX_DEATHS_PER_EPISODE}.",
            suggestion="Reduza para no máximo 2 mortes.")
    if episode_number >= NO_NEW_CHARACTERS_BEFORE and len(introduced_keys) > 1:
        add("pacing_overload", "warning",
            f"{len(introduced_keys)} personagens novos; a partir do ep. {NO_NEW_CHARACTERS_BEFORE} use no máximo 1.")

    # --- hook / threads --------------------------------------------------
    if episode_number < FINAL_EPISODE and not (script.get("cliffhanger") or "").strip():
        add("weak_hook", "blocker", "Cliffhanger vazio (só o episódio 20 pode terminar sem gancho).",
            suggestion="Termine com uma pergunta ou reviravolta.")

    opened = {t.get("key") for t in script.get("threads_opened") or []}
    open_set = set(open_threads or ()) | opened
    if open_threads is None and bible:
        open_set |= {t.get("key") for t in (bible.get("open_threads") or []) if t.get("closed_in") in (None, 0)}
    for key in script.get("threads_closed") or []:
        if key not in open_set:
            add("unresolved_reference", "blocker", f"threads_closed contém '{key}', que não está aberta.",
                suggestion="Feche apenas fios narrativos abertos.")

    # --- IP blocklist ----------------------------------------------------
    banned = tuple((((bible or {}).get("style_guide") or {}).get("banned_elements")) or ())
    hits: list[str] = []
    for text in _script_texts(script):
        for term in find_blocked_terms(text, banned):
            if term not in hits:
                hits.append(term)
    if hits:
        add("ip_infringement", "blocker",
            "O roteiro menciona nomes/universos protegidos ou elementos banidos: " + ", ".join(hits) + ".",
            suggestion="Substitua por personagens e lugares originais.")
    return issues


def merge_with_llm_report(det_issues: list[Issue], llm_report: dict | None) -> dict:
    """Union of the deterministic issues and the (optional) LLM report ->
    the `StoryEpisode.validation` JSON. `ok` iff no blocker in the union."""
    issues = [i.to_dict() for i in det_issues]
    scores = None
    if llm_report:
        scores = llm_report.get("scores")
        issues.extend(llm_report.get("issues") or [])
        if scores and (
            scores.get("premise_fidelity", 1) < 0.6
            or scores.get("coherence", 1) < 0.6
        ):
            if not any(i.get("code") == "premise_drift" and i.get("severity") == "blocker" for i in issues):
                issues.append(
                    {
                        "code": "premise_drift",
                        "severity": "blocker",
                        "scene_index": None,
                        "message": "Fidelidade à premissa ou coerência abaixo de 0,6.",
                        "suggestion": "Reaproxime o roteiro da premissa e do outline.",
                    }
                )
        for issue in list(issues):
            if issue.get("code") in ("ip_infringement", "real_person", "unsafe_content") and issue.get("severity") != "blocker":
                issue["severity"] = "blocker"
    return {"ok": not has_blocker(issues), "scores": scores, "issues": issues}

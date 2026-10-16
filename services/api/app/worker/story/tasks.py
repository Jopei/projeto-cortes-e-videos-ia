"""Series IA worker tasks (plano §4). Queues (see `celery_app.task_routes`):
`story` = Claude + orchestration, `genmedia` = provider submit/poll/download,
`celery` = ffmpeg (`assemble_episode`).

Conventions
-----------
* Every status change goes through `app.story.state.transition` (CAS): a
  task that loses the race (or finds the row in another state) is a no-op, so
  every task is safe to re-run / run twice.
* Tasks open their own session via `app.db.SessionLocal` (looked up
  dynamically so tests can monkeypatch it) and never re-raise a business
  failure: they record it on the row (`plan_failed`, `needs_attention`,
  `story_media_jobs.error`).
* Follow-up tasks are enqueued AFTER the commit (the "outbox"), never inside
  the transaction.
* Claude is always called through `llm.call_structured` (module attribute, so
  tests monkeypatch it). Costs go to `ai_usage_events` via `costs.py`.
* Media is idempotent by `story_media_jobs.idempotency_key`
  (`sha256(provider|kind|prompt|duration|refs|voice)`): an identical scene /
  narration is reused, never regenerated. To FORCE a redo of a component,
  mark its jobs `canceled`/`failed` (a failed/canceled job found by key is
  reset to `queued`).
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
import shutil
import tempfile
import uuid
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import update
from sqlalchemy.orm import Session

import app.db as db_module
from app.audit import record_action
from app.config import get_settings
from app.genmedia_catalog import get_provider as catalog_provider
from app.genmedia_catalog import price_usd
from app.integrations import get_integration_value
from app.models.clip import Clip, ClipStatus
from app.models.story import (
    CharacterRole,
    CharacterStatus,
    EpisodeStatus,
    MediaJobKind,
    MediaJobStatus,
    SeriesStatus,
    StoryCharacter,
    StoryCharacterEvent,
    StoryEpisode,
    StoryMediaJob,
    StorySeries,
)
from app.models.user import User
from app.story import lifecycle, prompts
from app.story.plan_checks import check_season_plan
from app.story.projection import assign_visual_modes, open_thread_keys, project_characters
from app.story.schemas import TOOL_MODELS, parse_tool_result, tool_schema
from app.story.state import TransitionConflict, transition
from app.story.validator import has_blocker, merge_with_llm_report, validate_script
from app.worker.celery_app import celery_app
from app.worker.genmedia import registry
from app.worker.genmedia.base import ProviderError
from app.worker.genmedia.semaphore import get_store, inflight_limit, slot_name
from app.worker.story import llm
from app.worker.story.costs import record_llm_usage, record_usage

logger = logging.getLogger(__name__)

E = EpisodeStatus
MAX_MEDIA_ATTEMPTS = 3
ESTIMATED_EPISODE_BYTES = 50 * 1024 * 1024
SUBMIT_RETRY_S = 30
RESCRIPTABLE_CODES = ("unsafe_content", "narration_too_long")
IN_FLIGHT = (
    E.SCRIPTING, E.VALIDATING, E.SCRIPT_READY, E.AWAITING_SCRIPT_APPROVAL, E.GENERATING_MEDIA,
    E.ASSEMBLING, E.PENDING_REVIEW, E.APPROVED, E.REJECTED, E.NEEDS_ATTENTION,
)
HAS_SCRIPT = (
    E.SCRIPT_READY, E.AWAITING_SCRIPT_APPROVAL, E.GENERATING_MEDIA, E.ASSEMBLING, E.PENDING_REVIEW,
    E.APPROVED, E.SCHEDULED, E.PUBLISHED,
)


# ------------------------------------------------------------- plumbing ----


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@contextmanager
def _db():
    session = db_module.SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _uid(value) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


class _Outbox:
    """Follow-up tasks collected during a transaction and fired after commit."""

    def __init__(self) -> None:
        self.items: list[tuple] = []

    def add(self, task, *args, countdown: float | None = None) -> None:
        self.items.append((task, args, countdown))

    def flush(self) -> None:
        items, self.items = self.items, []
        for task, args, countdown in items:
            if countdown:
                task.apply_async(args=list(args), countdown=countdown)
            else:
                task.delay(*args)


def _api_key() -> str | None:
    return get_integration_value("anthropic", "api_key")


def _model(series: StorySeries, role: str) -> str:
    settings = get_settings()
    if role == "planner":
        return series.planner_model or settings.story_planner_model
    return series.writer_model or settings.story_writer_model


def _call(db: Session, series: StorySeries, episode: StoryEpisode | None, *, role: str, tool: str, messages: list[dict],
          max_tokens: int, purpose: str) -> dict:
    """One structured Claude call + cost bookkeeping (committed immediately so
    the spend survives a later failure in the same task)."""
    schema = tool_schema(tool)
    data, usage = llm.call_structured(
        _model(series, role), prompts.SYSTEM_RULES, messages, tool, schema["input_schema"], max_tokens, _api_key() or "",
        tool_description=TOOL_MODELS[tool][1],
    )
    record_llm_usage(
        db, owner_id=series.owner_id, series_id=series.id, episode_id=episode.id if episode else None,
        usage=usage, purpose=purpose,
    )
    db.commit()
    return data


def _characters(db: Session, series_id) -> list[StoryCharacter]:
    return db.query(StoryCharacter).filter(StoryCharacter.series_id == series_id).all()


def _char_dict(c: StoryCharacter) -> dict:
    return {
        "key": c.key, "name": c.name, "role": c.role.value if c.role else None, "description": c.description,
        "visual_description": c.visual_description, "personality": c.personality, "status": c.status.value,
        "committed": c.committed, "reference_image_key": c.reference_image_key,
    }


def _event_dicts(db: Session, series_id, characters: list[StoryCharacter]) -> list[dict]:
    keys = {c.id: c.key for c in characters}
    rows = db.query(StoryCharacterEvent).filter(StoryCharacterEvent.series_id == series_id).all()
    return [
        {
            "character_key": keys.get(r.character_id), "episode_number": r.episode_number, "type": r.type.value,
            "from_status": r.from_status.value if r.from_status else None,
            "to_status": r.to_status.value if r.to_status else None, "description": r.description,
            "state": r.state.value,
        }
        for r in rows
    ]


def _video_caps(series: StorySeries) -> dict | None:
    if not series.video_provider:
        return None
    spec = catalog_provider(series.video_provider, "video")
    if spec is None:
        return None
    return {"allowed_durations": list(spec.capabilities.allowed_durations)}


def _scene_texts(script: dict) -> list[str]:
    return [(s.get("narration") or "").strip() for s in script.get("scenes") or []]


def _narration(script: dict) -> str:
    return " ".join(t for t in _scene_texts(script) if t)


def _episode_context_script(db: Session, series: StorySeries, episode: StoryEpisode) -> dict | None:
    if not episode.script:
        return None
    return assign_visual_modes(
        episode.script, series.visual_strategy, series.max_video_scenes_per_episode,
        video_available=bool(series.video_provider),
    )


# ---------------------------------------------------- budgets / pausing ----


def _pause_series(db: Session, series: StorySeries, reason: str) -> None:
    try:
        transition(db, series, SeriesStatus.PAUSED, SeriesStatus.ACTIVE, pause_reason=reason)
    except TransitionConflict:
        return
    record_action(db, user_id=None, action="series.auto_pause", entity="series", entity_id=series.id, details={"reason": reason})


def _budget_pause_reason(db: Session, series: StorySeries, additional: Decimal) -> str | None:
    from app.quotas import assert_ai_budget, assert_storage_quota

    if series.budget_limit_usd is not None and Decimal(str(series.cost_usd_total)) + additional > Decimal(str(series.budget_limit_usd)):
        return "series_budget_exceeded"
    user = db.get(User, series.owner_id)
    if user is None:
        return None
    try:
        assert_ai_budget(db, user, series.owner_id, additional)
    except HTTPException:
        return "user_ai_budget_exceeded"
    try:
        assert_storage_quota(db, user, series.owner_id, ESTIMATED_EPISODE_BYTES)
    except HTTPException:
        return "storage_quota_exceeded"
    return None


# ----------------------------------------------------- failure handling ----


def _needs_attention(db: Session, episode: StoryEpisode, from_status, message: str) -> None:
    try:
        transition(db, episode, E.NEEDS_ATTENTION, from_status, error=message[:500])
    except TransitionConflict:
        pass


def _media_failure(db: Session, episode: StoryEpisode, from_status, outbox: _Outbox, *, code: str, message: str,
                   scene_index: int | None = None) -> None:
    """A media/assembly failure: for a provider safety refusal or a narration
    that is too long, re-script ONCE (`validation.media_retries`), otherwise
    `needs_attention`."""
    validation = dict(episode.validation or {})
    retries = int(validation.get("media_retries", 0))
    if code in RESCRIPTABLE_CODES and retries < 1:
        validation.update(
            ok=False,
            media_retries=retries + 1,
            issues=[{
                "code": "unsafe_content" if code == "unsafe_content" else "pacing_overload",
                "severity": "blocker",
                "scene_index": scene_index,
                "message": message,
                "suggestion": "Reescreva a cena de forma mais branda." if code == "unsafe_content" else "Encurte a narração.",
            }],
        )
        try:
            transition(db, episode, E.SCRIPTING, from_status, validation=validation, error=None)
        except TransitionConflict:
            return
        outbox.add(script_episode, str(episode.id))
        return
    _needs_attention(db, episode, from_status, f"{code}: {message}")


# ================================================================ PLAN ====


def _persist_plan(db: Session, series: StorySeries, plan: dict, core_elements: list[str]) -> None:
    from app.story.schemas import Bible, OpenThread

    ep_ids = [e.id for e in db.query(StoryEpisode).filter(StoryEpisode.series_id == series.id).all()]
    db.query(StoryCharacterEvent).filter(StoryCharacterEvent.series_id == series.id).delete()
    for ep_id in ep_ids:
        db.query(StoryEpisode).filter(StoryEpisode.id == ep_id).delete()
    db.query(StoryCharacter).filter(StoryCharacter.series_id == series.id).delete()
    db.flush()

    bible = Bible(
        world=plan["world"], style_guide=plan["style_guide"], relationships=plan.get("relationships") or [],
        season_arc=plan["season_arc"],
        open_threads=[OpenThread(key=t["key"], description=t["description"], introduced_in=t["introduced_in"],
                                 planned_resolution_in=t["planned_resolution_in"]) for t in plan.get("open_threads") or []],
        premise_core_elements=core_elements,
    )
    series.bible = bible.model_dump(mode="json")
    series.bible_version = (series.bible_version or 0) + 1
    if not series.title:
        series.title = plan["title"][:120]
    if not series.genre:
        series.genre = plan["genre"][:60]
    if not series.tone:
        series.tone = plan["tone"][:60]

    for c in plan["characters"]:
        db.add(StoryCharacter(
            series_id=series.id, key=c["key"], name=c["name"], role=CharacterRole(c["role"]),
            description=c["description"], visual_description=c["visual_description"],
            personality=f"{c['personality']} Objetivo: {c['goal']}. Arco: {c['arc']}",
            status=CharacterStatus.ALIVE, committed=True, introduced_in_episode=1,
        ))
    for ep in sorted(plan["episodes"], key=lambda e: e["number"]):
        db.add(StoryEpisode(
            owner_id=series.owner_id, series_id=series.id, number=ep["number"], title=ep["title"],
            arc_phase=ep["arc_phase"], status=E.PLANNED,
            outline={
                "summary": ep["summary"], "key_events": ep.get("key_events") or [],
                "planned_state_changes": ep.get("planned_state_changes") or [], "cliffhanger": ep["cliffhanger"],
            },
        ))
    db.flush()


def _fail_plan(db: Session, series: StorySeries, message: str) -> None:
    db.rollback()
    series = db.get(StorySeries, series.id)
    try:
        transition(db, series, SeriesStatus.PLAN_FAILED, SeriesStatus.PLANNING, error=message[:1000])
    except TransitionConflict:
        db.rollback()
        return
    record_action(db, user_id=None, action="series.plan", entity="series", entity_id=series.id, details={"ok": False})
    db.commit()


@celery_app.task(name="app.worker.story.tasks.plan_series")
def plan_series(series_id: str, instructions: str | None = None) -> dict:
    with _db() as db:
        series = db.get(StorySeries, _uid(series_id))
        if series is None:
            return {"series_id": series_id, "status": "not_found"}
        if series.status != SeriesStatus.PLANNING:
            return {"series_id": series_id, "status": "noop"}
        try:
            if not llm.is_available(_api_key()):
                _fail_plan(db, series, "Chave da Anthropic não configurada.")
                return {"series_id": series_id, "status": "plan_failed"}

            screen = parse_tool_result("screen_premise", _call(
                db, series, None, role="writer", tool="screen_premise", purpose="screen",
                messages=prompts.screen_messages(series.premise, series.genre, series.tone), max_tokens=1500,
            )).model_dump()
            if not screen["allowed"]:
                reasons = "; ".join(f"[{r['code']}] {r['message']}" for r in screen["reasons"]) or "premissa recusada"
                _fail_plan(db, series, f"Premissa recusada na triagem: {reasons}")
                return {"series_id": series_id, "status": "plan_failed"}

            feedback: list[str] | None = None
            plan: dict | None = None
            for _attempt in range(3):  # first try + up to 2 retries with feedback
                raw = _call(
                    db, series, None, role="planner", tool="submit_season_plan", purpose="plan", max_tokens=16000,
                    messages=prompts.plan_messages(series.premise, series.genre, series.tone, screen["core_elements"],
                                                   instructions, feedback),
                )
                try:
                    candidate = parse_tool_result("submit_season_plan", raw).model_dump(mode="json")
                except ValidationError as exc:
                    feedback = [f"Esquema inválido: {err['loc']}: {err['msg']}" for err in exc.errors()[:10]]
                    continue
                feedback = check_season_plan(candidate)
                if not feedback:
                    plan = candidate
                    break
            if plan is None:
                _fail_plan(db, series, "O plano não passou nas checagens: " + "; ".join(feedback or []))
                return {"series_id": series_id, "status": "plan_failed"}

            series = db.get(StorySeries, series.id)
            _persist_plan(db, series, plan, screen["core_elements"])
            transition(db, series, SeriesStatus.PLANNED, SeriesStatus.PLANNING, error=None)
            record_action(db, user_id=None, action="series.plan", entity="series", entity_id=series.id, details={"ok": True})
            db.commit()
            return {"series_id": series_id, "status": "planned"}
        except Exception as exc:  # noqa: BLE001 - recorded on the row
            logger.exception("plan_series failed for %s", series_id)
            _fail_plan(db, series, f"Erro inesperado no planejamento: {exc}")
            return {"series_id": series_id, "status": "plan_failed"}


# ============================================================== SCRIPT ====


@celery_app.task(name="app.worker.story.tasks.script_episode")
def script_episode(episode_id: str) -> dict:
    outbox = _Outbox()
    result: dict = {"episode_id": episode_id, "status": "noop"}
    with _db() as db:
        episode = db.get(StoryEpisode, _uid(episode_id))
        if episode is None:
            return {"episode_id": episode_id, "status": "not_found"}
        if episode.status != E.SCRIPTING:
            return result
        series = db.get(StorySeries, episode.series_id)
        try:
            lifecycle.sync_script_events(db, series, episode, None)
            db.commit()

            chars = _characters(db, series.id)
            events = _event_dicts(db, series.id, chars)
            projected = project_characters([_char_dict(c) for c in chars], events, episode.number)
            earlier = (
                db.query(StoryEpisode)
                .filter(StoryEpisode.series_id == series.id, StoryEpisode.number < episode.number)
                .order_by(StoryEpisode.number)
                .all()
            )
            previous = earlier[-1] if earlier else None
            summaries = [
                {"number": e.number, "title": e.title, "summary": (e.outline or {}).get("summary"),
                 "cliffhanger": (e.script or {}).get("cliffhanger") or (e.outline or {}).get("cliffhanger")}
                for e in earlier
            ]
            previous_issues = (episode.validation or {}).get("issues") if episode.validation else None
            messages = prompts.script_messages(
                premise=series.premise, bible=series.bible or {}, projected_characters=projected,
                outline=episode.outline or {}, episode_number=episode.number, episode_title=episode.title,
                arc_phase=episode.arc_phase.value if episode.arc_phase else None, previous_summaries=summaries,
                previous_events=[e for e in events if e["episode_number"] < episode.number and e["state"] != "discarded"],
                previous_script=previous.script if previous else None, user_instructions=episode.user_instructions,
                previous_issues=previous_issues, target_s=series.episode_duration_s,
            )
            script: dict | None = None
            parse_feedback: list[str] = []
            for _attempt in range(3):
                raw = _call(
                    db, series, episode, role="writer", tool="submit_episode_script", purpose="script",
                    messages=messages + ([{"role": "user", "content": "Corrija o esquema: " + "; ".join(parse_feedback)}]
                                         if parse_feedback else []),
                    max_tokens=6000,
                )
                raw["number"] = episode.number
                try:
                    script = parse_tool_result("submit_episode_script", raw).model_dump(mode="json")
                    break
                except ValidationError as exc:
                    parse_feedback = [f"{'.'.join(map(str, err['loc']))}: {err['msg']}" for err in exc.errors()[:8]]
            episode = db.get(StoryEpisode, episode.id)
            if script is None:
                validation = {"ok": False, "scores": None, "issues": [{
                    "code": "script_missing", "severity": "blocker", "scene_index": None,
                    "message": "O roteiro devolvido não seguia o esquema: " + "; ".join(parse_feedback), "suggestion": "",
                }], "media_retries": int((episode.validation or {}).get("media_retries", 0))}
                transition(db, episode, E.VALIDATING, E.SCRIPTING, script=None, validation=validation)
            else:
                script = assign_visual_modes(
                    script, series.visual_strategy, series.max_video_scenes_per_episode,
                    video_available=bool(series.video_provider),
                )
                transition(
                    db, episode, E.VALIDATING, E.SCRIPTING, script=script, title=script["title"][:255],
                    script_revision=episode.script_revision + 1,
                )
            db.commit()
            outbox.add(validate_episode, str(episode.id))
            result = {"episode_id": episode_id, "status": "validating"}
        except TransitionConflict:
            db.rollback()
        except Exception as exc:  # noqa: BLE001
            logger.exception("script_episode failed for %s", episode_id)
            db.rollback()
            episode = db.get(StoryEpisode, _uid(episode_id))
            if episode is not None and episode.status == E.SCRIPTING:
                validation = {"ok": False, "scores": None, "issues": [{
                    "code": "script_missing", "severity": "blocker", "scene_index": None,
                    "message": f"Falha ao gerar o roteiro: {exc}"[:500], "suggestion": "",
                }], "media_retries": int((episode.validation or {}).get("media_retries", 0))}
                transition(db, episode, E.VALIDATING, E.SCRIPTING, script=None, validation=validation)
                db.commit()
                outbox.add(validate_episode, str(episode.id))
                result = {"episode_id": episode_id, "status": "validating"}
    outbox.flush()
    return result


# ============================================================ VALIDATE ====


@celery_app.task(name="app.worker.story.tasks.validate_episode")
def validate_episode(episode_id: str) -> dict:
    outbox = _Outbox()
    result: dict = {"episode_id": episode_id, "status": "noop"}
    with _db() as db:
        episode = db.get(StoryEpisode, _uid(episode_id))
        if episode is None:
            return {"episode_id": episode_id, "status": "not_found"}
        if episode.status != E.VALIDATING:
            return result
        series = db.get(StorySeries, episode.series_id)
        try:
            script = episode.script
            chars = _characters(db, series.id)
            events = _event_dicts(db, series.id, chars)
            projected = project_characters([_char_dict(c) for c in chars], events, episode.number)
            earlier = (
                db.query(StoryEpisode)
                .filter(StoryEpisode.series_id == series.id, StoryEpisode.number < episode.number,
                        StoryEpisode.script.isnot(None))
                .all()
            )
            open_threads = open_thread_keys(series.bible, [(e.number, e.script) for e in earlier if e.script])
            det = validate_script(
                script, projected, series.bible, episode.number, _video_caps(series),
                target_s=series.episode_duration_s, open_threads=open_threads,
            )
            llm_report = None
            if script and not has_blocker(det):
                try:
                    llm_report = parse_tool_result("submit_validation", _call(
                        db, series, episode, role="writer", tool="submit_validation", purpose="validation", max_tokens=2500,
                        messages=prompts.validation_messages(
                            premise=series.premise, bible=series.bible or {}, outline=episode.outline or {},
                            script=script, projected_characters=projected, episode_number=episode.number,
                        ),
                    )).model_dump(mode="json")
                except Exception:  # noqa: BLE001 - the deterministic checks already passed; LLM review is best-effort
                    logger.exception("LLM validation failed for episode %s; relying on deterministic checks", episode_id)
                    db.rollback()
            report = merge_with_llm_report(det, llm_report)
            report["media_retries"] = int((episode.validation or {}).get("media_retries", 0))
            episode = db.get(StoryEpisode, episode.id)
            series = db.get(StorySeries, series.id)

            if report["ok"]:
                lifecycle.sync_script_events(db, series, episode, script)
                transition(db, episode, E.SCRIPT_READY, E.VALIDATING, validation=report, error=None)
                if series.require_script_approval:
                    transition(db, episode, E.AWAITING_SCRIPT_APPROVAL, E.SCRIPT_READY)
                else:
                    transition(db, episode, E.GENERATING_MEDIA, E.SCRIPT_READY)
                    outbox.add(generate_episode_media, str(episode.id), "all")
                result = {"episode_id": episode_id, "status": episode.status.value}
            else:
                attempts = episode.validation_attempts + 1
                if attempts < get_settings().story_max_validation_attempts:
                    transition(db, episode, E.SCRIPTING, E.VALIDATING, validation=report, validation_attempts=attempts)
                    outbox.add(script_episode, str(episode.id))
                    result = {"episode_id": episode_id, "status": "scripting"}
                else:
                    blockers = "; ".join(i["message"] for i in report["issues"] if i.get("severity") == "blocker")
                    transition(db, episode, E.NEEDS_ATTENTION, E.VALIDATING, validation=report,
                               validation_attempts=attempts, error=f"Roteiro reprovado {attempts}x: {blockers}"[:500])
                    result = {"episode_id": episode_id, "status": "needs_attention"}
            db.commit()
        except TransitionConflict:
            db.rollback()
        except Exception as exc:  # noqa: BLE001
            logger.exception("validate_episode failed for %s", episode_id)
            db.rollback()
            episode = db.get(StoryEpisode, _uid(episode_id))
            if episode is not None and episode.status == E.VALIDATING:
                _needs_attention(db, episode, E.VALIDATING, f"Erro na validação: {exc}")
                db.commit()
    outbox.flush()
    return result


# ============================================================== MEDIA ====


def _sha(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def _pick_video_duration(series: StorySeries, scene_duration: float) -> int:
    caps = _video_caps(series) or {}
    allowed = sorted(caps.get("allowed_durations") or [])
    if not allowed:
        return max(1, int(round(scene_duration)))
    fits = [d for d in allowed if d >= scene_duration]
    return fits[0] if fits else allowed[-1]


def build_media_specs(db: Session, series: StorySeries, episode: StoryEpisode) -> dict:
    """The set of media jobs an episode needs, derived ONLY from the script +
    series settings (so `generate_episode_media` and `maybe_assemble` /
    `assemble_episode` agree on the idempotency keys)."""
    script = _episode_context_script(db, series, episode)
    if script is None:
        raise ValueError("Episódio sem roteiro.")
    chars = {c.key: c for c in _characters(db, series.id)}
    locations = {loc["key"]: loc for loc in ((series.bible or {}).get("world") or {}).get("locations") or []}
    char_view = {k: {"name": c.name, "visual_description": c.visual_description} for k, c in chars.items()}
    style_guide = (series.bible or {}).get("style_guide") or {}
    scenes = []
    for scene in script["scenes"]:
        mode = scene.get("visual_mode") or "image"
        if mode == "video" and not series.video_provider:
            mode = "image"
        prompt = prompts.compose_visual_prompt(style_guide, char_view, scene, locations.get(scene.get("location_key") or ""))
        refs = sorted(
            chars[k].reference_image_key for k in scene.get("characters_on_screen") or []
            if k in chars and chars[k].reference_image_key
        )
        if mode == "video":
            provider, kind, duration = series.video_provider, MediaJobKind.VIDEO_CLIP, _pick_video_duration(series, scene["duration_s"])
        else:
            provider, kind, duration = series.image_provider, MediaJobKind.IMAGE, 0
        if not provider:
            raise ValueError(f"Provedor de {'vídeo' if mode == 'video' else 'imagem'} não configurado na série.")
        scenes.append({
            "kind": kind, "scene_index": scene["index"], "provider": provider, "prompt": prompt, "refs": refs,
            "duration": duration, "scene_duration_s": scene["duration_s"],
            "key": _sha(provider, kind.value, prompt, str(duration), ",".join(refs), ""),
        })
    if not series.tts_provider or not series.tts_voice_id:
        raise ValueError("Provedor de voz não configurado na série.")
    text = _narration(script)
    tts = {
        "kind": MediaJobKind.TTS, "scene_index": None, "provider": series.tts_provider, "prompt": text, "refs": [],
        "duration": 0, "voice": series.tts_voice_id,
        "key": _sha(series.tts_provider, "tts", text, "0", "", series.tts_voice_id),
    }
    return {"script": script, "scenes": scenes, "tts": tts}


def _find_job(db: Session, key: str, episode_id) -> StoryMediaJob | None:
    job = db.query(StoryMediaJob).filter(StoryMediaJob.idempotency_key == key).one_or_none()
    if job is not None and job.episode_id == episode_id:
        return job
    salted = _sha(key, str(episode_id))
    return db.query(StoryMediaJob).filter(StoryMediaJob.idempotency_key == salted).one_or_none()


def _spec_cost(spec: dict) -> float:
    kind = {MediaJobKind.VIDEO_CLIP: "video", MediaJobKind.IMAGE: "image", MediaJobKind.TTS: "tts"}[spec["kind"]]
    cat = catalog_provider(spec["provider"], kind)
    if cat is None:
        return 0.0
    price = price_usd(cat)
    if kind == "video":
        return price * spec["duration"]
    if kind == "image":
        return price
    return len(spec["prompt"]) / 1000.0 * price


def _upsert_job(db: Session, episode: StoryEpisode, spec: dict, script_revision: int) -> tuple[StoryMediaJob, bool]:
    """Returns `(job, needs_submit)`."""
    job = _find_job(db, spec["key"], episode.id)
    if job is not None:
        job.script_revision = script_revision
        job.scene_index = spec["scene_index"]
        if job.status in (MediaJobStatus.FAILED, MediaJobStatus.CANCELED):
            job.status = MediaJobStatus.QUEUED
            job.attempts = 0
            job.error = None
            job.provider_job_id = None
            job.finished_at = None
            return job, True
        return job, job.status == MediaJobStatus.QUEUED
    key = spec["key"]
    clash = db.query(StoryMediaJob).filter(StoryMediaJob.idempotency_key == key).one_or_none()
    if clash is not None:  # same prompt exists under another episode: don't share its row
        key = _sha(key, str(episode.id))
    job = StoryMediaJob(
        owner_id=episode.owner_id, episode_id=episode.id, script_revision=script_revision, kind=spec["kind"],
        scene_index=spec["scene_index"], provider=spec["provider"], prompt=spec["prompt"],
        params={"duration": spec["duration"], "refs": spec["refs"], "voice": spec.get("voice"),
                "scene_duration_s": spec.get("scene_duration_s")},
        status=MediaJobStatus.QUEUED, attempts=0, cost_usd_estimated=Decimal(str(round(_spec_cost(spec), 4))),
        idempotency_key=key,
    )
    db.add(job)
    db.flush()
    return job, True


@celery_app.task(name="app.worker.story.tasks.generate_episode_media")
def generate_episode_media(episode_id: str, scope: str = "all") -> dict:
    outbox = _Outbox()
    result: dict = {"episode_id": episode_id, "status": "noop"}
    with _db() as db:
        episode = db.get(StoryEpisode, _uid(episode_id))
        if episode is None:
            return {"episode_id": episode_id, "status": "not_found"}
        series = db.get(StorySeries, episode.series_id)
        if episode.status != E.GENERATING_MEDIA or series.status != SeriesStatus.ACTIVE:
            return result
        try:
            try:
                specs = build_media_specs(db, series, episode)
            except ValueError as exc:
                _needs_attention(db, episode, E.GENERATING_MEDIA, str(exc))
                db.commit()
                return {"episode_id": episode_id, "status": "needs_attention"}
            wanted = []
            if scope in ("all", "visual"):
                wanted += specs["scenes"]
            if scope in ("all", "narration"):
                wanted.append(specs["tts"])

            pending = []
            for spec in wanted:
                existing = _find_job(db, spec["key"], episode.id)
                if existing is None or existing.status != MediaJobStatus.SUCCEEDED:
                    pending.append(spec)
            estimate = Decimal(str(round(sum(_spec_cost(s) for s in pending), 4)))
            reason = _budget_pause_reason(db, series, estimate) if pending else None
            if reason:
                _pause_series(db, series, reason)
                db.commit()
                return {"episode_id": episode_id, "status": "paused", "reason": reason}

            to_submit = []
            for spec in wanted:
                job, needs_submit = _upsert_job(db, episode, spec, episode.script_revision)
                if needs_submit:
                    to_submit.append(job.id)
            db.commit()
            for job_id in to_submit:
                outbox.add(submit_media_job, str(job_id))
            outbox.add(maybe_assemble, str(episode.id))
            result = {"episode_id": episode_id, "status": "generating", "jobs": len(to_submit)}
        except Exception as exc:  # noqa: BLE001
            logger.exception("generate_episode_media failed for %s", episode_id)
            db.rollback()
            episode = db.get(StoryEpisode, _uid(episode_id))
            if episode is not None and episode.status == E.GENERATING_MEDIA:
                _needs_attention(db, episode, E.GENERATING_MEDIA, f"Erro ao preparar a mídia: {exc}")
                db.commit()
    outbox.flush()
    return result


# --- genmedia: slots, upload, completion --------------------------------


def _slot_ttl() -> float:
    return float(get_settings().genmedia_job_timeout_s + 300)


def _release(job: StoryMediaJob) -> None:
    get_store().release(slot_name(job.provider), str(job.id))


def _storage_key(job: StoryMediaJob, series_id, ext: str) -> str:
    return f"users/{job.owner_id}/story/{series_id}/{job.episode_id}/{job.kind.value}_{job.id.hex[:12]}.{ext}"


def _upload(local_path: str, key: str, content_type: str) -> None:
    from app.storage import get_s3_client

    get_s3_client().upload_file(local_path, get_settings().s3_bucket, key, ExtraArgs={"ContentType": content_type})


def _cas_job(db: Session, job: StoryMediaJob, to: MediaJobStatus, expected: tuple, **fields) -> bool:
    res = db.execute(
        update(StoryMediaJob)
        .where(StoryMediaJob.id == job.id, StoryMediaJob.status.in_(expected))
        .values(status=to, **fields)
        .execution_options(synchronize_session=False)
    )
    db.flush()
    ok = res.rowcount == 1
    if ok:
        db.refresh(job)
    return ok


def _complete_job(db: Session, job: StoryMediaJob, series: StorySeries, *, storage_key: str, size_bytes: int,
                  duration_s: float | None, cost: float, params: dict | None = None) -> bool:
    """CAS -> succeeded + cost event (only the winner records the cost)."""
    fields = dict(storage_key=storage_key, size_bytes=size_bytes, duration_s=duration_s,
                  cost_usd_actual=Decimal(str(round(cost, 4))), finished_at=_now(), error=None)
    if params is not None:
        fields["params"] = params
    if not _cas_job(db, job, MediaJobStatus.SUCCEEDED,
                    (MediaJobStatus.QUEUED, MediaJobStatus.SUBMITTED, MediaJobStatus.RUNNING), **fields):
        return False
    kind = {MediaJobKind.VIDEO_CLIP: "video", MediaJobKind.IMAGE: "image", MediaJobKind.TTS: "tts"}[job.kind]
    record_usage(db, owner_id=job.owner_id, series_id=series.id, episode_id=job.episode_id, kind=kind,
                 provider=job.provider, model=None, cost_usd=cost, units={"job_id": str(job.id), "scene_index": job.scene_index})
    return True


def _job_failed(db: Session, job: StoryMediaJob, episode: StoryEpisode, outbox: _Outbox, exc: ProviderError | str) -> None:
    """Retry (re-queue) a retryable error up to MAX_MEDIA_ATTEMPTS, otherwise
    fail the job and the episode (re-script once on a safety refusal)."""
    message = str(exc)[:500]
    retryable = isinstance(exc, ProviderError) and exc.retryable
    safety = isinstance(exc, ProviderError) and exc.safety
    _release(job)
    if retryable and job.attempts < MAX_MEDIA_ATTEMPTS:
        delay = float(exc.retry_after or SUBMIT_RETRY_S)
        if _cas_job(db, job, MediaJobStatus.QUEUED, (MediaJobStatus.SUBMITTED, MediaJobStatus.RUNNING, MediaJobStatus.QUEUED),
                    error=message, provider_job_id=None):
            outbox.add(submit_media_job, str(job.id), countdown=delay)
        return
    if _cas_job(db, job, MediaJobStatus.FAILED, (MediaJobStatus.SUBMITTED, MediaJobStatus.RUNNING, MediaJobStatus.QUEUED),
                error=message, finished_at=_now()):
        _media_failure(db, episode, E.GENERATING_MEDIA, outbox, code="unsafe_content" if safety else "provider_error",
                       message=message, scene_index=job.scene_index)


def _download_refs(job: StoryMediaJob, tmp_dir: str, limit: int) -> list[str]:
    paths: list[str] = []
    refs = (job.params or {}).get("refs") or []
    if not refs or limit <= 0:
        return paths
    from app.storage import get_s3_client

    client = get_s3_client()
    for i, key in enumerate(refs[:limit]):
        dest = os.path.join(tmp_dir, f"ref_{i}")
        try:
            client.download_file(get_settings().s3_bucket, key, dest)
            paths.append(dest)
        except Exception:  # noqa: BLE001 - references are best effort
            logger.warning("could not download reference image %s", key)
    return paths


def submit_media_job_core(job_id: str, outbox: _Outbox) -> str:
    """Returns `noop|missing|deferred|busy|submitted|done|retry|failed`."""
    settings = get_settings()
    with _db() as db:
        job = db.get(StoryMediaJob, _uid(job_id))
        if job is None:
            return "missing"
        if job.status != MediaJobStatus.QUEUED:
            return "noop"
        episode = db.get(StoryEpisode, job.episode_id)
        series = db.get(StorySeries, episode.series_id)
        if series.status == SeriesStatus.CANCELED or episode.status != E.GENERATING_MEDIA:
            # The episode left the media stage (re-script, needs_attention, stale, canceled...):
            # drop the job; a later `generate_episode_media` resets a canceled job to queued.
            _cas_job(db, job, MediaJobStatus.CANCELED, (MediaJobStatus.QUEUED,))
            db.commit()
            return "noop"
        if series.status != SeriesStatus.ACTIVE:
            return "deferred"  # paused: the tick re-drives queued jobs once the series is active again
        store = get_store()
        if not store.acquire(slot_name(job.provider), str(job.id), inflight_limit(job.provider), _slot_ttl()):
            return "busy"
        tmp_dir: str | None = None
        keep_slot = False
        try:
            try:
                provider = registry.get_provider_for(job.kind.value, job.provider)
            except ProviderError as exc:
                job.attempts += 1
                _job_failed(db, job, episode, outbox, ProviderError(str(exc)))
                db.commit()
                return "failed"
            if not _cas_job(db, job, MediaJobStatus.SUBMITTED, (MediaJobStatus.QUEUED,),
                            attempts=job.attempts + 1, submitted_at=_now()):
                return "noop"
            db.commit()
            params = dict(job.params or {})
            try:
                if job.kind == MediaJobKind.VIDEO_CLIP:
                    sub = provider.submit(
                        {"prompt": job.prompt, "negative_prompt": prompts.NEGATIVE_PROMPT, "duration_s": params.get("duration"),
                         "aspect_ratio": "9:16", "reference_image_paths": [], "options": {**(series.video_options or {}),
                                                                                           "scene_index": job.scene_index}},
                        job.idempotency_key,
                    )
                    delay = float(settings.genmedia_poll_initial_s)
                    _cas_job(db, job, MediaJobStatus.SUBMITTED, (MediaJobStatus.SUBMITTED,), provider_job_id=sub.provider_job_id,
                             next_poll_at=_now() + timedelta(seconds=delay),
                             cost_usd_estimated=Decimal(str(round(sub.estimated_cost_usd or 0, 4))))
                    db.commit()
                    keep_slot = True
                    outbox.add(poll_media_job, str(job.id), countdown=delay)
                    return "submitted"
                tmp_dir = tempfile.mkdtemp(prefix="genmedia-", dir=_tmp_base())
                if job.kind == MediaJobKind.IMAGE:
                    dest = os.path.join(tmp_dir, "image.png")
                    refs = _download_refs(job, tmp_dir, provider.max_reference_images if provider.supports_reference_images else 0)
                    res = provider.generate(job.prompt, prompts.NEGATIVE_PROMPT, "9:16", refs, dest, series.image_options)
                    key = _storage_key(job, series.id, "png")
                    _upload(dest, key, "image/png")
                    _complete_job(db, job, series, storage_key=key, size_bytes=res.size_bytes, duration_s=None, cost=res.cost_usd)
                else:  # tts
                    dest = os.path.join(tmp_dir, f"narration.{provider.file_extension}")
                    res = provider.synthesize(job.prompt, params.get("voice") or series.tts_voice_id, series.language, dest,
                                              series.tts_options)
                    key = _storage_key(job, series.id, provider.file_extension)
                    _upload(dest, key, "audio/mpeg" if provider.file_extension == "mp3" else "audio/wav")
                    params["words"] = res.words
                    _complete_job(db, job, series, storage_key=key, size_bytes=res.size_bytes, duration_s=res.duration_s,
                                  cost=res.cost_usd, params=params)
                db.commit()
                outbox.add(maybe_assemble, str(episode.id))
                return "done"
            except ProviderError as exc:
                db.rollback()
                job = db.get(StoryMediaJob, job.id)
                episode = db.get(StoryEpisode, episode.id)
                _job_failed(db, job, episode, outbox, exc)
                db.commit()
                return "retry" if job.status == MediaJobStatus.QUEUED else "failed"
            except Exception as exc:  # noqa: BLE001
                logger.exception("submit_media_job crashed for %s", job_id)
                db.rollback()
                job = db.get(StoryMediaJob, job.id)
                episode = db.get(StoryEpisode, episode.id)
                _job_failed(db, job, episode, outbox, ProviderError(f"Erro inesperado: {exc}"))
                db.commit()
                return "failed"
        finally:
            if not keep_slot:
                store.release(slot_name(job.provider), str(job.id))
            if tmp_dir:
                shutil.rmtree(tmp_dir, ignore_errors=True)


def _tmp_base() -> str:
    base = get_settings().worker_tmp_dir
    os.makedirs(base, exist_ok=True)
    return base


@celery_app.task(bind=True, name="app.worker.story.tasks.submit_media_job", max_retries=None)
def submit_media_job(self, job_id: str) -> dict:
    outbox = _Outbox()
    status = submit_media_job_core(job_id, outbox)
    outbox.flush()
    if status == "busy" and not get_settings().celery_task_always_eager:
        raise self.retry(countdown=SUBMIT_RETRY_S)  # saturated provider: try again in 30 s
    return {"job_id": job_id, "status": status}


def poll_media_job_core(job_id: str, outbox: _Outbox) -> str:
    settings = get_settings()
    with _db() as db:
        job = db.get(StoryMediaJob, _uid(job_id))
        if job is None:
            return "missing"
        if job.status not in (MediaJobStatus.SUBMITTED, MediaJobStatus.RUNNING):
            return "noop"
        episode = db.get(StoryEpisode, job.episode_id)
        series = db.get(StorySeries, episode.series_id)
        try:
            provider = registry.get_video_provider(job.provider)
        except ProviderError as exc:
            _job_failed(db, job, episode, outbox, ProviderError(str(exc)))
            db.commit()
            return "failed"
        if episode.status != E.GENERATING_MEDIA or series.status == SeriesStatus.CANCELED:
            try:
                provider.cancel(job.provider_job_id or "")
            except Exception:  # noqa: BLE001
                pass
            _cas_job(db, job, MediaJobStatus.CANCELED, (MediaJobStatus.SUBMITTED, MediaJobStatus.RUNNING), finished_at=_now())
            _release(job)
            db.commit()
            return "canceled"
        submitted = _aware(job.submitted_at) or _now()
        if (_now() - submitted).total_seconds() > settings.genmedia_job_timeout_s:
            try:
                provider.cancel(job.provider_job_id or "")
            except Exception:  # noqa: BLE001
                pass
            job.attempts = MAX_MEDIA_ATTEMPTS  # a timeout is final
            _job_failed(db, job, episode, outbox, ProviderError("Tempo limite do provedor excedido."))
            db.commit()
            return "failed"
        tmp_dir: str | None = None
        try:
            poll = provider.poll(job.provider_job_id)
            if poll.state == "running":
                params = dict(job.params or {})
                polls = int(params.get("polls", 0)) + 1
                params["polls"] = polls
                delay = min(float(settings.genmedia_poll_max_s), settings.genmedia_poll_initial_s * (2 ** (polls - 1)))
                _cas_job(db, job, MediaJobStatus.RUNNING, (MediaJobStatus.SUBMITTED, MediaJobStatus.RUNNING), params=params,
                         next_poll_at=_now() + timedelta(seconds=delay))
                db.commit()
                outbox.add(poll_media_job, str(job.id), countdown=delay)
                return "running"
            if poll.state == "failed":
                _job_failed(db, job, episode, outbox,
                            ProviderError(poll.error or "Falha do provedor.", retryable=poll.retryable, safety=poll.safety))
                db.commit()
                return "failed"
            tmp_dir = tempfile.mkdtemp(prefix="genmedia-", dir=_tmp_base())
            dest = os.path.join(tmp_dir, "clip.mp4")
            res = provider.download(job.provider_job_id, dest)
            key = _storage_key(job, series.id, "mp4")
            _upload(dest, key, "video/mp4")
            cost = res.actual_cost_usd if res.actual_cost_usd is not None else float(job.cost_usd_estimated or 0)
            won = _complete_job(db, job, series, storage_key=key, size_bytes=res.size_bytes, duration_s=res.duration_s, cost=cost)
            _release(job)
            db.commit()
            if won:
                outbox.add(maybe_assemble, str(episode.id))
            return "done"
        except ProviderError as exc:
            db.rollback()
            job = db.get(StoryMediaJob, job.id)
            episode = db.get(StoryEpisode, episode.id)
            _job_failed(db, job, episode, outbox, exc)
            db.commit()
            return "failed"
        except Exception as exc:  # noqa: BLE001
            logger.exception("poll_media_job crashed for %s", job_id)
            db.rollback()
            job = db.get(StoryMediaJob, job.id)
            episode = db.get(StoryEpisode, episode.id)
            _job_failed(db, job, episode, outbox, ProviderError(f"Erro inesperado: {exc}"))
            db.commit()
            return "failed"
        finally:
            if tmp_dir:
                shutil.rmtree(tmp_dir, ignore_errors=True)


@celery_app.task(name="app.worker.story.tasks.poll_media_job")
def poll_media_job(job_id: str) -> dict:
    outbox = _Outbox()
    status = poll_media_job_core(job_id, outbox)
    outbox.flush()
    return {"job_id": job_id, "status": status}


@celery_app.task(name="app.worker.story.tasks.maybe_assemble")
def maybe_assemble(episode_id: str) -> dict:
    outbox = _Outbox()
    result = {"episode_id": episode_id, "status": "noop"}
    with _db() as db:
        episode = db.get(StoryEpisode, _uid(episode_id))
        if episode is None or episode.status != E.GENERATING_MEDIA:
            return result
        series = db.get(StorySeries, episode.series_id)
        try:
            specs = build_media_specs(db, series, episode)
        except ValueError:
            return result
        for spec in specs["scenes"] + [specs["tts"]]:
            job = _find_job(db, spec["key"], episode.id)
            if job is None or job.status != MediaJobStatus.SUCCEEDED:
                return {"episode_id": episode_id, "status": "waiting"}
        try:
            transition(db, episode, E.ASSEMBLING, E.GENERATING_MEDIA, error=None)  # CAS: exactly one caller wins
        except TransitionConflict:
            db.rollback()
            return result
        db.commit()
        outbox.add(assemble_episode, str(episode.id))
        result = {"episode_id": episode_id, "status": "assembling"}
    outbox.flush()
    return result


# ============================================================ ASSEMBLE ====


@celery_app.task(name="app.worker.story.tasks.assemble_episode")
def assemble_episode(episode_id: str) -> dict:
    from app.storage import get_s3_client
    from app.worker.render.pipeline import build_subtitle_files, extract_thumbnail
    from app.worker.story.assemble import AssembleError, SceneAsset, assemble_episode_video

    outbox = _Outbox()
    result: dict = {"episode_id": episode_id, "status": "noop"}
    settings = get_settings()
    tmp_dir: str | None = None
    with _db() as db:
        episode = db.get(StoryEpisode, _uid(episode_id))
        if episode is None:
            return {"episode_id": episode_id, "status": "not_found"}
        if episode.status != E.ASSEMBLING:
            return result
        series = db.get(StorySeries, episode.series_id)
        try:
            specs = build_media_specs(db, series, episode)
            tmp_dir = tempfile.mkdtemp(prefix=f"episode-{episode.number}-", dir=_tmp_base())
            client = get_s3_client()
            assets: list[SceneAsset] = []
            for spec in specs["scenes"]:
                job = _find_job(db, spec["key"], episode.id)
                if job is None or job.status != MediaJobStatus.SUCCEEDED or not job.storage_key:
                    raise AssembleError("media_missing", f"Mídia da cena {spec['scene_index']} ausente.")
                ext = "mp4" if spec["kind"] == MediaJobKind.VIDEO_CLIP else "png"
                path = os.path.join(tmp_dir, f"scene_{spec['scene_index']}.{ext}")
                client.download_file(settings.s3_bucket, job.storage_key, path)
                assets.append(SceneAsset(index=spec["scene_index"], kind="video" if ext == "mp4" else "image", path=path))
            tts_job = _find_job(db, specs["tts"]["key"], episode.id)
            if tts_job is None or tts_job.status != MediaJobStatus.SUCCEEDED or not tts_job.storage_key:
                raise AssembleError("media_missing", "Narração ausente.")
            narration_path = os.path.join(tmp_dir, "narration" + os.path.splitext(tts_job.storage_key)[1])
            client.download_file(settings.s3_bucket, tts_job.storage_key, narration_path)

            script = specs["script"]
            counts = [len(t.split()) for t in _scene_texts(script)]
            out_path = os.path.join(tmp_dir, "episode.mp4")
            res = assemble_episode_video(
                assets, counts, narration_path, float(tts_job.duration_s or 0), (tts_job.params or {}).get("words"),
                episode_number=episode.number, on_screen_title=script.get("on_screen_title") or "",
                hook=script.get("cliffhanger") or "", out_path=out_path, work_dir=tmp_dir,
            )
            thumb_path = os.path.join(tmp_dir, "thumbnail.jpg")
            extract_thumbnail(out_path, min(2.8, res.duration_s / 2), thumb_path)
            _, srt_text = build_subtitle_files(res.words)

            clip = db.query(Clip).filter(Clip.episode_id == episode.id).one_or_none()
            if clip is None:
                clip = Clip(owner_id=episode.owner_id, episode_id=episode.id, channel_id=series.channel_id,
                            synthetic_media=True, start_s=0.0, end_s=res.duration_s, status=ClipStatus.RENDERING)
                db.add(clip)
                db.flush()
            prefix = f"users/{episode.owner_id}/clips/{clip.id}"
            client.upload_file(out_path, settings.s3_bucket, f"{prefix}/video.mp4", ExtraArgs={"ContentType": "video/mp4"})
            client.upload_file(thumb_path, settings.s3_bucket, f"{prefix}/thumbnail.jpg", ExtraArgs={"ContentType": "image/jpeg"})
            client.put_object(Bucket=settings.s3_bucket, Key=f"{prefix}/subtitles.srt", Body=srt_text.encode("utf-8"),
                              ContentType="text/plain")
            clip.channel_id = series.channel_id
            clip.synthetic_media = True
            clip.start_s, clip.end_s = 0.0, res.duration_s
            clip.storage_key, clip.thumbnail_key, clip.subtitles_key = (
                f"{prefix}/video.mp4", f"{prefix}/thumbnail.jpg", f"{prefix}/subtitles.srt")
            clip.size_bytes = os.path.getsize(out_path)
            clip.transcript = _narration(script)
            clip.signals = {"episode_number": episode.number, "atempo": round(res.tempo, 4)}
            clip.status = ClipStatus.PENDING_REVIEW
            transition(db, episode, E.PENDING_REVIEW, E.ASSEMBLING, error=None)
            db.commit()
            outbox.add(_regenerate_metadata_task(), str(clip.id), None)
            result = {"episode_id": episode_id, "status": "pending_review", "clip_id": str(clip.id)}
        except TransitionConflict:
            db.rollback()
        except Exception as exc:  # noqa: BLE001
            logger.exception("assemble_episode failed for %s", episode_id)
            db.rollback()
            episode = db.get(StoryEpisode, _uid(episode_id))
            if episode is not None and episode.status == E.ASSEMBLING:
                code = getattr(exc, "code", "assemble_error")
                _media_failure(db, episode, E.ASSEMBLING, outbox, code=code, message=str(exc)[:400])
                db.commit()
                result = {"episode_id": episode_id, "status": episode.status.value, "error": code}
        finally:
            if tmp_dir:
                shutil.rmtree(tmp_dir, ignore_errors=True)
    outbox.flush()
    return result


def _regenerate_metadata_task():
    from app.worker.tasks import regenerate_metadata

    return regenerate_metadata


# ================================================================ TICK ====


def _publish_moment(series: StorySeries, episode: StoryEpisode) -> datetime | None:
    if episode.target_date is None:
        return None
    hh, mm = (series.publish_time or "00:00").split(":")
    return datetime.combine(episode.target_date, time(int(hh), int(mm)), tzinfo=ZoneInfo(series.timezone))


def _shift_agenda(db: Session, series: StorySeries, episodes: list[StoryEpisode], now: datetime) -> int:
    """If the oldest not-yet-scheduled episode's publish moment has passed,
    it and the following (unscheduled) ones move +k days (audit
    `series.agenda_shift`, actor None). Returns k (0 = no shift)."""
    done = (E.SCHEDULED, E.PUBLISHED, E.CANCELED)
    pending = [e for e in episodes if e.status not in done]
    if not pending:
        return 0
    first = pending[0]
    moment = _publish_moment(series, first)
    if moment is None or moment > now:
        return 0
    k = max(1, math.ceil((now - moment).total_seconds() / 86400))
    for ep in pending:
        if ep.target_date is not None:
            ep.target_date = ep.target_date + timedelta(days=k)
    record_action(db, user_id=None, action="series.agenda_shift", entity="series", entity_id=series.id,
                  details={"from_episode": first.number, "days": k, "reason": "publish_time_passed"})
    return k


def _tick_series(db: Session, series: StorySeries, now: datetime, outbox: _Outbox) -> dict:
    stats = {"shift": 0, "started": 0, "recovered": 0}
    episodes = db.query(StoryEpisode).filter(StoryEpisode.series_id == series.id).order_by(StoryEpisode.number).all()

    if episodes and all(e.status == E.PUBLISHED for e in episodes):
        try:
            transition(db, series, SeriesStatus.COMPLETED, SeriesStatus.ACTIVE)
        except TransitionConflict:
            pass
        return stats

    stats["shift"] = _shift_agenda(db, series, episodes, now)

    # `approved` episodes that found no publishing slot get another attempt.
    for ep in episodes:
        if ep.status == E.APPROVED and lifecycle.retry_approved_scheduling(db, lifecycle.Ctx(), series, ep):
            stats["rescheduled"] = stats.get("rescheduled", 0) + 1

    # --- recovery of stuck stages / jobs --------------------------------
    stuck_after = timedelta(minutes=get_settings().story_stuck_minutes)
    handlers = {E.SCRIPTING: script_episode, E.VALIDATING: validate_episode, E.ASSEMBLING: assemble_episode}
    for ep in episodes:
        if ep.status in handlers and now - (_aware(ep.updated_at) or now) > stuck_after:
            outbox.add(handlers[ep.status], str(ep.id))
            stats["recovered"] += 1
        elif ep.status == E.GENERATING_MEDIA:
            if now - (_aware(ep.updated_at) or now) > stuck_after or _has_queued_jobs(db, ep, now, stuck_after):
                outbox.add(generate_episode_media, str(ep.id), "all")
                stats["recovered"] += 1
            for job in db.query(StoryMediaJob).filter(
                StoryMediaJob.episode_id == ep.id,
                StoryMediaJob.status.in_((MediaJobStatus.SUBMITTED, MediaJobStatus.RUNNING)),
            ).all():
                due = _aware(job.next_poll_at) or _aware(job.submitted_at) or now
                if now - due > timedelta(minutes=5):
                    outbox.add(poll_media_job, str(job.id))
                    stats["recovered"] += 1

    # --- horizon: start generating upcoming episodes -----------------------
    tz = ZoneInfo(series.timezone)
    horizon = now.astimezone(tz).date() + timedelta(days=series.lead_days)
    in_flight = sum(1 for e in episodes if e.status in IN_FLIGHT)
    by_number = {e.number: e for e in episodes}
    for ep in episodes:
        if ep.status != E.PLANNED or ep.target_date is None or ep.target_date > horizon:
            continue
        previous = by_number.get(ep.number - 1)
        if previous is not None and previous.status not in HAS_SCRIPT:
            break  # sequential: N needs N-1's script first
        if in_flight + 1 > series.lead_days + 1:
            break
        try:
            transition(db, ep, E.SCRIPTING, E.PLANNED, error=None)
        except TransitionConflict:
            continue
        in_flight += 1
        stats["started"] += 1
        outbox.add(script_episode, str(ep.id))
        break  # one per tick per series: the next one waits for this script to exist
    return stats


def _has_queued_jobs(db: Session, ep: StoryEpisode, now: datetime, stuck_after: timedelta) -> bool:
    for job in db.query(StoryMediaJob).filter(StoryMediaJob.episode_id == ep.id, StoryMediaJob.status == MediaJobStatus.QUEUED).all():
        if now - (_aware(job.created_at) or now) > timedelta(minutes=10):
            return True
    return False


@celery_app.task(name="app.worker.story.tasks.series_tick")
def series_tick() -> dict:
    store = get_store()
    token = store.try_lock("series_tick", get_settings().story_tick_lock_s)
    if token is None:
        return {"status": "locked"}
    outbox = _Outbox()
    summary: dict = {"status": "ok", "series": 0}
    try:
        with _db() as db:
            now = _now()
            ids = [s.id for s in db.query(StorySeries).filter(StorySeries.status == SeriesStatus.ACTIVE).all()]
            for series_id in ids:
                series = db.get(StorySeries, series_id)
                try:
                    _tick_series(db, series, now, outbox)
                    db.commit()
                    summary["series"] += 1
                except Exception:  # noqa: BLE001 - one broken series must not stop the others
                    logger.exception("series_tick failed for %s", series_id)
                    db.rollback()
        outbox.flush()
    finally:
        store.unlock("series_tick", token)
    return summary

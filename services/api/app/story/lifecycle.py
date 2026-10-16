"""Series IA lifecycle: every API-driven state change of a series/episode
(plano §2/§3) lives here so routers stay thin and the clips router can
delegate episode-clip approvals to the same code path.

Conventions:
- Functions flush but never commit (the caller owns the transaction) and
  never enqueue Celery work directly: they add to an `Outbox`, flushed by the
  caller *after* commit. Tasks are sent by NAME with `celery_app.send_task`
  (this module never imports `app.worker.story.*`), queue `story`.
- Status changes go through `app.story.state.transition` (compare-and-set).
- Business errors are `HTTPException(detail={"code", "message"})`.
- Audit entries never carry prompt/instruction contents, only sizes/flags.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.audit import record_action
from app.config import get_settings
from app.genmedia_catalog import get_provider, is_configured
from app.models.clip import Clip, ClipStatus
from app.models.clip_metadata import ClipMetadata
from app.models.platform_account import PlatformAccount
from app.models.publication import Privacy, Publication, PublicationStatus
from app.models.source import LicenseType, Source
from app.models.story import (
    AiUsageEvent,
    CharacterEventState,
    CharacterEventType,
    CharacterRole,
    CharacterStatus,
    EpisodeStatus as E,
    MediaJobKind,
    MediaJobStatus,
    SeriesStatus as S,
    StoryCharacter,
    StoryCharacterEvent,
    StoryEpisode,
    StoryMediaJob,
    StorySeries,
)
from app.models.user import User
from app.publishing import create_publications
from app.quotas import assert_ai_budget
from app.story.state import InvalidTransition, TransitionConflict, transition

logger = logging.getLogger(__name__)

STORY_QUEUE = "story"
TASK_PLAN_SERIES = "app.worker.story.tasks.plan_series"
TASK_SCRIPT_EPISODE = "app.worker.story.tasks.script_episode"
TASK_VALIDATE_EPISODE = "app.worker.story.tasks.validate_episode"
TASK_GENERATE_MEDIA = "app.worker.story.tasks.generate_episode_media"

AI_ATTRIBUTION = "Conteúdo gerado com inteligência artificial."

# Episode states with a worker task running (a user action now would race it).
BUSY_STATES = (E.SCRIPTING, E.VALIDATING, E.GENERATING_MEDIA, E.ASSEMBLING)
# Approved episodes: "N-1 approved" for the sequential rule.
APPROVED_STATES = (E.APPROVED, E.SCHEDULED, E.PUBLISHED)
# Intermediate states a bible/previous-episode edit invalidates (PLANNED has
# nothing to invalidate yet).
STALEABLE_STATES = (
    E.SCRIPTING,
    E.VALIDATING,
    E.SCRIPT_READY,
    E.AWAITING_SCRIPT_APPROVAL,
    E.GENERATING_MEDIA,
    E.ASSEMBLING,
    E.PENDING_REVIEW,
    E.REJECTED,
    E.NEEDS_ATTENTION,
)
LIVE_SERIES_STATES = (S.PLANNING, S.PLANNED, S.ACTIVE, S.PAUSED)


# ------------------------------------------------------------- plumbing ----


def coded(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


class Outbox:
    """Celery calls to send after the DB transaction commits."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, list]] = []

    def add(self, task_name: str, *args) -> None:
        self.calls.append((task_name, list(args)))

    def flush(self) -> None:
        from app.worker.celery_app import celery_app

        calls, self.calls = self.calls, []
        for name, args in calls:
            try:
                celery_app.send_task(name, args=args, queue=STORY_QUEUE)
            except Exception:  # noqa: BLE001 - never 500 after commit; the tick recovers stuck stages
                logger.exception("Failed to enqueue %s", name)


@dataclass
class Ctx:
    """Who is acting. `actor=None` = automatic (worker/tick)."""

    actor: User | None = None
    extra: dict = field(default_factory=dict)  # merged into every audit entry (as_user)

    @property
    def actor_id(self) -> uuid.UUID | None:
        return self.actor.id if self.actor is not None else None

    @classmethod
    def from_scope(cls, scope) -> "Ctx":
        return cls(actor=scope.actor, extra=scope.audit_details())


def audit(db: Session, ctx: Ctx, action: str, entity: str, entity_id: uuid.UUID | None, **details) -> None:
    record_action(
        db,
        user_id=ctx.actor_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        details={**ctx.extra, **details},
    )


def move(db: Session, obj: StorySeries | StoryEpisode, to, expected, **fields):
    """`transition()` with API-friendly errors."""
    try:
        return transition(db, obj, to, expected, **fields)
    except InvalidTransition as exc:
        raise coded(409, "invalid_transition", f"Transição não permitida: {exc.current.value} -> {exc.to.value}.") from exc
    except TransitionConflict as exc:
        if isinstance(obj, StoryEpisode):
            raise coded(409, "episode_busy", "O episódio mudou de estado ou está em processamento.") from exc
        raise coded(409, "invalid_transition", "A série mudou de estado; recarregue.") from exc


def _cur(obj) -> str:
    return getattr(obj.status, "value", obj.status)


def _require_status(obj, allowed: tuple, what: str) -> None:
    if obj.status not in allowed:
        raise coded(
            409,
            "invalid_transition",
            f"{what} está em '{_cur(obj)}'; esperado: {', '.join(s.value for s in allowed)}.",
        )


def _require_idle(episode: StoryEpisode) -> None:
    if episode.status in BUSY_STATES:
        raise coded(409, "episode_busy", f"O episódio está em processamento ({_cur(episode)}).")


# --------------------------------------------------------------- budget ----


def assert_budgets(db: Session, ctx: Ctx, series: StorySeries) -> None:
    """Series budget (always) + user monthly AI budget (admins exempt)."""
    if series.budget_limit_usd is not None and Decimal(series.cost_usd_total) >= Decimal(series.budget_limit_usd):
        raise coded(
            409,
            "series_budget_exceeded",
            f"Orçamento da série excedido: US$ {Decimal(series.cost_usd_total):.2f} de US$ {Decimal(series.budget_limit_usd):.2f}.",
        )
    if ctx.actor is not None and not ctx.actor.is_admin:
        assert_ai_budget(db, ctx.actor, series.owner_id)


# ------------------------------------------------------------ providers ----


def validate_provider_ids(*, video: str | None, image: str | None, tts: str | None) -> None:
    for kind, pid in (("video", video), ("image", image), ("tts", tts)):
        if pid is not None and get_provider(pid, kind) is None:
            raise HTTPException(status_code=422, detail={"code": "unknown_provider", "message": f"Provedor de {kind} desconhecido ou indisponível: {pid}"})


def assert_providers_ready(series: StorySeries) -> None:
    """Providers the effective strategy needs are chosen AND configured."""
    needs: list[tuple[str, str | None]] = [("tts", series.tts_provider)]
    strategy = series.visual_strategy
    if strategy != "full_video":
        needs.append(("image", series.image_provider))
    if strategy == "full_video" or (strategy == "hybrid" and series.max_video_scenes_per_episode > 0):
        needs.append(("video", series.video_provider))
    for kind, pid in needs:
        if not pid:
            raise coded(422, "provider_not_configured", f"Provedor de {kind} não escolhido.")
        spec = get_provider(pid, kind)
        if spec is None or not is_configured(spec):
            raise coded(422, "provider_not_configured", f"Provedor de {kind} '{pid}' não está configurado (credenciais ausentes).")


# ---------------------------------------------------------------- dates ----


def local_today(tz_name: str) -> date:
    return datetime.now(ZoneInfo(tz_name)).date()


def target_datetime(series: StorySeries, episode: StoryEpisode) -> datetime | None:
    """`target_date + publish_time` in the series timezone, as aware UTC."""
    if episode.target_date is None:
        return None
    hh, mm = series.publish_time.split(":")
    local = datetime.combine(episode.target_date, time(int(hh), int(mm)), tzinfo=ZoneInfo(series.timezone))
    return local.astimezone(timezone.utc)


def episodes_of(db: Session, series: StorySeries) -> list[StoryEpisode]:
    return db.query(StoryEpisode).filter(StoryEpisode.series_id == series.id).order_by(StoryEpisode.number).all()


def get_episode(db: Session, series: StorySeries, number: int) -> StoryEpisode:
    episode = (
        db.query(StoryEpisode)
        .filter(StoryEpisode.series_id == series.id, StoryEpisode.number == number)
        .one_or_none()
    )
    if episode is None:
        raise HTTPException(status_code=404, detail="Episódio não encontrado")
    return episode


def episode_clip(db: Session, episode: StoryEpisode) -> Clip | None:
    return db.query(Clip).filter(Clip.episode_id == episode.id).one_or_none()


# ---------------------------------------------------------------- stale ----


def mark_following_stale(db: Session, series: StorySeries, from_number: int) -> list[int]:
    """Mark every episode after `from_number` that is not yet approved (and
    not planned/canceled/already stale) as `stale`, via CAS. Returns the
    numbers changed. Usable by the worker too (flushes, no commit)."""
    changed: list[int] = []
    followers = (
        db.query(StoryEpisode)
        .filter(StoryEpisode.series_id == series.id, StoryEpisode.number > from_number)
        .order_by(StoryEpisode.number)
        .all()
    )
    for ep in followers:
        if ep.status not in STALEABLE_STATES:
            continue
        try:
            transition(db, ep, E.STALE, ep.status)
        except TransitionConflict:
            continue  # moved by a worker meanwhile; its own transition decides
        changed.append(ep.number)
    return changed


# --------------------------------------------------- character events ----


def sync_script_events(db: Session, series: StorySeries, episode: StoryEpisode, script: dict | None) -> None:
    """(Re)build the `proposed` character events of `episode` from the
    `state_events` of `script` (idempotent): previous proposed events are
    discarded; characters introduced only by those are dropped unless
    re-introduced; `new_character` creates an uncommitted character."""
    n = episode.number
    old = (
        db.query(StoryCharacterEvent)
        .filter(StoryCharacterEvent.episode_id == episode.id, StoryCharacterEvent.state == CharacterEventState.PROPOSED)
        .all()
    )
    for ev in old:
        ev.state = CharacterEventState.DISCARDED
    db.flush()

    events = (script or {}).get("state_events") or []
    introduced_keys = {e.get("character_key") for e in events if e.get("type") == "introduce"}
    # Drop uncommitted characters this episode introduced before and no longer does.
    orphans = (
        db.query(StoryCharacter)
        .filter(
            StoryCharacter.series_id == series.id,
            StoryCharacter.committed.is_(False),
            StoryCharacter.introduced_in_episode == n,
        )
        .all()
    )
    for ch in orphans:
        if ch.key in introduced_keys:
            continue
        db.query(StoryCharacterEvent).filter(StoryCharacterEvent.character_id == ch.id).delete()
        db.delete(ch)
    db.flush()

    for e in events:
        key = e.get("character_key")
        char = db.query(StoryCharacter).filter(StoryCharacter.series_id == series.id, StoryCharacter.key == key).one_or_none()
        if char is None:
            new = e.get("new_character")
            if e.get("type") != "introduce" or not new:
                continue
            char = StoryCharacter(
                series_id=series.id,
                key=key,
                name=new["name"],
                role=CharacterRole(new.get("role") or "minor"),
                description=new["description"],
                visual_description=new["visual_description"],
                personality=new.get("personality"),
                status=CharacterStatus.ALIVE,
                committed=False,
                introduced_in_episode=n,
            )
            db.add(char)
            db.flush()
        db.add(
            StoryCharacterEvent(
                series_id=series.id,
                character_id=char.id,
                episode_id=episode.id,
                episode_number=n,
                type=CharacterEventType(e["type"]),
                from_status=CharacterStatus(e["from_status"]) if e.get("from_status") else None,
                to_status=CharacterStatus(e["to_status"]) if e.get("to_status") else None,
                description=e.get("description") or None,
                state=CharacterEventState.PROPOSED,
            )
        )
    db.flush()


def apply_events(db: Session, episode: StoryEpisode) -> int:
    """proposed -> applied (on final-video approval)."""
    now = datetime.now(timezone.utc)
    events = (
        db.query(StoryCharacterEvent)
        .filter(StoryCharacterEvent.episode_id == episode.id, StoryCharacterEvent.state == CharacterEventState.PROPOSED)
        .order_by(StoryCharacterEvent.created_at)
        .all()
    )
    for ev in events:
        char = db.get(StoryCharacter, ev.character_id)
        if char is not None:
            if ev.type == CharacterEventType.INTRODUCE:
                char.committed = True
                if char.introduced_in_episode is None:
                    char.introduced_in_episode = ev.episode_number
            elif ev.to_status is not None:
                if ev.from_status is None:
                    ev.from_status = char.status  # remembered so unapprove can revert
                char.status = ev.to_status
        ev.state = CharacterEventState.APPLIED
        ev.applied_at = now
    db.flush()
    return len(events)


def revert_events(db: Session, episode: StoryEpisode) -> int:
    """applied -> proposed (on unapprove), undoing the character changes."""
    events = (
        db.query(StoryCharacterEvent)
        .filter(StoryCharacterEvent.episode_id == episode.id, StoryCharacterEvent.state == CharacterEventState.APPLIED)
        .order_by(StoryCharacterEvent.applied_at.desc(), StoryCharacterEvent.created_at.desc())
        .all()
    )
    for ev in events:
        char = db.get(StoryCharacter, ev.character_id)
        if char is not None:
            if ev.type == CharacterEventType.INTRODUCE:
                if char.introduced_in_episode == ev.episode_number:
                    char.committed = False
            elif ev.to_status is not None:
                char.status = ev.from_status or CharacterStatus.ALIVE
        ev.state = CharacterEventState.PROPOSED
        ev.applied_at = None
    db.flush()
    return len(events)


# --------------------------------------------------------- series: crud ----


def create_source_for_series(db: Session, owner_id: uuid.UUID, title: str | None, monetization_allowed: bool) -> Source:
    label = f"Série IA: {title}" if title else "Série IA"
    source = Source(
        owner_id=owner_id,
        title=label[:255],
        work_name=label[:255],
        license_type=LicenseType.AI_GENERATED,
        allowed_platforms=[],
        territories=[],
        monetization_allowed=monetization_allowed,
        attribution_text=AI_ATTRIBUTION,
    )
    db.add(source)
    db.flush()
    return source


def create_series(db: Session, ctx: Ctx, owner_id: uuid.UUID, payload, outbox: Outbox) -> StorySeries:
    settings = get_settings()
    source = create_source_for_series(db, owner_id, payload.title, payload.monetization_allowed)
    budget = payload.budget_limit_usd
    if "budget_limit_usd" not in payload.model_fields_set and settings.default_series_budget_usd is not None:
        budget = Decimal(str(settings.default_series_budget_usd))
    series = StorySeries(
        owner_id=owner_id,
        channel_id=payload.channel_id,
        source_id=source.id,
        title=payload.title or None,
        premise=payload.premise,
        genre=payload.genre,
        tone=payload.tone,
        timezone=payload.timezone,
        publish_time=payload.publish_time,
        lead_days=payload.lead_days,
        privacy=payload.privacy,
        visual_strategy=payload.visual_strategy,
        max_video_scenes_per_episode=payload.max_video_scenes_per_episode,
        video_provider=payload.video_provider,
        image_provider=payload.image_provider,
        tts_provider=payload.tts_provider,
        tts_voice_id=payload.tts_voice_id,
        status=S.PLANNING,
        require_script_approval=payload.require_script_approval,
        max_regenerations_per_episode=payload.max_regenerations_per_episode,
        budget_limit_usd=budget,
        cost_usd_total=Decimal("0"),
        originality_attested_at=datetime.now(timezone.utc),
    )
    db.add(series)
    db.flush()
    audit(
        db, ctx, "series.create", "series", series.id,
        channel_id=str(payload.channel_id), visual_strategy=series.visual_strategy,
    )
    outbox.add(TASK_PLAN_SERIES, str(series.id), None)
    return series


def update_series(db: Session, ctx: Ctx, series: StorySeries, payload) -> list[str]:
    _require_status(series, (S.PLANNING, S.PLAN_FAILED, S.PLANNED, S.ACTIVE, S.PAUSED), "A série")
    fields = payload.model_fields_set
    nullable = {"title", "video_provider", "video_options", "image_options", "tts_options", "budget_limit_usd"}
    updates = {k: getattr(payload, k) for k in fields if getattr(payload, k) is not None or k in nullable}
    validate_provider_ids(
        video=updates.get("video_provider"), image=updates.get("image_provider"), tts=updates.get("tts_provider")
    )
    for key, value in updates.items():
        setattr(series, key, value)
    db.flush()
    audit(db, ctx, "series.update", "series", series.id, fields=sorted(updates))
    return sorted(updates)


def pause_series(db: Session, ctx: Ctx, series: StorySeries) -> StorySeries:
    move(db, series, S.PAUSED, S.ACTIVE, pause_reason="user")
    audit(db, ctx, "series.pause", "series", series.id)
    return series


def resume_series(db: Session, ctx: Ctx, series: StorySeries) -> StorySeries:
    _require_status(series, (S.PAUSED,), "A série")
    if series.pause_reason in ("series_budget_exceeded", "user_ai_budget_exceeded"):
        assert_budgets(db, ctx, series)
    move(db, series, S.ACTIVE, S.PAUSED, pause_reason=None, error=None)
    audit(db, ctx, "series.resume", "series", series.id)
    return series


def replan_series(db: Session, ctx: Ctx, series: StorySeries, instructions: str | None, outbox: Outbox) -> StorySeries:
    _require_status(series, (S.PLAN_FAILED, S.PLANNED), "A série")
    move(db, series, S.PLANNING, (S.PLAN_FAILED, S.PLANNED), error=None)
    audit(db, ctx, "series.replan", "series", series.id, has_instructions=bool(instructions))
    outbox.add(TASK_PLAN_SERIES, str(series.id), instructions)
    return series


def channel_accounts(db: Session, series: StorySeries) -> list[PlatformAccount]:
    if series.channel_id is None:
        return []
    return (
        db.query(PlatformAccount)
        .filter(PlatformAccount.channel_id == series.channel_id, PlatformAccount.owner_id == series.owner_id)
        .order_by(PlatformAccount.platform, PlatformAccount.created_at)
        .all()
    )


def _sync_allowed_platforms(db: Session, series: StorySeries, accounts: list[PlatformAccount]) -> None:
    source = db.get(Source, series.source_id)
    if source is None:
        return
    wanted = sorted({a.platform.value for a in accounts})
    current = list(source.allowed_platforms or [])
    merged = sorted(set(current) | set(wanted))
    if merged != sorted(current):
        source.allowed_platforms = merged
        db.flush()


def start_series(db: Session, ctx: Ctx, series: StorySeries, start_date: date | None) -> StorySeries:
    _require_status(series, (S.PLANNED,), "A série")
    assert_providers_ready(series)
    accounts = channel_accounts(db, series)
    if not accounts:
        raise coded(409, "channel_without_accounts", "O canal da série não tem contas de plataforma vinculadas.")
    minimum = local_today(series.timezone) + timedelta(days=series.lead_days)
    if start_date is None:
        start_date = minimum
    elif start_date < minimum:
        raise HTTPException(
            status_code=422,
            detail={"code": "start_date_too_early", "message": f"start_date mínima: {minimum.isoformat()} (hoje + {series.lead_days} dia(s))."},
        )
    assert_budgets(db, ctx, series)

    _sync_allowed_platforms(db, series, accounts)
    for ep in episodes_of(db, series):
        if ep.status != E.CANCELED:
            ep.target_date = start_date + timedelta(days=ep.number - 1)
    move(db, series, S.ACTIVE, S.PLANNED, start_date=start_date, pause_reason=None, error=None)
    audit(db, ctx, "series.start", "series", series.id, start_date=start_date.isoformat())
    return series


def cancel_series(db: Session, ctx: Ctx, series: StorySeries, cancel_scheduled_publications: bool) -> StorySeries:
    move(db, series, S.CANCELED, (S.PLANNING, S.PLAN_FAILED, S.PLANNED, S.ACTIVE, S.PAUSED))
    canceled_pubs = 0
    for ep in episodes_of(db, series):
        if ep.status in (E.CANCELED, E.PUBLISHED):
            continue
        if ep.status == E.SCHEDULED:
            if not cancel_scheduled_publications:
                continue  # its scheduled publications still go out
            canceled_pubs += _cancel_publications(db, ctx, ep, (PublicationStatus.SCHEDULED,))
        try:
            transition(db, ep, E.CANCELED, ep.status)
        except TransitionConflict:
            continue
    audit(
        db, ctx, "series.cancel", "series", series.id,
        cancel_scheduled_publications=cancel_scheduled_publications, canceled_publications=canceled_pubs,
    )
    return series


def _cancel_publications(db: Session, ctx: Ctx, episode: StoryEpisode, statuses: tuple) -> int:
    clip = episode_clip(db, episode)
    if clip is None:
        return 0
    pubs = db.query(Publication).filter(Publication.clip_id == clip.id, Publication.status.in_(statuses)).all()
    for pub in pubs:
        pub.status = PublicationStatus.CANCELED
        audit(db, ctx, "publication.cancel", "publication", pub.id, episode_id=str(episode.id))
    db.flush()
    return len(pubs)


def assert_deletable(db: Session, series: StorySeries) -> None:
    if series.status not in (S.PLANNED, S.PLAN_FAILED, S.CANCELED):
        raise coded(409, "invalid_transition", "Só é possível apagar uma série não iniciada ou cancelada (cancele antes).")
    episodes = episodes_of(db, series)
    if any(ep.status == E.PUBLISHED for ep in episodes):
        raise coded(409, "invalid_transition", "A série tem episódios publicados.")
    clip_ids = [c.id for c in db.query(Clip.id).filter(Clip.episode_id.in_([e.id for e in episodes])).all()] if episodes else []
    if clip_ids:
        busy = (
            db.query(Publication.id)
            .filter(
                Publication.clip_id.in_(clip_ids),
                Publication.status.in_(
                    (
                        PublicationStatus.SCHEDULED,
                        PublicationStatus.PUBLISHING,
                        PublicationStatus.PUBLISHED,
                        PublicationStatus.EXPORTED,
                        PublicationStatus.TAKEN_DOWN,
                    )
                ),
            )
            .first()
        )
        if busy is not None:
            raise coded(409, "invalid_transition", "A série tem publicações agendadas, exportadas ou publicadas.")


def delete_series(db: Session, ctx: Ctx, series: StorySeries, s3=None) -> None:
    """Hard delete (call `assert_deletable` first). Removes episode clips and
    their objects/metadata/publications BEFORE the episodes (CHECK
    ck_clips_origin forbids a clip with neither job nor episode). Usage events
    are detached, not deleted, so monthly AI spend accounting stays right."""
    episodes = episodes_of(db, series)
    ep_ids = [e.id for e in episodes]
    keys: list[str] = []
    if ep_ids:
        clips = db.query(Clip).filter(Clip.episode_id.in_(ep_ids)).all()
        clip_ids = [c.id for c in clips]
        for c in clips:
            keys.extend(k for k in (c.storage_key, c.thumbnail_key, c.subtitles_key) if k)
        if clip_ids:
            db.query(Publication).filter(Publication.clip_id.in_(clip_ids)).delete(synchronize_session=False)
            db.query(ClipMetadata).filter(ClipMetadata.clip_id.in_(clip_ids)).delete(synchronize_session=False)
            db.query(Clip).filter(Clip.id.in_(clip_ids)).delete(synchronize_session=False)
        for job in db.query(StoryMediaJob).filter(StoryMediaJob.episode_id.in_(ep_ids)).all():
            if job.storage_key:
                keys.append(job.storage_key)
        db.query(StoryMediaJob).filter(StoryMediaJob.episode_id.in_(ep_ids)).delete(synchronize_session=False)
    chars = db.query(StoryCharacter).filter(StoryCharacter.series_id == series.id).all()
    keys.extend(c.reference_image_key for c in chars if c.reference_image_key)
    db.query(StoryCharacterEvent).filter(StoryCharacterEvent.series_id == series.id).delete(synchronize_session=False)
    db.query(StoryCharacter).filter(StoryCharacter.series_id == series.id).delete(synchronize_session=False)
    db.execute(
        update(AiUsageEvent).where(AiUsageEvent.series_id == series.id).values(series_id=None, episode_id=None)
    )
    db.query(StoryEpisode).filter(StoryEpisode.series_id == series.id).delete(synchronize_session=False)
    source_id = series.source_id
    audit(db, ctx, "series.delete", "series", series.id, title=series.title, episodes=len(ep_ids))
    db.delete(series)
    db.flush()
    source = db.get(Source, source_id)
    if source is not None:
        db.delete(source)
    db.flush()
    if s3 is not None:
        from app.config import get_settings as _gs

        bucket = _gs().s3_bucket
        for key in keys:
            try:
                s3.delete_object(Bucket=bucket, Key=key)
            except Exception:  # noqa: BLE001 - best effort; DB is already consistent
                logger.warning("Could not delete S3 object %s", key)


# ------------------------------------------------------------ bible etc ----


def update_bible(db: Session, ctx: Ctx, series: StorySeries, bible_version: int, bible: dict) -> StorySeries:
    _require_status(series, (S.PLANNED, S.ACTIVE, S.PAUSED), "A série")
    if series.bible is None:
        raise coded(409, "invalid_transition", "A série ainda não tem bíblia.")
    if bible_version != series.bible_version:
        raise coded(409, "bible_version_conflict", f"Versão da bíblia desatualizada (atual: {series.bible_version}).")
    bible = dict(bible)
    bible["premise_core_elements"] = list((series.bible or {}).get("premise_core_elements") or [])
    series.bible = bible
    series.bible_version = bible_version + 1
    staled = []
    for ep in episodes_of(db, series):
        if ep.status in (E.SCRIPT_READY, E.AWAITING_SCRIPT_APPROVAL):
            try:
                transition(db, ep, E.STALE, ep.status)
                staled.append(ep.number)
            except TransitionConflict:
                continue
    db.flush()
    audit(db, ctx, "series.bible_update", "series", series.id, bible_version=series.bible_version, stale_episodes=staled)
    return series


# ---------------------------------------------------------- episode ops ----


def update_outline(db: Session, ctx: Ctx, series: StorySeries, episode: StoryEpisode, payload) -> StoryEpisode:
    _require_status(series, (S.PLANNED, S.ACTIVE, S.PAUSED), "A série")
    _require_status(episode, (E.PLANNED, E.STALE), "O episódio")
    data = payload.model_dump(exclude_unset=True, mode="json")
    outline = dict(episode.outline or {})
    if "title" in data and data["title"] is not None:
        episode.title = data["title"]
    if "arc_phase" in data and data["arc_phase"] is not None:
        episode.arc_phase = data["arc_phase"]
    for key in ("summary", "key_events", "planned_state_changes", "cliffhanger"):
        if key in data and data[key] is not None:
            outline[key] = data[key]
    episode.outline = outline
    db.flush()
    audit(db, ctx, "episode.outline_update", "episode", episode.id, number=episode.number, fields=sorted(data))
    return episode


def update_script(
    db: Session, ctx: Ctx, series: StorySeries, episode: StoryEpisode, script_revision: int, script: dict, outbox: Outbox
) -> StoryEpisode:
    _require_idle(episode)
    _require_status(episode, (E.SCRIPT_READY, E.AWAITING_SCRIPT_APPROVAL, E.NEEDS_ATTENTION), "O episódio")
    if script_revision != episode.script_revision:
        raise coded(409, "script_revision_conflict", f"Revisão do roteiro desatualizada (atual: {episode.script_revision}).")
    if script.get("number") != episode.number:
        raise HTTPException(status_code=422, detail={"code": "script_number_mismatch", "message": "script.number deve ser o número do episódio."})
    move(
        db, episode, E.VALIDATING, episode.status,
        script=script, script_revision=episode.script_revision + 1, validation=None,
        validation_attempts=0, error=None,
    )
    sync_script_events(db, series, episode, script)
    mark_following_stale(db, series, episode.number)
    audit(db, ctx, "episode.script_update", "episode", episode.id, number=episode.number, script_revision=episode.script_revision)
    outbox.add(TASK_VALIDATE_EPISODE, str(episode.id))
    return episode


def approve_script(db: Session, ctx: Ctx, series: StorySeries, episode: StoryEpisode, outbox: Outbox) -> StoryEpisode:
    _require_idle(episode)
    _require_status(episode, (E.AWAITING_SCRIPT_APPROVAL, E.SCRIPT_READY), "O episódio")
    assert_budgets(db, ctx, series)
    move(db, episode, E.GENERATING_MEDIA, episode.status, error=None)
    audit(db, ctx, "episode.approve_script", "episode", episode.id, number=episode.number)
    outbox.add(TASK_GENERATE_MEDIA, str(episode.id), "all")
    return episode


def regenerate(
    db: Session,
    ctx: Ctx,
    series: StorySeries,
    episode: StoryEpisode,
    scope: str,
    instructions: str | None,
    outbox: Outbox,
    *,
    action: str = "episode.regenerate",
) -> StoryEpisode:
    _require_idle(episode)
    script_from = (E.PENDING_REVIEW, E.REJECTED, E.NEEDS_ATTENTION, E.SCRIPT_READY, E.AWAITING_SCRIPT_APPROVAL, E.STALE)
    media_from = (E.PENDING_REVIEW, E.REJECTED, E.NEEDS_ATTENTION)
    _require_status(episode, script_from if scope == "script" else media_from, "O episódio")
    if scope != "script" and not episode.script:
        raise coded(409, "invalid_transition", "O episódio ainda não tem roteiro para gerar mídia.")
    if episode.status != E.STALE and episode.regenerations >= series.max_regenerations_per_episode:
        raise coded(
            409,
            "regeneration_limit_reached",
            f"Limite de regenerações atingido ({episode.regenerations}/{series.max_regenerations_per_episode}).",
        )
    assert_budgets(db, ctx, series)

    current = episode.status
    clip = episode_clip(db, episode)
    if current == E.PENDING_REVIEW:
        move(db, episode, E.REJECTED, E.PENDING_REVIEW)
        current = E.REJECTED
    if clip is not None and clip.status != ClipStatus.REJECTED and scope != "script":
        clip.status = ClipStatus.REJECTED
    fields: dict = {"regenerations": episode.regenerations + (0 if current == E.STALE else 1), "error": None}
    if instructions is not None:
        fields["user_instructions"] = instructions
    if scope == "script":
        move(db, episode, E.SCRIPTING, current, **fields)
        mark_following_stale(db, series, episode.number)
        outbox.add(TASK_SCRIPT_EPISODE, str(episode.id))
    else:
        cancel_media_jobs(db, episode, scope)
        move(db, episode, E.GENERATING_MEDIA, current, **fields)
        outbox.add(TASK_GENERATE_MEDIA, str(episode.id), "visual" if scope == "media" else "narration")
    audit(
        db, ctx, action, "episode", episode.id,
        number=episode.number, scope=scope, has_instructions=bool(instructions), regenerations=episode.regenerations,
    )
    return episode


def cancel_media_jobs(db: Session, episode: StoryEpisode, scope: str) -> int:
    """Mark the current-revision media jobs of the component being redone as
    `canceled` so the worker regenerates them (it reuses `succeeded` jobs by
    idempotency key otherwise). `media`/`visual` = images+video, `narration` = tts."""
    kinds = (MediaJobKind.TTS,) if scope == "narration" else (MediaJobKind.IMAGE, MediaJobKind.VIDEO_CLIP)
    jobs = (
        db.query(StoryMediaJob)
        .filter(
            StoryMediaJob.episode_id == episode.id,
            StoryMediaJob.script_revision == episode.script_revision,
            StoryMediaJob.kind.in_(kinds),
            StoryMediaJob.status != MediaJobStatus.CANCELED,
        )
        .all()
    )
    for job in jobs:
        job.status = MediaJobStatus.CANCELED
    db.flush()
    return len(jobs)


def reject_episode(
    db: Session,
    ctx: Ctx,
    series: StorySeries,
    episode: StoryEpisode,
    instructions: str | None,
    regenerate_flag: bool,
    scope: str,
    outbox: Outbox,
) -> StoryEpisode:
    _require_idle(episode)
    _require_status(episode, (E.PENDING_REVIEW,), "O episódio")
    if regenerate_flag:
        # regenerate() does the pending_review -> rejected -> ... itself.
        clip = episode_clip(db, episode)
        if clip is not None:
            clip.status = ClipStatus.REJECTED
        return regenerate(db, ctx, series, episode, scope, instructions, outbox, action="episode.reject")
    fields = {"user_instructions": instructions} if instructions is not None else {}
    move(db, episode, E.REJECTED, E.PENDING_REVIEW, **fields)
    clip = episode_clip(db, episode)
    if clip is not None:
        clip.status = ClipStatus.REJECTED
    mark_following_stale(db, series, episode.number)
    audit(db, ctx, "episode.reject", "episode", episode.id, number=episode.number, regenerate=False, has_instructions=bool(instructions))
    return episode


def schedule_episode_publications(
    db: Session, ctx: Ctx, series: StorySeries, episode: StoryEpisode, clip: Clip
) -> list[Publication]:
    """Create the publications of an approved episode through the single
    rights-gate entry (`create_publications`). Failed leftovers from an
    earlier attempt are canceled first (the worker tick may call this again
    for `approved` episodes that found no slot)."""
    accounts = channel_accounts(db, series)
    if not accounts:
        raise coded(409, "channel_without_accounts", "O canal da série não tem contas de plataforma vinculadas.")
    _sync_allowed_platforms(db, series, accounts)
    _cancel_publications(db, ctx, episode, (PublicationStatus.FAILED,))
    after = target_datetime(series, episode)
    return create_publications(
        db,
        owner_id=series.owner_id,
        pairs=[(clip, account) for account in accounts],
        schedule="auto",
        privacy=Privacy(series.privacy),
        actor_id=ctx.actor_id,
        audit_details=ctx.extra,
        after=after,
        synthetic_media=True,
    )


def apply_threads(series: StorySeries, episode: StoryEpisode) -> None:
    """On approval: open the script's `threads_opened` (with `introduced_in`)
    and mark `closed_in` on the `threads_closed` in `bible.open_threads`."""
    script = episode.script or {}
    bible = dict(series.bible or {})
    threads = [dict(t) for t in bible.get("open_threads") or []]
    by_key = {t["key"]: t for t in threads}
    for opened in script.get("threads_opened") or []:
        if opened["key"] in by_key:
            continue
        thread = {"key": opened["key"], "description": opened["description"], "introduced_in": episode.number,
                  "planned_resolution_in": None, "closed_in": None}
        threads.append(thread)
        by_key[thread["key"]] = thread
    for key in script.get("threads_closed") or []:
        thread = by_key.get(key)
        if thread is not None and not thread.get("closed_in"):
            thread["closed_in"] = episode.number
    bible["open_threads"] = threads
    series.bible = bible


def revert_threads(series: StorySeries, episode: StoryEpisode) -> None:
    """Inverse of `apply_threads` (on unapprove)."""
    script = episode.script or {}
    bible = dict(series.bible or {})
    threads = [dict(t) for t in bible.get("open_threads") or []]
    opened = {t["key"] for t in script.get("threads_opened") or []}
    kept = []
    for thread in threads:
        # Threads added by apply_threads have no planned resolution (plan threads always do).
        if thread["key"] in opened and thread.get("introduced_in") == episode.number and thread.get("planned_resolution_in") is None:
            continue
        if thread["key"] in (script.get("threads_closed") or []) and thread.get("closed_in") == episode.number:
            thread["closed_in"] = None
        kept.append(thread)
    bible["open_threads"] = kept
    series.bible = bible


def _settle_scheduling(
    db: Session, ctx: Ctx, series: StorySeries, episode: StoryEpisode, clip: Clip, expected, **extra_fields
) -> tuple[list[Publication], E]:
    pubs = schedule_episode_publications(db, ctx, series, episode, clip)
    ok = [p for p in pubs if p.status in (PublicationStatus.SCHEDULED, PublicationStatus.EXPORTED)]
    scheduled_times = [p.scheduled_at for p in pubs if p.status == PublicationStatus.SCHEDULED and p.scheduled_at]
    scheduled_at = min(scheduled_times) if scheduled_times else (target_datetime(series, episode) if ok else None)
    target = E.SCHEDULED if ok else E.APPROVED
    if target != episode.status:
        move(db, episode, target, expected, scheduled_at=scheduled_at, error=None, **extra_fields)
    return pubs, target


def retry_approved_scheduling(db: Session, ctx: Ctx, series: StorySeries, episode: StoryEpisode) -> bool:
    """Tick helper: an `approved` episode whose publications all failed for lack
    of a slot gets another attempt. Returns True when it became `scheduled`."""
    if episode.status != E.APPROVED:
        return False
    clip = episode_clip(db, episode)
    if clip is None or clip.status != ClipStatus.APPROVED:
        return False
    statuses = [p.status for p in db.query(Publication).filter(Publication.clip_id == clip.id).all()]
    if statuses and any(st != PublicationStatus.FAILED for st in statuses):
        return False  # blocked by the rights gate etc.: retrying would only pile up rows
    try:
        _, target = _settle_scheduling(db, ctx, series, episode, clip, E.APPROVED)
    except HTTPException:
        return False
    if target == E.SCHEDULED:
        audit(db, ctx, "episode.schedule_retry", "episode", episode.id, number=episode.number)
    return target == E.SCHEDULED


def approve_episode(db: Session, ctx: Ctx, series: StorySeries, episode: StoryEpisode) -> StoryEpisode:
    _require_idle(episode)
    _require_status(episode, (E.PENDING_REVIEW,), "O episódio")
    if episode.number > 1:
        previous = (
            db.query(StoryEpisode)
            .filter(StoryEpisode.series_id == series.id, StoryEpisode.number == episode.number - 1)
            .one_or_none()
        )
        if previous is not None and previous.status not in APPROVED_STATES:
            raise coded(409, "previous_episode_not_approved", f"O episódio {episode.number - 1} precisa ser aprovado antes.")
    clip = episode_clip(db, episode)
    if clip is None:
        raise coded(409, "invalid_transition", "O episódio ainda não tem vídeo final (clip).")

    clip.status = ClipStatus.APPROVED
    db.flush()
    apply_events(db, episode)
    apply_threads(series, episode)
    pubs = schedule_episode_publications(db, ctx, series, episode, clip)
    ok = [p for p in pubs if p.status in (PublicationStatus.SCHEDULED, PublicationStatus.EXPORTED)]
    scheduled_times = [p.scheduled_at for p in pubs if p.status == PublicationStatus.SCHEDULED and p.scheduled_at]
    scheduled_at = min(scheduled_times) if scheduled_times else (target_datetime(series, episode) if ok else None)
    target = E.SCHEDULED if ok else E.APPROVED
    move(
        db, episode, target, E.PENDING_REVIEW,
        approved_at=datetime.now(timezone.utc), approved_by=ctx.actor_id, scheduled_at=scheduled_at, error=None,
    )
    audit(
        db, ctx, "episode.approve", "episode", episode.id,
        number=episode.number, result=target.value, publications=[p.status.value for p in pubs],
    )
    return episode


def unapprove_episode(db: Session, ctx: Ctx, series: StorySeries, episode: StoryEpisode) -> StoryEpisode:
    _require_status(episode, (E.APPROVED, E.SCHEDULED), "O episódio")
    nxt = (
        db.query(StoryEpisode)
        .filter(StoryEpisode.series_id == series.id, StoryEpisode.number == episode.number + 1)
        .one_or_none()
    )
    if nxt is not None and nxt.status in APPROVED_STATES:
        raise coded(409, "invalid_transition", f"O episódio {nxt.number} já está aprovado; desfaça-o primeiro.")
    clip = episode_clip(db, episode)
    if clip is not None:
        live = (
            db.query(Publication.id)
            .filter(Publication.clip_id == clip.id, Publication.status.in_((PublicationStatus.PUBLISHING, PublicationStatus.PUBLISHED)))
            .first()
        )
        if live is not None:
            raise coded(409, "invalid_transition", "O episódio já foi publicado.")
    canceled = _cancel_publications(
        db, ctx, episode,
        (PublicationStatus.SCHEDULED, PublicationStatus.EXPORTED, PublicationStatus.BLOCKED, PublicationStatus.FAILED),
    )
    if clip is not None:
        clip.status = ClipStatus.PENDING_REVIEW
    revert_events(db, episode)
    revert_threads(series, episode)
    move(db, episode, E.PENDING_REVIEW, episode.status, approved_at=None, approved_by=None, scheduled_at=None)
    mark_following_stale(db, series, episode.number)
    audit(db, ctx, "episode.unapprove", "episode", episode.id, number=episode.number, canceled_publications=canceled)
    return episode

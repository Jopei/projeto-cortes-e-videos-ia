"""Series IA REST API (plano §2). Thin layer over `app.story.lifecycle`:
validation, scoping (`get_scope`, 404 cross-owner), read models, commit and
post-commit task dispatch. Business errors are `{"detail": {"code",
"message"}}`."""

from __future__ import annotations

import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import record_action
from app.config import get_settings
from app.db import get_db
from app.genmedia_catalog import (
    ProviderSpec,
    estimate_episode_cost,
    is_configured,
    list_providers,
    price_usd,
)
from app.models.channel import Channel
from app.models.clip import Clip
from app.models.publication import Publication
from app.models.story import (
    AiUsageEvent,
    EpisodeStatus as E,
    SeriesStatus,
    StoryCharacter,
    StoryCharacterEvent,
    StoryEpisode,
    StoryMediaJob,
    StorySeries,
)
from app.quotas import assert_active_series_quota
from app.schemas.publication import PublicationRead
from app.schemas.series import (
    BibleUpdate,
    CancelRequest,
    CharacterRead,
    CharacterUpdate,
    CostsRead,
    EpisodeCost,
    EpisodeDetail,
    EpisodeSummary,
    EstimatedCost,
    EventRead,
    MediaJobRead,
    NextEpisode,
    OutlineUpdate,
    ProviderRead,
    LlmStatusRead,
    ProvidersRead,
    RegenerateRequest,
    RejectRequest,
    ReplanRequest,
    ScriptUpdate,
    SeriesCreate,
    SeriesDetail,
    SeriesEstimateRead,
    SeriesEstimateRequest,
    SeriesProgress,
    SeriesRead,
    SeriesUpdate,
    StartRequest,
    StateEventRead,
    UsageByKind,
    UsageEventRead,
    VoiceRead,
)
from app.integrations import get_integration_value
from app.scope import Scope, get_owned_or_404, get_scope
from app.storage import S3Client, get_s3_client
from app.story import lifecycle
from app.story.lifecycle import Ctx, Outbox
from app.story.voices import list_voices

router = APIRouter(prefix="/api/series", tags=["series"], dependencies=[Depends(get_scope)])


def _provider_read(spec: ProviderSpec) -> ProviderRead:
    caps = spec.capabilities
    return ProviderRead(
        id=spec.id,
        name=spec.name,
        configured=is_configured(spec),
        fake=spec.fake,
        supports_reference_images=caps.supports_reference_images,
        max_reference_images=caps.max_reference_images,
        allowed_durations=list(caps.allowed_durations) if spec.kind == "video" else None,
        word_timestamps=caps.word_timestamps if spec.kind == "tts" else None,
        est_cost_usd=price_usd(spec),
        est_cost_unit=spec.price_unit,
    )


def _llm_status() -> LlmStatusRead:
    key = get_integration_value("anthropic", "api_key")
    fake = bool(get_settings().story_fake_llm_enabled) and not key
    return LlmStatusRead(fake=fake, configured=bool(key) or fake)


@router.get("/providers", response_model=ProvidersRead)
def get_providers() -> ProvidersRead:
    return ProvidersRead(
        video=[_provider_read(s) for s in list_providers("video")],
        image=[_provider_read(s) for s in list_providers("image")],
        tts=[_provider_read(s) for s in list_providers("tts")],
        llm=_llm_status(),
    )


@router.post("/estimate", response_model=SeriesEstimateRead)
def estimate(payload: SeriesEstimateRequest) -> SeriesEstimateRead:
    try:
        result = estimate_episode_cost(
            payload.visual_strategy,
            payload.max_video_scenes_per_episode,
            payload.video_provider,
            payload.image_provider,
            payload.tts_provider,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return SeriesEstimateRead(
        per_episode_usd=result.per_episode_usd,
        season_usd=result.season_usd,
        breakdown=result.breakdown,
        assumptions=result.assumptions,
    )


@router.get("/providers/tts/{provider_id}/voices", response_model=list[VoiceRead])
def tts_voices(provider_id: str, language: str = Query(default="pt-BR")) -> list[dict]:
    return list_voices(provider_id, language)


# ------------------------------------------------------------ read models ----

_DONE_NEXT = (E.SCHEDULED, E.PUBLISHED, E.CANCELED)


def _f(value) -> float | None:
    return float(value) if value is not None else None


def _series_reads(db: Session, items: list[StorySeries]) -> list[SeriesRead]:
    if not items:
        return []
    by_series: dict[uuid.UUID, list] = defaultdict(list)
    rows = (
        db.query(StoryEpisode.series_id, StoryEpisode.number, StoryEpisode.status, StoryEpisode.target_date)
        .filter(StoryEpisode.series_id.in_([s.id for s in items]))
        .order_by(StoryEpisode.number)
        .all()
    )
    for sid, number, status, target in rows:
        by_series[sid].append((number, status, target))
    reads = []
    for series in items:
        eps = by_series.get(series.id, [])

        def count(*st) -> int:
            return sum(1 for _, status, _ in eps if status in st)

        progress = SeriesProgress(
            approved=count(E.APPROVED, E.SCHEDULED, E.PUBLISHED),
            scheduled=count(E.SCHEDULED),
            published=count(E.PUBLISHED),
            pending_review=count(E.PENDING_REVIEW),
            awaiting_script_approval=count(E.AWAITING_SCRIPT_APPROVAL),
            failed=count(E.NEEDS_ATTENTION),
        )
        nxt = next(((n, st, t) for n, st, t in eps if st not in _DONE_NEXT), None)
        try:
            est = estimate_episode_cost(
                series.visual_strategy,
                series.max_video_scenes_per_episode,
                series.video_provider,
                series.image_provider,
                series.tts_provider,
            )
            estimated = EstimatedCost(per_episode_usd=est.per_episode_usd, season_usd=est.season_usd)
        except ValueError:
            estimated = None  # provider no longer available (e.g. fakes disabled)
        read = SeriesRead.model_validate(series)
        read.progress = progress
        read.next_episode = NextEpisode(number=nxt[0], target_date=nxt[2], status=nxt[1].value) if nxt else None
        read.estimated_cost = estimated
        reads.append(read)
    return reads


def _series_read(db: Session, series: StorySeries) -> SeriesRead:
    return _series_reads(db, [series])[0]


def _episode_summaries(db: Session, episodes: list[StoryEpisode]) -> list[EpisodeSummary]:
    clip_by_ep: dict[uuid.UUID, uuid.UUID] = {}
    if episodes:
        clip_by_ep = {
            ep_id: clip_id
            for clip_id, ep_id in db.query(Clip.id, Clip.episode_id).filter(Clip.episode_id.in_([e.id for e in episodes])).all()
        }
    return [
        EpisodeSummary(
            id=e.id,
            number=e.number,
            title=e.title,
            arc_phase=e.arc_phase.value if e.arc_phase else None,
            status=e.status.value,
            target_date=e.target_date,
            scheduled_at=e.scheduled_at,
            clip_id=clip_by_ep.get(e.id),
            cost_usd=float(e.cost_usd or 0),
            regenerations=e.regenerations,
            error=e.error,
        )
        for e in episodes
    ]


def _episode_detail(db: Session, episode: StoryEpisode) -> EpisodeDetail:
    summary = _episode_summaries(db, [episode])[0]
    jobs = (
        db.query(StoryMediaJob)
        .filter(StoryMediaJob.episode_id == episode.id)
        .order_by(StoryMediaJob.created_at, StoryMediaJob.scene_index)
        .all()
    )
    chars = {c.id: c.key for c in db.query(StoryCharacter).filter(StoryCharacter.series_id == episode.series_id).all()}
    events = (
        db.query(StoryCharacterEvent)
        .filter(StoryCharacterEvent.episode_id == episode.id)
        .order_by(StoryCharacterEvent.created_at)
        .all()
    )
    pubs = []
    if summary.clip_id is not None:
        pubs = db.query(Publication).filter(Publication.clip_id == summary.clip_id).order_by(Publication.created_at).all()
    return EpisodeDetail(
        **summary.model_dump(),
        outline=episode.outline,
        script=episode.script,
        script_revision=episode.script_revision,
        user_instructions=episode.user_instructions,
        validation=episode.validation,
        validation_attempts=episode.validation_attempts,
        media_jobs=[MediaJobRead.model_validate(j) for j in jobs],
        state_events=[
            StateEventRead(**EventRead.model_validate(ev).model_dump(), character_key=chars.get(ev.character_id, "?"))
            for ev in events
        ],
        publications=[PublicationRead.model_validate(p) for p in pubs],
    )


def _character_read(char: StoryCharacter, events: list[StoryCharacterEvent]) -> CharacterRead:
    return CharacterRead(
        id=char.id,
        key=char.key,
        name=char.name,
        role=char.role.value,
        description=char.description,
        visual_description=char.visual_description,
        personality=char.personality,
        status=char.status.value,
        committed=char.committed,
        introduced_in_episode=char.introduced_in_episode,
        has_reference_image=bool(char.reference_image_key),
        events=[EventRead.model_validate(e) for e in events],
    )


def _characters(db: Session, series: StorySeries) -> list[CharacterRead]:
    chars = (
        db.query(StoryCharacter)
        .filter(StoryCharacter.series_id == series.id)
        .order_by(StoryCharacter.created_at, StoryCharacter.key)
        .all()
    )
    events: dict[uuid.UUID, list] = defaultdict(list)
    for ev in (
        db.query(StoryCharacterEvent)
        .filter(StoryCharacterEvent.series_id == series.id)
        .order_by(StoryCharacterEvent.episode_number, StoryCharacterEvent.created_at)
        .all()
    ):
        events[ev.character_id].append(ev)
    return [_character_read(c, events.get(c.id, [])) for c in chars]


def _series_detail(db: Session, series: StorySeries) -> SeriesDetail:
    base = _series_read(db, series)
    return SeriesDetail(
        **base.model_dump(),
        bible=series.bible,
        characters=_characters(db, series),
        episodes=_episode_summaries(db, lifecycle.episodes_of(db, series)),
    )


def _get_series(db: Session, series_id: uuid.UUID, scope: Scope) -> StorySeries:
    return get_owned_or_404(db, StorySeries, series_id, scope)


def _commit(db: Session, outbox: Outbox | None = None) -> None:
    db.commit()
    if outbox is not None:
        outbox.flush()


# ----------------------------------------------------------------- series ----


@router.post("", response_model=SeriesRead, status_code=201)
def create_series(payload: SeriesCreate, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> SeriesRead:
    owner_id = scope.create_owner_id
    channel = db.get(Channel, payload.channel_id)
    if channel is None or channel.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    lifecycle.validate_provider_ids(video=payload.video_provider, image=payload.image_provider, tts=payload.tts_provider)
    if not scope.actor.is_admin:
        assert_active_series_quota(db, scope.actor, owner_id)
    outbox = Outbox()
    series = lifecycle.create_series(db, Ctx.from_scope(scope), owner_id, payload, outbox)
    _commit(db, outbox)
    db.refresh(series)
    return _series_read(db, series)


@router.get("", response_model=list[SeriesRead])
def list_series(
    channel_id: uuid.UUID | None = Query(default=None),
    status: SeriesStatus | None = Query(default=None),
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> list[SeriesRead]:
    stmt = scope.owned(db.query(StorySeries), StorySeries)
    if channel_id is not None:
        stmt = stmt.filter(StorySeries.channel_id == channel_id)
    if status is not None:
        stmt = stmt.filter(StorySeries.status == status)
    return _series_reads(db, list(stmt.order_by(StorySeries.created_at.desc()).all()))


@router.get("/{series_id}", response_model=SeriesDetail)
def get_series(series_id: uuid.UUID, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> SeriesDetail:
    return _series_detail(db, _get_series(db, series_id, scope))


@router.patch("/{series_id}", response_model=SeriesRead)
def update_series(
    series_id: uuid.UUID, payload: SeriesUpdate, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)
) -> SeriesRead:
    series = _get_series(db, series_id, scope)
    lifecycle.update_series(db, Ctx.from_scope(scope), series, payload)
    _commit(db)
    db.refresh(series)
    return _series_read(db, series)


@router.put("/{series_id}/bible", response_model=SeriesDetail)
def put_bible(
    series_id: uuid.UUID, payload: BibleUpdate, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)
) -> SeriesDetail:
    series = _get_series(db, series_id, scope)
    lifecycle.update_bible(db, Ctx.from_scope(scope), series, payload.bible_version, payload.bible.model_dump(mode="json"))
    _commit(db)
    db.refresh(series)
    return _series_detail(db, series)


@router.post("/{series_id}/replan", response_model=SeriesRead, status_code=202)
def replan(
    series_id: uuid.UUID,
    payload: ReplanRequest | None = None,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> SeriesRead:
    series = _get_series(db, series_id, scope)
    outbox = Outbox()
    lifecycle.replan_series(db, Ctx.from_scope(scope), series, payload.instructions if payload else None, outbox)
    _commit(db, outbox)
    return _series_read(db, series)


@router.post("/{series_id}/start", response_model=SeriesRead)
def start(
    series_id: uuid.UUID,
    payload: StartRequest | None = None,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> SeriesRead:
    series = _get_series(db, series_id, scope)
    lifecycle.start_series(db, Ctx.from_scope(scope), series, payload.start_date if payload else None)
    _commit(db)
    return _series_read(db, series)


@router.post("/{series_id}/pause", response_model=SeriesRead)
def pause(series_id: uuid.UUID, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> SeriesRead:
    series = _get_series(db, series_id, scope)
    lifecycle.pause_series(db, Ctx.from_scope(scope), series)
    _commit(db)
    return _series_read(db, series)


@router.post("/{series_id}/resume", response_model=SeriesRead)
def resume(series_id: uuid.UUID, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> SeriesRead:
    series = _get_series(db, series_id, scope)
    lifecycle.resume_series(db, Ctx.from_scope(scope), series)
    _commit(db)
    return _series_read(db, series)


@router.post("/{series_id}/cancel", response_model=SeriesRead)
def cancel(
    series_id: uuid.UUID,
    payload: CancelRequest | None = None,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> SeriesRead:
    series = _get_series(db, series_id, scope)
    flag = payload.cancel_scheduled_publications if payload else False
    lifecycle.cancel_series(db, Ctx.from_scope(scope), series, flag)
    _commit(db)
    return _series_read(db, series)


@router.delete("/{series_id}", status_code=204, response_class=Response)
def delete_series(
    series_id: uuid.UUID,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    s3: S3Client = Depends(get_s3_client),
) -> Response:
    series = _get_series(db, series_id, scope)
    lifecycle.assert_deletable(db, series)
    lifecycle.delete_series(db, Ctx.from_scope(scope), series, s3)
    _commit(db)
    return Response(status_code=204)


@router.get("/{series_id}/costs", response_model=CostsRead)
def costs(series_id: uuid.UUID, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> CostsRead:
    series = _get_series(db, series_id, scope)
    by_kind = UsageByKind()
    for kind, total in (
        db.query(AiUsageEvent.kind, func.coalesce(func.sum(AiUsageEvent.cost_usd), 0))
        .filter(AiUsageEvent.series_id == series.id)
        .group_by(AiUsageEvent.kind)
        .all()
    ):
        setattr(by_kind, kind.value, float(total))
    episodes = lifecycle.episodes_of(db, series)
    recent = (
        db.query(AiUsageEvent)
        .filter(AiUsageEvent.series_id == series.id)
        .order_by(AiUsageEvent.created_at.desc())
        .limit(100)
        .all()
    )
    return CostsRead(
        total_usd=float(series.cost_usd_total or 0),
        budget_limit_usd=_f(series.budget_limit_usd),
        by_kind=by_kind,
        by_episode=[EpisodeCost(episode_id=e.id, number=e.number, cost_usd=float(e.cost_usd or 0)) for e in episodes],
        recent=[
            UsageEventRead(
                id=ev.id,
                episode_id=ev.episode_id,
                kind=ev.kind.value,
                provider=ev.provider,
                model=ev.model,
                cost_usd=float(ev.cost_usd),
                created_at=ev.created_at,
            )
            for ev in recent
        ],
    )


# ------------------------------------------------------------- characters ----

_MAX_REF_IMAGE_BYTES = 5 * 1024 * 1024
_EXT_TYPES = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}


def _get_character(db: Session, series: StorySeries, character_id: uuid.UUID) -> StoryCharacter:
    char = db.get(StoryCharacter, character_id)
    if char is None or char.series_id != series.id:
        raise HTTPException(status_code=404, detail="Personagem não encontrado")
    return char


def _character_with_events(db: Session, char: StoryCharacter) -> CharacterRead:
    events = (
        db.query(StoryCharacterEvent)
        .filter(StoryCharacterEvent.character_id == char.id)
        .order_by(StoryCharacterEvent.episode_number, StoryCharacterEvent.created_at)
        .all()
    )
    return _character_read(char, events)


@router.patch("/{series_id}/characters/{character_id}", response_model=CharacterRead)
def update_character(
    series_id: uuid.UUID,
    character_id: uuid.UUID,
    payload: CharacterUpdate,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> CharacterRead:
    series = _get_series(db, series_id, scope)
    char = _get_character(db, series, character_id)
    updates = {
        k: getattr(payload, k)
        for k in payload.model_fields_set
        if getattr(payload, k) is not None or k == "personality"
    }
    for key, value in updates.items():
        setattr(char, key, value)
    record_action(
        db,
        user_id=scope.actor.id,
        action="character.update",
        entity="character",
        entity_id=char.id,
        details=scope.audit_details({"series_id": str(series.id), "fields": sorted(updates)}),
    )
    _commit(db)
    db.refresh(char)
    return _character_with_events(db, char)


def _sniff_image(data: bytes) -> tuple[str, str] | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None


@router.put("/{series_id}/characters/{character_id}/reference-image", response_model=CharacterRead)
def put_reference_image(
    series_id: uuid.UUID,
    character_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    s3: S3Client = Depends(get_s3_client),
) -> CharacterRead:
    series = _get_series(db, series_id, scope)
    char = _get_character(db, series, character_id)
    data = file.file.read(_MAX_REF_IMAGE_BYTES + 1)
    if len(data) > _MAX_REF_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Imagem de referência acima de 5 MB.")
    sniffed = _sniff_image(data)
    if sniffed is None:
        raise HTTPException(status_code=415, detail="Formato não suportado: use PNG, JPEG ou WebP.")
    content_type, ext = sniffed
    key = f"users/{series.owner_id}/series/{series.id}/characters/{char.id}/reference.{ext}"
    bucket = get_settings().s3_bucket
    s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    old = char.reference_image_key
    char.reference_image_key = key
    record_action(
        db,
        user_id=scope.actor.id,
        action="character.update",
        entity="character",
        entity_id=char.id,
        details=scope.audit_details({"series_id": str(series.id), "fields": ["reference_image"]}),
    )
    _commit(db)
    if old and old != key:
        try:
            s3.delete_object(Bucket=bucket, Key=old)
        except Exception:  # noqa: BLE001 - best effort
            pass
    db.refresh(char)
    return _character_with_events(db, char)


@router.get("/{series_id}/characters/{character_id}/reference-image")
def get_reference_image(
    series_id: uuid.UUID,
    character_id: uuid.UUID,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    s3: S3Client = Depends(get_s3_client),
) -> Response:
    series = _get_series(db, series_id, scope)
    char = _get_character(db, series, character_id)
    if not char.reference_image_key:
        raise HTTPException(status_code=404, detail="Imagem de referência não encontrada")
    try:
        obj = s3.get_object(Bucket=get_settings().s3_bucket, Key=char.reference_image_key)
        body = obj["Body"].read()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Imagem de referência não encontrada") from exc
    ext = char.reference_image_key.rsplit(".", 1)[-1]
    return Response(
        content=body,
        media_type=_EXT_TYPES.get(ext, "application/octet-stream"),
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.delete("/{series_id}/characters/{character_id}/reference-image", status_code=204, response_class=Response)
def delete_reference_image(
    series_id: uuid.UUID,
    character_id: uuid.UUID,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    s3: S3Client = Depends(get_s3_client),
) -> Response:
    series = _get_series(db, series_id, scope)
    char = _get_character(db, series, character_id)
    key = char.reference_image_key
    if key:
        char.reference_image_key = None
        record_action(
            db,
            user_id=scope.actor.id,
            action="character.update",
            entity="character",
            entity_id=char.id,
            details=scope.audit_details({"series_id": str(series.id), "fields": ["reference_image_removed"]}),
        )
        _commit(db)
        try:
            s3.delete_object(Bucket=get_settings().s3_bucket, Key=key)
        except Exception:  # noqa: BLE001
            pass
    return Response(status_code=204)


# --------------------------------------------------------------- episodes ----


@router.get("/{series_id}/episodes", response_model=list[EpisodeSummary])
def list_episodes(
    series_id: uuid.UUID, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)
) -> list[EpisodeSummary]:
    series = _get_series(db, series_id, scope)
    return _episode_summaries(db, lifecycle.episodes_of(db, series))


@router.get("/{series_id}/episodes/{number}", response_model=EpisodeDetail)
def get_episode(
    series_id: uuid.UUID, number: int, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)
) -> EpisodeDetail:
    series = _get_series(db, series_id, scope)
    return _episode_detail(db, lifecycle.get_episode(db, series, number))


@router.put("/{series_id}/outline/{number}", response_model=EpisodeDetail)
def put_outline(
    series_id: uuid.UUID,
    number: int,
    payload: OutlineUpdate,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> EpisodeDetail:
    series = _get_series(db, series_id, scope)
    episode = lifecycle.get_episode(db, series, number)
    lifecycle.update_outline(db, Ctx.from_scope(scope), series, episode, payload)
    _commit(db)
    db.refresh(episode)
    return _episode_detail(db, episode)


@router.put("/{series_id}/episodes/{number}/script", response_model=EpisodeDetail)
def put_script(
    series_id: uuid.UUID,
    number: int,
    payload: ScriptUpdate,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> EpisodeDetail:
    series = _get_series(db, series_id, scope)
    episode = lifecycle.get_episode(db, series, number)
    outbox = Outbox()
    lifecycle.update_script(
        db, Ctx.from_scope(scope), series, episode, payload.script_revision, payload.script.model_dump(mode="json"), outbox
    )
    _commit(db, outbox)
    db.refresh(episode)
    return _episode_detail(db, episode)


@router.post("/{series_id}/episodes/{number}/regenerate", response_model=EpisodeSummary, status_code=202)
def regenerate_episode(
    series_id: uuid.UUID,
    number: int,
    payload: RegenerateRequest,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> EpisodeSummary:
    series = _get_series(db, series_id, scope)
    episode = lifecycle.get_episode(db, series, number)
    outbox = Outbox()
    lifecycle.regenerate(db, Ctx.from_scope(scope), series, episode, payload.scope, payload.instructions, outbox)
    _commit(db, outbox)
    db.refresh(episode)
    return _episode_summaries(db, [episode])[0]


@router.post("/{series_id}/episodes/{number}/approve-script", response_model=EpisodeSummary)
def approve_script(
    series_id: uuid.UUID, number: int, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)
) -> EpisodeSummary:
    series = _get_series(db, series_id, scope)
    episode = lifecycle.get_episode(db, series, number)
    outbox = Outbox()
    lifecycle.approve_script(db, Ctx.from_scope(scope), series, episode, outbox)
    _commit(db, outbox)
    db.refresh(episode)
    return _episode_summaries(db, [episode])[0]


@router.post("/{series_id}/episodes/{number}/approve", response_model=EpisodeDetail)
def approve_episode(
    series_id: uuid.UUID, number: int, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)
) -> EpisodeDetail:
    series = _get_series(db, series_id, scope)
    episode = lifecycle.get_episode(db, series, number)
    lifecycle.approve_episode(db, Ctx.from_scope(scope), series, episode)
    _commit(db)
    db.refresh(episode)
    return _episode_detail(db, episode)


@router.post("/{series_id}/episodes/{number}/reject", response_model=EpisodeSummary)
def reject_episode(
    series_id: uuid.UUID,
    number: int,
    payload: RejectRequest | None = None,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> EpisodeSummary:
    series = _get_series(db, series_id, scope)
    episode = lifecycle.get_episode(db, series, number)
    payload = payload or RejectRequest()
    outbox = Outbox()
    lifecycle.reject_episode(
        db, Ctx.from_scope(scope), series, episode, payload.instructions, payload.regenerate, payload.scope, outbox
    )
    _commit(db, outbox)
    db.refresh(episode)
    return _episode_summaries(db, [episode])[0]


@router.post("/{series_id}/episodes/{number}/unapprove", response_model=EpisodeDetail)
def unapprove_episode(
    series_id: uuid.UUID, number: int, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)
) -> EpisodeDetail:
    series = _get_series(db, series_id, scope)
    episode = lifecycle.get_episode(db, series, number)
    lifecycle.unapprove_episode(db, Ctx.from_scope(scope), series, episode)
    _commit(db)
    db.refresh(episode)
    return _episode_detail(db, episode)

"""Series IA end to end through the HTTP API with the worker running eagerly
(`send_task` -> in-process `.apply`) on the deterministic `fake_llm` + fake
providers; ffmpeg assembly is stubbed (real assembly is covered by the
`integration` tests in test_story_worker_flow.py). Covers the API<->worker
seams: transitions before enqueueing, unified character events, narrative
threads, scoped media regeneration, tick retry of `approved` episodes."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

import app.db as db_module
from app.config import get_settings
from app.models.clip import Clip, ClipStatus
from app.models.platform_account import AccountMode
from app.models.publication import Publication, PublicationStatus
from app.models.story import (
    AiUsageEvent,
    CharacterEventState,
    EpisodeStatus as E,
    MediaJobKind,
    MediaJobStatus,
    SeriesStatus as S,
    StoryCharacterEvent,
    StoryEpisode,
    StoryMediaJob,
    StorySeries,
)
from app.story import lifecycle
from app.worker.celery_app import celery_app
from app.worker.genmedia import semaphore
from app.worker.genmedia.base import CALL_LOG
from app.worker.story import fake_llm, tasks
from tests.factories import insert_account, insert_channel
from tests.story_helpers import MemS3


@pytest.fixture()
def world(logged_in_client, session_factory, user, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "story_fake_providers_enabled", True)
    monkeypatch.setattr(settings, "story_fake_llm_enabled", True)
    monkeypatch.setattr(tasks, "_api_key", lambda: None)
    s3 = MemS3()
    monkeypatch.setattr("app.storage.get_s3_client", lambda: s3)
    semaphore.reset_memory_store()
    CALL_LOG.calls.clear()

    def _send(name, args=None, kwargs=None, queue=None, **kw):
        celery_app.tasks[name].apply(args=list(args or []))

    monkeypatch.setattr(celery_app, "send_task", _send)

    from app.worker.story.assemble import AssembleResult

    def _assemble(assets, counts, narration_path, narration_s, words, **kw):
        with open(kw["out_path"], "wb") as fh:
            fh.write(b"fake-mp4")
        return AssembleResult(duration_s=30.0, width=1080, height=1920, tempo=1.0, ass_text="", words=[])

    def _thumb(video, at, out):
        with open(out, "wb") as fh:
            fh.write(b"jpg")

    monkeypatch.setattr("app.worker.story.assemble.assemble_episode_video", _assemble)
    monkeypatch.setattr("app.worker.render.pipeline.extract_thumbnail", _thumb)

    channel_id = insert_channel(session_factory)
    insert_account(session_factory, channel_id=channel_id, platform="youtube", mode=AccountMode.MANUAL)

    class W:
        pass

    w = W()
    w.c, w.sf, w.user, w.channel_id, w.s3 = logged_in_client, session_factory, user, channel_id, s3
    w.mp = monkeypatch
    return w


def _create(w, **over) -> str:
    body = {
        "premise": "Uma faroleira descobre mensagens misteriosas chegando pelo mar, cada noite mais perto da verdade.",
        "channel_id": str(w.channel_id), "visual_strategy": "economy", "max_video_scenes_per_episode": 0, "image_provider": "fake_image",
        "tts_provider": "fake_tts", "tts_voice_id": "fake_voice_f", "publish_time": "18:00",
        "originality_attestation": True, "timezone": "UTC", "genre": "mistério", "tone": "intimista",
    }
    body.update(over)
    resp = w.c.post("/api/series", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _q(w, fn):
    db = w.sf()
    try:
        return fn(db)
    finally:
        db.close()


def _ep(w, sid, n) -> StoryEpisode:
    return _q(w, lambda db: db.query(StoryEpisode).filter_by(series_id=uuid.UUID(sid), number=n).one())


def _start(w, sid) -> None:
    series = _q(w, lambda db: db.get(StorySeries, uuid.UUID(sid)))
    assert series.status == S.PLANNED, series.error
    minimum = datetime.now(ZoneInfo("UTC")).date() + timedelta(days=series.lead_days)
    r = w.c.post(f"/api/series/{sid}/start", json={"start_date": minimum.isoformat()})
    assert r.status_code == 200, r.text


def _pull_forward(w, sid, n) -> None:
    db = w.sf()
    db.query(StoryEpisode).filter_by(series_id=uuid.UUID(sid), number=n).update({"target_date": date.today()})
    db.commit()
    db.close()


def _drive_to_pending_review(w, sid, n) -> None:
    _pull_forward(w, sid, n)
    tasks.series_tick()
    assert _ep(w, sid, n).status == E.AWAITING_SCRIPT_APPROVAL, _ep(w, sid, n).error
    r = w.c.post(f"/api/series/{sid}/episodes/{n}/approve-script")
    assert r.status_code == 200, r.text
    ep = _ep(w, sid, n)
    assert ep.status == E.PENDING_REVIEW, ep.error


def _approve(w, sid, n):
    r = w.c.post(f"/api/series/{sid}/episodes/{n}/approve")
    assert r.status_code == 200, r.text
    return r.json()


def test_e2e_create_to_scheduled(world):
    w = world
    sid = _create(w)
    series = _q(w, lambda db: db.get(StorySeries, uuid.UUID(sid)))
    assert series.status == S.PLANNED, series.error
    assert len(series.bible["open_threads"]) == 2
    _start(w, sid)

    _drive_to_pending_review(w, sid, 1)
    detail = w.c.get(f"/api/series/{sid}/episodes/1").json()
    assert detail["status"] == "pending_review" and detail["clip_id"]
    clip = _q(w, lambda db: db.query(Clip).filter_by(episode_id=_ep(w, sid, 1).id).one())
    assert clip.status == ClipStatus.PENDING_REVIEW and clip.synthetic_media

    body = _approve(w, sid, 1)
    assert body["status"] == "scheduled"
    pubs = _q(w, lambda db: db.query(Publication).filter_by(clip_id=clip.id).all())
    assert [p.status for p in pubs] == [PublicationStatus.EXPORTED]

    # fake_llm usage is recorded as provider fake_llm at cost 0
    usage = _q(w, lambda db: db.query(AiUsageEvent).filter_by(kind="llm").all())
    assert usage and {u.provider for u in usage} == {"fake_llm"} and all(float(u.cost_usd) == 0 for u in usage)
    read = w.c.get(f"/api/series/{sid}").json()
    assert isinstance(read["cost_usd_total"], float) and read["cost_usd_total"] == 0.0


def test_threads_opened_closed_on_approve_and_reverted_on_unapprove(world):
    w = world
    sid = _create(w)
    _start(w, sid)
    for n in (1, 2, 3):
        _drive_to_pending_review(w, sid, n)
        _approve(w, sid, n)
    bible = _q(w, lambda db: db.get(StorySeries, uuid.UUID(sid))).bible
    threads = {t["key"]: t for t in bible["open_threads"]}
    assert threads["pista_do_mar"]["introduced_in"] == 3 and threads["pista_do_mar"]["closed_in"] is None
    assert w.c.post(f"/api/series/{sid}/episodes/3/unapprove").status_code == 200
    bible = _q(w, lambda db: db.get(StorySeries, uuid.UUID(sid))).bible
    assert "pista_do_mar" not in {t["key"] for t in bible["open_threads"]}
    assert {t["key"] for t in bible["open_threads"]} == {"misterio_central", "segredo_do_mentor"}


def test_apply_and_revert_threads_closing():
    series = StorySeries(bible={"open_threads": [
        {"key": "a", "description": "x", "introduced_in": 1, "planned_resolution_in": 6, "closed_in": None}]})
    ep = StoryEpisode(number=6, script={"threads_opened": [{"key": "b", "description": "y"}], "threads_closed": ["a"]})
    lifecycle.apply_threads(series, ep)
    by = {t["key"]: t for t in series.bible["open_threads"]}
    assert by["a"]["closed_in"] == 6 and by["b"]["introduced_in"] == 6
    lifecycle.revert_threads(series, ep)
    by = {t["key"]: t for t in series.bible["open_threads"]}
    assert by["a"]["closed_in"] is None and "b" not in by


def test_script_events_single_implementation_and_put_script_validates(world):
    w = world
    sid = _create(w)
    _start(w, sid)
    _pull_forward(w, sid, 1)
    tasks.series_tick()
    ep = _ep(w, sid, 1)
    assert ep.status == E.AWAITING_SCRIPT_APPROVAL
    script = dict(ep.script)
    script["state_events"] = [{
        "type": "introduce", "character_key": "gaivota",
        "new_character": {"name": "Gaivota", "role": "minor", "description": "Uma ave curiosa.",
                          "visual_description": "a large white seagull with a torn left wing and one amber eye, always perched on the rail"},
        "description": "Surge no farol."}]
    r = w.c.put(f"/api/series/{sid}/episodes/1/script", json={"script_revision": ep.script_revision, "script": script})
    assert r.status_code == 200, r.text
    ep = _ep(w, sid, 1)
    assert ep.status == E.AWAITING_SCRIPT_APPROVAL  # PUT -> validating -> (eager) validate -> awaiting
    events = _q(w, lambda db: db.query(StoryCharacterEvent).filter_by(episode_id=ep.id).all())
    proposed = [e for e in events if e.state == CharacterEventState.PROPOSED]
    assert len(proposed) == 1 and proposed[0].type.value == "introduce"
    chars = {c["key"]: c for c in w.c.get(f"/api/series/{sid}").json()["characters"]}
    assert chars["gaivota"]["committed"] is False


def test_regenerate_scopes_cancel_only_the_component(world):
    w = world
    sid = _create(w)
    _start(w, sid)
    _drive_to_pending_review(w, sid, 1)
    ep = _ep(w, sid, 1)

    def n(op):
        return len([c for c in CALL_LOG.calls if c[0] == op])

    images, tts = n("image.generate"), n("tts.synthesize")
    assert images >= 1 and tts == 1

    # media/visual scope: images (and video) redone, narration reused
    r = w.c.post(f"/api/series/{sid}/episodes/1/regenerate", json={"scope": "media"})
    assert r.status_code == 202, r.text
    assert _ep(w, sid, 1).status == E.PENDING_REVIEW
    assert n("image.generate") == 2 * images and n("tts.synthesize") == 1

    # narration scope: only TTS redone
    r = w.c.post(f"/api/series/{sid}/episodes/1/reject", json={"regenerate": True, "scope": "narration"})
    assert r.status_code == 200, r.text
    assert _ep(w, sid, 1).status == E.PENDING_REVIEW
    assert n("tts.synthesize") == 2 and n("image.generate") == 2 * images

    # script scope: back to script approval, then through the API again
    r = w.c.post(f"/api/series/{sid}/episodes/1/reject", json={"regenerate": True, "scope": "script", "instructions": "mais tensão"})
    assert r.status_code == 200, r.text
    assert _ep(w, sid, 1).status == E.AWAITING_SCRIPT_APPROVAL
    assert w.c.post(f"/api/series/{sid}/episodes/1/approve-script").status_code == 200
    assert _ep(w, sid, 1).status == E.PENDING_REVIEW
    assert _ep(w, sid, 1).regenerations == 3
    assert all(j.status == MediaJobStatus.SUCCEEDED for j in _q(w, lambda db: db.query(StoryMediaJob).filter_by(episode_id=ep.id).all())
               if j.script_revision == _ep(w, sid, 1).script_revision)


def test_tick_retries_approved_episode_without_slot(world):
    w = world
    sid = _create(w)
    # replace the manual account by an oauth one with daily_limit=0 -> no slot
    db = w.sf()
    from app.models.platform_account import PlatformAccount

    db.query(PlatformAccount).delete()
    db.commit()
    db.close()
    acc_id = insert_account(w.sf, channel_id=w.channel_id, platform="youtube", mode=AccountMode.OAUTH, daily_limit=0)
    _start(w, sid)
    _drive_to_pending_review(w, sid, 1)
    body = _approve(w, sid, 1)
    assert body["status"] == "approved"
    assert [p.status for p in _q(w, lambda db: db.query(Publication).all())] == [PublicationStatus.FAILED]

    db = w.sf()
    acc = db.get(PlatformAccount, acc_id)
    acc.daily_limit = None
    db.commit()
    db.close()
    tasks.series_tick()
    assert _ep(w, sid, 1).status == E.SCHEDULED
    statuses = sorted(p.status.value for p in _q(w, lambda db: db.query(Publication).all()))
    assert statuses == ["canceled", "scheduled"]


def test_resource_404_is_not_the_bare_route_404(world):
    w = world
    for path in (f"/api/series/{uuid.uuid4()}", f"/api/series/{uuid.uuid4()}/episodes/1", f"/api/clips/{uuid.uuid4()}",
                 f"/api/channels/{uuid.uuid4()}"):
        r = w.c.get(path)
        assert r.status_code == 404 and r.json()["detail"] != "Not Found", path
    assert w.c.get("/api/rota-que-nao-existe").json()["detail"] == "Not Found"


def test_providers_reports_fake_llm(world):
    w = world
    llm = w.c.get("/api/series/providers").json()["llm"]
    assert llm == {"fake": True, "configured": True}
    w.mp.setattr(get_settings(), "story_fake_llm_enabled", False)
    assert w.c.get("/api/series/providers").json()["llm"] == {"fake": False, "configured": False}


def test_fake_llm_plan_passes_schema_and_plan_checks():
    premise = "Uma faroleira descobre mensagens misteriosas chegando pelo mar"
    plan = fake_llm.season_plan(f"<premissa>\n{premise}\n</premissa>")
    from app.story.plan_checks import check_season_plan
    from app.story.schemas import SeasonPlan

    SeasonPlan.model_validate(plan)
    assert check_season_plan(plan) == []

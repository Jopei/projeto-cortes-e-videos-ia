"""Series IA worker engine, end to end with fake providers and a mocked
Claude, tasks running eagerly (CELERY_TASK_ALWAYS_EAGER) against SQLite.

Tests that need the real ffmpeg are marked `integration` and skipped when it
is missing; run them in the worker image:
  docker run --rm -v "$PWD/services/api":/app -w /app projetos_cortes-worker \
    sh -c "pip install -q pytest httpx && pytest -m integration -q"
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from datetime import timedelta
from decimal import Decimal

import pytest

import app.db as db_module
from app.config import get_settings
from app.models.audit_log import AuditLog
from app.models.clip import Clip
from app.models.clip_metadata import ClipMetadata
from app.models.story import (
    AiUsageEvent,
    CharacterEventState,
    CharacterStatus,
    EpisodeStatus as E,
    MediaJobKind,
    MediaJobStatus,
    SeriesStatus,
    StoryCharacter,
    StoryCharacterEvent,
    StoryEpisode,
    StoryMediaJob,
    StorySeries,
)
from app.story.state import transition
from app.worker.genmedia import semaphore
from app.worker.genmedia.base import CALL_LOG
from app.worker.story import llm, tasks
from tests.story_helpers import FakeClaude, MemS3, ffmpeg_available, make_plan, make_script, make_series

needs_ffmpeg = pytest.mark.skipif(not ffmpeg_available(), reason="needs ffmpeg/ffprobe (run in the worker image)")


@pytest.fixture()
def env(session_factory, user, monkeypatch):
    monkeypatch.setattr(db_module, "SessionLocal", session_factory)
    monkeypatch.setattr(get_settings(), "story_fake_providers_enabled", True)
    monkeypatch.setattr(tasks, "_api_key", lambda: "test-key")
    s3 = MemS3()
    monkeypatch.setattr("app.storage.get_s3_client", lambda: s3)
    claude = FakeClaude()
    monkeypatch.setattr(llm, "call_structured", claude)
    semaphore.reset_memory_store()
    CALL_LOG.calls.clear()

    class Env:
        pass

    e = Env()
    e.sf, e.user, e.s3, e.claude, e.mp = session_factory, user, s3, claude, monkeypatch
    return e


def q(env, fn):
    db = env.sf()
    try:
        return fn(db)
    finally:
        db.close()


def series_of(env, sid):
    return q(env, lambda db: db.get(StorySeries, sid))


def episode(env, sid, number):
    return q(env, lambda db: db.query(StoryEpisode).filter_by(series_id=sid, number=number).one())


def start_series(env, sid, *, offset_days=1):
    """What POST /start does (API, other specialist): status active + target dates."""
    from datetime import datetime, timezone

    today = datetime.now(timezone.utc).date()
    db = env.sf()
    series = db.get(StorySeries, sid)
    series.status = SeriesStatus.ACTIVE
    series.start_date = today + timedelta(days=offset_days)
    for ep in db.query(StoryEpisode).filter_by(series_id=sid):
        ep.target_date = today + timedelta(days=offset_days + ep.number - 1)
    db.commit()
    db.close()


def planned_series(env, **kw):
    sid = make_series(env.sf, env.user.id, **kw)
    tasks.plan_series(str(sid))
    return sid


def approve_script(env, sid, number):
    """What POST .../approve-script does: awaiting -> generating_media, then enqueue."""
    db = env.sf()
    ep = db.query(StoryEpisode).filter_by(series_id=sid, number=number).one()
    transition(db, ep, E.GENERATING_MEDIA, E.AWAITING_SCRIPT_APPROVAL)
    db.commit()
    eid = str(ep.id)
    db.close()
    tasks.generate_episode_media.delay(eid, "all")


# ------------------------------------------------------------------ plan ----


def test_plan_creates_bible_characters_and_20_episodes(env):
    sid = planned_series(env)
    series = series_of(env, sid)
    assert series.status == SeriesStatus.PLANNED and series.error is None
    assert series.title == "Maré Alta" and series.bible_version == 1
    assert series.bible["premise_core_elements"] and series.bible["open_threads"][0]["closed_in"] is None

    chars = q(env, lambda db: db.query(StoryCharacter).filter_by(series_id=sid).all())
    assert len(chars) == 4 and all(c.committed for c in chars)
    eps = q(env, lambda db: db.query(StoryEpisode).filter_by(series_id=sid).order_by(StoryEpisode.number).all())
    assert [e.number for e in eps] == list(range(1, 21)) and all(e.status == E.PLANNED for e in eps)
    phases = {e.number: e.arc_phase.value for e in eps}
    assert phases[1] == phases[3] == "setup" and phases[10] == "midpoint" and phases[18] == "climax" and phases[20] == "resolution"
    assert eps[0].outline["cliffhanger"]
    assert env.claude.calls[:2] == ["screen_premise", "submit_season_plan"]
    events = q(env, lambda db: db.query(AiUsageEvent).filter_by(series_id=sid, kind="llm").count())
    assert events == 2
    assert float(series.cost_usd_total) == pytest.approx(0.02)


def test_plan_retries_with_feedback_then_succeeds(env):
    bad = make_plan()
    bad["episodes"][0]["arc_phase"] = "climax"
    env.claude.plan_sequence = [bad, make_plan()]
    sid = planned_series(env)
    assert series_of(env, sid).status == SeriesStatus.PLANNED
    assert env.claude.plan_attempts == 2


def test_plan_fails_after_three_bad_attempts(env):
    bad = make_plan()
    bad["episodes"][0]["arc_phase"] = "climax"
    env.claude.plan = bad
    sid = planned_series(env)
    series = series_of(env, sid)
    assert series.status == SeriesStatus.PLAN_FAILED and "checagens" in series.error
    assert env.claude.plan_attempts == 3
    assert q(env, lambda db: db.query(StoryEpisode).filter_by(series_id=sid).count()) == 0


def test_plan_rejected_by_screening(env):
    env.claude.screen_allowed = False
    sid = planned_series(env)
    series = series_of(env, sid)
    assert series.status == SeriesStatus.PLAN_FAILED and "ip_infringement" in series.error
    assert "submit_season_plan" not in env.claude.calls


def test_plan_without_api_key_fails_cleanly(env):
    env.mp.setattr(tasks, "_api_key", lambda: None)
    sid = planned_series(env)
    assert series_of(env, sid).status == SeriesStatus.PLAN_FAILED


def test_plan_is_noop_when_not_planning(env):
    sid = planned_series(env)
    calls = len(env.claude.calls)
    assert tasks.plan_series(str(sid))["status"] == "noop"
    assert len(env.claude.calls) == calls


# --------------------------------------------------- tick -> script flow ----


def test_tick_drives_episodes_1_and_2_to_script_approval(env):
    sid = planned_series(env)
    start_series(env, sid)  # ep1 = tomorrow, ep2 = day after (both within lead_days=2)
    tasks.series_tick()
    assert episode(env, sid, 1).status == E.AWAITING_SCRIPT_APPROVAL
    assert episode(env, sid, 2).status == E.PLANNED  # sequential: one per tick
    tasks.series_tick()
    assert episode(env, sid, 2).status == E.AWAITING_SCRIPT_APPROVAL
    assert episode(env, sid, 3).status == E.PLANNED  # target_date beyond the lead horizon

    ep1 = episode(env, sid, 1)
    assert ep1.script_revision == 1 and ep1.validation["ok"] and ep1.title == "Roteiro 1"
    # video-suggesting scene 4 is kept as the single hybrid video scene
    assert [s["visual_mode"] for s in ep1.script["scenes"]].count("video") == 1
    assert env.claude.calls.count("submit_episode_script") == 2 and env.claude.calls.count("submit_validation") == 2

    # re-running the tick or the tasks does not duplicate anything
    before = len(env.claude.calls)
    tasks.series_tick()
    assert episode(env, sid, 3).status == E.PLANNED
    assert tasks.script_episode(str(ep1.id))["status"] == "noop"
    assert tasks.validate_episode(str(ep1.id))["status"] == "noop"
    assert len(env.claude.calls) == before


def test_script_events_are_proposed_and_new_characters_uncommitted(env):
    intro = {"type": "introduce", "character_key": "novo", "from_status": None, "to_status": "alive", "description": "chega",
             "new_character": {"name": "Novo", "role": "minor", "description": "d", "visual_description": "v" * 90}}
    env.claude.script_factory = lambda n: make_script(n, characters_on_screen=("lia", "novo"), state_events=[
        intro, {"type": "status_change", "character_key": "tomas", "from_status": "alive", "to_status": "injured", "description": "x"}])
    sid = planned_series(env)
    start_series(env, sid)
    tasks.series_tick()
    ep1 = episode(env, sid, 1)
    assert ep1.status == E.AWAITING_SCRIPT_APPROVAL
    events = q(env, lambda db: db.query(StoryCharacterEvent).filter_by(episode_id=ep1.id).all())
    assert len(events) == 2 and all(e.state == CharacterEventState.PROPOSED for e in events)
    novo = q(env, lambda db: db.query(StoryCharacter).filter_by(series_id=sid, key="novo").one())
    assert novo.committed is False and novo.introduced_in_episode == 1
    # applied status of existing characters is untouched until approval
    tomas = q(env, lambda db: db.query(StoryCharacter).filter_by(series_id=sid, key="tomas").one())
    assert tomas.status == CharacterStatus.ALIVE

    # re-scripting the same episode discards proposals and does not duplicate the new character
    db = env.sf()
    transition(db, db.get(StoryEpisode, ep1.id), E.STALE, E.AWAITING_SCRIPT_APPROVAL)
    transition(db, db.get(StoryEpisode, ep1.id), E.SCRIPTING, E.STALE)
    db.commit()
    db.close()
    tasks.script_episode(str(ep1.id))
    assert q(env, lambda db: db.query(StoryCharacter).filter_by(series_id=sid, key="novo").count()) == 1
    live = q(env, lambda db: db.query(StoryCharacterEvent).filter_by(episode_id=ep1.id, state=CharacterEventState.PROPOSED).count())
    assert live == 2


def test_dead_character_in_scene_is_rescripted_then_needs_attention(env):
    env.claude.script_factory = lambda n: make_script(n, characters_on_screen=("lia", "vera"))
    sid = planned_series(env)
    db = env.sf()
    db.query(StoryCharacter).filter_by(series_id=sid, key="vera").one().status = CharacterStatus.DEAD
    db.commit()
    db.close()
    start_series(env, sid)
    tasks.series_tick()
    ep1 = episode(env, sid, 1)
    assert ep1.status == E.NEEDS_ATTENTION and ep1.validation_attempts == 3
    assert "dead_character_appears" in [i["code"] for i in ep1.validation["issues"]]
    assert env.claude.calls.count("submit_episode_script") == 3
    assert "submit_validation" not in env.claude.calls  # deterministic blockers short-circuit the LLM review


def test_no_script_approval_goes_straight_to_media(env):
    env.mp.setattr(tasks.generate_episode_media, "delay", lambda *a: None)
    sid = planned_series(env, require_script_approval=False)
    start_series(env, sid)
    tasks.series_tick()
    assert episode(env, sid, 1).status == E.GENERATING_MEDIA


# ---------------------------------------------------------------- media ----


def to_generating(env, sid, number=1):
    env.mp.setattr(tasks.submit_media_job, "delay", lambda *a: None)
    env.mp.setattr(tasks.maybe_assemble, "delay", lambda *a: None)
    start_series(env, sid)
    for _ in range(number):
        tasks.series_tick()
    approve_script(env, sid, number)
    return episode(env, sid, number)


def jobs(env, ep):
    return q(env, lambda db: db.query(StoryMediaJob).filter_by(episode_id=ep.id).all())


def test_generate_media_creates_one_job_per_scene_plus_tts_and_respects_hybrid(env):
    sid = planned_series(env)
    ep = to_generating(env, sid)
    rows = jobs(env, ep)
    kinds = sorted(j.kind.value for j in rows)
    assert kinds == ["image"] * 4 + ["tts", "video_clip"]
    assert all(j.status == MediaJobStatus.QUEUED for j in rows)
    assert {j.provider for j in rows} == {"fake_video", "fake_image", "fake_tts"}
    video = next(j for j in rows if j.kind == MediaJobKind.VIDEO_CLIP)
    assert video.params["duration"] in (6, 8)  # smallest allowed duration >= the scene's 6 s
    assert "Style:" in next(j for j in rows if j.kind == MediaJobKind.IMAGE).prompt  # prompt composed in code

    # idempotent: running again creates nothing new
    tasks.generate_episode_media(str(ep.id), "all")
    assert len(jobs(env, ep)) == 6


def test_economy_strategy_uses_only_images(env):
    sid = planned_series(env, visual_strategy="economy", video_provider=None)
    ep = to_generating(env, sid)
    assert sorted(j.kind.value for j in jobs(env, ep)) == ["image"] * 5 + ["tts"]


def test_series_budget_pauses_series(env):
    # LLM spend so far (plan + scripts, US$ 0.0x) already exceeds the 0.001 limit
    sid = planned_series(env, budget_limit_usd=Decimal("0.001"))
    ep = to_generating(env, sid)  # approve-script -> generate_episode_media checks the budget first
    series = series_of(env, sid)
    assert series.status == SeriesStatus.PAUSED and series.pause_reason == "series_budget_exceeded"
    assert jobs(env, ep) == [] and episode(env, sid, 1).status == E.GENERATING_MEDIA
    audit = q(env, lambda db: db.query(AuditLog).filter_by(action="series.auto_pause").one())
    assert audit.user_id is None and audit.details["reason"] == "series_budget_exceeded"
    # a paused series is skipped by the tick and by later generate calls
    assert tasks.generate_episode_media(str(ep.id), "all")["status"] == "noop"


def test_user_monthly_budget_pauses_series(env):
    db = env.sf()
    db.get(type(env.user), env.user.id).monthly_ai_budget_usd = Decimal("0.001")
    db.commit()
    db.close()
    sid = planned_series(env)
    ep = to_generating(env, sid)
    assert series_of(env, sid).pause_reason == "user_ai_budget_exceeded"
    assert jobs(env, ep) == []


def test_submit_respects_semaphore_limit(env):
    sid = planned_series(env, visual_strategy="economy", video_provider=None)
    ep = to_generating(env, sid)
    image_jobs = [j for j in jobs(env, ep) if j.kind == MediaJobKind.IMAGE]
    store = semaphore.get_store()
    limit = semaphore.inflight_limit("fake_image")
    for i in range(limit):  # every slot taken by other (long-running) jobs
        assert store.acquire(semaphore.slot_name("fake_image"), f"other-{i}", limit, 600)
    outbox = tasks._Outbox()
    assert tasks.submit_media_job_core(str(image_jobs[0].id), outbox) == "busy"
    assert q(env, lambda db: db.get(StoryMediaJob, image_jobs[0].id)).status == MediaJobStatus.QUEUED
    assert CALL_LOG.calls == []  # the provider was never touched
    store.release(semaphore.slot_name("fake_image"), "other-0")
    assert tasks.submit_media_job_core(str(image_jobs[0].id), outbox) == "done"
    assert store.count(semaphore.slot_name("fake_image")) == limit - 1  # its own slot was released
    job = q(env, lambda db: db.get(StoryMediaJob, image_jobs[0].id))
    assert job.status == MediaJobStatus.SUCCEEDED and job.storage_key in env.s3.objects
    assert job.storage_key.startswith(f"users/{env.user.id}/story/")
    # a second submit of the same (already succeeded) job is a no-op and costs nothing extra
    assert tasks.submit_media_job_core(str(image_jobs[0].id), outbox) == "noop"
    assert len([c for c in CALL_LOG.calls if c[0] == "image.generate"]) == 1


def test_provider_safety_refusal_rescripts_once_then_needs_attention(env):
    sid = planned_series(env, visual_strategy="economy", video_provider=None)
    ep = to_generating(env, sid)
    image_job = next(j for j in jobs(env, ep) if j.kind == MediaJobKind.IMAGE)
    from app.worker.genmedia.base import ProviderError

    class Refusing:
        max_reference_images = 0
        supports_reference_images = False

        def generate(self, *a, **k):
            raise ProviderError("blocked by safety", safety=True)

    env.mp.setattr("app.worker.story.tasks.registry.get_provider_for", lambda kind, pid: Refusing())
    env.mp.setattr(tasks.script_episode, "delay", lambda *a: None)
    assert tasks.submit_media_job_core(str(image_job.id), tasks._Outbox()) == "failed"
    ep_row = episode(env, sid, 1)
    assert ep_row.status == E.SCRIPTING and ep_row.validation["media_retries"] == 1
    assert ep_row.validation["issues"][0]["code"] == "unsafe_content"
    # second refusal (after a new script reached generating_media again) -> needs_attention
    db = env.sf()
    row = db.get(StoryEpisode, ep.id)
    row.status = E.GENERATING_MEDIA
    job = db.get(StoryMediaJob, image_job.id)
    job.status = MediaJobStatus.QUEUED
    job.attempts = 0
    db.commit()
    db.close()
    assert tasks.submit_media_job_core(str(image_job.id), tasks._Outbox()) == "failed"
    assert episode(env, sid, 1).status == E.NEEDS_ATTENTION


def test_retryable_provider_error_requeues_up_to_three_attempts(env):
    sid = planned_series(env, visual_strategy="economy", video_provider=None)
    ep = to_generating(env, sid)
    image_job = next(j for j in jobs(env, ep) if j.kind == MediaJobKind.IMAGE)
    from app.worker.genmedia.base import ProviderError

    class Flaky:
        max_reference_images = 0
        supports_reference_images = False

        def generate(self, *a, **k):
            raise ProviderError("rate limited", retryable=True, retry_after=5)

    env.mp.setattr("app.worker.story.tasks.registry.get_provider_for", lambda kind, pid: Flaky())
    outbox = tasks._Outbox()
    for expected in ("retry", "retry", "failed"):
        assert tasks.submit_media_job_core(str(image_job.id), outbox) == expected
    assert [item[2] for item in outbox.items] == [5.0, 5.0]  # retried with the provider's retry_after
    assert q(env, lambda db: db.get(StoryMediaJob, image_job.id)).status == MediaJobStatus.FAILED
    assert episode(env, sid, 1).status == E.NEEDS_ATTENTION


# ----------------------------------------------------------------- tick ----


def test_tick_shifts_agenda_when_publish_time_passed(env):
    from datetime import datetime, timezone

    env.mp.setattr(tasks.script_episode, "delay", lambda *a: None)
    sid = planned_series(env)
    start_series(env, sid, offset_days=-1)  # ep1's publish moment was yesterday
    today = datetime.now(timezone.utc).date()
    before = {e.number: e.target_date for e in q(env, lambda db: db.query(StoryEpisode).filter_by(series_id=sid).all())}
    assert before[1] == today - timedelta(days=1)
    tasks.series_tick()
    after = {e.number: e.target_date for e in q(env, lambda db: db.query(StoryEpisode).filter_by(series_id=sid).all())}
    assert all(after[n] == before[n] + timedelta(days=1) for n in before)
    audit = q(env, lambda db: db.query(AuditLog).filter_by(action="series.agenda_shift").all())
    assert len(audit) == 1 and audit[0].user_id is None and audit[0].details["days"] == 1
    tasks.series_tick()  # idempotent: the new moment is in the future
    assert len(q(env, lambda db: db.query(AuditLog).filter_by(action="series.agenda_shift").all())) == 1


def test_tick_does_not_shift_scheduled_episodes_and_completes_series(env):
    sid = planned_series(env)
    start_series(env, sid)
    db = env.sf()
    for ep in db.query(StoryEpisode).filter_by(series_id=sid):
        ep.status = E.PUBLISHED
    db.commit()
    db.close()
    tasks.series_tick()
    assert series_of(env, sid).status == SeriesStatus.COMPLETED


def test_tick_skips_paused_series_and_respects_lock(env):
    env.mp.setattr(tasks.script_episode, "delay", lambda *a: None)
    sid = planned_series(env)
    start_series(env, sid)
    db = env.sf()
    db.get(StorySeries, sid).status = SeriesStatus.PAUSED
    db.commit()
    db.close()
    tasks.series_tick()
    assert episode(env, sid, 1).status == E.PLANNED

    token = semaphore.get_store().try_lock("series_tick", 60)
    assert tasks.series_tick() == {"status": "locked"}
    semaphore.get_store().unlock("series_tick", token)


def test_tick_recovers_stuck_stages_and_jobs(env):
    from datetime import datetime, timezone

    started = []
    for name in ("script_episode", "validate_episode", "generate_episode_media", "assemble_episode", "poll_media_job"):
        env.mp.setattr(getattr(tasks, name), "delay", lambda *a, _n=name: started.append((_n, a[0])))
    env.mp.setattr(tasks.script_episode, "apply_async", lambda **k: started.append(("script_episode", k["args"][0])))
    sid = planned_series(env)
    start_series(env, sid, offset_days=30)  # nothing eligible for the horizon
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    db = env.sf()
    eps = {e.number: e for e in db.query(StoryEpisode).filter_by(series_id=sid)}
    for n, status in ((1, E.SCRIPTING), (2, E.VALIDATING), (3, E.GENERATING_MEDIA), (4, E.ASSEMBLING)):
        eps[n].status = status
        eps[n].updated_at = old
    job = StoryMediaJob(owner_id=env.user.id, episode_id=eps[3].id, kind=MediaJobKind.VIDEO_CLIP, provider="fake_video",
                        status=MediaJobStatus.RUNNING, idempotency_key="k" * 64, next_poll_at=old, submitted_at=old)
    db.add(job)
    db.commit()
    ids = {n: str(e.id) for n, e in eps.items()}
    job_id = str(job.id)
    db.close()
    tasks.series_tick()
    assert ("script_episode", ids[1]) in started and ("validate_episode", ids[2]) in started
    assert ("generate_episode_media", ids[3]) in started and ("assemble_episode", ids[4]) in started
    assert ("poll_media_job", job_id) in started


# ------------------------------------------------- full flow (ffmpeg) ----


def probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=width,height,codec_type:format=duration", "-of", "json", path],
        capture_output=True, check=True,
    ).stdout
    return json.loads(out)


@pytest.mark.integration
@needs_ffmpeg
def test_full_flow_plan_to_pending_review_with_fakes(env):
    sid = planned_series(env)
    start_series(env, sid)
    tasks.series_tick()
    ep1 = episode(env, sid, 1)
    assert ep1.status == E.AWAITING_SCRIPT_APPROVAL

    approve_script(env, sid, 1)  # eager: generate -> submit/poll -> maybe_assemble -> assemble -> metadata

    ep1 = episode(env, sid, 1)
    assert ep1.status == E.PENDING_REVIEW, ep1.error
    clip = q(env, lambda db: db.query(Clip).filter_by(episode_id=ep1.id).one())
    assert clip.synthetic_media is True and clip.status.value == "pending_review" and clip.job_id is None
    assert clip.owner_id == env.user.id and clip.storage_key.startswith(f"users/{env.user.id}/clips/{clip.id}/")
    assert 27.0 <= clip.end_s <= 33.0 and clip.transcript.count(" ") >= 60
    assert clip.thumbnail_key in env.s3.objects and clip.subtitles_key in env.s3.objects

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "final.mp4")
        with open(path, "wb") as fh:
            fh.write(env.s3.objects[clip.storage_key])
        info = probe(path)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert (video["width"], video["height"]) == (1080, 1920)
    assert any(s["codec_type"] == "audio" for s in info["streams"])
    assert 27.0 <= float(info["format"]["duration"]) <= 33.0

    rows = jobs(env, ep1)
    assert all(j.status == MediaJobStatus.SUCCEEDED for j in rows)
    assert sum(1 for j in rows if j.kind == MediaJobKind.VIDEO_CLIP) <= 1  # hybrid, max_video_scenes_per_episode = 1
    assert sum(1 for j in rows if j.kind == MediaJobKind.IMAGE) == 4

    meta = q(env, lambda db: {m.platform.value: m for m in db.query(ClipMetadata).filter_by(clip_id=clip.id)})
    assert meta["youtube"].title == "Maré Alta — Ep. 1: Roteiro 1"

    # re-execution is idempotent: no new jobs, usage events or clips
    n_jobs = len(rows)
    n_usage = q(env, lambda db: db.query(AiUsageEvent).count())
    total_cost = float(series_of(env, sid).cost_usd_total)
    db = env.sf()
    db.get(StoryEpisode, ep1.id).status = E.GENERATING_MEDIA  # as if the process died after the jobs finished
    db.commit()
    db.close()
    tasks.generate_episode_media(str(ep1.id), "all")
    assert episode(env, sid, 1).status == E.PENDING_REVIEW
    assert len(jobs(env, ep1)) == n_jobs
    assert q(env, lambda db: db.query(AiUsageEvent).count()) == n_usage
    assert float(series_of(env, sid).cost_usd_total) == pytest.approx(total_cost)
    assert q(env, lambda db: db.query(Clip).filter_by(episode_id=ep1.id).count()) == 1
    assert len([c for c in CALL_LOG.calls if c[0] == "tts.synthesize"]) == 1
    assert len([c for c in CALL_LOG.calls if c[0] == "image.generate"]) == 4


@pytest.mark.integration
@needs_ffmpeg
def test_full_video_strategy_makes_every_scene_a_video(env):
    sid = planned_series(env, visual_strategy="full_video")
    start_series(env, sid)
    tasks.series_tick()
    approve_script(env, sid, 1)
    ep1 = episode(env, sid, 1)
    assert ep1.status == E.PENDING_REVIEW, ep1.error
    assert sum(1 for j in jobs(env, ep1) if j.kind == MediaJobKind.VIDEO_CLIP) == 5


@pytest.mark.integration
@needs_ffmpeg
def test_narration_too_long_triggers_rescript(env):
    def long_script(n):
        script = make_script(n)
        for scene in script["scenes"]:
            scene["narration"] = " ".join(["palavra"] * 16)  # 80 words total
            scene["duration_s"] = 6.0
        return script

    env.claude.script_factory = long_script
    from app.worker.genmedia import fake_tts

    sid = planned_series(env)
    start_series(env, sid)
    tasks.series_tick()  # 80 words <= 85: the validator accepts the script
    assert episode(env, sid, 1).status == E.AWAITING_SCRIPT_APPROVAL
    # a TTS this slow narrates 80 words in ~44 s: atempo would exceed 1.08 -> narration_too_long
    env.mp.setattr(fake_tts, "WORDS_PER_SECOND", 1.8)
    env.mp.setattr(tasks.script_episode, "delay", lambda *a: None)  # observe the re-script request
    approve_script(env, sid, 1)
    ep1 = episode(env, sid, 1)
    assert ep1.status == E.SCRIPTING and ep1.validation["media_retries"] == 1
    assert ep1.validation["issues"][0]["code"] == "pacing_overload"

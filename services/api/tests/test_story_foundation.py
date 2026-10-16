"""Series IA foundation: state machine CAS, schemas, catalog/estimate,
resolve_clip_source, create_publications, quotas, elevenlabs test, batch
rejecting episode clips, providers/estimate routes."""
from __future__ import annotations

import urllib.error
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.clip_source import resolve_clip_source
from app.config import get_settings
from app.genmedia_catalog import estimate_episode_cost, get_provider, list_providers, price_usd
from app.models.clip import Clip, ClipStatus
from app.models.platform_account import AccountMode, PlatformAccount
from app.models.source import Source
from app.models.story import (
    AiUsageEvent,
    EpisodeStatus as E,
    SeriesStatus as S,
    StoryEpisode,
    StoryMediaJob,
    StorySeries,
)
from app.publishing import create_publications
from app.quotas import (
    ai_spend_month,
    assert_active_series_quota,
    assert_ai_budget,
    storage_used_bytes,
)
from app.story import schemas as story_schemas
from app.story.state import (
    EPISODE_TRANSITIONS,
    SERIES_TRANSITIONS,
    InvalidTransition,
    TransitionConflict,
    transition,
)
from app.models.user import User
from tests.factories import insert_account, insert_clip, insert_media_asset, insert_source


@pytest.fixture()
def fakes_on(monkeypatch):
    monkeypatch.setattr(get_settings(), "story_fake_providers_enabled", True)


def _series(session_factory, owner_id, source_id=None, **kw) -> uuid.UUID:
    db = session_factory()
    s = StorySeries(
        owner_id=owner_id,
        source_id=source_id or uuid.uuid4(),
        premise="p" * 60,
        publish_time="18:00",
        originality_attested_at=datetime.now(timezone.utc),
        **kw,
    )
    db.add(s)
    db.commit()
    sid = s.id
    db.close()
    return sid


def _episode(session_factory, owner_id, series_id, number=1, **kw) -> uuid.UUID:
    db = session_factory()
    ep = StoryEpisode(owner_id=owner_id, series_id=series_id, number=number, **kw)
    db.add(ep)
    db.commit()
    eid = ep.id
    db.close()
    return eid


# ------------------------------------------------------------ state.py ----


def test_transition_tables_are_consistent():
    for table in (SERIES_TRANSITIONS, EPISODE_TRANSITIONS):
        for src, dsts in table.items():
            assert src not in dsts
    assert set(SERIES_TRANSITIONS) == set(S)
    assert set(EPISODE_TRANSITIONS) == set(E)
    assert not SERIES_TRANSITIONS[S.CANCELED] and not SERIES_TRANSITIONS[S.COMPLETED]
    assert not EPISODE_TRANSITIONS[E.PUBLISHED]
    assert E.STALE in EPISODE_TRANSITIONS[E.PENDING_REVIEW]
    assert E.CANCELED in EPISODE_TRANSITIONS[E.SCHEDULED]


def test_series_transition_valid_and_extra_fields(session_factory, user):
    sid = _series(session_factory, user.id)
    db = session_factory()
    s = db.get(StorySeries, sid)
    transition(db, s, S.PLANNED, S.PLANNING)
    assert s.status == S.PLANNED
    transition(db, s, S.ACTIVE, S.PLANNED)
    transition(db, s, S.PAUSED, [S.ACTIVE], pause_reason="user")
    db.commit()
    db.refresh(s)
    assert (s.status, s.pause_reason) == (S.PAUSED, "user")
    db.close()


def test_series_transition_invalid_raises(session_factory, user):
    sid = _series(session_factory, user.id)
    db = session_factory()
    s = db.get(StorySeries, sid)
    with pytest.raises(InvalidTransition):
        transition(db, s, S.COMPLETED, S.PLANNING)
    db.refresh(s)
    assert s.status == S.PLANNING
    db.close()


def test_episode_transition_conflict_when_not_in_expected(session_factory, user):
    sid = _series(session_factory, user.id)
    eid = _episode(session_factory, user.id, sid)
    db = session_factory()
    ep = db.get(StoryEpisode, eid)
    with pytest.raises(TransitionConflict):
        transition(db, ep, E.VALIDATING, E.SCRIPTING)  # actually PLANNED
    transition(db, ep, E.SCRIPTING, E.PLANNED)
    assert ep.status == E.SCRIPTING
    db.close()


def test_episode_cas_two_sessions_only_one_wins(session_factory, user):
    sid = _series(session_factory, user.id)
    eid = _episode(session_factory, user.id, sid, status=E.GENERATING_MEDIA)
    db1, db2 = session_factory(), session_factory()
    ep1, ep2 = db1.get(StoryEpisode, eid), db2.get(StoryEpisode, eid)
    transition(db1, ep1, E.ASSEMBLING, E.GENERATING_MEDIA)
    db1.commit()
    with pytest.raises(TransitionConflict):
        transition(db2, ep2, E.ASSEMBLING, E.GENERATING_MEDIA)
    db1.close()
    db2.close()


def test_episode_multiple_expected(session_factory, user):
    sid = _series(session_factory, user.id)
    eid = _episode(session_factory, user.id, sid, status=E.REJECTED)
    db = session_factory()
    ep = db.get(StoryEpisode, eid)
    transition(db, ep, E.SCRIPTING, (E.REJECTED, E.NEEDS_ATTENTION, E.STALE))
    assert ep.status == E.SCRIPTING
    db.close()


# ------------------------------------------------------------- schemas ----


def _scene(i):
    return {"index": i, "duration_s": 6, "narration": "x", "visual_prompt": "a cat", "visual_mode": "image"}


def test_script_schema_scene_bounds():
    base = {"number": 1, "title": "t", "on_screen_title": "t", "cliffhanger": "c"}
    ok = story_schemas.EpisodeScript.model_validate({**base, "scenes": [_scene(i) for i in range(3)]})
    assert len(ok.scenes) == 3
    with pytest.raises(ValidationError):
        story_schemas.EpisodeScript.model_validate({**base, "scenes": [_scene(0)]})
    with pytest.raises(ValidationError):
        story_schemas.EpisodeScript.model_validate({**base, "scenes": [_scene(i) for i in range(7)]})
    bad = {**_scene(0), "visual_mode": "gif"}
    with pytest.raises(ValidationError):
        story_schemas.EpisodeScript.model_validate({**base, "scenes": [bad, _scene(1), _scene(2)]})


def test_tools_schema_shape():
    tools = story_schemas.all_tools()
    assert set(tools) == {"screen_premise", "submit_season_plan", "submit_episode_script", "submit_validation"}
    for t in tools.values():
        assert t["input_schema"]["type"] == "object" and t["description"]
    script_props = tools["submit_episode_script"]["input_schema"]["properties"]
    assert "scenes" in script_props
    assert "visual_mode" in str(tools["submit_episode_script"]["input_schema"])
    plan = tools["submit_season_plan"]["input_schema"]["properties"]["episodes"]
    assert plan["minItems"] == 20 and plan["maxItems"] == 20


def test_validation_report_parse():
    r = story_schemas.parse_tool_result(
        "submit_validation",
        {"ok": True, "scores": {"premise_fidelity": 0.9, "coherence": 0.8, "interest": 0.7, "outline_adherence": 1}},
    )
    assert r.ok and r.issues == []
    with pytest.raises(ValidationError):
        story_schemas.parse_tool_result(
            "submit_validation",
            {"ok": True, "scores": {"premise_fidelity": 2, "coherence": 0.8, "interest": 0.7, "outline_adherence": 1}},
        )


# ------------------------------------------------------ catalog/estimate ----


def test_fake_providers_hidden_unless_flag(monkeypatch):
    monkeypatch.setattr(get_settings(), "story_fake_providers_enabled", False)
    assert [p.id for p in list_providers("tts")] == ["elevenlabs"]
    assert get_provider("fake_tts") is None
    monkeypatch.setattr(get_settings(), "story_fake_providers_enabled", True)
    assert {p.id for p in list_providers("tts")} == {"fake_tts", "elevenlabs"}
    assert get_provider("fake_video", "video") is not None


def test_price_env_override(monkeypatch):
    spec = get_provider("elevenlabs")
    assert price_usd(spec) == 0.30
    monkeypatch.setenv("GENMEDIA_PRICE_ELEVENLABS_USD", "0.5")
    assert price_usd(spec) == 0.5


def test_estimate_strategies_with_fakes(fakes_on, monkeypatch):
    monkeypatch.setenv("GENMEDIA_PRICE_FAKE_VIDEO_USD", "0.1")  # per second
    monkeypatch.setenv("GENMEDIA_PRICE_FAKE_IMAGE_USD", "0.04")
    monkeypatch.setenv("GENMEDIA_PRICE_FAKE_TTS_USD", "0")
    monkeypatch.setenv("STORY_ESTIMATE_LLM_PER_EPISODE_USD", "0.15")
    monkeypatch.setenv("STORY_ESTIMATE_LLM_PLAN_USD", "1")
    eco = estimate_episode_cost("economy", 1, "fake_video", "fake_image", "fake_tts")
    assert eco.breakdown == {"video": 0.0, "image": 0.2, "tts": 0.0, "llm": 0.15}
    assert eco.per_episode_usd == 0.35
    assert eco.season_usd == round(0.35 * 20 * 1.2 + 1, 4)
    hyb = estimate_episode_cost("hybrid", 1, "fake_video", "fake_image", "fake_tts")
    assert hyb.breakdown["video"] == 0.6 and hyb.breakdown["image"] == 0.16
    full = estimate_episode_cost("full_video", 1, "fake_video", None, "fake_tts")
    assert full.breakdown["video"] == 3.0 and full.breakdown["image"] == 0.0
    assert full.season_usd > hyb.season_usd > eco.season_usd


def test_estimate_missing_provider_and_unknown(fakes_on):
    r = estimate_episode_cost("hybrid", 1, None, "fake_image", "fake_tts")
    assert r.breakdown["video"] == 0.0
    assert any("vídeo" in a for a in r.assumptions)
    with pytest.raises(ValueError):
        estimate_episode_cost("hybrid", 1, None, "nope", "fake_tts")
    with pytest.raises(ValueError):
        estimate_episode_cost("wat", 1, None, "fake_image", "fake_tts")
    with pytest.raises(ValueError):  # tts id used as image provider
        estimate_episode_cost("economy", 0, None, "fake_tts", "fake_tts")


# ---------------------------------------------------- resolve_clip_source ----


def test_resolve_clip_source_both_origins(session_factory, user):
    src_legacy = insert_source(session_factory)
    asset = insert_media_asset(session_factory, src_legacy)
    legacy_clip = insert_clip(session_factory, media_asset_id=asset)
    src_ai = insert_source(session_factory, license_type="ai_generated")
    sid = _series(session_factory, user.id, source_id=src_ai)
    eid = _episode(session_factory, user.id, sid)
    db = session_factory()
    ep_clip = Clip(owner_id=user.id, episode_id=eid, start_s=0, end_s=30, synthetic_media=True)
    orphan = Clip(owner_id=user.id, episode_id=uuid.uuid4(), start_s=0, end_s=30)
    db.add_all([ep_clip, orphan])
    db.commit()
    assert resolve_clip_source(db, db.get(Clip, legacy_clip)).id == src_legacy
    assert resolve_clip_source(db, ep_clip).id == src_ai
    assert resolve_clip_source(db, orphan) is None
    db.close()


# ------------------------------------------------- create_publications ----


def _episode_clip(session_factory, user, platforms="", status=ClipStatus.APPROVED, license_type="ai_generated"):
    src = insert_source(session_factory, license_type=license_type, allowed_platforms=platforms, monetization_allowed=True)
    sid = _series(session_factory, user.id, source_id=src)
    eid = _episode(session_factory, user.id, sid)
    db = session_factory()
    clip = Clip(owner_id=user.id, episode_id=eid, start_s=0, end_s=30, status=status, synthetic_media=True)
    db.add(clip)
    db.commit()
    cid = clip.id
    db.close()
    return cid


def test_create_publications_synthetic_and_after(session_factory, user):
    cid = _episode_clip(session_factory, user)
    manual = insert_account(session_factory, platform="youtube", mode=AccountMode.MANUAL)
    oauth = insert_account(
        session_factory,
        platform="youtube",
        mode=AccountMode.OAUTH,
        posting_windows=[{"days": [0, 1, 2, 3, 4, 5, 6], "start": "00:00", "end": "23:59"}],
    )
    after = datetime.now(timezone.utc) + timedelta(days=3)
    db = session_factory()
    clip = db.get(Clip, cid)
    pubs = create_publications(
        db,
        owner_id=user.id,
        pairs=[(clip, db.get(PlatformAccount, manual)), (clip, db.get(PlatformAccount, oauth))],
        schedule="auto",
        privacy="public",
        actor_id=user.id,
        audit_details={"as_user": "x"},
        after=after,
    )
    db.commit()
    by_status = {p.status.value: p for p in pubs}
    assert set(by_status) == {"exported", "scheduled"}
    assert all(p.synthetic_media for p in pubs)
    sched = by_status["scheduled"].scheduled_at
    if sched.tzinfo is None:
        sched = sched.replace(tzinfo=timezone.utc)
    assert sched >= after
    db.close()


def test_create_publications_after_raises_now_and_explicit(session_factory, user):
    cid = _episode_clip(session_factory, user)
    oauth = insert_account(session_factory, platform="youtube", mode=AccountMode.OAUTH)
    after = datetime.now(timezone.utc) + timedelta(days=2)
    db = session_factory()
    clip, acc = db.get(Clip, cid), db.get(PlatformAccount, oauth)
    [p_now] = create_publications(
        db, owner_id=user.id, pairs=[(clip, acc)], schedule="now", privacy=None, actor_id=user.id, after=after
    )
    [p_exp] = create_publications(
        db,
        owner_id=user.id,
        pairs=[(clip, acc)],
        schedule=(datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        privacy=None,
        actor_id=user.id,
        after=after,
    )
    for p in (p_now, p_exp):
        t = p.scheduled_at if p.scheduled_at.tzinfo else p.scheduled_at.replace(tzinfo=timezone.utc)
        assert t == after
    db.close()


def test_create_publications_gate_blocks_and_flag_param(session_factory, user):
    # ai_generated source whose allowed_platforms doesn't include the account's platform
    # allowed_platforms round-trips as a raw string on sqlite: "x" never contains the account platform
    cid = _episode_clip(session_factory, user, platforms="x")
    acc = insert_account(session_factory, platform="youtube", mode=AccountMode.MANUAL)
    # legacy (non-synthetic) clip + explicit synthetic_media=True param
    src = insert_source(session_factory)
    legacy = insert_clip(session_factory, media_asset_id=insert_media_asset(session_factory, src))
    db = session_factory()
    [blocked] = create_publications(
        db, owner_id=user.id, pairs=[(db.get(Clip, cid), db.get(PlatformAccount, acc))],
        schedule="auto", privacy=None, actor_id=user.id,
    )
    assert blocked.status.value == "blocked"
    [forced] = create_publications(
        db, owner_id=user.id, pairs=[(db.get(Clip, legacy), db.get(PlatformAccount, acc))],
        schedule="auto", privacy=None, actor_id=user.id, synthetic_media=True,
    )
    [plain] = create_publications(
        db, owner_id=user.id, pairs=[(db.get(Clip, legacy), db.get(PlatformAccount, acc))],
        schedule="auto", privacy=None, actor_id=user.id,
    )
    assert forced.synthetic_media is True and plain.synthetic_media is False
    db.close()


def test_batch_rejects_episode_clip(logged_in_client, session_factory, user):
    cid = _episode_clip(session_factory, user)
    acc = insert_account(session_factory, platform="youtube")
    resp = logged_in_client.post(
        "/api/publications/batch", json={"clip_ids": [str(cid)], "account_ids": [str(acc)]}
    )
    assert resp.status_code == 422


def test_clips_api_with_episode_clip(logged_in_client, session_factory, user):
    cid = _episode_clip(session_factory, user)
    body = logged_in_client.get(f"/api/clips/{cid}").json()
    assert body["job_id"] is None and body["media_asset_id"] is None
    assert body["synthetic_media"] is True and body["episode_number"] == 1 and body["series_id"]
    [item] = [c for c in logged_in_client.get("/api/clips").json() if c["id"] == str(cid)]
    assert item["episode_id"] == body["episode_id"]
    # lifecycle-managed: direct edits are refused
    assert logged_in_client.patch(f"/api/clips/{cid}", json={"status": "rejected"}).status_code == 409
    assert logged_in_client.post("/api/clips/bulk", json={"ids": [str(cid)], "action": "approve"}).status_code == 409
    assert logged_in_client.get("/api/dashboard/summary").status_code == 200
    assert logged_in_client.post(f"/api/clips/{cid}/metadata/regenerate").status_code == 200


# ---------------------------------------------------------------- quotas ----


def _user(session_factory, user_id) -> User:
    db = session_factory()
    u = db.get(User, user_id)
    db.expunge(u)
    db.close()
    return u


def test_active_series_quota(session_factory, user):
    db = session_factory()
    u = db.get(User, user.id)
    u.max_active_series = 1
    db.commit()
    assert_active_series_quota(db, u, u.id)  # none yet
    for status in (S.PLAN_FAILED, S.CANCELED, S.COMPLETED):
        _series(session_factory, user.id, status=status)
    assert_active_series_quota(db, u, u.id)  # finished ones don't count
    _series(session_factory, user.id, status=S.PAUSED)
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        assert_active_series_quota(db, u, u.id)
    assert exc.value.status_code == 409 and exc.value.detail["code"] == "active_series_limit"
    u.is_admin = True
    assert_active_series_quota(db, u, u.id)  # admin exempt
    u.is_admin = False
    u.max_active_series = None
    assert_active_series_quota(db, u, u.id)  # unlimited
    db.rollback()
    db.close()


def test_ai_budget_and_spend_month(session_factory, user):
    from fastapi import HTTPException

    sid = _series(session_factory, user.id)
    db = session_factory()
    now = datetime.now(timezone.utc)
    db.add_all(
        [
            AiUsageEvent(owner_id=user.id, series_id=sid, kind="llm", provider="anthropic", cost_usd=Decimal("1.50"), created_at=now),
            AiUsageEvent(owner_id=user.id, series_id=sid, kind="tts", provider="elevenlabs", cost_usd=Decimal("0.50"), created_at=now),
            AiUsageEvent(owner_id=user.id, series_id=sid, kind="llm", provider="anthropic", cost_usd=Decimal("9"), created_at=now - timedelta(days=62)),
        ]
    )
    db.commit()
    assert ai_spend_month(db, user.id) == Decimal("2.0")
    u = db.get(User, user.id)
    u.monthly_ai_budget_usd = Decimal("2.50")
    assert_ai_budget(db, u, u.id, 0.5)
    with pytest.raises(HTTPException) as exc:
        assert_ai_budget(db, u, u.id, 0.51)
    assert exc.value.detail["code"] == "user_ai_budget_exceeded"
    u.is_admin = True
    assert_ai_budget(db, u, u.id, 100)
    db.rollback()
    db.close()


def test_storage_counts_story_media_jobs(session_factory, user):
    sid = _series(session_factory, user.id)
    eid = _episode(session_factory, user.id, sid)
    db = session_factory()
    base = storage_used_bytes(db, user.id)
    db.add(
        StoryMediaJob(
            owner_id=user.id, episode_id=eid, kind="image", provider="fake_image", idempotency_key="k1", size_bytes=1234
        )
    )
    db.commit()
    assert storage_used_bytes(db, user.id) == base + 1234
    db.close()


def test_usage_and_admin_users_expose_new_quotas(logged_in_client, admin_client, session_factory, user):
    sid = _series(session_factory, user.id)
    db = session_factory()
    db.add(AiUsageEvent(owner_id=user.id, series_id=sid, kind="llm", provider="anthropic", cost_usd=Decimal("0.25")))
    db.commit()
    db.close()
    usage = logged_in_client.get("/api/me/usage").json()
    assert usage["active_series"] == 1 and usage["ai_spend_month_usd"] == 0.25
    assert "max_active_series" in usage and "monthly_ai_budget_usd" in usage

    created = admin_client.post(
        "/api/admin/users",
        json={"username": "novo1", "password": "senha-longa-123", "max_active_series": 3, "monthly_ai_budget_usd": 12.5},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["max_active_series"] == 3 and body["monthly_ai_budget_usd"] == 12.5
    assert body["usage"]["max_active_series"] == 3
    patched = admin_client.patch(
        f"/api/admin/users/{body['id']}", json={"max_active_series": None, "monthly_ai_budget_usd": 7}
    )
    assert patched.json()["max_active_series"] is None and patched.json()["monthly_ai_budget_usd"] == 7
    # defaults from settings when omitted
    d = admin_client.post("/api/admin/users", json={"username": "novo2", "password": "senha-longa-123"}).json()
    assert d["max_active_series"] == 1 and d["monthly_ai_budget_usd"] is None


# ------------------------------------------------------------ elevenlabs ----


class _Resp:
    def __init__(self, status=200):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_elevenlabs_integration_registered_and_test(admin_client, monkeypatch):
    body = admin_client.get("/api/admin/integrations/elevenlabs").json()
    assert body["redirect_uri"] is None
    keys = {f["key"]: f for f in body["fields"]}
    assert keys["api_key"]["secret"] and keys["api_key"]["required"] and not keys["model_id"]["required"]
    assert admin_client.get("/api/admin/integrations/openai").json()["redirect_uri"] is None

    monkeypatch.setattr(get_settings(), "elevenlabs_api_key", None)
    r = admin_client.post("/api/admin/integrations/elevenlabs/test").json()
    assert r["ok"] is False and "não configurada" in r["message"]

    admin_client.put("/api/admin/integrations/elevenlabs", json={"values": {"api_key": "xi-secret-key-1234"}})
    seen = {}

    def _ok(req, timeout=10):
        seen["url"], seen["key"] = req.full_url, req.get_header("Xi-api-key")
        return _Resp(200)

    monkeypatch.setattr("app.routers.admin_integrations.urllib.request.urlopen", _ok)
    r = admin_client.post("/api/admin/integrations/elevenlabs/test").json()
    assert r["ok"] is True
    assert seen == {"url": "https://api.elevenlabs.io/v1/user", "key": "xi-secret-key-1234"}

    def _401(req, timeout=10):
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", hdrs=None, fp=None)

    monkeypatch.setattr("app.routers.admin_integrations.urllib.request.urlopen", _401)
    r = admin_client.post("/api/admin/integrations/elevenlabs/test").json()
    assert r["ok"] is False and "inválida" in r["message"]


# ------------------------------------------------------ providers routes ----


def test_providers_and_estimate_routes(logged_in_client, client, fakes_on, monkeypatch):
    monkeypatch.setattr(get_settings(), "elevenlabs_api_key", None)
    body = logged_in_client.get("/api/series/providers").json()
    assert {p["id"] for p in body["video"]} == {"fake_video"}
    assert {p["id"] for p in body["image"]} == {"fake_image"}
    tts = {p["id"]: p for p in body["tts"]}
    assert set(tts) == {"fake_tts", "elevenlabs"}
    assert tts["fake_tts"]["configured"] is True and tts["elevenlabs"]["configured"] is False
    assert tts["elevenlabs"]["word_timestamps"] is True and tts["elevenlabs"]["est_cost_unit"] == "per_1k_chars"
    assert body["video"][0]["allowed_durations"] == [4, 5, 6, 8, 10]

    ok = logged_in_client.post(
        "/api/series/estimate",
        json={
            "visual_strategy": "hybrid",
            "max_video_scenes_per_episode": 1,
            "video_provider": "fake_video",
            "image_provider": "fake_image",
            "tts_provider": "elevenlabs",
        },
    )
    assert ok.status_code == 200
    e = ok.json()
    assert set(e["breakdown"]) == {"video", "image", "tts", "llm"}
    assert e["season_usd"] > e["per_episode_usd"] > 0 and e["assumptions"]
    bad = logged_in_client.post("/api/series/estimate", json={"image_provider": "nope", "tts_provider": "fake_tts"})
    assert bad.status_code == 422
    assert logged_in_client.post("/api/series/estimate", json={"visual_strategy": "x"}).status_code == 422
    assert logged_in_client.post("/api/series/estimate", json={"foo": 1}).status_code == 422


def test_series_routes_require_auth(client):
    assert client.get("/api/series/providers").status_code == 401
    assert client.post("/api/series/estimate", json={}).status_code == 401

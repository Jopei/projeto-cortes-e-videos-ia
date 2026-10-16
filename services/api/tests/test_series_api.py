"""Series IA API (etapa 2b): routes, business error codes, state machine via
API (Celery `send_task` mocked: names/args/queue are the contract with the
worker), episode approval -> publications through the rights gate, character
event apply/revert, stale propagation, budgets, scoping."""
from __future__ import annotations

import io
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from app.config import get_settings
from app.models.audit_log import AuditLog
from app.models.clip import Clip, ClipStatus
from app.models.platform_account import AccountMode
from app.models.publication import Publication
from app.models.source import Source
from app.models.story import (
    AiUsageEvent,
    CharacterEventState,
    CharacterEventType,
    CharacterRole,
    CharacterStatus,
    EpisodeStatus as E,
    SeriesStatus as S,
    StoryCharacter,
    StoryCharacterEvent,
    StoryEpisode,
    StorySeries,
)
from app.models.user import User
from app.story import lifecycle
from tests import factories
from tests.fake_s3 import FakeS3Client
from tests.factories import insert_account, insert_channel

TZ = ZoneInfo("America/Sao_Paulo")


@pytest.fixture(autouse=True)
def _fakes_on(monkeypatch):
    monkeypatch.setattr(get_settings(), "story_fake_providers_enabled", True)


@pytest.fixture(autouse=True)
def sent(monkeypatch):
    """Records every `celery_app.send_task` (never touches a broker)."""
    calls: list[dict] = []
    from app.worker.celery_app import celery_app

    def _send(name, args=None, kwargs=None, queue=None, **kw):
        calls.append({"name": name, "args": list(args or []), "queue": queue})

    monkeypatch.setattr(celery_app, "send_task", _send)
    return calls


@pytest.fixture()
def s3_fake():
    from app.main import app
    from app.storage import get_s3_client

    fake = FakeS3Client({})
    app.dependency_overrides[get_s3_client] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_s3_client, None)


def _payload(channel_id, **over) -> dict:
    body = {
        "premise": "Uma marinheira descobre que o farol da ilha esconde um portal para outra época. " * 2,
        "genre": "fantasia",
        "tone": "misterioso",
        "channel_id": str(channel_id),
        "video_provider": "fake_video",
        "image_provider": "fake_image",
        "tts_provider": "fake_tts",
        "tts_voice_id": "fake_voice_f",
        "publish_time": "18:00",
        "originality_attestation": True,
    }
    body.update(over)
    return body


def _create(client, channel_id, **over) -> dict:
    resp = client.post("/api/series", json=_payload(channel_id, **over))
    assert resp.status_code == 201, resp.text
    return resp.json()


_BIBLE = {
    "world": {"setting": "ilha", "era": "1890", "rules": [], "locations": []},
    "style_guide": {"narration_voice": "calma", "visual_style": "pintura a óleo", "banned_elements": []},
    "relationships": [],
    "season_arc": {"theme": "tempo", "central_question": "voltar?", "ending_summary": "sim"},
    "open_threads": [],
    "premise_core_elements": ["farol", "portal"],
}


def _plan(session_factory, series_id: str, *, status=S.PLANNED, characters=True):
    """What the worker's plan_series would leave behind: bible, characters, 20 episodes."""
    db = session_factory()
    series = db.get(StorySeries, uuid.UUID(series_id))
    series.status = status
    series.title = series.title or "O Farol"
    series.bible = {
        "world": {"setting": "ilha", "era": "1890", "rules": [], "locations": []},
        "style_guide": {"narration_voice": "calma", "visual_style": "pintura a óleo", "banned_elements": []},
        "relationships": [],
        "season_arc": {"theme": "tempo", "central_question": "voltar?", "ending_summary": "sim"},
        "open_threads": [],
        "premise_core_elements": ["farol", "portal"],
    }
    series.bible_version = 1
    if characters:
        for key, role in (("marina", CharacterRole.PROTAGONIST), ("velho", CharacterRole.SUPPORTING), ("sombra", CharacterRole.ANTAGONIST)):
            db.add(
                StoryCharacter(
                    series_id=series.id, key=key, name=key.title(), role=role, description="d" * 20,
                    visual_description="v" * 90, committed=True, introduced_in_episode=1,
                )
            )
    phases = ["setup"] * 3 + ["rising"] * 6 + ["midpoint"] * 2 + ["escalation"] * 6 + ["climax", "resolution", "resolution"]
    for n in range(1, 21):
        db.add(
            StoryEpisode(
                owner_id=series.owner_id, series_id=series.id, number=n, title=f"Ep {n}",
                arc_phase=phases[n - 1], outline={"summary": f"resumo {n}"},
            )
        )
    db.commit()
    db.close()


def _scene(i: int) -> dict:
    return {
        "index": i, "duration_s": 6, "narration": "palavra " * 14, "visual_prompt": "a lighthouse at dusk",
        "visual_mode": "image", "characters_on_screen": ["marina"],
    }


def _script(number: int, **over) -> dict:
    body = {
        "number": number, "title": f"Ep {number}", "on_screen_title": f"Ep {number}",
        "scenes": [_scene(0), _scene(1), _scene(2), _scene(3), _scene(4)],
        "cliffhanger": "e então...", "state_events": [],
    }
    body.update(over)
    return body


def _set_episode(session_factory, series_id: str, number: int, status: E, *, script=None, clip=False, **fields):
    db = session_factory()
    ep = db.query(StoryEpisode).filter(StoryEpisode.series_id == uuid.UUID(series_id), StoryEpisode.number == number).one()
    ep_id = ep.id
    ep.status = status
    if script is not None:
        ep.script = script
    for k, v in fields.items():
        setattr(ep, k, v)
    if clip:
        series = db.get(StorySeries, ep.series_id)
        db.add(
            Clip(
                owner_id=ep.owner_id, episode_id=ep.id, channel_id=series.channel_id, start_s=0, end_s=30,
                status=ClipStatus.PENDING_REVIEW, storage_key=f"users/x/clips/{ep.id}/video.mp4", synthetic_media=True,
            )
        )
    db.commit()
    db.close()
    return ep_id


def _episode(session_factory, series_id: str, number: int) -> StoryEpisode:
    db = session_factory()
    ep = db.query(StoryEpisode).filter(StoryEpisode.series_id == uuid.UUID(series_id), StoryEpisode.number == number).one()
    db.expunge(ep)
    db.close()
    return ep


def _add_event(session_factory, series_id, episode_id, number, character_key, to_status, from_status=None):
    db = session_factory()
    char = db.query(StoryCharacter).filter(StoryCharacter.series_id == uuid.UUID(series_id), StoryCharacter.key == character_key).one()
    db.add(
        StoryCharacterEvent(
            series_id=uuid.UUID(series_id), character_id=char.id, episode_id=episode_id, episode_number=number,
            type=CharacterEventType.STATUS_CHANGE, from_status=from_status, to_status=to_status,
            state=CharacterEventState.PROPOSED,
        )
    )
    db.commit()
    db.close()


def _char_status(session_factory, series_id, key) -> CharacterStatus:
    db = session_factory()
    st = db.query(StoryCharacter).filter(StoryCharacter.series_id == uuid.UUID(series_id), StoryCharacter.key == key).one().status
    db.close()
    return st


def _audit_actions(session_factory) -> list[AuditLog]:
    db = session_factory()
    rows = db.query(AuditLog).all()
    db.close()
    return rows


@pytest.fixture()
def channel(session_factory, user):
    return insert_channel(session_factory)


@pytest.fixture()
def manual_account(session_factory, channel):
    return insert_account(session_factory, platform="youtube", mode=AccountMode.MANUAL, channel_id=channel)


@pytest.fixture()
def planned(logged_in_client, session_factory, channel, sent):
    data = _create(logged_in_client, channel)
    _plan(session_factory, data["id"])
    sent.clear()
    return data["id"]


# ---------------------------------------------------------------- create ----


def test_create_series_makes_ai_source_and_enqueues_plan(logged_in_client, session_factory, channel, user, sent):
    data = _create(logged_in_client, channel, monetization_allowed=False)
    assert data["status"] == "planning"
    assert data["owner_id"] == str(user.id)
    assert data["progress"]["approved"] == 0
    assert data["estimated_cost"]["season_usd"] > 0
    assert data["require_script_approval"] is True and data["language"] == "pt-BR"
    assert sent == [{"name": "app.worker.story.tasks.plan_series", "args": [data["id"], None], "queue": "story"}]

    db = session_factory()
    series = db.get(StorySeries, uuid.UUID(data["id"]))
    source = db.get(Source, series.source_id)
    assert source.license_type.value == "ai_generated"
    assert source.attribution_text == "Conteúdo gerado com inteligência artificial."
    assert source.allowed_platforms == []
    assert source.monetization_allowed is False
    assert source.owner_id == user.id
    db.close()
    assert any(a.action == "series.create" for a in _audit_actions(session_factory))


@pytest.mark.parametrize(
    "over",
    [
        {"premise": "curta"},
        {"originality_attestation": False},
        {"unknown_field": 1},
        {"publish_time": "25:99"},
        {"timezone": "Mars/Base"},
        {"lead_days": 3},
        {"max_regenerations_per_episode": 11},
    ],
)
def test_create_series_validation_422(logged_in_client, channel, over):
    assert logged_in_client.post("/api/series", json=_payload(channel, **over)).status_code == 422


def test_create_series_unknown_provider_422(logged_in_client, channel):
    resp = logged_in_client.post("/api/series", json=_payload(channel, tts_provider="nope"))
    assert resp.status_code == 422 and resp.json()["detail"]["code"] == "unknown_provider"


def test_create_series_foreign_channel_404(logged_in_client, session_factory, other_user):
    other_channel = insert_channel(session_factory, owner_id=other_user.id)
    assert logged_in_client.post("/api/series", json=_payload(other_channel)).status_code == 404


def test_active_series_limit_409(logged_in_client, session_factory, channel, user):
    db = session_factory()
    db.get(User, user.id).max_active_series = 1
    db.commit()
    db.close()
    _create(logged_in_client, channel)
    resp = logged_in_client.post("/api/series", json=_payload(channel))
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "active_series_limit"


def test_patch_series_premise_is_422_and_fields_apply(logged_in_client, channel):
    sid = _create(logged_in_client, channel)["id"]
    assert logged_in_client.patch(f"/api/series/{sid}", json={"premise": "x" * 80}).status_code == 422
    resp = logged_in_client.patch(f"/api/series/{sid}", json={"privacy": "private", "budget_limit_usd": 5, "title": "Novo"})
    assert resp.status_code == 200
    assert resp.json()["privacy"] == "private" and resp.json()["budget_limit_usd"] == 5 and resp.json()["title"] == "Novo"
    assert logged_in_client.patch(f"/api/series/{sid}", json={"image_provider": "nope"}).status_code == 422


def test_get_detail_and_list_filters(logged_in_client, session_factory, channel, planned):
    detail = logged_in_client.get(f"/api/series/{planned}").json()
    assert detail["status"] == "planned"
    assert detail["bible"]["season_arc"]["theme"] == "tempo"
    assert [c["key"] for c in detail["characters"]] == ["marina", "velho", "sombra"] or len(detail["characters"]) == 3
    assert len(detail["episodes"]) == 20 and detail["episodes"][0]["number"] == 1
    assert detail["next_episode"]["number"] == 1
    assert "premise_core_elements" not in {k for k in detail if k != "bible"}
    assert len(logged_in_client.get("/api/series").json()) == 1
    assert len(logged_in_client.get(f"/api/series?status=planned&channel_id={channel}").json()) == 1
    assert logged_in_client.get("/api/series?status=active").json() == []
    assert len(logged_in_client.get(f"/api/series/{planned}/episodes").json()) == 20
    ep = logged_in_client.get(f"/api/series/{planned}/episodes/3").json()
    assert ep["number"] == 3 and ep["outline"]["summary"] == "resumo 3" and ep["media_jobs"] == []
    assert logged_in_client.get(f"/api/series/{planned}/episodes/99").status_code == 404


# ------------------------------------------------------- scoping (crit 9) ----


def test_other_user_gets_404_everywhere(other_logged_in_client, planned, session_factory):
    c = other_logged_in_client
    sid = planned
    cid = uuid.uuid4()
    assert c.get("/api/series").json() == []
    for method, path, body in [
        ("get", f"/api/series/{sid}", None),
        ("patch", f"/api/series/{sid}", {"title": "x"}),
        ("put", f"/api/series/{sid}/bible", {"bible_version": 1, "bible": _BIBLE}),
        ("patch", f"/api/series/{sid}/characters/{cid}", {"name": "x"}),
        ("get", f"/api/series/{sid}/characters/{cid}/reference-image", None),
        ("delete", f"/api/series/{sid}/characters/{cid}/reference-image", None),
        ("put", f"/api/series/{sid}/outline/1", {"title": "x"}),
        ("post", f"/api/series/{sid}/replan", {}),
        ("post", f"/api/series/{sid}/start", {}),
        ("post", f"/api/series/{sid}/pause", None),
        ("post", f"/api/series/{sid}/resume", None),
        ("post", f"/api/series/{sid}/cancel", {}),
        ("delete", f"/api/series/{sid}", None),
        ("get", f"/api/series/{sid}/episodes", None),
        ("get", f"/api/series/{sid}/episodes/1", None),
        ("post", f"/api/series/{sid}/episodes/1/approve", None),
        ("post", f"/api/series/{sid}/episodes/1/approve-script", None),
        ("post", f"/api/series/{sid}/episodes/1/reject", {}),
        ("post", f"/api/series/{sid}/episodes/1/unapprove", None),
        ("post", f"/api/series/{sid}/episodes/1/regenerate", {"scope": "script"}),
        ("get", f"/api/series/{sid}/costs", None),
    ]:
        resp = getattr(c, method)(path, **({"json": body} if body is not None else {}))
        assert resp.status_code == 404, (method, path, resp.status_code)


def test_admin_sees_all_and_as_user(admin_client, planned, user, admin_user):
    assert len(admin_client.get("/api/series").json()) == 1
    assert admin_client.get(f"/api/series/{planned}").status_code == 200
    assert admin_client.get(f"/api/series?as_user={admin_user.id}").json() == []
    assert len(admin_client.get(f"/api/series?as_user={user.id}").json()) == 1
    assert admin_client.get(f"/api/series/{planned}", headers={"X-As-User": str(admin_user.id)}).status_code == 404


def test_admin_as_user_create_audits_actor(admin_client, session_factory, user, admin_user):
    ch = insert_channel(session_factory, owner_id=user.id)
    resp = admin_client.post(f"/api/series?as_user={user.id}", json=_payload(ch))
    assert resp.status_code == 201 and resp.json()["owner_id"] == str(user.id)
    entry = [a for a in _audit_actions(session_factory) if a.action == "series.create"][0]
    assert entry.user_id == admin_user.id and entry.details["as_user"] == str(user.id)


def test_regular_user_as_user_is_ignored(logged_in_client, planned, admin_user):
    assert len(logged_in_client.get(f"/api/series?as_user={admin_user.id}").json()) == 1


# ------------------------------------------------------------------ start ----


def test_start_without_accounts_409(logged_in_client, planned):
    resp = logged_in_client.post(f"/api/series/{planned}/start", json={})
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "channel_without_accounts"


def test_start_provider_not_configured_422(logged_in_client, planned, manual_account):
    assert logged_in_client.patch(f"/api/series/{planned}", json={"tts_provider": "elevenlabs"}).status_code == 200
    resp = logged_in_client.post(f"/api/series/{planned}/start", json={})
    assert resp.status_code == 422 and resp.json()["detail"]["code"] == "provider_not_configured"


def test_start_sets_target_dates_and_allowed_platforms(logged_in_client, session_factory, planned, channel, manual_account):
    insert_account(session_factory, platform="tiktok", mode=AccountMode.MANUAL, channel_id=channel)
    expected_min = datetime.now(TZ).date() + timedelta(days=2)
    resp = logged_in_client.post(f"/api/series/{planned}/start", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "active" and body["start_date"] == expected_min.isoformat()
    eps = logged_in_client.get(f"/api/series/{planned}/episodes").json()
    assert eps[0]["target_date"] == expected_min.isoformat()
    assert eps[4]["target_date"] == (expected_min + timedelta(days=4)).isoformat()
    assert eps[19]["target_date"] == (expected_min + timedelta(days=19)).isoformat()
    db = session_factory()
    source = db.get(Source, db.get(StorySeries, uuid.UUID(planned)).source_id)
    assert sorted(source.allowed_platforms) == ["tiktok", "youtube"]
    db.close()
    # not PLANNED anymore
    again = logged_in_client.post(f"/api/series/{planned}/start", json={})
    assert again.status_code == 409 and again.json()["detail"]["code"] == "invalid_transition"


def test_start_date_minimum_and_explicit(logged_in_client, planned, manual_account):
    today = datetime.now(TZ).date()
    early = logged_in_client.post(f"/api/series/{planned}/start", json={"start_date": today.isoformat()})
    assert early.status_code == 422
    later = today + timedelta(days=10)
    ok = logged_in_client.post(f"/api/series/{planned}/start", json={"start_date": later.isoformat()})
    assert ok.status_code == 200 and ok.json()["start_date"] == later.isoformat()
    assert logged_in_client.get(f"/api/series/{planned}/episodes/2").json()["target_date"] == (later + timedelta(days=1)).isoformat()


def test_start_blocked_when_series_budget_spent(logged_in_client, session_factory, planned, manual_account):
    db = session_factory()
    s = db.get(StorySeries, uuid.UUID(planned))
    s.budget_limit_usd = Decimal("1")
    s.cost_usd_total = Decimal("1")
    db.commit()
    db.close()
    resp = logged_in_client.post(f"/api/series/{planned}/start", json={})
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "series_budget_exceeded"


def test_pause_resume_cancel(logged_in_client, planned, manual_account):
    assert logged_in_client.post(f"/api/series/{planned}/pause").status_code == 409  # still planned
    logged_in_client.post(f"/api/series/{planned}/start", json={})
    paused = logged_in_client.post(f"/api/series/{planned}/pause").json()
    assert paused["status"] == "paused" and paused["pause_reason"] == "user"
    resumed = logged_in_client.post(f"/api/series/{planned}/resume").json()
    assert resumed["status"] == "active" and resumed["pause_reason"] is None
    assert logged_in_client.post(f"/api/series/{planned}/resume").status_code == 409
    canceled = logged_in_client.post(f"/api/series/{planned}/cancel", json={}).json()
    assert canceled["status"] == "canceled"
    eps = logged_in_client.get(f"/api/series/{planned}/episodes").json()
    assert {e["status"] for e in eps} == {"canceled"}
    assert logged_in_client.post(f"/api/series/{planned}/cancel", json={}).status_code == 409


def test_resume_blocked_if_budget_still_exceeded(logged_in_client, session_factory, planned, manual_account):
    logged_in_client.post(f"/api/series/{planned}/start", json={})
    db = session_factory()
    s = db.get(StorySeries, uuid.UUID(planned))
    s.status = S.PAUSED
    s.pause_reason = "series_budget_exceeded"
    s.budget_limit_usd = Decimal("2")
    s.cost_usd_total = Decimal("3")
    db.commit()
    db.close()
    resp = logged_in_client.post(f"/api/series/{planned}/resume")
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "series_budget_exceeded"


def test_replan(logged_in_client, session_factory, planned, sent):
    resp = logged_in_client.post(f"/api/series/{planned}/replan", json={"instructions": "mais ação"})
    assert resp.status_code == 202 and resp.json()["status"] == "planning"
    assert sent == [{"name": "app.worker.story.tasks.plan_series", "args": [planned, "mais ação"], "queue": "story"}]
    # planning -> replan not allowed
    assert logged_in_client.post(f"/api/series/{planned}/replan", json={}).status_code == 409
    # instruction content never audited
    assert "mais ação" not in str([a.details for a in _audit_actions(session_factory)])


# ----------------------------------------------------------- bible/outline ----


def test_bible_put_version_conflict_and_stale(logged_in_client, session_factory, planned):
    _set_episode(session_factory, planned, 1, E.AWAITING_SCRIPT_APPROVAL, script=_script(1))
    _set_episode(session_factory, planned, 2, E.SCRIPT_READY, script=_script(2))
    _set_episode(session_factory, planned, 3, E.GENERATING_MEDIA, script=_script(3))
    bible = logged_in_client.get(f"/api/series/{planned}").json()["bible"]
    bible["world"]["setting"] = "ilha nova"
    bible["premise_core_elements"] = ["hack"]
    ok = logged_in_client.put(f"/api/series/{planned}/bible", json={"bible_version": 1, "bible": bible})
    assert ok.status_code == 200, ok.text
    assert ok.json()["bible_version"] == 2
    assert ok.json()["bible"]["world"]["setting"] == "ilha nova"
    assert ok.json()["bible"]["premise_core_elements"] == ["farol", "portal"]  # read-only
    statuses = {e["number"]: e["status"] for e in ok.json()["episodes"]}
    assert statuses[1] == "stale" and statuses[2] == "stale" and statuses[3] == "generating_media"
    conflict = logged_in_client.put(f"/api/series/{planned}/bible", json={"bible_version": 1, "bible": bible})
    assert conflict.status_code == 409 and conflict.json()["detail"]["code"] == "bible_version_conflict"


def test_outline_only_planned_or_stale(logged_in_client, session_factory, planned):
    ok = logged_in_client.put(f"/api/series/{planned}/outline/4", json={"title": "Novo título", "summary": "novo", "arc_phase": "rising"})
    assert ok.status_code == 200
    assert ok.json()["title"] == "Novo título" and ok.json()["outline"]["summary"] == "novo"
    _set_episode(session_factory, planned, 5, E.SCRIPT_READY, script=_script(5))
    bad = logged_in_client.put(f"/api/series/{planned}/outline/5", json={"title": "x"})
    assert bad.status_code == 409 and bad.json()["detail"]["code"] == "invalid_transition"
    _set_episode(session_factory, planned, 5, E.STALE)
    assert logged_in_client.put(f"/api/series/{planned}/outline/5", json={"title": "x"}).status_code == 200


def test_character_patch_cannot_set_status(logged_in_client, planned):
    cid = logged_in_client.get(f"/api/series/{planned}").json()["characters"][0]["id"]
    ok = logged_in_client.patch(f"/api/series/{planned}/characters/{cid}", json={"name": "Nova", "personality": "teimosa"})
    assert ok.status_code == 200 and ok.json()["name"] == "Nova" and ok.json()["personality"] == "teimosa"
    assert logged_in_client.patch(f"/api/series/{planned}/characters/{cid}", json={"status": "dead"}).status_code == 422
    assert logged_in_client.patch(f"/api/series/{planned}/characters/{uuid.uuid4()}", json={"name": "x"}).status_code == 404


PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def test_reference_image_lifecycle(logged_in_client, planned, s3_fake):
    cid = logged_in_client.get(f"/api/series/{planned}").json()["characters"][0]["id"]
    url = f"/api/series/{planned}/characters/{cid}/reference-image"
    assert logged_in_client.get(url).status_code == 404
    bad = logged_in_client.put(url, files={"file": ("a.png", io.BytesIO(b"not an image"), "image/png")})
    assert bad.status_code == 415
    big = logged_in_client.put(url, files={"file": ("a.png", io.BytesIO(PNG + b"0" * (5 * 1024 * 1024)), "image/png")})
    assert big.status_code == 413
    ok = logged_in_client.put(url, files={"file": ("a.png", io.BytesIO(PNG), "image/png")})
    assert ok.status_code == 200 and ok.json()["has_reference_image"] is True
    got = logged_in_client.get(url)
    assert got.status_code == 200 and got.content == PNG and got.headers["content-type"] == "image/png"
    assert "private" in got.headers["cache-control"]
    assert any(k.startswith("users/") and "/characters/" in k for k in s3_fake._objects)
    assert logged_in_client.delete(url).status_code == 204
    assert logged_in_client.get(url).status_code == 404
    assert s3_fake._objects == {}


def test_tts_voices_fake(logged_in_client):
    resp = logged_in_client.get("/api/series/providers/tts/fake_tts/voices?language=pt-BR")
    assert resp.status_code == 200 and resp.json()[0]["id"].startswith("fake_voice")
    assert logged_in_client.get("/api/series/providers/tts/nope/voices").status_code == 404
    unconfigured = logged_in_client.get("/api/series/providers/tts/elevenlabs/voices")
    assert unconfigured.status_code == 422 and unconfigured.json()["detail"]["code"] == "provider_not_configured"


# ------------------------------------------------------- script/regenerate ----


def test_put_script_revision_conflict_then_validating(logged_in_client, session_factory, planned, sent):
    ep1 = _set_episode(session_factory, planned, 1, E.AWAITING_SCRIPT_APPROVAL, script=_script(1), script_revision=2)
    _set_episode(session_factory, planned, 2, E.SCRIPT_READY, script=_script(2))
    url = f"/api/series/{planned}/episodes/1/script"
    stale = logged_in_client.put(url, json={"script_revision": 1, "script": _script(1)})
    assert stale.status_code == 409 and stale.json()["detail"]["code"] == "script_revision_conflict"
    assert logged_in_client.put(url, json={"script_revision": 2, "script": _script(2)}).status_code == 422  # number mismatch
    assert logged_in_client.put(url, json={"script_revision": 2, "script": _script(1, scenes=[_scene(0)])}).status_code == 422
    ok = logged_in_client.put(url, json={"script_revision": 2, "script": _script(1)})
    assert ok.status_code == 200 and ok.json()["status"] == "validating" and ok.json()["script_revision"] == 3
    assert sent == [{"name": "app.worker.story.tasks.validate_episode", "args": [str(ep1)], "queue": "story"}]
    assert _episode(session_factory, planned, 2).status == E.STALE


def test_put_script_syncs_proposed_events_and_new_character(logged_in_client, session_factory, planned):
    _set_episode(session_factory, planned, 1, E.SCRIPT_READY, script=_script(1))
    events = [
        {"type": "status_change", "character_key": "velho", "from_status": "alive", "to_status": "dead", "description": "morre"},
        {
            "type": "introduce", "character_key": "gaivota",
            "new_character": {"name": "Gaivota", "description": "ave", "visual_description": "g" * 90},
        },
    ]
    r = logged_in_client.put(
        f"/api/series/{planned}/episodes/1/script", json={"script_revision": 0, "script": _script(1, state_events=events)}
    )
    assert r.status_code == 200, r.text
    assert {(e["character_key"], e["state"]) for e in r.json()["state_events"]} == {("velho", "proposed"), ("gaivota", "proposed")}
    chars = {c["key"]: c for c in logged_in_client.get(f"/api/series/{planned}").json()["characters"]}
    assert chars["gaivota"]["committed"] is False and chars["velho"]["status"] == "alive"
    # edit again without the introduce -> the uncommitted character disappears, old event discarded
    _set_episode(session_factory, planned, 1, E.SCRIPT_READY)
    r2 = logged_in_client.put(
        f"/api/series/{planned}/episodes/1/script", json={"script_revision": 1, "script": _script(1, state_events=events[:1])}
    )
    assert r2.status_code == 200
    assert "gaivota" not in {c["key"] for c in logged_in_client.get(f"/api/series/{planned}").json()["characters"]}
    states = [(e["character_key"], e["state"]) for e in r2.json()["state_events"]]
    assert states.count(("velho", "proposed")) == 1 and ("velho", "discarded") in states


def test_approve_script_enqueues_media(logged_in_client, session_factory, planned, sent):
    ep = _set_episode(session_factory, planned, 1, E.AWAITING_SCRIPT_APPROVAL, script=_script(1))
    resp = logged_in_client.post(f"/api/series/{planned}/episodes/1/approve-script")
    assert resp.status_code == 200 and resp.json()["status"] == "generating_media"
    assert sent == [{"name": "app.worker.story.tasks.generate_episode_media", "args": [str(ep), "all"], "queue": "story"}]
    again = logged_in_client.post(f"/api/series/{planned}/episodes/1/approve-script")
    assert again.status_code == 409 and again.json()["detail"]["code"] == "episode_busy"
    wrong = logged_in_client.post(f"/api/series/{planned}/episodes/2/approve-script")
    assert wrong.status_code == 409 and wrong.json()["detail"]["code"] == "invalid_transition"


def test_approve_script_blocked_by_budgets(logged_in_client, session_factory, planned, sent, user):
    _set_episode(session_factory, planned, 1, E.AWAITING_SCRIPT_APPROVAL, script=_script(1))
    db = session_factory()
    s = db.get(StorySeries, uuid.UUID(planned))
    s.budget_limit_usd = Decimal("1")
    s.cost_usd_total = Decimal("1.5")
    db.commit()
    db.close()
    resp = logged_in_client.post(f"/api/series/{planned}/episodes/1/approve-script")
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "series_budget_exceeded"
    assert sent == [] and _episode(session_factory, planned, 1).status == E.AWAITING_SCRIPT_APPROVAL

    db = session_factory()
    s = db.get(StorySeries, uuid.UUID(planned))
    s.budget_limit_usd = None
    u = db.get(User, user.id)
    u.monthly_ai_budget_usd = Decimal("1")
    db.add(AiUsageEvent(owner_id=user.id, series_id=s.id, kind="llm", provider="anthropic", cost_usd=Decimal("2")))
    db.commit()
    db.close()
    resp = logged_in_client.post(f"/api/series/{planned}/episodes/1/approve-script")
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "user_ai_budget_exceeded"


@pytest.mark.parametrize(
    "scope,task,args_extra",
    [("script", "script_episode", None), ("media", "generate_episode_media", "visual"), ("narration", "generate_episode_media", "narration")],
)
def test_regenerate_scopes(logged_in_client, session_factory, planned, sent, scope, task, args_extra):
    ep = _set_episode(session_factory, planned, 1, E.REJECTED, script=_script(1))
    resp = logged_in_client.post(f"/api/series/{planned}/episodes/1/regenerate", json={"scope": scope, "instructions": "mais tenso"})
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["regenerations"] == 1
    assert body["status"] == ("scripting" if scope == "script" else "generating_media")
    expected_args = [str(ep)] + ([args_extra] if args_extra else [])
    assert sent == [{"name": f"app.worker.story.tasks.{task}", "args": expected_args, "queue": "story"}]
    assert _episode(session_factory, planned, 1).user_instructions == "mais tenso"
    # busy now
    busy = logged_in_client.post(f"/api/series/{planned}/episodes/1/regenerate", json={"scope": scope})
    assert busy.status_code == 409 and busy.json()["detail"]["code"] == "episode_busy"


def test_regeneration_limit_crit8(logged_in_client, session_factory, planned, sent):
    _set_episode(session_factory, planned, 1, E.REJECTED, script=_script(1), regenerations=3)
    resp = logged_in_client.post(f"/api/series/{planned}/episodes/1/regenerate", json={"scope": "script"})
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "regeneration_limit_reached"
    assert sent == []
    # raising the limit via PATCH unblocks
    logged_in_client.patch(f"/api/series/{planned}", json={"max_regenerations_per_episode": 5})
    assert logged_in_client.post(f"/api/series/{planned}/episodes/1/regenerate", json={"scope": "script"}).status_code == 202


def test_regenerate_marks_following_stale_and_stale_rescript_is_free(logged_in_client, session_factory, planned, sent):
    _set_episode(session_factory, planned, 1, E.REJECTED, script=_script(1))
    _set_episode(session_factory, planned, 2, E.PENDING_REVIEW, script=_script(2), clip=True)
    logged_in_client.post(f"/api/series/{planned}/episodes/1/regenerate", json={"scope": "script"})
    assert _episode(session_factory, planned, 2).status == E.STALE
    sent.clear()
    r = logged_in_client.post(f"/api/series/{planned}/episodes/2/regenerate", json={"scope": "script"})
    assert r.status_code == 202 and r.json()["regenerations"] == 0  # stale re-script does not consume the quota
    assert sent[0]["name"].endswith("script_episode")
    # media regenerate from stale is invalid
    _set_episode(session_factory, planned, 3, E.STALE, script=_script(3))
    assert logged_in_client.post(f"/api/series/{planned}/episodes/3/regenerate", json={"scope": "media"}).status_code == 409


# ------------------------------------------------- approve / reject (crit 3,4,7) ----


def _started(logged_in_client, planned):
    assert logged_in_client.post(f"/api/series/{planned}/start", json={}).status_code == 200


def test_approve_requires_previous_approved_crit4(logged_in_client, session_factory, planned, manual_account):
    _started(logged_in_client, planned)
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    _set_episode(session_factory, planned, 2, E.PENDING_REVIEW, script=_script(2), clip=True)
    resp = logged_in_client.post(f"/api/series/{planned}/episodes/2/approve")
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "previous_episode_not_approved"
    assert _episode(session_factory, planned, 2).status == E.PENDING_REVIEW
    assert logged_in_client.post(f"/api/series/{planned}/episodes/1/approve").status_code == 200
    assert logged_in_client.post(f"/api/series/{planned}/episodes/2/approve").status_code == 200


def test_approve_manual_account_exported_and_synthetic(logged_in_client, session_factory, planned, manual_account):
    _started(logged_in_client, planned)
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    resp = logged_in_client.post(f"/api/series/{planned}/episodes/1/approve")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "scheduled" and body["scheduled_at"] is not None
    assert len(body["publications"]) == 1
    pub = body["publications"][0]
    assert pub["status"] == "exported" and pub["synthetic_media"] is True and pub["platform"] == "youtube"
    db = session_factory()
    clip = db.query(Clip).filter(Clip.id == uuid.UUID(body["clip_id"])).one()
    assert clip.status == ClipStatus.APPROVED
    db.close()
    ep = _episode(session_factory, planned, 1)
    assert ep.approved_at is not None


def test_approve_oauth_account_scheduled_at_target_slot(logged_in_client, session_factory, planned, channel):
    insert_account(
        session_factory, platform="youtube", mode=AccountMode.OAUTH, channel_id=channel,
        posting_windows=[{"days": [0, 1, 2, 3, 4, 5, 6], "start": "00:00", "end": "23:59"}],
    )
    _started(logged_in_client, planned)
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    body = logged_in_client.post(f"/api/series/{planned}/episodes/1/approve").json()
    assert body["status"] == "scheduled"
    pub = body["publications"][0]
    assert pub["status"] == "scheduled" and pub["synthetic_media"] is True
    ep_target = date.fromisoformat(body["target_date"])
    scheduled = datetime.fromisoformat(pub["scheduled_at"])
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=timezone.utc)
    floor = datetime.combine(ep_target, datetime.min.time().replace(hour=18), tzinfo=TZ)
    assert scheduled >= floor  # never before target_date + publish_time (series tz)
    assert body["scheduled_at"] is not None


def test_approve_gate_blocks_and_leaves_episode_approved(logged_in_client, session_factory, planned, channel):
    insert_account(session_factory, platform="youtube", mode=AccountMode.MANUAL, channel_id=channel)
    _started(logged_in_client, planned)
    db = session_factory()
    series = db.get(StorySeries, uuid.UUID(planned))
    db.get(Source, series.source_id).license_type = "cc_by_nd"  # gate must still be the one deciding
    db.commit()
    db.close()
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    body = logged_in_client.post(f"/api/series/{planned}/episodes/1/approve").json()
    assert body["publications"][0]["status"] == "blocked"
    assert body["status"] == "approved"  # approved but nothing could be scheduled


def test_approve_without_clip_or_wrong_state(logged_in_client, session_factory, planned, manual_account):
    _started(logged_in_client, planned)
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1))
    assert logged_in_client.post(f"/api/series/{planned}/episodes/1/approve").status_code == 409
    resp = logged_in_client.post(f"/api/series/{planned}/episodes/3/approve")
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "invalid_transition"


def test_events_applied_on_approve_and_reverted_on_unapprove_crit7(logged_in_client, session_factory, planned, manual_account):
    _started(logged_in_client, planned)
    ep1 = _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    _set_episode(session_factory, planned, 2, E.SCRIPT_READY, script=_script(2))
    _add_event(session_factory, planned, ep1, 1, "velho", CharacterStatus.DEAD)  # from_status unknown
    assert _char_status(session_factory, planned, "velho") == CharacterStatus.ALIVE  # proposed != applied
    approved = logged_in_client.post(f"/api/series/{planned}/episodes/1/approve").json()
    assert _char_status(session_factory, planned, "velho") == CharacterStatus.DEAD
    assert {e["state"] for e in approved["state_events"]} == {"applied"}
    assert approved["state_events"][0]["from_status"] == "alive"
    chars = {c["key"]: c for c in logged_in_client.get(f"/api/series/{planned}").json()["characters"]}
    assert chars["velho"]["status"] == "dead" and chars["velho"]["events"][0]["state"] == "applied"

    un = logged_in_client.post(f"/api/series/{planned}/episodes/1/unapprove")
    assert un.status_code == 200, un.text
    body = un.json()
    assert body["status"] == "pending_review" and body["scheduled_at"] is None
    assert {e["state"] for e in body["state_events"]} == {"proposed"}
    assert [p["status"] for p in body["publications"]] == ["canceled"]
    assert _char_status(session_factory, planned, "velho") == CharacterStatus.ALIVE
    assert _episode(session_factory, planned, 2).status == E.STALE  # followers invalidated
    db = session_factory()
    assert db.query(Clip).filter(Clip.episode_id == ep1).one().status == ClipStatus.PENDING_REVIEW
    db.close()
    # re-approve works again
    assert logged_in_client.post(f"/api/series/{planned}/episodes/1/approve").status_code == 200
    assert _char_status(session_factory, planned, "velho") == CharacterStatus.DEAD


def test_unapprove_conflicts(logged_in_client, session_factory, planned, manual_account):
    _started(logged_in_client, planned)
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    _set_episode(session_factory, planned, 2, E.PENDING_REVIEW, script=_script(2), clip=True)
    logged_in_client.post(f"/api/series/{planned}/episodes/1/approve")
    logged_in_client.post(f"/api/series/{planned}/episodes/2/approve")
    nxt = logged_in_client.post(f"/api/series/{planned}/episodes/1/unapprove")
    assert nxt.status_code == 409 and "2" in nxt.json()["detail"]["message"]
    # published -> invalid
    _set_episode(session_factory, planned, 2, E.PUBLISHED)
    assert logged_in_client.post(f"/api/series/{planned}/episodes/2/unapprove").status_code == 409
    # not approved at all
    assert logged_in_client.post(f"/api/series/{planned}/episodes/5/unapprove").status_code == 409


def test_unapprove_blocked_when_publication_already_published(logged_in_client, session_factory, planned, channel):
    insert_account(
        session_factory, platform="youtube", mode=AccountMode.OAUTH, channel_id=channel,
        posting_windows=[{"days": [0, 1, 2, 3, 4, 5, 6], "start": "00:00", "end": "23:59"}],
    )
    _started(logged_in_client, planned)
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    logged_in_client.post(f"/api/series/{planned}/episodes/1/approve")
    db = session_factory()
    db.query(Publication).update({"status": "published"})
    db.commit()
    db.close()
    resp = logged_in_client.post(f"/api/series/{planned}/episodes/1/unapprove")
    assert resp.status_code == 409


def test_reject_with_and_without_regenerate(logged_in_client, session_factory, planned, sent):
    ep1 = _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    _set_episode(session_factory, planned, 2, E.SCRIPT_READY, script=_script(2))
    r = logged_in_client.post(f"/api/series/{planned}/episodes/1/reject", json={"instructions": "mais ação", "regenerate": False})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    assert sent == []
    assert _episode(session_factory, planned, 2).status == E.STALE
    db = session_factory()
    assert db.query(Clip).filter(Clip.episode_id == ep1).one().status == ClipStatus.REJECTED
    db.close()
    # regenerate afterwards
    assert logged_in_client.post(f"/api/series/{planned}/episodes/1/regenerate", json={"scope": "script"}).status_code == 202

    ep3 = _set_episode(session_factory, planned, 3, E.PENDING_REVIEW, script=_script(3), clip=True)
    sent.clear()
    r3 = logged_in_client.post(f"/api/series/{planned}/episodes/3/reject", json={"instructions": "x"})  # default regenerate=True
    assert r3.status_code == 200 and r3.json()["status"] == "scripting" and r3.json()["regenerations"] == 1
    assert sent == [{"name": "app.worker.story.tasks.script_episode", "args": [str(ep3)], "queue": "story"}]

    ep4 = _set_episode(session_factory, planned, 4, E.PENDING_REVIEW, script=_script(4), clip=True)
    sent.clear()
    r4 = logged_in_client.post(f"/api/series/{planned}/episodes/4/reject", json={"scope": "narration"})
    assert r4.json()["status"] == "generating_media"
    assert sent == [{"name": "app.worker.story.tasks.generate_episode_media", "args": [str(ep4), "narration"], "queue": "story"}]


def test_prompts_never_audited(logged_in_client, session_factory, planned):
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    logged_in_client.post(f"/api/series/{planned}/episodes/1/reject", json={"instructions": "SEGREDO-INSTRUCAO", "scope": "script"})
    logged_in_client.post(f"/api/series/{planned}/replan", json={"instructions": "SEGREDO-INSTRUCAO"})
    rows = _audit_actions(session_factory)
    assert any(a.action == "episode.reject" for a in rows)
    assert "SEGREDO-INSTRUCAO" not in str([a.details for a in rows])


# --------------------------------------------------------- clips delegation ----


def test_clip_patch_delegates_to_episode_lifecycle(logged_in_client, session_factory, planned, manual_account):
    _started(logged_in_client, planned)
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    clip_id = logged_in_client.get(f"/api/series/{planned}/episodes/1").json()["clip_id"]
    trim = logged_in_client.patch(f"/api/clips/{clip_id}", json={"start_s": 1, "end_s": 5})
    assert trim.status_code == 409 and trim.json()["detail"]["code"] == "episode_clip_managed_by_series"
    resp = logged_in_client.patch(f"/api/clips/{clip_id}", json={"status": "approved"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "approved" and resp.json()["episode_number"] == 1
    assert _episode(session_factory, planned, 1).status == E.SCHEDULED
    assert logged_in_client.patch(f"/api/clips/{clip_id}", json={"status": "approved"}).status_code == 409


def test_clip_patch_reject_and_sequential_rule(logged_in_client, session_factory, planned, manual_account):
    _started(logged_in_client, planned)
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    _set_episode(session_factory, planned, 2, E.PENDING_REVIEW, script=_script(2), clip=True)
    c1 = logged_in_client.get(f"/api/series/{planned}/episodes/1").json()["clip_id"]
    c2 = logged_in_client.get(f"/api/series/{planned}/episodes/2").json()["clip_id"]
    bad = logged_in_client.patch(f"/api/clips/{c2}", json={"status": "approved"})
    assert bad.status_code == 409 and bad.json()["detail"]["code"] == "previous_episode_not_approved"
    rej = logged_in_client.patch(f"/api/clips/{c1}", json={"status": "rejected"})
    assert rej.status_code == 200 and rej.json()["status"] == "rejected"
    assert _episode(session_factory, planned, 1).status == E.REJECTED


def test_clip_bulk_approve_in_episode_order(logged_in_client, session_factory, planned, manual_account):
    _started(logged_in_client, planned)
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    _set_episode(session_factory, planned, 2, E.PENDING_REVIEW, script=_script(2), clip=True)
    c1 = logged_in_client.get(f"/api/series/{planned}/episodes/1").json()["clip_id"]
    c2 = logged_in_client.get(f"/api/series/{planned}/episodes/2").json()["clip_id"]
    resp = logged_in_client.post("/api/clips/bulk", json={"ids": [c2, c1], "action": "approve"})
    assert resp.status_code == 200, resp.text
    assert _episode(session_factory, planned, 1).status == E.SCHEDULED
    assert _episode(session_factory, planned, 2).status == E.SCHEDULED


# ------------------------------------------------- cancel / delete / guards ----


def test_cancel_scheduled_publications_flag(logged_in_client, session_factory, planned, channel):
    insert_account(
        session_factory, platform="youtube", mode=AccountMode.OAUTH, channel_id=channel,
        posting_windows=[{"days": [0, 1, 2, 3, 4, 5, 6], "start": "00:00", "end": "23:59"}],
    )
    _started(logged_in_client, planned)
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    logged_in_client.post(f"/api/series/{planned}/episodes/1/approve")
    logged_in_client.post(f"/api/series/{planned}/cancel", json={})
    assert _episode(session_factory, planned, 1).status == E.SCHEDULED  # still going out
    assert _episode(session_factory, planned, 2).status == E.CANCELED


def test_cancel_with_flag_cancels_publications(logged_in_client, session_factory, planned, channel):
    insert_account(
        session_factory, platform="youtube", mode=AccountMode.OAUTH, channel_id=channel,
        posting_windows=[{"days": [0, 1, 2, 3, 4, 5, 6], "start": "00:00", "end": "23:59"}],
    )
    _started(logged_in_client, planned)
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    logged_in_client.post(f"/api/series/{planned}/episodes/1/approve")
    logged_in_client.post(f"/api/series/{planned}/cancel", json={"cancel_scheduled_publications": True})
    assert _episode(session_factory, planned, 1).status == E.CANCELED
    db = session_factory()
    assert {p.status.value for p in db.query(Publication).all()} == {"canceled"}
    db.close()


def test_delete_series_removes_clips_and_objects(logged_in_client, session_factory, planned, s3_fake, user):
    _set_episode(session_factory, planned, 1, E.PENDING_REVIEW, script=_script(1), clip=True)
    db = session_factory()
    clip = db.query(Clip).filter(Clip.episode_id.isnot(None)).one()
    s3_fake._objects[clip.storage_key] = b"video"
    series = db.get(StorySeries, uuid.UUID(planned))
    source_id = series.source_id
    db.add(AiUsageEvent(owner_id=user.id, series_id=series.id, kind="llm", provider="anthropic", cost_usd=Decimal("0.5")))
    db.commit()
    db.close()

    resp = logged_in_client.delete(f"/api/series/{planned}")
    assert resp.status_code == 204, resp.text
    assert logged_in_client.get(f"/api/series/{planned}").status_code == 404
    assert s3_fake._objects == {}
    db = session_factory()
    assert db.query(Clip).count() == 0 and db.query(StoryEpisode).count() == 0 and db.query(StoryCharacter).count() == 0
    assert db.get(Source, source_id) is None
    ev = db.query(AiUsageEvent).one()  # spend accounting survives
    assert ev.series_id is None and ev.cost_usd == Decimal("0.5")
    db.close()


def test_delete_series_guards(logged_in_client, session_factory, planned, manual_account):
    _started(logged_in_client, planned)
    active = logged_in_client.delete(f"/api/series/{planned}")
    assert active.status_code == 409
    logged_in_client.post(f"/api/series/{planned}/cancel", json={})
    assert logged_in_client.delete(f"/api/series/{planned}").status_code == 204


def test_delete_canceled_series_with_published_episode_409(logged_in_client, session_factory, planned, manual_account):
    _started(logged_in_client, planned)
    logged_in_client.post(f"/api/series/{planned}/cancel", json={})
    _set_episode(session_factory, planned, 1, E.PUBLISHED)
    assert logged_in_client.delete(f"/api/series/{planned}").status_code == 409


def test_delete_channel_blocked_by_active_series(logged_in_client, planned, channel):
    resp = logged_in_client.delete(f"/api/channels/{channel}")
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "channel_has_active_series"
    logged_in_client.post(f"/api/series/{planned}/cancel", json={})
    assert logged_in_client.delete(f"/api/channels/{channel}").status_code == 204


def test_series_source_cannot_be_deleted_or_relicensed(logged_in_client, session_factory, planned):
    db = session_factory()
    source_id = db.get(StorySeries, uuid.UUID(planned)).source_id
    db.close()
    d = logged_in_client.delete(f"/api/sources/{source_id}")
    assert d.status_code == 409 and d.json()["detail"]["code"] == "source_managed_by_series"
    p = logged_in_client.patch(f"/api/sources/{source_id}", json={"license_type": "own"})
    assert p.status_code == 409 and p.json()["detail"]["code"] == "source_managed_by_series"
    ok = logged_in_client.patch(f"/api/sources/{source_id}", json={"title": "renomeada"})
    assert ok.status_code == 200


def test_costs_endpoint(logged_in_client, session_factory, planned, user):
    db = session_factory()
    series = db.get(StorySeries, uuid.UUID(planned))
    series.cost_usd_total = Decimal("1.75")
    series.budget_limit_usd = Decimal("10")
    db.add_all(
        [
            AiUsageEvent(owner_id=user.id, series_id=series.id, kind="llm", provider="anthropic", cost_usd=Decimal("1")),
            AiUsageEvent(owner_id=user.id, series_id=series.id, kind="tts", provider="elevenlabs", cost_usd=Decimal("0.75")),
        ]
    )
    db.commit()
    db.close()
    body = logged_in_client.get(f"/api/series/{planned}/costs").json()
    assert body["total_usd"] == 1.75 and body["budget_limit_usd"] == 10.0
    assert body["by_kind"] == {"llm": 1.0, "video": 0.0, "image": 0.0, "tts": 0.75}
    assert len(body["by_episode"]) == 20 and len(body["recent"]) == 2


# ---------------------------------------------------------- lifecycle unit ----


def test_mark_following_stale_only_unapproved(session_factory, user, planned):
    _set_episode(session_factory, planned, 2, E.SCRIPT_READY)
    _set_episode(session_factory, planned, 3, E.APPROVED)
    _set_episode(session_factory, planned, 4, E.SCHEDULED)
    _set_episode(session_factory, planned, 5, E.PENDING_REVIEW)
    _set_episode(session_factory, planned, 6, E.NEEDS_ATTENTION)
    _set_episode(session_factory, planned, 7, E.CANCELED)
    db = session_factory()
    series = db.get(StorySeries, uuid.UUID(planned))
    changed = lifecycle.mark_following_stale(db, series, 1)
    db.commit()
    assert changed == [2, 5, 6]  # PLANNED/APPROVED/SCHEDULED/CANCELED untouched
    assert lifecycle.mark_following_stale(db, series, 1) == []  # idempotent
    db.close()


def test_state_table_allows_script_edit_paths():
    from app.story.state import EPISODE_TRANSITIONS

    assert E.VALIDATING in EPISODE_TRANSITIONS[E.AWAITING_SCRIPT_APPROVAL]
    assert E.SCRIPTING in EPISODE_TRANSITIONS[E.SCRIPT_READY]
    assert E.VALIDATING in EPISODE_TRANSITIONS[E.NEEDS_ATTENTION]

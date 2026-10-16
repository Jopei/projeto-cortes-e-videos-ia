from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.analysis_job import AnalysisJob, AnalysisJobStatus, Preset
from app.models.clip import Clip, ClipStatus
from app.models.publication import Publication, PublicationStatus
from app.models.story import EpisodeStatus as E, SeriesStatus as S, StoryEpisode
from tests import factories
from tests.story_helpers import make_series

ZERO = {
    "clips_pending_review": 0, "episodes_awaiting_script_approval": 0, "episodes_pending_review": 0,
    "episodes_needs_attention": 0, "series_paused": 0, "publications_failed": 0, "jobs_failed_recent": 0, "total": 0,
}


def _seed(sf, owner_id, channel_id=None):
    """One of each actionable item (two pending clips: one cut, one episode clip -> only cut counts)."""
    src = factories.insert_source(sf, owner_id=owner_id)
    media = factories.insert_media_asset(sf, src, owner_id=owner_id)
    clip_id = factories.insert_clip(
        sf, media_asset_id=media, owner_id=owner_id, status=ClipStatus.PENDING_REVIEW, channel_id=channel_id
    )
    acct = factories.insert_account(sf, owner_id=owner_id, platform="youtube")
    series_id = make_series(sf, owner_id, status=S.ACTIVE, channel_id=channel_id)
    make_series(sf, owner_id, status=S.PAUSED, pause_reason="series_budget_exceeded", channel_id=channel_id)
    make_series(sf, owner_id, status=S.PAUSED, pause_reason="user", channel_id=channel_id)
    db = sf()
    for n, st in enumerate((E.AWAITING_SCRIPT_APPROVAL, E.PENDING_REVIEW, E.NEEDS_ATTENTION, E.PLANNED), 1):
        db.add(StoryEpisode(owner_id=owner_id, series_id=series_id, number=n, title=f"E{n}", arc_phase="setup",
                            outline={}, status=st))
    db.flush()
    ep = db.query(StoryEpisode).filter(StoryEpisode.number == 2, StoryEpisode.series_id == series_id).one()
    db.add(Clip(owner_id=owner_id, episode_id=ep.id, channel_id=channel_id, start_s=0, end_s=30,
                status=ClipStatus.PENDING_REVIEW, storage_key="k", synthetic_media=True))
    db.add(Publication(owner_id=owner_id, clip_id=clip_id, account_id=acct, platform="youtube",
                       status=PublicationStatus.FAILED))
    db.add(AnalysisJob(owner_id=owner_id, media_asset_id=media, channel_id=channel_id, preset=Preset.ACTION, params={},
                       status=AnalysisJobStatus.FAILED))
    old = AnalysisJob(owner_id=owner_id, media_asset_id=media, channel_id=channel_id, preset=Preset.ACTION, params={},
                      status=AnalysisJobStatus.FAILED)
    old.created_at = datetime.now(timezone.utc) - timedelta(hours=30)
    db.add(old)
    db.commit()
    db.close()


EXPECTED = {
    "clips_pending_review": 1, "episodes_awaiting_script_approval": 1, "episodes_pending_review": 1,
    "episodes_needs_attention": 1, "series_paused": 1, "publications_failed": 1, "jobs_failed_recent": 1, "total": 7,
}


def test_attention_empty(logged_in_client):
    assert logged_in_client.get("/api/dashboard/summary").json()["attention"] == ZERO


def test_attention_values(logged_in_client, session_factory, user):
    _seed(session_factory, user.id)
    assert logged_in_client.get("/api/dashboard/summary").json()["attention"] == EXPECTED


def test_attention_owner_scope(logged_in_client, other_logged_in_client, session_factory, user, other_user):
    _seed(session_factory, other_user.id)
    assert logged_in_client.get("/api/dashboard/summary").json()["attention"] == ZERO
    assert other_logged_in_client.get("/api/dashboard/summary").json()["attention"] == EXPECTED


def test_attention_admin_sees_all_and_as_user(admin_client, session_factory, user, other_user):
    _seed(session_factory, user.id)
    _seed(session_factory, other_user.id)
    total = admin_client.get("/api/dashboard/summary").json()["attention"]
    assert total["total"] == 14 and total["clips_pending_review"] == 2
    one = admin_client.get(f"/api/dashboard/summary?as_user={other_user.id}").json()["attention"]
    assert one == EXPECTED


def test_attention_channel_filter(logged_in_client, session_factory, user):
    ch = factories.insert_channel(session_factory)
    _seed(session_factory, user.id, channel_id=ch)
    _seed(session_factory, user.id, channel_id=None)
    assert logged_in_client.get("/api/dashboard/summary").json()["attention"]["total"] == 14
    assert logged_in_client.get(f"/api/dashboard/summary?channel_id={ch}").json()["attention"] == EXPECTED

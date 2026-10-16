"""Schema-level checks for the Series IA tables (ck_clips_origin + uniques)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.clip import Clip
from app.models.story import (
    CharacterRole,
    StoryCharacter,
    StoryEpisode,
    StoryMediaJob,
    MediaJobKind,
    StorySeries,
)


def _series(owner: uuid.UUID, **kw) -> StorySeries:
    return StorySeries(
        owner_id=owner,
        source_id=uuid.uuid4(),
        premise="x" * 60,
        publish_time="18:00",
        originality_attested_at=datetime.now(timezone.utc),
        **kw,
    )


def _clip(owner: uuid.UUID, **kw) -> Clip:
    return Clip(owner_id=owner, start_s=0.0, end_s=30.0, **kw)


def test_clips_origin_check(session_factory):
    owner = uuid.uuid4()
    db = session_factory()
    # neither job/asset nor episode -> rejected
    db.add(_clip(owner))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    # job without media_asset and no episode -> rejected
    db.add(_clip(owner, job_id=uuid.uuid4()))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    # episode origin -> accepted; synthetic_media defaults to false
    c = _clip(owner, episode_id=uuid.uuid4())
    db.add(c)
    db.commit()
    assert c.synthetic_media is False
    # legacy origin -> accepted
    db.add(_clip(owner, job_id=uuid.uuid4(), media_asset_id=uuid.uuid4()))
    db.commit()
    db.close()


def test_clip_episode_id_unique(session_factory):
    owner, ep = uuid.uuid4(), uuid.uuid4()
    db = session_factory()
    db.add(_clip(owner, episode_id=ep))
    db.commit()
    db.add(_clip(owner, episode_id=ep))
    with pytest.raises(IntegrityError):
        db.commit()
    db.close()


def test_story_uniques(session_factory):
    owner = uuid.uuid4()
    db = session_factory()
    s = _series(owner, status="planning")
    db.add(s)
    db.commit()
    assert s.visual_strategy == "hybrid" and s.require_script_approval is True and s.lead_days == 2

    def char(key):
        return StoryCharacter(
            series_id=s.id, key=key, name="N", role=CharacterRole.MINOR, description="d", visual_description="v"
        )

    db.add(char("ana"))
    db.commit()
    db.add(char("ana"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    db.add(StoryEpisode(owner_id=owner, series_id=s.id, number=1, status="planned"))
    db.commit()
    db.add(StoryEpisode(owner_id=owner, series_id=s.id, number=1, status="planned"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    ep_id = uuid.uuid4()

    def job():
        return StoryMediaJob(
            owner_id=owner, episode_id=ep_id, kind=MediaJobKind.IMAGE, provider="fake", idempotency_key="k1"
        )

    db.add(job())
    db.commit()
    db.add(job())
    with pytest.raises(IntegrityError):
        db.commit()
    db.close()


def test_story_series_checks(session_factory):
    db = session_factory()
    db.add(_series(uuid.uuid4(), episode_count=19))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.add(_series(uuid.uuid4(), lead_days=3))
    with pytest.raises(IntegrityError):
        db.commit()
    db.close()

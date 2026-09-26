"""Unit tests for the deterministic (no-LLM) metadata fallback and the
attribution/hashtag rules that must hold regardless of LLM availability
(app/worker/metadata/pipeline.py) — no network, no anthropic key needed."""

from __future__ import annotations

from app.worker.metadata.pipeline import fallback_metadata, generate_metadata


def test_fallback_metadata_uses_work_name_and_transcript():
    title, description, hashtags = fallback_metadata(
        work_name="Sintel",
        transcript="A lonely dragon hunter finds an unlikely friend. It was amazing.",
        template={"fixed_hashtags": ["#CC"], "title_max": 100},
        platform="tiktok",
    )
    assert "Sintel" in title
    assert "#CC" in hashtags
    assert len(title) <= 100


def test_fallback_metadata_adds_shorts_hashtag_for_youtube_only():
    _, _, yt_hashtags = fallback_metadata(work_name="Sintel", transcript=None, template={}, platform="youtube")
    _, _, tiktok_hashtags = fallback_metadata(work_name="Sintel", transcript=None, template={}, platform="tiktok")
    assert "#Shorts" in yt_hashtags
    assert "#Shorts" not in tiktok_hashtags


def test_fallback_metadata_truncates_long_titles():
    title, _, _ = fallback_metadata(
        work_name="A" * 200,
        transcript=None,
        template={"title_max": 20},
        platform="youtube",
    )
    assert len(title) <= 20


def test_generate_metadata_without_api_key_always_appends_attribution():
    title, description, hashtags = generate_metadata(
        work_name="Big Buck Bunny",
        transcript="A giant rabbit gets revenge on three bullies.",
        template={"fixed_hashtags": ["#CCBY"]},
        platform="youtube",
        attribution_text="Big Buck Bunny (c) copyright 2008, Blender Foundation. CC-BY 3.0",
        api_key=None,
    )
    assert description.endswith("Big Buck Bunny (c) copyright 2008, Blender Foundation. CC-BY 3.0")
    assert "#CCBY" in hashtags
    assert "#Shorts" in hashtags


def test_generate_metadata_falls_back_when_llm_key_present_but_call_fails(monkeypatch):
    # No real anthropic package/network in this test env: passing a
    # (fake) api_key still must not raise or skip the attribution step.
    title, description, hashtags = generate_metadata(
        work_name="Tears of Steel",
        transcript="A group of soldiers and scientists battle robots.",
        template={},
        platform="tiktok",
        attribution_text="CC-BY Blender Foundation",
        api_key="not-a-real-key",
    )
    assert description.endswith("CC-BY Blender Foundation")
    assert title

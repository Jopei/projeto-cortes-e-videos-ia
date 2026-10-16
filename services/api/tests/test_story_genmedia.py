"""Provider adapters, semaphore, timeline/Ken Burns maths and the Claude
wrapper — all offline (HTTP and the Anthropic client are mocked)."""

from __future__ import annotations

import base64
import json
from types import SimpleNamespace

import pytest

from app.config import get_settings
from app.worker.genmedia.base import ProviderError, safe_download
from app.worker.genmedia.elevenlabs import ElevenLabsTTS, group_words
from app.worker.genmedia.semaphore import MemorySlotStore, inflight_limit
from app.worker.story import llm
from app.worker.story.assemble import AssembleError, build_episode_ass, compute_timeline, kenburns_filter


# ------------------------------------------------------------ semaphore ----


def test_semaphore_respects_limit_and_release():
    store = MemorySlotStore()
    assert store.acquire("genmedia:inflight:p", "a", 2, 60)
    assert store.acquire("genmedia:inflight:p", "b", 2, 60)
    assert not store.acquire("genmedia:inflight:p", "c", 2, 60)
    assert store.acquire("genmedia:inflight:p", "a", 2, 60)  # re-acquire by the same holder is idempotent
    assert store.count("genmedia:inflight:p") == 2
    store.release("genmedia:inflight:p", "a")
    assert store.acquire("genmedia:inflight:p", "c", 2, 60)
    # an expired holder frees its slot
    assert store.acquire("other", "x", 1, -1)
    assert store.acquire("other", "y", 1, 60)


def test_lock_is_exclusive():
    store = MemorySlotStore()
    token = store.try_lock("series_tick", 60)
    assert token and store.try_lock("series_tick", 60) is None
    store.unlock("series_tick", "wrong")
    assert store.try_lock("series_tick", 60) is None
    store.unlock("series_tick", token)
    assert store.try_lock("series_tick", 60)


def test_inflight_limit_default_and_override(monkeypatch):
    assert inflight_limit("some_provider") == get_settings().genmedia_max_inflight_default == 2
    monkeypatch.setenv("GENMEDIA_MAX_INFLIGHT_SOME_PROVIDER", "5")
    assert inflight_limit("some_provider") == 5


# ----------------------------------------------------------- ElevenLabs ----


def alignment_for(text: str, step: float = 0.1) -> dict:
    return {
        "characters": list(text),
        "character_start_times_seconds": [round(i * step, 3) for i in range(len(text))],
        "character_end_times_seconds": [round((i + 1) * step, 3) for i in range(len(text))],
    }


def test_group_words_from_character_alignment():
    al = alignment_for("Olá, mundo  novo")
    words = group_words(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"])
    assert [w["word"] for w in words] == ["Olá,", "mundo", "novo"]
    assert words[0]["start"] == 0.0 and words[0]["end"] == 0.4
    assert words[1]["start"] == 0.5 and words[1]["end"] == 1.0
    assert words[2]["start"] == 1.2  # double space does not create an empty word


class Recorder:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, method, url, headers, body, timeout):
        self.requests.append((method, url, headers, body))
        return self.responses.pop(0)


def test_elevenlabs_synthesize_with_timestamps(tmp_path):
    text = "A maré sobe"
    payload = {"audio_base64": base64.b64encode(b"ID3fake-mp3").decode(), "alignment": alignment_for(text)}
    transport = Recorder([(200, {}, json.dumps(payload).encode())])
    tts = ElevenLabsTTS("secret-key", transport=transport, price_per_1k_chars=0.3)
    out = tmp_path / "n.mp3"
    res = tts.synthesize(text, "voice/1", "pt-BR", str(out), {"voice_settings": {"stability": 0.5}})

    assert out.read_bytes() == b"ID3fake-mp3"
    assert [w["word"] for w in res.words] == ["A", "maré", "sobe"]
    assert res.duration_s == pytest.approx(len(text) * 0.1)
    assert res.cost_usd == pytest.approx(len(text) / 1000 * 0.3)
    method, url, headers, body = transport.requests[0]
    assert method == "POST"
    assert "/v1/text-to-speech/voice%2F1/with-timestamps" in url and "output_format=mp3_44100_128" in url
    assert headers["xi-api-key"] == "secret-key"
    sent = json.loads(body)
    assert sent["text"] == text and sent["model_id"] == "eleven_multilingual_v2" and sent["voice_settings"] == {"stability": 0.5}
    assert "language_code" not in sent


def test_elevenlabs_model_is_configurable(tmp_path):
    payload = {"audio_base64": base64.b64encode(b"x").decode(), "alignment": alignment_for("oi")}
    transport = Recorder([(200, {}, json.dumps(payload).encode())])
    ElevenLabsTTS("k", model_id="eleven_flash_v2_5", transport=transport).synthesize(
        "oi", "v", "pt-BR", str(tmp_path / "a.mp3"), {"language_code": "pt"}
    )
    sent = json.loads(transport.requests[0][3])
    assert sent["model_id"] == "eleven_flash_v2_5" and sent["language_code"] == "pt"


@pytest.mark.parametrize(
    "status,kwargs",
    [(429, {"retryable": True}), (503, {"retryable": True}), (401, {"retryable": False}), (400, {"retryable": False})],
)
def test_elevenlabs_error_mapping(tmp_path, status, kwargs):
    transport = Recorder([(status, {"retry-after": "7"}, b'{"detail": "nope"}')])
    with pytest.raises(ProviderError) as exc:
        ElevenLabsTTS("k", transport=transport).synthesize("oi", "v", "pt-BR", str(tmp_path / "a.mp3"))
    assert exc.value.retryable is kwargs["retryable"]
    if status == 429:
        assert exc.value.retry_after == 7.0


def test_elevenlabs_list_voices():
    body = {"voices": [
        {"voice_id": "b", "name": "Zeca", "labels": {"gender": "male"}, "preview_url": "https://x/z.mp3"},
        {"voice_id": "a", "name": "Ana", "labels": {"gender": "female"}, "preview_url": None},
    ]}
    transport = Recorder([(200, {}, json.dumps(body).encode())])
    voices = ElevenLabsTTS("k", transport=transport).list_voices("pt-BR")
    assert [v["id"] for v in voices] == ["a", "b"] and voices[0]["gender"] == "female"
    assert transport.requests[0][0] == "GET" and transport.requests[0][1].endswith("/v1/voices")


def test_safe_download_rejects_bad_urls(tmp_path):
    dest = str(tmp_path / "x")
    with pytest.raises(ProviderError):
        safe_download("http://cdn.example.com/a.mp4", dest, ("example.com",))
    with pytest.raises(ProviderError):
        safe_download("https://evil.test/a.mp4", dest, ("example.com",))


# ----------------------------------------------------------- timeline ----


def uniform_words(n, step=0.4):
    return [{"word": f"w{i}", "start": i * step, "end": i * step + step - 0.05} for i in range(n)]


def test_timeline_follows_word_timestamps_and_reaches_minimum():
    words = uniform_words(65)  # 26 s of narration
    tl = compute_timeline(26.0, words, [13] * 5)
    assert tl.tempo == 1.0 and len(tl.durations) == 5
    assert 27.4 <= tl.total_s <= 33.0
    assert all(d > 4 for d in tl.durations[:-1])
    assert tl.words[0]["start"] == pytest.approx(0.3)  # shifted by the lead-in


def test_timeline_speeds_up_slightly_long_narration_and_rejects_too_long():
    tl = compute_timeline(33.0, uniform_words(80, 33 / 80), [16] * 5)
    assert 1.0 < tl.tempo <= 1.08 and tl.total_s <= 33.0
    with pytest.raises(AssembleError) as exc:
        compute_timeline(38.0, uniform_words(80, 38 / 80), [16] * 5)
    assert exc.value.code == "narration_too_long"


def test_timeline_without_matching_timestamps_splits_proportionally():
    tl = compute_timeline(28.0, None, [10, 30])
    assert tl.durations[1] > tl.durations[0] * 2 and tl.total_s >= 27.4


def test_kenburns_directions_vary_per_scene():
    filters = {kenburns_filter(i, 150) for i in range(6)}
    assert len(filters) == 6
    assert all("zoompan" in f and "s=1080x1920" in f and "d=150" in f for f in filters)
    assert kenburns_filter(0, 150) == kenburns_filter(6, 150)


def test_episode_ass_has_title_and_hook():
    words = [{"word": "oi", "start": 0.3, "end": 0.6}]
    ass = build_episode_ass(words, 3, "A grande virada", "Quem abriu a porta?", 30.0)
    assert "Style: Title" in ass and "Style: Hook" in ass
    assert "EP. 3" in ass and "A GRANDE VIRADA" in ass and "Quem abriu a porta?" in ass
    assert "0:00:27.50" in ass  # hook starts 2.5 s before the end


# ------------------------------------------------------------------ LLM ----


class FakeAnthropic:
    def __init__(self, behaviours):
        self.behaviours = list(behaviours)
        self.calls = []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        item = self.behaviours.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def tool_response(data, tool="t", input_tokens=1000, output_tokens=500):
    return SimpleNamespace(content=[SimpleNamespace(type="tool_use", name=tool, input=data)],
                           usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens))


def test_call_structured_forces_tool_and_prices_usage():
    client = FakeAnthropic([tool_response({"ok": 1}, "t", 1_000_000, 100_000)])
    data, usage = llm.call_structured("claude-sonnet-5", "sys", [{"role": "user", "content": "x"}], "t",
                                      {"type": "object"}, 100, "k", client=client)
    assert data == {"ok": 1}
    call = client.calls[0]
    assert call["tool_choice"] == {"type": "tool", "name": "t"} and call["system"] == "sys"
    # sonnet: $3/MTok in, $15/MTok out -> 3.00 + 1.50
    assert float(usage["cost_usd"]) == pytest.approx(4.5)


def test_call_structured_retries_when_tool_missing_then_succeeds():
    empty = SimpleNamespace(content=[SimpleNamespace(type="text", text="oops")], usage=SimpleNamespace(input_tokens=1, output_tokens=1))
    client = FakeAnthropic([empty, tool_response({"a": 1})])
    data, _ = llm.call_structured("claude-opus-5-5", "s", [], "t", {}, 10, "k", client=client, sleep=lambda s: None)
    assert data == {"a": 1} and len(client.calls) == 2


def test_call_structured_gives_up_after_attempts():
    empty = SimpleNamespace(content=[], usage=SimpleNamespace(input_tokens=1, output_tokens=1))
    client = FakeAnthropic([empty, empty, empty])
    with pytest.raises(llm.LLMError):
        llm.call_structured("m", "s", [], "t", {}, 10, "k", client=client, sleep=lambda s: None)


def test_price_table_uses_longest_prefix_and_default():
    assert float(llm.compute_cost_usd("claude-opus-5-5", 1_000_000, 0)) == 15.0
    assert float(llm.compute_cost_usd("claude-haiku-9", 0, 1_000_000)) == 5.0
    assert float(llm.compute_cost_usd("something-else", 1_000_000, 0)) == 3.0

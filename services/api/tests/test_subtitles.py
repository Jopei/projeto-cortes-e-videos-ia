"""Unit tests for ASS/SRT generation (app/worker/render/subtitles.py) — pure
string processing, no ffmpeg needed."""

from __future__ import annotations

from app.worker.render.subtitles import build_ass, build_srt, group_words


def _words(*pairs):
    return [{"start": s, "end": e, "word": w} for s, e, w in pairs]


def test_group_words_caps_at_max_words_per_line():
    words = _words(
        (0.0, 0.3, "one"),
        (0.3, 0.6, "two"),
        (0.6, 0.9, "three"),
        (0.9, 1.2, "four"),
        (1.2, 1.5, "five"),
    )
    groups = group_words(words)
    assert len(groups) == 2
    assert len(groups[0]) == 4
    assert len(groups[1]) == 1


def test_group_words_splits_on_long_duration_even_under_max_words():
    words = _words((0.0, 0.5, "hello"), (5.0, 5.5, "world"))
    groups = group_words(words)
    assert len(groups) == 2


def test_build_ass_contains_dialogue_lines_and_header():
    words = _words((0.0, 0.5, "hello"), (0.5, 1.0, "world"))
    ass_text = build_ass(words)
    assert "[Script Info]" in ass_text
    assert "[V4+ Styles]" in ass_text
    assert "Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,HELLO WORLD" in ass_text


def test_build_srt_has_sequential_numbering_and_comma_timestamps():
    words = _words((0.0, 0.5, "hello"), (60.0, 60.5, "world"))
    srt_text = build_srt(words)
    assert "1\n00:00:00,000 --> 00:00:00,500\nhello" in srt_text
    assert "2\n00:01:00,000 --> 00:01:00,500\nworld" in srt_text

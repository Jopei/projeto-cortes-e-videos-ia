"""Burned-in subtitles: groups whisper words into short (2-4 word) lines and
renders them as a styled ASS (for `-vf ass=...` burn-in) and a plain SRT
(uploaded alongside the clip as `subtitles_key` for download/editing).

Callers are expected to have already sliced the full asset transcript down
to the clip's `[start_s, end_s]` window and shifted timestamps to be
relative to the clip (`word["start"] -= start_s`), matching the clip's own
output video timeline.
"""

from __future__ import annotations

MAX_WORDS_PER_LINE = 4
MIN_WORDS_PER_LINE = 2
MAX_LINE_DURATION = 3.0  # seconds — split a line even under 4 words if it'd otherwise run too long

ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,78,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,5,2,2,60,60,240,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def group_words(words: list[dict]) -> list[list[dict]]:
    groups: list[list[dict]] = []
    current: list[dict] = []
    for word in words:
        if not word.get("word", "").strip():
            continue
        if current:
            duration_if_added = word["end"] - current[0]["start"]
            if len(current) >= MAX_WORDS_PER_LINE or duration_if_added > MAX_LINE_DURATION:
                groups.append(current)
                current = []
        current.append(word)
    if current:
        groups.append(current)
    return groups


def _format_ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours}:{minutes:02d}:{secs:05.2f}"


def _format_srt_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _ass_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", "\\N")


def build_ass(words: list[dict]) -> str:
    lines = [ASS_HEADER]
    for group in group_words(words):
        start = group[0]["start"]
        end = group[-1]["end"]
        text = _ass_escape(" ".join(w["word"] for w in group).upper())
        lines.append(f"Dialogue: 0,{_format_ass_time(start)},{_format_ass_time(end)},Default,,0,0,0,,{text}\n")
    return "".join(lines)


def build_srt(words: list[dict]) -> str:
    blocks = []
    for i, group in enumerate(group_words(words), start=1):
        start = group[0]["start"]
        end = group[-1]["end"]
        text = " ".join(w["word"] for w in group)
        blocks.append(f"{i}\n{_format_srt_time(start)} --> {_format_srt_time(end)}\n{text}\n")
    return "\n".join(blocks)

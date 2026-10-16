"""Episode assembly (plano §4 "Montagem") — no DB/S3, just local files and
ffmpeg. Steps: each scene -> 1080x1920@30fps segment (image scenes get a
Ken Burns zoompan with a direction varied per scene; video scenes are
cropped/fps-normalised and held on the last frame if short), concat, narration
(+ `atempo` <= 1.08 when it is too long, error `narration_too_long`
otherwise), burned ASS (word subtitles from the TTS timestamps, "EP. N"
title in the first ~2 s, the cliffhanger hook in the last ~2.5 s),
`loudnorm` -14 LUFS, x264 crf 20 + aac 128k + faststart, final length forced
into 27-33 s. The video provider's own audio is discarded on purpose (the
episode is voice-only; no music bed yet).
"""

from __future__ import annotations

import os
import textwrap
from dataclasses import dataclass

from app.worker.analysis.ffmpeg_utils import probe_duration_seconds, probe_resolution, run
from app.worker.render.pipeline import _escape_filter_path
from app.worker.render.subtitles import build_ass

WIDTH, HEIGHT, FPS = 1080, 1920, 30
MIN_TOTAL_S, MAX_TOTAL_S = 27.5, 32.5  # target window (hard bounds 27-33 s are checked after encoding)
LEAD_S, TAIL_S = 0.3, 0.8
MAX_ATEMPO = 1.08
TITLE_SECONDS = 2.0
HOOK_SECONDS = 2.5
KB_SCALE = 1.5  # zoompan works on an upscaled frame to avoid jitter


class AssembleError(RuntimeError):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


@dataclass
class SceneAsset:
    index: int
    kind: str  # "image" | "video"
    path: str
    duration_s: float = 0.0  # filled by the timeline


@dataclass
class Timeline:
    durations: list[float]
    tempo: float
    words: list[dict]  # shifted by LEAD_S and scaled by 1/tempo
    total_s: float


# ------------------------------------------------------------ timeline ----


def compute_timeline(
    narration_s: float,
    words: list[dict] | None,
    scene_word_counts: list[int],
    scene_durations_hint: list[float] | None = None,
) -> Timeline:
    """Scene durations driven by the narration. With word timestamps whose
    count matches the script, a scene lasts from the middle of the pause
    before its first word to the middle of the pause after its last word;
    otherwise the narration is split proportionally to word counts."""
    available = MAX_TOTAL_S - LEAD_S - TAIL_S  # narration longer than this is sped up (atempo)
    tempo = 1.0
    if narration_s > available:
        tempo = narration_s / available
        if tempo > MAX_ATEMPO:
            raise AssembleError(
                "narration_too_long",
                f"A narração tem {narration_s:.1f}s e exigiria atempo {tempo:.2f} (> {MAX_ATEMPO}).",
            )
    words = [dict(w) for w in (words or [])]
    narr = narration_s / tempo
    for w in words:
        w["start"] = w["start"] / tempo + LEAD_S
        w["end"] = w["end"] / tempo + LEAD_S

    n = len(scene_word_counts)
    total = LEAD_S + narr + TAIL_S
    boundaries: list[float] = []  # end time of each scene on the final timeline
    if words and len(words) == sum(scene_word_counts):
        cursor = 0
        for i, count in enumerate(scene_word_counts[:-1]):
            last = words[cursor + count - 1]
            nxt = words[cursor + count]
            boundaries.append((last["end"] + nxt["start"]) / 2.0)
            cursor += count
    else:
        weights = [max(c, 1) for c in scene_word_counts]
        acc = 0.0
        for i, weight in enumerate(weights[:-1]):
            acc += weight
            boundaries.append(LEAD_S + narr * acc / sum(weights))
    boundaries.append(total)
    if total < MIN_TOTAL_S:  # hold the last scene so the clip reaches the minimum length
        boundaries[-1] = MIN_TOTAL_S
        total = MIN_TOTAL_S
    durations: list[float] = []
    prev = 0.0
    for b in boundaries:
        durations.append(max(round(b - prev, 3), 0.5))
        prev = b
    total = round(sum(durations), 3)
    return Timeline(durations=durations, tempo=tempo, words=words, total_s=total)


# ---------------------------------------------------------- Ken Burns ----


def kenburns_filter(index: int, frames: int) -> str:
    """zoompan expression for scene `index` (direction varies per scene:
    zoom-in, zoom-out, pan right, pan left, pan up, pan down). The input is
    expected pre-scaled to KB_SCALE x the output size."""
    n = max(frames - 1, 1)
    direction = index % 6
    center_x = "iw/2-(iw/zoom/2)"
    center_y = "ih/2-(ih/zoom/2)"
    exprs = {
        0: (f"1+0.22*on/{n}", center_x, center_y),  # zoom in
        1: (f"1.22-0.22*on/{n}", center_x, center_y),  # zoom out
        2: ("1.18", f"(iw-iw/zoom)*on/{n}", center_y),  # pan -> right
        3: ("1.18", f"(iw-iw/zoom)*(1-on/{n})", center_y),  # pan -> left
        4: ("1.18", center_x, f"(ih-ih/zoom)*(1-on/{n})"),  # pan up
        5: ("1.18", center_x, f"(ih-ih/zoom)*on/{n}"),  # pan down
    }
    z, x, y = exprs[direction]
    return f"zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={WIDTH}x{HEIGHT}:fps={FPS}"


def render_image_segment(image_path: str, out_path: str, duration_s: float, index: int, *, timeout: float = 600.0) -> None:
    frames = max(int(round(duration_s * FPS)), 2)
    big_w, big_h = int(WIDTH * KB_SCALE), int(HEIGHT * KB_SCALE)
    vf = (
        f"scale={big_w}:{big_h}:force_original_aspect_ratio=increase,crop={big_w}:{big_h},"
        f"{kenburns_filter(index, frames)},setsar=1,format=yuv420p"
    )
    run(
        ["ffmpeg", "-y", "-i", image_path, "-vf", vf, "-frames:v", str(frames), "-r", str(FPS), "-an",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", out_path],
        timeout=timeout,
    )


def render_video_segment(video_path: str, out_path: str, duration_s: float, *, timeout: float = 600.0) -> None:
    vf = (
        f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,crop={WIDTH}:{HEIGHT},fps={FPS},"
        f"tpad=stop_mode=clone:stop_duration={duration_s:.3f},setsar=1,format=yuv420p"
    )
    run(
        ["ffmpeg", "-y", "-i", video_path, "-vf", vf, "-t", f"{duration_s:.3f}", "-an",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", out_path],
        timeout=timeout,
    )


# ------------------------------------------------------------ captions ----


def _wrap(text: str, width: int) -> str:
    return "\\N".join(textwrap.wrap(text.replace("{", "(").replace("}", ")"), width=width)) or text


def _ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    return f"{int(seconds // 3600)}:{int(seconds % 3600 // 60):02d}:{seconds % 60:05.2f}"


def build_episode_ass(words: list[dict], episode_number: int, on_screen_title: str, hook: str, total_s: float) -> str:
    """Word subtitles (`build_ass`) + the "EP. N" title card and the hook,
    as extra ASS styles/events — no drawtext, so no font/quoting issues."""
    base = build_ass(words)
    styles = (
        "Style: Title,DejaVu Sans,96,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,6,2,8,60,60,260,1\n"
        "Style: Hook,DejaVu Sans,72,&H0000E5FF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,6,2,5,70,70,0,1\n"
    )
    marker = "\n[Events]"
    head, sep, tail = base.partition(marker)
    base = head.rstrip("\n") + "\n" + styles + sep + tail
    title_text = f"EP. {episode_number}"
    if on_screen_title.strip():
        title_text += "\\N" + _wrap(on_screen_title.strip().upper(), 16)
    events = f"Dialogue: 1,{_ass_time(0.0)},{_ass_time(TITLE_SECONDS)},Title,,0,0,0,,{title_text}\n"
    if hook.strip():
        start = max(total_s - HOOK_SECONDS, TITLE_SECONDS)
        events += f"Dialogue: 1,{_ass_time(start)},{_ass_time(total_s)},Hook,,0,0,0,,{_wrap(hook.strip(), 22)}\n"
    return base + events


# ------------------------------------------------------------ assemble ----


@dataclass
class AssembleResult:
    duration_s: float
    width: int
    height: int
    tempo: float
    ass_text: str
    words: list[dict]


def assemble_episode_video(
    scenes: list[SceneAsset],
    scene_word_counts: list[int],
    narration_path: str,
    narration_s: float,
    words: list[dict] | None,
    *,
    episode_number: int,
    on_screen_title: str,
    hook: str,
    out_path: str,
    work_dir: str,
) -> AssembleResult:
    if len(scenes) != len(scene_word_counts):
        raise AssembleError("scene_mismatch", "Número de cenas diferente do número de trechos de narração.")
    timeline = compute_timeline(narration_s, words, scene_word_counts)

    segments: list[str] = []
    for scene, duration in zip(scenes, timeline.durations):
        scene.duration_s = duration
        seg = os.path.join(work_dir, f"seg_{scene.index:02d}.mp4")
        if scene.kind == "video":
            render_video_segment(scene.path, seg, duration)
        else:
            render_image_segment(scene.path, seg, duration, scene.index)
        segments.append(seg)

    list_path = os.path.join(work_dir, "concat.txt")
    with open(list_path, "w", encoding="utf-8") as fh:
        fh.writelines(f"file '{seg}'\n" for seg in segments)
    video_path = os.path.join(work_dir, "video_concat.mp4")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path, "-c", "copy", video_path], timeout=600)

    ass_text = build_episode_ass(timeline.words, episode_number, on_screen_title, hook, timeline.total_s)
    ass_path = os.path.join(work_dir, "episode.ass")
    with open(ass_path, "w", encoding="utf-8") as fh:
        fh.write(ass_text)

    audio_filters = []
    if timeline.tempo > 1.0:
        audio_filters.append(f"atempo={timeline.tempo:.4f}")
    delay_ms = int(LEAD_S * 1000)
    audio_filters += [f"adelay={delay_ms}|{delay_ms}", f"apad=whole_dur={timeline.total_s:.3f}", "loudnorm=I=-14:TP=-1.5:LRA=11"]
    filter_complex = (
        f"[0:v]ass={_escape_filter_path(ass_path)}[v];[1:a]{','.join(audio_filters)}[a]"
    )
    run(
        ["ffmpeg", "-y", "-i", video_path, "-i", narration_path, "-filter_complex", filter_complex,
         "-map", "[v]", "-map", "[a]", "-t", f"{timeline.total_s:.3f}",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-movflags", "+faststart", out_path],
        timeout=1200,
    )
    duration = probe_duration_seconds(out_path)
    width, height = probe_resolution(out_path)
    if not (27.0 <= duration <= 33.0):
        raise AssembleError("duration_out_of_range", f"Duração final {duration:.1f}s fora de 27-33s.")
    return AssembleResult(duration, width, height, timeline.tempo, ass_text, timeline.words)

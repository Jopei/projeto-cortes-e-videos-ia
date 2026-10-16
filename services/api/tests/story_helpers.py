"""Shared builders for the Series IA worker tests: a fake Claude that answers
each forced tool call with canned (valid) payloads, an in-memory S3, and
helpers to build a series/plan/script. Nothing here talks to the network."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from app.models.story import SeriesStatus, StorySeries
from tests import factories

CORE = ["uma cidade submersa", "um faroleiro misterioso"]


def character(key: str, name: str, role: str = "supporting") -> dict:
    return {
        "key": key, "name": name, "role": role,
        "description": f"{name} vive na cidade submersa de Maré Alta.",
        "visual_description": f"{name}: mulher de uns trinta anos, cabelo curto grisalho, casaco de lã azul-marinho, olhos claros e cicatriz na sobrancelha.",
        "personality": "reservada", "goal": "descobrir a verdade", "arc": "da dúvida à coragem",
    }


def make_plan() -> dict:
    phases = ["setup"] * 3 + ["rising"] * 6 + ["midpoint"] + ["escalation"] * 7 + ["climax"] * 2 + ["resolution"]
    episodes = [
        {
            "number": n, "title": f"Capítulo {n}", "arc_phase": phases[n - 1], "summary": f"Resumo do episódio {n}.",
            "key_events": ["algo acontece"], "planned_state_changes": [],
            "cliffhanger": "" if n == 20 else f"Um novo segredo surge no episódio {n}?",
        }
        for n in range(1, 21)
    ]
    return {
        "title": "Maré Alta", "logline": "Uma cidade submersa guarda um segredo.", "genre": "mistério", "tone": "sombrio",
        "style_guide": {"narration_voice": "calma e misteriosa", "visual_style": "pintura digital sombria, tons azulados",
                        "banned_elements": []},
        "world": {"setting": "cidade submersa", "era": "futuro próximo", "rules": ["a maré sobe à noite"],
                  "locations": [{"key": "farol", "name": "O Farol", "visual_description": "farol antigo coberto de algas"}]},
        "characters": [character("lia", "Lia", "protagonist"), character("tomas", "Tomás", "antagonist"),
                       character("vera", "Vera"), character("noe", "Noé")],
        "relationships": [{"a": "lia", "b": "tomas", "type": "rivalidade", "description": "disputam o farol"}],
        "season_arc": {"theme": "memória", "central_question": "o que a maré esconde?", "ending_summary": "a cidade emerge"},
        "episodes": episodes,
        "open_threads": [{"key": "chave", "description": "a chave perdida", "introduced_in": 1, "planned_resolution_in": 15}],
    }


def make_script(number: int, *, characters_on_screen=("lia",), flashback=False, state_events=None, threads_closed=None) -> dict:
    words = "a maré sobe devagar e cobre as ruas vazias enquanto lia caminha sozinha".split()  # 13 words
    scenes = []
    for i in range(5):
        scenes.append({
            "index": i, "duration_s": 6.0, "narration": " ".join(words), "visual_prompt": f"wide shot of flooded street {i}",
            "visual_mode": "video" if i == 4 else "image", "characters_on_screen": list(characters_on_screen),
            "location_key": "farol", "camera": "slow push-in", "mood": "tenso" if i == 4 else "calmo", "is_flashback": flashback,
        })
    return {
        "number": number, "title": f"Roteiro {number}", "on_screen_title": f"A maré {number}", "scenes": scenes,
        "cliffhanger": "" if number == 20 else "Quem abriu a porta do farol?", "state_events": state_events or [],
        "threads_opened": [], "threads_closed": threads_closed or [], "continuity_notes": "nada",
    }


class FakeClaude:
    """Drop-in for `llm.call_structured`: answers by tool name."""

    def __init__(self, *, script_factory=None, screen_allowed: bool = True, plan: dict | None = None) -> None:
        self.calls: list[str] = []
        self.script_factory = script_factory or (lambda n: make_script(n))
        self.screen_allowed = screen_allowed
        self.plan = plan if plan is not None else make_plan()
        self.plan_attempts = 0
        self.plan_sequence: list[dict] | None = None  # optional per-attempt plans

    def __call__(self, model, system, messages, tool_name, input_schema, max_tokens, api_key, **kw):
        self.calls.append(tool_name)
        usage = {"model": model, "input_tokens": 100, "output_tokens": 50, "cost_usd": Decimal("0.01")}
        if tool_name == "screen_premise":
            reasons = [] if self.screen_allowed else [{"code": "ip_infringement", "message": "usa universo protegido"}]
            return {"allowed": self.screen_allowed, "reasons": reasons, "core_elements": CORE}, usage
        if tool_name == "submit_season_plan":
            self.plan_attempts += 1
            if self.plan_sequence:
                return self.plan_sequence[min(self.plan_attempts, len(self.plan_sequence)) - 1], usage
            return self.plan, usage
        if tool_name == "submit_episode_script":
            number = int(next(m["content"] for m in messages if m["role"] == "user").split("episódio ")[1].split(" ")[0])
            return self.script_factory(number), usage
        if tool_name == "submit_validation":
            return {"ok": True, "scores": {"premise_fidelity": 0.9, "coherence": 0.9, "interest": 0.8, "outline_adherence": 0.9},
                    "issues": []}, usage
        raise AssertionError(tool_name)


class MemS3:
    """In-memory boto3 stand-in covering what the story tasks use."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def upload_file(self, path, bucket, key, ExtraArgs=None):
        with open(path, "rb") as fh:
            self.objects[key] = fh.read()

    def download_file(self, bucket, key, dest):
        with open(dest, "wb") as fh:
            fh.write(self.objects[key])

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self.objects[Key] = Body


def make_series(session_factory, owner_id, *, status=SeriesStatus.PLANNING, **overrides) -> uuid.UUID:
    source_id = factories.insert_source(session_factory, owner_id=owner_id, license_type="ai_generated")
    db = session_factory()
    values = dict(
        owner_id=owner_id, source_id=source_id, premise="Uma cidade submersa e um faroleiro misterioso guardam um segredo antigo.",
        publish_time="19:00", timezone="UTC", status=status, visual_strategy="hybrid", max_video_scenes_per_episode=1,
        video_provider="fake_video", image_provider="fake_image", tts_provider="fake_tts", tts_voice_id="fake-voice",
        originality_attested_at=datetime.now(timezone.utc), require_script_approval=True, lead_days=2,
    )
    values.update(overrides)
    series = StorySeries(**values)
    db.add(series)
    db.commit()
    series_id = series.id
    db.close()
    return series_id


def ffmpeg_available() -> bool:
    import shutil

    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None

"""Single source of truth for the structured payloads of the Series IA
feature (plano §6): Pydantic models + the JSON Schemas of the Claude tools.

Used by the worker (tool `input_schema` + parsing the tool result) and by
the API (validating `PUT /series/{id}/bible` and
`PUT /series/{id}/episodes/{n}/script`). Do not redefine these shapes
elsewhere.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

KEY_PATTERN = r"^[a-z0-9_]{2,32}$"

CharacterRoleT = Literal["protagonist", "antagonist", "supporting", "minor"]
CharacterStatusT = Literal["alive", "dead", "injured", "missing", "transformed"]
ArcPhaseT = Literal["setup", "rising", "midpoint", "escalation", "climax", "resolution"]
VisualModeT = Literal["video", "image"]
EventTypeT = Literal["introduce", "status_change"]


# ---------------------------------------------------------------- bible ----


class Location(BaseModel):
    key: str = Field(pattern=KEY_PATTERN)
    name: str
    visual_description: str = Field(max_length=300)


class World(BaseModel):
    setting: str
    era: str
    rules: list[str] = Field(default_factory=list)
    locations: list[Location] = Field(default_factory=list)


class StyleGuide(BaseModel):
    narration_voice: str
    visual_style: str = Field(max_length=300)
    banned_elements: list[str] = Field(default_factory=list)


class Relationship(BaseModel):
    a: str
    b: str
    type: str
    description: str = ""


class SeasonArc(BaseModel):
    theme: str
    central_question: str
    ending_summary: str


class OpenThread(BaseModel):
    key: str
    description: str
    introduced_in: int = Field(ge=1, le=20)
    planned_resolution_in: int | None = Field(default=None, ge=1, le=20)
    closed_in: int | None = Field(default=None, ge=1, le=20)


class Bible(BaseModel):
    """`StorySeries.bible`. `premise_core_elements` is read-only: the API
    ignores whatever a client sends for it on PUT."""

    world: World
    style_guide: StyleGuide
    relationships: list[Relationship] = Field(default_factory=list)
    season_arc: SeasonArc
    open_threads: list[OpenThread] = Field(default_factory=list)
    premise_core_elements: list[str] = Field(default_factory=list)


# ------------------------------------------------------- screen_premise ----


class PremiseReason(BaseModel):
    code: Literal["ip_infringement", "real_person", "unsafe", "too_vague"]
    message: str


class ScreenPremise(BaseModel):
    allowed: bool
    reasons: list[PremiseReason] = Field(default_factory=list)
    core_elements: list[str] = Field(default_factory=list)


# ---------------------------------------------------- submit_season_plan ----


class PlanCharacter(BaseModel):
    key: str = Field(pattern=KEY_PATTERN)
    name: str
    role: CharacterRoleT
    description: str = Field(max_length=500)
    visual_description: str = Field(
        min_length=80,
        max_length=400,
        description="Fixed visual identity: apparent age, traits, hair, fixed outfit.",
    )
    personality: str
    goal: str
    arc: str


class PlannedStateChange(BaseModel):
    character_key: str
    to_status: CharacterStatusT
    note: str = ""


class PlanEpisode(BaseModel):
    number: int = Field(ge=1, le=20)
    title: str = Field(max_length=70)
    arc_phase: ArcPhaseT
    summary: str = Field(max_length=400)
    key_events: list[str] = Field(default_factory=list)
    planned_state_changes: list[PlannedStateChange] = Field(default_factory=list)
    cliffhanger: str = Field(max_length=140)


class PlanOpenThread(BaseModel):
    key: str
    description: str
    introduced_in: int = Field(ge=1, le=20)
    planned_resolution_in: int = Field(ge=1, le=20)


class SeasonPlan(BaseModel):
    title: str = Field(max_length=80)
    logline: str = Field(max_length=300)
    genre: str
    tone: str
    style_guide: StyleGuide
    world: World
    characters: list[PlanCharacter] = Field(min_length=3, max_length=8)
    relationships: list[Relationship] = Field(default_factory=list)
    season_arc: SeasonArc
    episodes: list[PlanEpisode] = Field(min_length=20, max_length=20)
    open_threads: list[PlanOpenThread] = Field(default_factory=list)


# ------------------------------------------------ submit_episode_script ----


class NewCharacter(BaseModel):
    name: str
    role: CharacterRoleT = "minor"
    description: str = Field(max_length=500)
    visual_description: str = Field(min_length=80, max_length=400)
    personality: str | None = None


class Scene(BaseModel):
    index: int = Field(ge=0)
    duration_s: float = Field(gt=0, le=15)
    narration: str
    visual_prompt: str = Field(max_length=600, description="English, visual only, no on-screen text, no synced speech.")
    visual_mode: VisualModeT = "image"
    characters_on_screen: list[str] = Field(default_factory=list)
    location_key: str | None = None
    camera: str = Field(default="", max_length=80)
    mood: str = Field(default="", max_length=40)
    is_flashback: bool = False


class StateEvent(BaseModel):
    type: EventTypeT
    character_key: str
    new_character: NewCharacter | None = None
    from_status: CharacterStatusT | None = None
    to_status: CharacterStatusT | None = None
    description: str = ""


class ThreadOpened(BaseModel):
    key: str
    description: str


class EpisodeScript(BaseModel):
    number: int = Field(ge=1, le=20)
    title: str = Field(max_length=70)
    on_screen_title: str = Field(max_length=40)
    scenes: list[Scene] = Field(min_length=3, max_length=6)
    cliffhanger: str = Field(default="", max_length=140, description="May be empty only on episode 20.")
    state_events: list[StateEvent] = Field(default_factory=list)
    threads_opened: list[ThreadOpened] = Field(default_factory=list)
    threads_closed: list[str] = Field(default_factory=list)
    continuity_notes: str = Field(default="", max_length=500)


# ------------------------------------------------- submit_validation ----

IssueCodeT = Literal[
    "premise_drift",
    "outline_deviation",
    "dead_character_appears",
    "status_contradiction",
    "unresolved_reference",
    "ip_infringement",
    "real_person",
    "unsafe_content",
    "weak_hook",
    "pacing_overload",
]


class ValidationScores(BaseModel):
    premise_fidelity: float = Field(ge=0, le=1)
    coherence: float = Field(ge=0, le=1)
    interest: float = Field(ge=0, le=1)
    outline_adherence: float = Field(ge=0, le=1)


class ValidationIssue(BaseModel):
    code: IssueCodeT
    severity: Literal["blocker", "warning"]
    scene_index: int | None = None
    message: str
    suggestion: str = ""


class ValidationReport(BaseModel):
    ok: bool
    scores: ValidationScores
    issues: list[ValidationIssue] = Field(default_factory=list)


# ------------------------------------------------------------- tools ----

TOOL_MODELS: dict[str, tuple[type[BaseModel], str]] = {
    "screen_premise": (ScreenPremise, "Triagem da premissa: permitida ou não, com motivos e elementos centrais."),
    "submit_season_plan": (SeasonPlan, "Entrega o plano completo da temporada (20 episódios)."),
    "submit_episode_script": (EpisodeScript, "Entrega o roteiro de um episódio."),
    "submit_validation": (ValidationReport, "Entrega o relatório de validação de um roteiro."),
}


def tool_schema(name: str) -> dict:
    """Anthropic tool definition `{name, description, input_schema}`."""
    model, description = TOOL_MODELS[name]
    schema = model.model_json_schema()
    schema.pop("title", None)
    return {"name": name, "description": description, "input_schema": schema}


def all_tools() -> dict[str, dict]:
    return {name: tool_schema(name) for name in TOOL_MODELS}


def parse_tool_result(name: str, data: dict) -> BaseModel:
    """Validate a tool payload; raises `pydantic.ValidationError`."""
    return TOOL_MODELS[name][0].model_validate(data)

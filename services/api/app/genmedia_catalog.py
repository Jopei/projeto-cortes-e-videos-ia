"""Lightweight catalog (no SDKs, importable by the API) of the media
providers usable by Series IA: video, image and TTS (plano §5). The real
adapters live in `app/worker/genmedia/*`; this module only describes them
(capabilities + estimated price) so the API can validate a provider choice
and quote a season cost before anything is created.

Prices are estimates, configurable per provider via
`GENMEDIA_PRICE_<ID>_USD` (e.g. `GENMEDIA_PRICE_ELEVENLABS_USD=0.3`). Units:
video = USD per second of video, image = USD per image, tts = USD per 1000
characters. `fake_*` providers (cost 0) only exist when
`STORY_FAKE_PROVIDERS_ENABLED=true`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from app.config import get_settings

KINDS = ("video", "image", "tts")
PRICE_UNITS = {"video": "per_second", "image": "per_image", "tts": "per_1k_chars"}


@dataclass(frozen=True)
class Capabilities:
    allowed_durations: tuple[int, ...] = ()
    aspect_ratios: tuple[str, ...] = ("9:16",)
    supports_reference_images: bool = False
    max_reference_images: int = 0
    generates_audio: bool = False
    word_timestamps: bool = False


@dataclass(frozen=True)
class ProviderSpec:
    id: str
    kind: str  # video | image | tts
    name: str
    integration_id: str | None  # None = needs no credentials (fake)
    capabilities: Capabilities = field(default_factory=Capabilities)
    default_price_usd: float = 0.0
    fake: bool = False

    @property
    def price_unit(self) -> str:
        return PRICE_UNITS[self.kind]


_SPECS: list[ProviderSpec] = [
    ProviderSpec(
        id="fake_video",
        kind="video",
        name="Vídeo falso (testes)",
        integration_id=None,
        capabilities=Capabilities(allowed_durations=(4, 5, 6, 8, 10), supports_reference_images=False),
        fake=True,
    ),
    ProviderSpec(
        id="fake_image",
        kind="image",
        name="Imagem falsa (testes)",
        integration_id=None,
        capabilities=Capabilities(supports_reference_images=True, max_reference_images=3),
        fake=True,
    ),
    ProviderSpec(
        id="fake_tts",
        kind="tts",
        name="Voz falsa (testes)",
        integration_id=None,
        capabilities=Capabilities(word_timestamps=True),
        fake=True,
    ),
    ProviderSpec(
        id="elevenlabs",
        kind="tts",
        name="ElevenLabs",
        integration_id="elevenlabs",
        capabilities=Capabilities(word_timestamps=True),
        default_price_usd=0.30,  # conservative; override with GENMEDIA_PRICE_ELEVENLABS_USD
    ),
]


def _visible(spec: ProviderSpec) -> bool:
    return not spec.fake or get_settings().story_fake_providers_enabled


def list_providers(kind: str | None = None) -> list[ProviderSpec]:
    return [s for s in _SPECS if _visible(s) and (kind is None or s.kind == kind)]


def get_provider(provider_id: str, kind: str | None = None) -> ProviderSpec | None:
    for spec in _SPECS:
        if spec.id == provider_id and _visible(spec) and (kind is None or spec.kind == kind):
            return spec
    return None


def price_usd(spec: ProviderSpec) -> float:
    """Estimated unit price (see module docstring); env override wins."""
    raw = os.environ.get(f"GENMEDIA_PRICE_{spec.id.upper()}_USD")
    if raw is not None and raw.strip():
        try:
            return max(float(raw), 0.0)
        except ValueError:
            pass
    return spec.default_price_usd


def is_configured(spec: ProviderSpec) -> bool:
    """Credentials present (DB-then-env). Fakes are always configured."""
    if spec.integration_id is None:
        return True
    from app.integrations import get_integration_value

    return bool(get_integration_value(spec.integration_id, "api_key"))


# --------------------------------------------------------- estimation ----

# Tunables for the estimate (env-overridable, documented in `assumptions`).
CHARS_PER_EPISODE_NARRATION = 450  # ~70 words
LLM_USD_PER_EPISODE_DEFAULT = 0.15  # script + validation
LLM_USD_PLAN_DEFAULT = 1.0  # season plan (planner model)
REGENERATION_MARGIN = 0.20  # headroom for regenerations/retries
EPISODES = 20


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class CostEstimate:
    per_episode_usd: float
    season_usd: float
    breakdown: dict[str, float]  # per episode: video/image/tts/llm
    assumptions: list[str]


def _resolve(provider_id: str | None, kind: str, label: str) -> ProviderSpec | None:
    if provider_id is None:
        return None
    spec = get_provider(provider_id, kind)
    if spec is None:
        raise ValueError(f"Provedor de {label} desconhecido ou indisponível: {provider_id}")
    return spec


def video_scene_count(strategy: str, max_video_scenes: int, scenes: int) -> int:
    if strategy == "economy":
        return 0
    if strategy == "full_video":
        return scenes
    if strategy == "hybrid":
        return max(0, min(max_video_scenes, scenes))
    raise ValueError(f"visual_strategy inválida: {strategy}")


def estimate_episode_cost(
    strategy: str,
    max_video_scenes: int,
    video_provider: str | None,
    image_provider: str | None,
    tts_provider: str | None,
    scenes: int = 5,
    duration: int = 30,
) -> CostEstimate:
    """Pure (no DB): per-episode cost + whole-season cost. Raises
    `ValueError` for unknown strategy/provider. Season = 20 episodes with a
    20% regeneration margin on media+LLM, plus the planning call."""
    v_spec = _resolve(video_provider, "video", "vídeo")
    i_spec = _resolve(image_provider, "image", "imagem")
    t_spec = _resolve(tts_provider, "tts", "TTS")

    n_video = video_scene_count(strategy, max_video_scenes, scenes)
    n_image = scenes - n_video
    seconds_per_scene = duration / scenes if scenes else 0.0
    assumptions = [
        f"{scenes} cenas por episódio de {duration}s ({n_video} em vídeo, {n_image} em imagem).",
        f"Narração de ~{CHARS_PER_EPISODE_NARRATION} caracteres por episódio.",
    ]

    video = 0.0
    if n_video:
        if v_spec is None:
            assumptions.append("Provedor de vídeo não escolhido: custo de vídeo não incluído.")
        else:
            video = n_video * seconds_per_scene * price_usd(v_spec)
    image = 0.0
    if n_image:
        if i_spec is None:
            assumptions.append("Provedor de imagem não escolhido: custo de imagem não incluído.")
        else:
            image = n_image * price_usd(i_spec)
    tts = 0.0
    if t_spec is None:
        assumptions.append("Provedor de voz não escolhido: custo de narração não incluído.")
    else:
        tts = CHARS_PER_EPISODE_NARRATION / 1000.0 * price_usd(t_spec)
    llm = _env_float("STORY_ESTIMATE_LLM_PER_EPISODE_USD", LLM_USD_PER_EPISODE_DEFAULT)
    plan = _env_float("STORY_ESTIMATE_LLM_PLAN_USD", LLM_USD_PLAN_DEFAULT)

    per_episode = video + image + tts + llm
    season = per_episode * EPISODES * (1 + REGENERATION_MARGIN) + plan
    assumptions.append(f"LLM estimado em US$ {llm:.2f} por episódio e US$ {plan:.2f} para o plano da temporada.")
    assumptions.append(f"Temporada = {EPISODES} episódios + {int(REGENERATION_MARGIN * 100)}% de margem para regenerações.")
    assumptions.append("Preços de provedores são estimativas configuráveis, não faturas.")
    return CostEstimate(
        per_episode_usd=round(per_episode, 4),
        season_usd=round(season, 4),
        breakdown={"video": round(video, 4), "image": round(image, 4), "tts": round(tts, 4), "llm": round(llm, 4)},
        assumptions=assumptions,
    )


def estimate_season_cost(*args, **kwargs) -> float:
    """Convenience: `estimate_episode_cost(...).season_usd`."""
    return estimate_episode_cost(*args, **kwargs).season_usd

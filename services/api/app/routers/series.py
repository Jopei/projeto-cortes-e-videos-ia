"""Series IA REST API (plano §2). This module currently only has the two
pre-creation quoting routes the wizard needs; the series CRUD/lifecycle
routes are added by the next step."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.genmedia_catalog import (
    ProviderSpec,
    estimate_episode_cost,
    is_configured,
    list_providers,
    price_usd,
)
from app.schemas.series import ProviderRead, ProvidersRead, SeriesEstimateRead, SeriesEstimateRequest
from app.scope import get_scope

router = APIRouter(prefix="/api/series", tags=["series"], dependencies=[Depends(get_scope)])


def _provider_read(spec: ProviderSpec) -> ProviderRead:
    caps = spec.capabilities
    return ProviderRead(
        id=spec.id,
        name=spec.name,
        configured=is_configured(spec),
        fake=spec.fake,
        supports_reference_images=caps.supports_reference_images,
        max_reference_images=caps.max_reference_images,
        allowed_durations=list(caps.allowed_durations) if spec.kind == "video" else None,
        word_timestamps=caps.word_timestamps if spec.kind == "tts" else None,
        est_cost_usd=price_usd(spec),
        est_cost_unit=spec.price_unit,
    )


@router.get("/providers", response_model=ProvidersRead)
def get_providers() -> ProvidersRead:
    return ProvidersRead(
        video=[_provider_read(s) for s in list_providers("video")],
        image=[_provider_read(s) for s in list_providers("image")],
        tts=[_provider_read(s) for s in list_providers("tts")],
    )


@router.post("/estimate", response_model=SeriesEstimateRead)
def estimate(payload: SeriesEstimateRequest) -> SeriesEstimateRead:
    try:
        result = estimate_episode_cost(
            payload.visual_strategy,
            payload.max_video_scenes_per_episode,
            payload.video_provider,
            payload.image_provider,
            payload.tts_provider,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return SeriesEstimateRead(
        per_episode_usd=result.per_episode_usd,
        season_usd=result.season_usd,
        breakdown=result.breakdown,
        assumptions=result.assumptions,
    )

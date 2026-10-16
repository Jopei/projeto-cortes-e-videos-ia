"""Resolve the `Source` (license record) behind a `Clip` — the input of the
rights gate. A clip comes from either an analysed upload
(`media_asset -> source`) or a Series IA episode (`episode -> series ->
source`). Single place for this lookup (publications router, export,
metadata generation)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.clip import Clip
from app.models.media_asset import MediaAsset
from app.models.source import Source
from app.models.story import StoryEpisode, StorySeries


def resolve_clip_source(db: Session, clip: Clip) -> Source | None:
    if clip.media_asset_id is not None:
        media_asset = db.get(MediaAsset, clip.media_asset_id)
        if media_asset is not None:
            return db.get(Source, media_asset.source_id)
    if clip.episode_id is not None:
        episode = db.get(StoryEpisode, clip.episode_id)
        if episode is not None:
            series = db.get(StorySeries, episode.series_id)
            if series is not None:
                return db.get(Source, series.source_id)
    return None

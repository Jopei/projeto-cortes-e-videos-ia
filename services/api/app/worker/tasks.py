"""Celery task entry points shared by the `worker` and `beat` services.

`run_analysis`/`render_clip`/`regenerate_metadata` are the real "etapa B/C"
engine (audio/scenes/motion/speech/LLM scoring -> clip selection -> ffmpeg
cut/reframe/subtitles -> LLM/fallback metadata). The heavy lifting lives in
`app.worker.analysis.*`, `app.worker.render.*` and `app.worker.metadata.*`
(kept free of DB/S3 concerns so they're unit-testable on their own — see
tests/test_scorer.py, tests/test_subtitles.py); this module owns the
DB/session/S3/job-bookkeeping side.

`publish_clip`/`takedown_publication` are still stubs, reserved for a later
phase (etapa C/5, publishers) — out of scope here.

Error handling: unlike the etapa-A stub, these tasks deliberately do NOT
re-raise after recording a failure. A failed analysis/render/metadata run is
an expected business outcome (bad file, transient ffmpeg/S3 hiccup, no
faces found, etc.), not a task crash — it's recorded on the row itself
(`AnalysisJob.error`, `MediaAsset.status=failed`) and the task still
"succeeds" from Celery's point of view. This also matters for
`CELERY_TASK_ALWAYS_EAGER` + `task_eager_propagates=True` (see
app/worker/celery_app.py, used by tests/conftest.py): re-raising there would
propagate straight out of `run_analysis.delay(...)` and fail the HTTP
request that queued the job.

Tasks open their own DB session via `app.db` (looked up dynamically, not
imported by name, so tests can monkeypatch `app.db.SessionLocal` — see
tests/conftest.py) rather than reusing a FastAPI request-scoped session.
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
import uuid
from datetime import datetime, timezone

import app.db as db_module
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)

DEFAULT_MIN_DURATION = 15.0
DEFAULT_MAX_DURATION = 60.0
DEFAULT_MAX_CLIPS = 6
DEFAULT_REFRAME_MODE = "auto"
DEFAULT_BURN_SUBTITLES = True
DEFAULT_METADATA_PLATFORMS = ("youtube", "tiktok")


def _ensure_tmp_dir(base: str) -> None:
    os.makedirs(base, exist_ok=True)


def _download_asset(client, bucket: str, key: str, dest_path: str) -> None:
    """Streams the S3 object straight to disk (boto3's `download_file`
    manages chunking/multipart internally) — never loads the whole file
    into memory, important for 1-3h source movies."""
    client.download_file(bucket, key, dest_path)


def _upload_file(client, bucket: str, key: str, local_path: str, content_type: str) -> None:
    client.upload_file(local_path, bucket, key, ExtraArgs={"ContentType": content_type})


def _upload_bytes(client, bucket: str, key: str, data: bytes, content_type: str) -> None:
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)


def _transcript_key(media_asset_id: uuid.UUID) -> str:
    return f"media/{media_asset_id}/transcript.json"


@celery_app.task(name="app.worker.tasks.run_analysis")
def run_analysis(job_id: str) -> dict[str, str]:
    import json

    from app.channels import effective_analysis_defaults  # noqa: F401 - kept for symmetry/reference
    from app.config import get_settings
    from app.integrations import get_integration_value
    from app.models.analysis_job import AnalysisJob, AnalysisJobStatus
    from app.models.clip import Clip, ClipStatus
    from app.models.media_asset import MediaAsset, MediaAssetStatus
    from app.presets import PRESET_WEIGHTS
    from app.storage import get_s3_client
    from app.worker.analysis.pipeline import AnalysisCanceled, analyze_video

    settings = get_settings()
    session = db_module.SessionLocal()
    job: AnalysisJob | None = None
    media_asset: MediaAsset | None = None
    tmp_dir: str | None = None

    try:
        job = session.get(AnalysisJob, uuid.UUID(str(job_id)))
        if job is None:
            return {"job_id": job_id, "status": "not_found"}

        media_asset = session.get(MediaAsset, job.media_asset_id)
        if media_asset is None:
            job.status = AnalysisJobStatus.FAILED
            job.error = "MediaAsset not found"
            job.finished_at = datetime.now(timezone.utc)
            session.commit()
            return {"job_id": job_id, "status": "failed"}

        job.status = AnalysisJobStatus.RUNNING
        job.started_at = datetime.now(timezone.utc)
        job.progress = 0
        job.stage = "starting"
        media_asset.status = MediaAssetStatus.ANALYZING
        session.commit()

        def is_canceled() -> bool:
            session.refresh(job)
            return job.status == AnalysisJobStatus.CANCELED

        def on_progress(progress: int, stage: str) -> None:
            job.progress = progress
            job.stage = stage
            session.commit()

        if is_canceled():
            raise AnalysisCanceled()

        _ensure_tmp_dir(settings.worker_tmp_dir)
        tmp_dir = tempfile.mkdtemp(prefix=f"job-{job_id}-", dir=settings.worker_tmp_dir)
        source_path = os.path.join(tmp_dir, "source")

        on_progress(1, "downloading")
        client = get_s3_client()
        _download_asset(client, settings.s3_bucket, media_asset.storage_key, source_path)

        params = dict(job.params or {})
        preset_weights = PRESET_WEIGHTS.get(job.preset, {})
        weights = params.get("weights") or preset_weights

        result = analyze_video(
            source_path,
            weights=weights,
            min_duration=params.get("min_duration") or DEFAULT_MIN_DURATION,
            max_duration=params.get("max_duration") or DEFAULT_MAX_DURATION,
            max_clips=params.get("max_clips") or DEFAULT_MAX_CLIPS,
            language=params.get("language"),
            whisper_enabled=settings.whisper_enabled,
            whisper_model=settings.whisper_model,
            anthropic_api_key=get_integration_value("anthropic", "api_key"),
            on_progress=on_progress,
            is_canceled=is_canceled,
        )

        if result.words:
            on_progress(95, "saving_transcript")
            transcript_payload = {
                "language": result.language,
                "duration": result.duration,
                "words": result.words,
                "segments": result.segments,
            }
            _upload_bytes(
                client,
                settings.s3_bucket,
                _transcript_key(media_asset.id),
                json.dumps(transcript_payload).encode("utf-8"),
                "application/json",
            )

        on_progress(97, "creating_clips")
        reframe_mode = params.get("reframe_mode") or DEFAULT_REFRAME_MODE
        burn_subtitles = params.get("burn_subtitles", DEFAULT_BURN_SUBTITLES)

        created_clip_ids: list[uuid.UUID] = []
        for candidate in result.clips:
            transcript_text = " ".join(
                seg["text"] for seg in result.segments if seg["end"] > candidate.start and seg["start"] < candidate.end
            ).strip()
            signals_with_peak = dict(candidate.signals)
            # `_peak_time` isn't a "signal" per se, just a spare slot in this
            # free-form JSON column used to remember which absolute second
            # (in the source video) scored highest in this window — so
            # render_clip can pick that frame for the thumbnail without a
            # schema change (Clip has no dedicated column for it).
            signals_with_peak["_peak_time"] = candidate.peak_time
            clip = Clip(
                owner_id=job.owner_id,
                job_id=job.id,
                media_asset_id=media_asset.id,
                channel_id=job.channel_id,
                start_s=candidate.start,
                end_s=candidate.end,
                score=candidate.score,
                signals=signals_with_peak,
                transcript=transcript_text or None,
                status=ClipStatus.RENDERING,
            )
            session.add(clip)
            session.flush()
            created_clip_ids.append(clip.id)
        session.commit()

        job.status = AnalysisJobStatus.DONE
        job.progress = 100
        job.stage = "done"
        job.finished_at = datetime.now(timezone.utc)
        media_asset.duration = result.duration
        media_asset.status = MediaAssetStatus.READY
        session.commit()

        for clip_id in created_clip_ids:
            render_clip.delay(str(clip_id))

        return {"job_id": job_id, "status": job.status.value, "clips": str(len(created_clip_ids))}

    except AnalysisCanceled:
        logger.info("analysis job %s canceled", job_id)
        if job is not None:
            job.stage = "canceled"
            if media_asset is not None:
                media_asset.status = MediaAssetStatus.READY
            session.commit()
        return {"job_id": job_id, "status": "canceled"}

    except Exception as exc:  # noqa: BLE001 - record and stop, see module docstring
        logger.exception("run_analysis failed for job %s", job_id)
        session.rollback()
        job = session.get(AnalysisJob, uuid.UUID(str(job_id)))
        if job is not None:
            job.status = AnalysisJobStatus.FAILED
            job.error = str(exc)[:4000]
            job.finished_at = datetime.now(timezone.utc)
            asset = session.get(MediaAsset, job.media_asset_id)
            if asset is not None:
                asset.status = MediaAssetStatus.FAILED
            session.commit()
        return {"job_id": job_id, "status": "failed", "error": str(exc)[:500]}

    finally:
        if tmp_dir is not None:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        session.close()


@celery_app.task(name="app.worker.tasks.render_clip")
def render_clip(clip_id: str) -> dict[str, str]:
    """Cut/reframe/subtitle/normalize `[clip.start_s, clip.end_s]` of the
    clip's source MediaAsset and upload the result. Re-entrant: called both
    right after `run_analysis` creates the clip and again whenever a
    reviewer edits `start_s`/`end_s` via `PATCH /api/clips/{id}`.
    """
    import json

    from app.config import get_settings
    from app.models.analysis_job import AnalysisJob
    from app.models.clip import Clip, ClipStatus
    from app.models.media_asset import MediaAsset
    from app.storage import get_s3_client
    from app.worker.render.pipeline import build_subtitle_files, extract_thumbnail, render_clip_file

    settings = get_settings()
    session = db_module.SessionLocal()
    tmp_dir: str | None = None

    try:
        clip = session.get(Clip, uuid.UUID(str(clip_id)))
        if clip is None:
            return {"clip_id": clip_id, "status": "not_found"}

        media_asset = session.get(MediaAsset, clip.media_asset_id)
        if media_asset is None:
            clip.status = ClipStatus.FAILED
            session.commit()
            return {"clip_id": clip_id, "status": "failed"}

        job = session.get(AnalysisJob, clip.job_id)
        job_params = dict(job.params or {}) if job is not None else {}
        reframe_mode = job_params.get("reframe_mode") or DEFAULT_REFRAME_MODE
        burn_subtitles = job_params.get("burn_subtitles", DEFAULT_BURN_SUBTITLES)

        clip.status = ClipStatus.RENDERING
        session.commit()

        _ensure_tmp_dir(settings.worker_tmp_dir)
        tmp_dir = tempfile.mkdtemp(prefix=f"clip-{clip_id}-", dir=settings.worker_tmp_dir)
        source_path = os.path.join(tmp_dir, "source")
        output_path = os.path.join(tmp_dir, "clip.mp4")
        thumbnail_path = os.path.join(tmp_dir, "thumbnail.jpg")

        client = get_s3_client()
        _download_asset(client, settings.s3_bucket, media_asset.storage_key, source_path)

        words_in_clip: list[dict] = []
        srt_text: str | None = None
        if burn_subtitles:
            try:
                obj = client.get_object(Bucket=settings.s3_bucket, Key=_transcript_key(media_asset.id))
                transcript = json.loads(obj["Body"].read())
                for word in transcript.get("words") or []:
                    if word["end"] > clip.start_s and word["start"] < clip.end_s:
                        words_in_clip.append(
                            {"start": max(0.0, word["start"] - clip.start_s), "end": word["end"] - clip.start_s, "word": word["word"]}
                        )
            except Exception:
                logger.info("no transcript available for media asset %s; rendering without subtitles", media_asset.id)

        render_clip_file(
            source_path,
            clip.start_s,
            clip.end_s,
            output_path,
            reframe_mode=reframe_mode,
            burn_subtitles=burn_subtitles,
            words_in_clip=words_in_clip,
        )

        # Peak frame for the thumbnail: `signals["_peak_time"]` (set by
        # run_analysis, see there) if present, else the middle of the clip —
        # e.g. after a manual PATCH trim, where there's no fresh score curve.
        peak_time = (clip.signals or {}).get("_peak_time")
        if peak_time is None or not (clip.start_s <= peak_time <= clip.end_s):
            peak_time = clip.start_s + (clip.end_s - clip.start_s) / 2.0
        thumbnail_at = peak_time
        extract_thumbnail(source_path, thumbnail_at, thumbnail_path)

        # Storage keys are prefixed per-owner so a raw S3 listing already
        # reflects tenant boundaries (the DB `owner_id` column remains the
        # actual source of truth/enforcement point). tusd-originated uploads
        # get the same `users/{owner_id}/...` prefix too, assigned server-side
        # by the `pre-create` hook — see CLAUDE.md "Auth" and
        # `app/uploads_security.py::new_upload_object_id`.
        key_prefix = f"users/{clip.owner_id}/clips/{clip.id}"
        video_key = f"{key_prefix}/video.mp4"
        thumbnail_key = f"{key_prefix}/thumbnail.jpg"
        _upload_file(client, settings.s3_bucket, video_key, output_path, "video/mp4")
        _upload_file(client, settings.s3_bucket, thumbnail_key, thumbnail_path, "image/jpeg")

        subtitles_key = None
        if words_in_clip:
            _, srt_text = build_subtitle_files(words_in_clip)
            subtitles_key = f"{key_prefix}/subtitles.srt"
            _upload_bytes(client, settings.s3_bucket, subtitles_key, srt_text.encode("utf-8"), "text/plain")

        clip.storage_key = video_key
        clip.thumbnail_key = thumbnail_key
        clip.subtitles_key = subtitles_key
        clip.size_bytes = os.path.getsize(output_path)
        clip.status = ClipStatus.PENDING_REVIEW
        session.commit()

        regenerate_metadata.delay(str(clip.id), None)
        return {"clip_id": clip_id, "status": clip.status.value}

    except Exception as exc:  # noqa: BLE001 - record and stop, see module docstring
        logger.exception("render_clip failed for clip %s", clip_id)
        session.rollback()
        clip = session.get(Clip, uuid.UUID(str(clip_id)))
        if clip is not None:
            clip.status = ClipStatus.FAILED
            session.commit()
        return {"clip_id": clip_id, "status": "failed", "error": str(exc)[:500]}

    finally:
        if tmp_dir is not None:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        session.close()


@celery_app.task(name="app.worker.tasks.regenerate_metadata")
def regenerate_metadata(clip_id: str, platform: str | None = None) -> dict[str, str]:
    """Generate title/description/hashtags for one platform (if `platform`
    is given) or for every platform the clip's channel has an account on
    (falling back to `youtube`+`tiktok` when there's no channel/no
    accounts). Skips a platform whose `ClipMetadata.edited=True` unless that
    exact platform was explicitly requested.
    """
    from app.channels import effective_template
    from app.integrations import get_integration_value
    from app.models.channel import Channel
    from app.models.clip import Clip
    from app.models.clip_metadata import ClipMetadata
    from app.models.media_asset import MediaAsset
    from app.models.platform_account import PlatformAccount
    from app.clip_source import resolve_clip_source
    from app.worker.metadata.pipeline import generate_metadata

    session = db_module.SessionLocal()

    try:
        clip = session.get(Clip, uuid.UUID(str(clip_id)))
        if clip is None:
            return {"clip_id": clip_id, "status": "not_found"}

        media_asset = session.get(MediaAsset, clip.media_asset_id) if clip.media_asset_id else None
        source = resolve_clip_source(session, clip)
        channel = session.get(Channel, clip.channel_id) if clip.channel_id else None

        accounts: list[PlatformAccount] = []
        if clip.channel_id:
            accounts = session.query(PlatformAccount).filter(PlatformAccount.channel_id == clip.channel_id).all()

        if platform:
            target_platforms = [platform]
        elif accounts:
            target_platforms = sorted({a.platform.value for a in accounts})
        else:
            target_platforms = list(DEFAULT_METADATA_PLATFORMS)

        work_name = source.work_name if source is not None else (media_asset.filename if media_asset else "Untitled")
        attribution_text = source.attribution_text if source is not None else None

        # Series IA episode clip: title "{série} — Ep. {n}: {título}", work_name =
        # series title, transcript = the narration (set at assembly).
        episode_title: str | None = None
        if clip.episode_id is not None:
            from app.models.story import StoryEpisode, StorySeries

            episode = session.get(StoryEpisode, clip.episode_id)
            series = session.get(StorySeries, episode.series_id) if episode is not None else None
            if episode is not None and series is not None:
                work_name = series.title or work_name
                episode_title = f"{work_name} — Ep. {episode.number}: {episode.title or ''}".rstrip(": ").strip()

        updated = []
        for plat in target_platforms:
            account = next((a for a in accounts if a.platform.value == plat), None)
            template = effective_template(channel, account)

            entry = (
                session.query(ClipMetadata)
                .filter(ClipMetadata.clip_id == clip.id, ClipMetadata.platform == plat)
                .one_or_none()
            )
            explicitly_requested = platform == plat
            if entry is not None and entry.edited and not explicitly_requested:
                continue

            title, description, hashtags = generate_metadata(
                work_name=work_name,
                transcript=clip.transcript,
                template=template,
                platform=plat,
                attribution_text=attribution_text,
                api_key=get_integration_value("anthropic", "api_key"),
            )
            if episode_title is not None:
                from app.worker.metadata.pipeline import _title_max_for, _truncate_title

                title = _truncate_title(episode_title, _title_max_for(template, plat))

            if entry is None:
                entry = ClipMetadata(clip_id=clip.id, platform=plat)
                session.add(entry)
            entry.title = title
            entry.description = description
            entry.hashtags = hashtags
            if not explicitly_requested:
                entry.edited = False
            updated.append(plat)

        session.commit()
        return {"clip_id": clip_id, "status": "done", "platforms": ",".join(updated)}

    except Exception as exc:  # noqa: BLE001 - record and stop, see module docstring
        logger.exception("regenerate_metadata failed for clip %s", clip_id)
        session.rollback()
        return {"clip_id": clip_id, "platform": platform, "status": "failed", "error": str(exc)[:500]}

    finally:
        session.close()


@celery_app.task(name="app.worker.tasks.publish_clip")
def publish_clip(publication_id: str) -> dict[str, str]:
    """Stub: hand off to the platform's Publisher (app.worker.publishers.*)."""
    return {"publication_id": publication_id, "status": "not_implemented"}


@celery_app.task(name="app.worker.tasks.takedown_publication")
def takedown_publication(publication_id: str) -> dict[str, str]:
    """Stub: call Publisher.delete() to remove/privatize a published post."""
    return {"publication_id": publication_id, "status": "not_implemented"}

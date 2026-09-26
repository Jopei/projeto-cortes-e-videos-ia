"""Celery task entry points shared by the `worker` and `beat` services.

Every task here is a stub for this phase ("etapa A"): it only moves an
entity through its status machine so the API contract (endpoints + models)
is fully wired end to end. The real implementations land in later phases:

- `run_analysis`      -> etapa B (app.worker.analysis/render: scoring,
                          cutting, reframe, subtitles, produces Clip rows).
- `render_clip`        -> etapa B (re-render after a manual start_s/end_s
                          trim from the review screen).
- `regenerate_metadata`-> etapa C (app.worker.metadata: LLM titles/
                          descriptions/hashtags per platform + template).
- `publish_clip`        -> etapa C/5 (app.worker.publishers/*). MUST NOT be
                          enqueued for a (clip, account) pair that hasn't
                          already passed `app.rights.gate.check_publishable`
                          — that check happens in the API before the
                          Publication row is even created, see
                          app/routers/publications.py.
- `takedown_publication`-> etapa C/5 (Publisher.delete()).

Tasks open their own DB session via `app.db` (looked up dynamically, not
imported by name, so tests can monkeypatch `app.db.SessionLocal` — see
tests/conftest.py) rather than reusing a FastAPI request-scoped session.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import app.db as db_module
from app.worker.celery_app import celery_app


@celery_app.task(name="app.worker.tasks.run_analysis")
def run_analysis(job_id: str) -> dict[str, str]:
    from app.models.analysis_job import AnalysisJob, AnalysisJobStatus

    session = db_module.SessionLocal()
    try:
        job = session.get(AnalysisJob, uuid.UUID(str(job_id)))
        if job is None:
            return {"job_id": job_id, "status": "not_found"}

        job.status = AnalysisJobStatus.RUNNING
        job.stage = "stub"
        job.started_at = datetime.now(timezone.utc)
        session.commit()

        # TODO(etapa B): run app.worker.analysis.* (audio/scenes/motion/
        # speech/llm scoring), select+trim peaks, render 9:16 clips, and
        # create the resulting Clip rows here instead of just finishing.
        job.status = AnalysisJobStatus.DONE
        job.progress = 100
        job.stage = "done"
        job.finished_at = datetime.now(timezone.utc)
        session.commit()
        return {"job_id": job_id, "status": job.status.value}
    except Exception as exc:  # noqa: BLE001 - stub: record and re-raise
        session.rollback()
        job = session.get(AnalysisJob, uuid.UUID(str(job_id)))
        if job is not None:
            job.status = AnalysisJobStatus.FAILED
            job.error = str(exc)
            job.finished_at = datetime.now(timezone.utc)
            session.commit()
        raise
    finally:
        session.close()


@celery_app.task(name="app.worker.tasks.render_clip")
def render_clip(clip_id: str) -> dict[str, str]:
    """Stub: re-render a clip's video/thumbnail after a start_s/end_s trim."""
    return {"clip_id": clip_id, "status": "not_implemented"}


@celery_app.task(name="app.worker.tasks.regenerate_metadata")
def regenerate_metadata(clip_id: str, platform: str | None = None) -> dict[str, str]:
    """Stub: regenerate title/description/hashtags for one or all platforms."""
    return {"clip_id": clip_id, "platform": platform, "status": "not_implemented"}


@celery_app.task(name="app.worker.tasks.publish_clip")
def publish_clip(publication_id: str) -> dict[str, str]:
    """Stub: hand off to the platform's Publisher (app.worker.publishers.*)."""
    return {"publication_id": publication_id, "status": "not_implemented"}


@celery_app.task(name="app.worker.tasks.takedown_publication")
def takedown_publication(publication_id: str) -> dict[str, str]:
    """Stub: call Publisher.delete() to remove/privatize a published post."""
    return {"publication_id": publication_id, "status": "not_implemented"}

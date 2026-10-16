from __future__ import annotations

from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "projetos_cortes",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.worker.tasks",
        "app.worker.story.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Lets pytest (and any other in-process caller) run tasks synchronously
    # without needing a real broker — see CELERY_TASK_ALWAYS_EAGER in
    # app/config.py and tests/conftest.py. Never enable this in prod.
    task_always_eager=settings.celery_task_always_eager,
    task_eager_propagates=True,
)

# Series IA queues: `story` (Claude + orchestration) and `genmedia` (provider
# submit/poll/download) are consumed by the `worker-story` service
# (`-Q story,genmedia`); everything else (analysis/render/metadata and the
# ffmpeg `assemble_episode`) stays on the default `celery` queue.
celery_app.conf.task_default_queue = "celery"
celery_app.conf.task_routes = {
    "app.worker.story.tasks.plan_series": {"queue": "story"},
    "app.worker.story.tasks.script_episode": {"queue": "story"},
    "app.worker.story.tasks.validate_episode": {"queue": "story"},
    "app.worker.story.tasks.generate_episode_media": {"queue": "story"},
    "app.worker.story.tasks.maybe_assemble": {"queue": "story"},
    "app.worker.story.tasks.series_tick": {"queue": "story"},
    "app.worker.story.tasks.submit_media_job": {"queue": "genmedia"},
    "app.worker.story.tasks.poll_media_job": {"queue": "genmedia"},
    "app.worker.story.tasks.assemble_episode": {"queue": "celery"},
}

# Celery beat schedule. Series IA agenda tick every 10 minutes (the task
# takes a Redis lock, so overlapping runs are harmless). Etapa C (refresh de
# tokens OAuth, checagem de posting_windows) adds more entries here.
celery_app.conf.beat_schedule = {
    "series-tick": {
        "task": "app.worker.story.tasks.series_tick",
        "schedule": 600.0,
        "options": {"queue": "story"},
    },
}

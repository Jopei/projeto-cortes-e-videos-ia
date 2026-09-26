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

# Celery beat schedule. Empty on purpose for now — etapa C (agendamento,
# refresh de tokens OAuth, checagem de posting_windows) adds entries here.
celery_app.conf.beat_schedule = {}

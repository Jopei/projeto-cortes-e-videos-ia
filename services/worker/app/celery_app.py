from __future__ import annotations

import os

from celery import Celery

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:16379/0")

celery_app = Celery(
    "projetos_cortes_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

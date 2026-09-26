from __future__ import annotations

from app.celery_app import celery_app


@celery_app.task(name="analysis.analyze_media")
def analyze_media(media_id: str) -> dict[str, str]:
    """Placeholder for the intensity-analysis pipeline (Fase 2).

    Will eventually run audio/scene/motion/speech scoring (see
    app/analysis/*), produce Clip candidates, and hand off to app/render/*.
    Publication of any resulting clip must still go through the API's
    rights gate (app.rights.gate.check_publishable) before any
    app/publishers/* implementation is invoked.
    """
    return {"media_id": media_id, "status": "not_implemented"}

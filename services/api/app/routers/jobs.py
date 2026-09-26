from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.audit import record_action
from app.db import get_db
from app.models.analysis_job import AnalysisJob, AnalysisJobStatus
from app.presets import PRESET_WEIGHTS
from app.scope import Scope, get_owned_or_404, get_scope
from app.schemas.analysis_job import AnalysisJobRead, PresetWeights

router = APIRouter(prefix="/api", tags=["jobs"], dependencies=[Depends(get_scope)])


@router.get("/presets", response_model=list[PresetWeights])
def list_presets() -> list[PresetWeights]:
    return [PresetWeights(preset=preset, weights=weights) for preset, weights in PRESET_WEIGHTS.items()]


@router.get("/jobs", response_model=list[AnalysisJobRead])
def list_jobs(
    status: AnalysisJobStatus | None = Query(default=None),
    media_asset_id: uuid.UUID | None = Query(default=None),
    channel_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> list[AnalysisJob]:
    stmt = scope.owned(db.query(AnalysisJob), AnalysisJob)
    if status is not None:
        stmt = stmt.filter(AnalysisJob.status == status)
    if media_asset_id is not None:
        stmt = stmt.filter(AnalysisJob.media_asset_id == media_asset_id)
    if channel_id is not None:
        stmt = stmt.filter(AnalysisJob.channel_id == channel_id)
    return list(stmt.order_by(AnalysisJob.created_at.desc()).all())


@router.get("/jobs/{job_id}", response_model=AnalysisJobRead)
def get_job(job_id: uuid.UUID, db: Session = Depends(get_db), scope: Scope = Depends(get_scope)) -> AnalysisJob:
    return get_owned_or_404(db, AnalysisJob, job_id, scope)


@router.post("/jobs/{job_id}/cancel", response_model=AnalysisJobRead)
def cancel_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
) -> AnalysisJob:
    job = get_owned_or_404(db, AnalysisJob, job_id, scope)
    if job.status in (AnalysisJobStatus.DONE, AnalysisJobStatus.FAILED, AnalysisJobStatus.CANCELED):
        raise HTTPException(status_code=409, detail=f"Job already in a terminal state: {job.status.value}")

    job.status = AnalysisJobStatus.CANCELED
    record_action(
        db,
        user_id=scope.actor.id,
        action="analysis_job.cancel",
        entity="analysis_job",
        entity_id=job.id,
        details=scope.audit_details(),
    )
    db.commit()
    db.refresh(job)
    return job

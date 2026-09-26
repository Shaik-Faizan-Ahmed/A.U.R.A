import env_setup  # noqa: F401 -- must import first, before torch/transformers anywhere in the process, so HF_HOME/TORCH_HOME are set before those libraries read them (see env_setup.py)

from typing import List
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import config
from auth import get_institution_id
from schemas.api_models import (
    SubmissionRequest, SubmissionCreatedResponse, SubmissionResultResponse,
    FlagItem, DecisionRequest, FairnessResponse,
)
import jobs
import uploads
from services.bias_audit import get_fairness_stats

app = FastAPI(
    title="AURA Core API",
    version="0.1.0",
    description=(
        "AI-powered Unbiased Review & Assessment — flags AI-generated submissions "
        "with evidence-backed reasoning and per-group bias auditing. Designed to be "
        "integrated into a college ERP/LMS's assessment-and-grading module. "
        "Every request must include an X-AURA-Key header."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(uploads.router)


@app.get("/")
async def root():
    return {"message": "AURA Core API", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/v1/submissions", response_model=SubmissionCreatedResponse, tags=["submissions"])
async def create_submission(
    body: SubmissionRequest,
    institution_id: str = Depends(get_institution_id),
):
    """Queues a submission for analysis. Returns immediately with a job_id — analysis runs async."""
    job_id = jobs.create_submission_job(
        institution_id=institution_id,
        student_ref=body.student_ref,
        modality=body.modality,
        content_ref=body.content_ref,
        demographic_group=body.demographic_group,
    )
    return SubmissionCreatedResponse(job_id=job_id, status="queued")


@app.get("/v1/submissions/{job_id}", response_model=SubmissionResultResponse, tags=["submissions"])
async def get_submission(job_id: str, institution_id: str = Depends(get_institution_id)):
    """Poll this for job status. Once status == 'complete', the reasoning fields are populated."""
    job = jobs.get_job(job_id)
    if job is None or job["institution_id"] != institution_id:
        raise HTTPException(status_code=404, detail="Job not found")

    result = job.get("result") or {}
    return SubmissionResultResponse(
        job_id=job_id,
        status=job["status"],
        modality=result.get("modality"),
        overall_score=result.get("overall_score"),
        confidence=result.get("confidence"),
        explanation=result.get("explanation"),
        signals=result.get("signals"),
        fairness_banner=result.get("fairness_banner"),
    )


@app.get("/v1/flags", response_model=List[FlagItem], tags=["review"])
async def get_flags(institution_id: str = Depends(get_institution_id)):
    """Lists submissions flagged for human review at this institution."""
    return jobs.list_flags(institution_id)


@app.post("/v1/flags/{flag_id}/decision", response_model=FlagItem, tags=["review"])
async def decide_flag(
    flag_id: str,
    body: DecisionRequest,
    institution_id: str = Depends(get_institution_id),
):
    """Records a human reviewer's decision on a flagged submission. Never automated."""
    flag = jobs.get_flag(flag_id)
    if flag is None or flag["institution_id"] != institution_id:
        raise HTTPException(status_code=404, detail="Flag not found")
    updated = jobs.set_flag_decision(flag_id, body.decision, body.reviewer_id)
    return updated


@app.get("/v1/audit/fairness", response_model=FairnessResponse, tags=["audit"])
async def audit_fairness(institution_id: str = Depends(get_institution_id)):
    """Per-group false-positive-rate breakdown and disparate-impact ratio for this institution."""
    groups, ratio = get_fairness_stats(institution_id)
    return FairnessResponse(institution_id=institution_id, groups=groups, disparate_impact_ratio=ratio)


if __name__ == "__main__":
    import uvicorn
    # Pass the app as an import string ("module:variable") rather than the
    # object itself — required for reload=True to work, since the reloader
    # needs to re-import the module in a subprocess on each file change.
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

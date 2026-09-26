from pydantic import BaseModel
from typing import Optional, Literal, List
from schemas.evidence import Signal


class SubmissionRequest(BaseModel):
    student_ref: str
    modality: Literal["text", "image", "video"]
    content_ref: str  # raw text, or a file path/URL for image/video
    demographic_group: Optional[str] = None  # proxy group, for bias-audit demo purposes


class SubmissionCreatedResponse(BaseModel):
    job_id: str
    status: str


class SubmissionResultResponse(BaseModel):
    job_id: str
    status: str
    modality: Optional[str] = None
    overall_score: Optional[float] = None
    confidence: Optional[float] = None
    explanation: Optional[str] = None
    signals: Optional[List[Signal]] = None
    fairness_banner: Optional[str] = None
    # The proxy group this submission was actually bucketed into for the
    # bias audit (text: language code; image/video: quality_group from
    # models/image_detector.py / video_detector.py). Was computed and
    # persisted (submissions.demographic_group) but never returned here --
    # /v1/audit/fairness and /v1/submissions (the list endpoint) could show
    # it in aggregate, but the single-submission result view (what /submit
    # actually renders right after analysis) had no way to display it.
    demographic_group: Optional[str] = None


class FlagItem(BaseModel):
    flag_id: str
    job_id: str
    student_ref: str
    modality: str
    overall_score: float
    explanation: str
    fairness_banner: Optional[str] = None
    status: Literal["pending", "upheld", "dismissed"]


class DecisionRequest(BaseModel):
    decision: Literal["uphold", "dismiss"]
    reviewer_id: str


class SubmissionListItem(BaseModel):
    """One row for the dashboard's full submission list (flagged + unflagged)."""
    job_id: str
    student_ref: str
    modality: str
    status: str  # queued | processing | complete
    overall_score: Optional[float] = None
    confidence: Optional[float] = None
    fairness_banner: Optional[str] = None
    demographic_group: Optional[str] = None
    created_at: str
    flag_id: Optional[str] = None
    # Derived: pending_review (still analyzing) | approved (complete, not
    # flagged, or flag dismissed) | flagged (flag pending review) |
    # escalated (flag upheld)
    review_status: Literal["pending_review", "approved", "flagged", "escalated"]


class GroupStat(BaseModel):
    group: str
    fpr: float
    fnr: float
    sample_size: int


class FairnessResponse(BaseModel):
    institution_id: str
    groups: List[GroupStat]
    disparate_impact_ratio: float

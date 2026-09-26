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


class GroupStat(BaseModel):
    group: str
    fpr: float
    fnr: float
    sample_size: int


class FairnessResponse(BaseModel):
    institution_id: str
    groups: List[GroupStat]
    disparate_impact_ratio: float

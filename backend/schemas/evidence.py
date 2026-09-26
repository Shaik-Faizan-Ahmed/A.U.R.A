from pydantic import BaseModel
from typing import Optional, Literal


class EvidenceRef(BaseModel):
    # text
    start: Optional[int] = None
    end: Optional[int] = None
    # image
    bbox: Optional[list] = None  # [x, y, w, h]
    # video
    frame_range: Optional[list] = None  # [start_frame, end_frame]
    timestamp: Optional[float] = None


class Signal(BaseModel):
    """
    Common cross-modality detection signal.
    Every detector (text, image, video) must emit results in this shape
    so the reasoning and bias-audit layers stay modality-agnostic.
    """
    modality: Literal["text", "image", "video"]
    signal_name: str
    raw_score: float
    confidence: float
    evidence_ref: Optional[EvidenceRef] = None

import threading
import time
import uuid
from typing import Dict, Any, Optional

from models.progress_tracker import get_progress_tracker
from models.text_detector import analyze_text
from models.image_detector import analyze_image
from models.video_detector import analyze_video
from services.reasoning import build_reasoning, format_explanation
from services.bias_audit import get_fairness_banner, record_outcome
import config

_jobs: Dict[str, Dict[str, Any]] = {}
_flags: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()


def create_submission_job(
    institution_id: str,
    student_ref: str,
    modality: str,
    content_ref: str,
    demographic_group: Optional[str] = None,
) -> str:
    job_id = str(uuid.uuid4())
    with _lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "institution_id": institution_id,
            "student_ref": student_ref,
            "modality": modality,
            "status": "queued",
            "result": None,
        }

    thread = threading.Thread(
        target=_run_analysis,
        args=(job_id, institution_id, student_ref, modality, content_ref, demographic_group),
        daemon=True,
    )
    thread.start()
    return job_id


def _run_analysis(job_id, institution_id, student_ref, modality, content_ref, demographic_group):
    tracker = get_progress_tracker()
    with _lock:
        _jobs[job_id]["status"] = "processing"
    tracker.update(f"Job {job_id}: starting {modality} analysis")

    # --- Phase 1 -----------------------------------------------------
    # Text modality runs the real detector (models/text_detector.py) and
    # goes through reasoning.py's generic confidence-weighted average --
    # appropriate there since no text signal is meant to dominate another
    # by design (see reasoning.py's compute_overall docstring). Image and
    # video (models/image_detector.py, models/video_detector.py) instead
    # compute their own importance-weighted fused (score, confidence) --
    # ported from V.E.R.I.T.A.S's own fusion, where e.g. frame-based
    # analysis is meant to dominate a video verdict (40%) and metadata
    # barely votes (10%) -- and jobs.py uses that fused pair directly as
    # overall_score/confidence instead of averaging the signals again.
    # format_explanation() still builds the same evidence-referencing text
    # either way, just handed a different (score, confidence) to describe.
    if modality == "text":
        signals, text_meta = analyze_text(content_ref)
        # If the caller didn't pass demographic_group, fall back to the
        # detector's own detected-language signal instead of "unspecified"
        # -- ties the bias-audit layer to a real signal the API already
        # computed, rather than requiring the caller to self-report it.
        if demographic_group is None:
            demographic_group = text_meta["suggested_demographic_group"]
        overall_score, confidence, explanation = build_reasoning(signals)
    elif modality == "image":
        signals, fused_meta = analyze_image(content_ref)
        overall_score = fused_meta["fused_score"]
        confidence = fused_meta["fused_confidence"]
        explanation = format_explanation(signals, overall_score, confidence)
    elif modality == "video":
        signals, fused_meta = analyze_video(content_ref)
        overall_score = fused_meta["fused_score"]
        confidence = fused_meta["fused_confidence"]
        explanation = format_explanation(signals, overall_score, confidence)
    else:
        time.sleep(2)
        signals = _fixture_signals(modality, content_ref)
        overall_score, confidence, explanation = build_reasoning(signals)
    # -------------------------------------------------------------------

    fairness_banner = get_fairness_banner(institution_id, demographic_group)

    result = {
        "modality": modality,
        "overall_score": overall_score,
        "confidence": confidence,
        "explanation": explanation,
        "signals": signals,
        "fairness_banner": fairness_banner,
    }

    with _lock:
        _jobs[job_id]["status"] = "complete"
        _jobs[job_id]["result"] = result

    record_outcome(institution_id, demographic_group, overall_score)

    if overall_score >= config.FLAG_THRESHOLD:
        flag_id = str(uuid.uuid4())
        with _lock:
            _flags[flag_id] = {
                "flag_id": flag_id,
                "job_id": job_id,
                "institution_id": institution_id,
                "student_ref": student_ref,
                "modality": modality,
                "overall_score": overall_score,
                "explanation": explanation,
                "fairness_banner": fairness_banner,
                "status": "pending",
            }

    tracker.update(f"Job {job_id}: complete, score={overall_score:.2f}")


def _fixture_signals(modality: str, content_ref: str):
    """Deterministic-ish fixture data so demo runs are repeatable pre-Phase-1."""
    base = min(0.9, 0.3 + (len(content_ref or "") % 50) / 100)

    if modality == "text":
        return [
            {
                "modality": "text", "signal_name": "perplexity",
                "raw_score": round(base, 2), "confidence": 0.8,
                "evidence_ref": {"start": 0, "end": min(40, len(content_ref or ""))},
            },
            {
                "modality": "text", "signal_name": "burstiness",
                "raw_score": round(base * 0.9, 2), "confidence": 0.7,
                "evidence_ref": None,
            },
        ]
    elif modality == "image":
        return [
            {
                "modality": "image", "signal_name": "neural_ensemble",
                "raw_score": round(base, 2), "confidence": 0.85,
                "evidence_ref": {"bbox": [10, 10, 100, 100]},
            },
        ]
    else:  # video
        return [
            {
                "modality": "video", "signal_name": "frame_based",
                "raw_score": round(base, 2), "confidence": 0.8,
                "evidence_ref": {"frame_range": [0, 30]},
            },
            {
                "modality": "video", "signal_name": "temporal_consistency",
                "raw_score": round(base * 0.8, 2), "confidence": 0.75,
                "evidence_ref": {"timestamp": 4.2},
            },
        ]


def get_job(job_id: str):
    with _lock:
        return _jobs.get(job_id)


def list_flags(institution_id: str):
    with _lock:
        return [f for f in _flags.values() if f["institution_id"] == institution_id]


def get_flag(flag_id: str):
    with _lock:
        return _flags.get(flag_id)


def set_flag_decision(flag_id: str, decision: str, reviewer_id: str):
    with _lock:
        flag = _flags.get(flag_id)
        if flag is None:
            return None
        flag["status"] = "upheld" if decision == "uphold" else "dismissed"
        flag["reviewer_id"] = reviewer_id
        return flag

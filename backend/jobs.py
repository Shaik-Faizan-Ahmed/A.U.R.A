import threading
import uuid
import json
import logging
from typing import Optional

from models.progress_tracker import get_progress_tracker
from models.text_detector import analyze_text
from models.image_detector import analyze_image
from models.video_detector import analyze_video
from services.reasoning import build_reasoning, format_explanation
from services.bias_audit import get_fairness_banner, record_outcome
import config
import db

logger = logging.getLogger(__name__)


def create_submission_job(
    institution_id: str,
    student_ref: str,
    modality: str,
    content_ref: str,
    demographic_group: Optional[str] = None,
) -> str:
    job_id = str(uuid.uuid4())

    conn = db.get_connection()
    try:
        with db.WRITE_LOCK:
            conn.execute(
                "INSERT INTO submissions (job_id, institution_id, student_ref, modality, "
                "content_ref, demographic_group, status, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, 'queued', datetime('now'))",
                (job_id, institution_id, student_ref, modality, content_ref, demographic_group),
            )
            conn.commit()
    finally:
        conn.close()

    thread = threading.Thread(
        target=_run_analysis,
        args=(job_id, institution_id, student_ref, modality, content_ref, demographic_group),
        daemon=True,
    )
    thread.start()
    return job_id


def _run_real_analysis(modality: str, content_ref: str):
    """Dispatches to the real per-modality detector. Each of these already
    returns (signals, meta) in AURA's common Signal shape -- see the module
    docstrings in models/text_detector.py, models/image_detector.py, and
    models/video_detector.py."""
    if modality == "text":
        return analyze_text(content_ref)
    elif modality == "image":
        return analyze_image(content_ref)
    elif modality == "video":
        return analyze_video(content_ref)
    else:
        raise ValueError(f"Unknown modality: {modality!r}")


def _suggested_group(modality: str, meta: dict) -> Optional[str]:
    """Falls back to the detector's own proxy-group signal when the caller
    didn't supply demographic_group explicitly. text_detector.py's
    analyze_text() docstring was written for exactly this handoff
    ("suggested_demographic_group ... so callers (jobs.py) can default the
    bias-audit demographic_group ... instead of falling back to
    'unspecified'") but nothing here ever actually read it -- every real
    submission was landing in 'unspecified' regardless of what the detector
    figured out. Image/video use their own quality_group the same way."""
    if modality == "text":
        return meta.get("suggested_demographic_group")
    return meta.get("quality_group")


def _run_analysis(job_id, institution_id, student_ref, modality, content_ref, demographic_group):
    tracker = get_progress_tracker()
    _update_status(job_id, "processing")
    tracker.update(f"Job {job_id}: starting {modality} analysis")

    try:
        signals, meta = _run_real_analysis(modality, content_ref)
    except Exception as e:
        # Mirrors the neutral-signal fallback each detector already uses
        # internally for its own partial failures (e.g. image_detector.py
        # when all four analyzers fail) -- a hard failure here (bad file
        # path, model load error) shouldn't crash the job, just produce a
        # zero-confidence result a human reviewer will see plainly isn't a
        # real verdict.
        logger.exception(f"Job {job_id}: {modality} analysis raised, using neutral fallback")
        signals = [{
            "modality": modality, "signal_name": "analysis_error",
            "raw_score": 0.5, "confidence": 0.0, "evidence_ref": None,
        }]
        meta = {}

    if not demographic_group:
        demographic_group = _suggested_group(modality, meta) or "unspecified"

    # image/video carry their own importance-weighted fused (score, confidence)
    # in meta -- see image_detector.py/video_detector.py's module docstrings
    # and compute_overall()'s docstring in reasoning.py for why a plain
    # confidence-weighted average (build_reasoning) is the wrong fusion for
    # those two. This branch was dropped in the SQLite-persistence rewrite of
    # this function (build_reasoning(signals) was being called unconditionally
    # for every modality) -- silently reintroducing the exact dilution bug
    # that branch was written to fix: a decisive frame_based/temporal signal
    # getting averaged down toward 0.5 by a barely-informative layer with
    # similar confidence, instead of frame_based's intended 40% dominance
    # actually applying. meta.get(...) with a None-check, not meta[...],
    # since the except-block above sets meta = {} on a hard analysis failure
    # and that path must still fall through to build_reasoning's signals-only
    # fallback rather than KeyError.
    fused_score = meta.get("fused_score") if modality in ("image", "video") else None
    if fused_score is not None:
        fused_confidence = meta.get("fused_confidence", 0.0)
        overall_score, confidence = round(fused_score, 3), round(fused_confidence, 3)
        explanation = format_explanation(signals, overall_score, confidence)
    else:
        overall_score, confidence, explanation = build_reasoning(signals)

    # --- Per-modality flag decision --------------------------------------
    # Image/video: no labeled validation set exists yet for either modality
    # (see backend/data/validation/{image,video}/), so they still use the
    # original, unvalidated config.FLAG_THRESHOLD.
    #
    # Text: config.TEXT_FLAG_THRESHOLD was recalibrated against real labeled
    # data (see config.py's comment + backend/data/validation/text/RESULTS.md)
    # but that validation also found the underlying signal unreliable for
    # anything other than English (Spanish AUC ~0.56, French AUC 0.00 --
    # exactly inverted). Rather than let a score we know is unreliable or
    # backwards silently decide "not AI", non-English text is always routed
    # to human review instead of trusting the threshold.
    if modality == "text":
        detected_lang = meta.get("detected_language", "en")
        if detected_lang != "en":
            should_flag = True
            explanation = (
                f"Automated AI-detection accuracy has not been validated for text "
                f"in this language ('{detected_lang}') and was found unreliable in "
                f"internal testing (see backend/data/validation/text/RESULTS.md). "
                f"Routed to human review rather than trusting an automated score.\n\n"
            ) + explanation
        else:
            should_flag = overall_score >= config.TEXT_FLAG_THRESHOLD
    else:
        should_flag = overall_score >= config.FLAG_THRESHOLD

    fairness_banner = get_fairness_banner(institution_id, demographic_group)

    conn = db.get_connection()
    try:
        with db.WRITE_LOCK:
            conn.execute(
                "UPDATE submissions SET status='complete', overall_score=?, confidence=?, "
                "explanation=?, signals_json=?, fairness_banner=?, demographic_group=? WHERE job_id=?",
                (overall_score, confidence, explanation, json.dumps(signals), fairness_banner,
                 demographic_group, job_id),
            )
            conn.commit()
    finally:
        conn.close()

    # Updates the persistent per-group flag-rate stats used by the fairness
    # endpoint. Passes the actual should_flag decision above, not a
    # recomputed one, so the audit stats can never disagree with the real
    # flag/no-flag outcome (see bias_audit.py's record_outcome docstring).
    record_outcome(institution_id, demographic_group, should_flag)

    if should_flag:
        flag_id = str(uuid.uuid4())
        conn = db.get_connection()
        try:
            with db.WRITE_LOCK:
                conn.execute(
                    "INSERT INTO flags (flag_id, job_id, institution_id, student_ref, modality, "
                    "overall_score, explanation, fairness_banner, status, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))",
                    (flag_id, job_id, institution_id, student_ref, modality,
                     overall_score, explanation, fairness_banner),
                )
                conn.commit()
        finally:
            conn.close()

    tracker.update(f"Job {job_id}: complete, score={overall_score:.2f}")


def _update_status(job_id: str, status: str):
    conn = db.get_connection()
    try:
        with db.WRITE_LOCK:
            conn.execute("UPDATE submissions SET status=? WHERE job_id=?", (status, job_id))
            conn.commit()
    finally:
        conn.close()


def get_job(job_id: str):
    """Returns {job_id, institution_id, status, result} -- same shape main.py
    expected from the old in-memory dict, now backed by SQLite."""
    conn = db.get_connection()
    try:
        row = conn.execute("SELECT * FROM submissions WHERE job_id=?", (job_id,)).fetchone()
    finally:
        conn.close()

    if row is None:
        return None

    row = dict(row)
    result = None
    if row["status"] == "complete":
        result = {
            "modality": row["modality"],
            "overall_score": row["overall_score"],
            "confidence": row["confidence"],
            "explanation": row["explanation"],
            "signals": json.loads(row["signals_json"]) if row["signals_json"] else [],
            "fairness_banner": row["fairness_banner"],
            "demographic_group": row["demographic_group"],
        }

    return {
        "job_id": row["job_id"],
        "institution_id": row["institution_id"],
        "status": row["status"],
        "result": result,
    }


def list_submissions(institution_id: str):
    """
    Full submission list (flagged + unflagged) for the dashboard, joined
    against flags so each row carries a derived review_status:
      pending_review -- still queued/processing
      approved       -- complete, never flagged, OR flag was dismissed
      flagged        -- flag exists and is still pending
      escalated      -- flag exists and reviewer upheld it
    """
    conn = db.get_connection()
    try:
        rows = conn.execute(
            """
            SELECT s.*, f.flag_id AS flag_id, f.status AS flag_status
            FROM submissions s
            LEFT JOIN flags f ON f.job_id = s.job_id
            WHERE s.institution_id = ?
            ORDER BY s.created_at DESC
            """,
            (institution_id,),
        ).fetchall()
    finally:
        conn.close()

    items = []
    for r in rows:
        r = dict(r)
        if r["status"] != "complete":
            review_status = "pending_review"
        elif r["flag_id"] is None:
            review_status = "approved"
        elif r["flag_status"] == "pending":
            review_status = "flagged"
        elif r["flag_status"] == "upheld":
            review_status = "escalated"
        else:  # dismissed
            review_status = "approved"

        items.append({
            "job_id": r["job_id"],
            "student_ref": r["student_ref"],
            "modality": r["modality"],
            "status": r["status"],
            "overall_score": r["overall_score"],
            "confidence": r["confidence"],
            "fairness_banner": r["fairness_banner"],
            "demographic_group": r["demographic_group"],
            "created_at": r["created_at"],
            "flag_id": r["flag_id"],
            "review_status": review_status,
        })
    return items


def list_flags(institution_id: str):
    conn = db.get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM flags WHERE institution_id=? ORDER BY created_at DESC",
            (institution_id,),
        ).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


def get_flag(flag_id: str):
    conn = db.get_connection()
    try:
        row = conn.execute("SELECT * FROM flags WHERE flag_id=?", (flag_id,)).fetchone()
    finally:
        conn.close()
    return dict(row) if row else None


def set_flag_decision(flag_id: str, decision: str, reviewer_id: str):
    status = "upheld" if decision == "uphold" else "dismissed"
    conn = db.get_connection()
    try:
        with db.WRITE_LOCK:
            conn.execute(
                "UPDATE flags SET status=?, reviewer_id=?, decided_at=datetime('now') WHERE flag_id=?",
                (status, reviewer_id, flag_id),
            )
            conn.commit()
    finally:
        conn.close()
    return get_flag(flag_id)

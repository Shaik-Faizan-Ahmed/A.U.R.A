"""
Image AI/deepfake-forensics adapter for AURA's Phase 1b image module.

Wraps four detectors copied verbatim from V.E.R.I.T.A.S (D:\\genai-media-verifier)
into this tree, per AURA_BUILD_PLAN.md's reuse map:
  - models/ensemble_detector.py    neural ensemble: 2 HuggingFace deepfake classifiers
  - models/frequency_analyzer.py   FFT / DCT / high-frequency-anomaly analysis
  - models/face_analyzer.py        facial landmark / symmetry / eye / texture forensics
  - models/metadata_analyzer.py    EXIF + Error-Level-Analysis + compression consistency
(plus utils/forensics_utils.py and models/progress_tracker.py, their shared
dependencies, also copied verbatim.)

None of the four analyzer files were modified. This module only adapts
their outputs into AURA's common Signal schema (schemas/evidence.py) so
jobs.py, reasoning.py and bias_audit.py stay modality-agnostic -- exactly
the same pattern models/text_detector.py uses for the text modality.

analyze_image() takes content_ref (a file path, per SubmissionRequest's
"raw text, or a file path/URL for image/video") and returns (signals, meta):
signals is a list of Signal-shaped dicts (one per analyzer that succeeded);
meta carries the fused_score/fused_confidence jobs.py uses directly as
overall_score/confidence (see _combine_scores_aggressive below -- why a
plain average over signals is the wrong fusion for this modality). All
four underlying analyzers already accept either a file path or a
PIL.Image, so content_ref is passed straight through with no extra
loading step here.
"""

from __future__ import annotations
import logging
from typing import List, Optional

from models.ensemble_detector import predict_ensemble
from models.frequency_analyzer import analyze_frequency_domain
from models.face_analyzer import analyze_face
from models.metadata_analyzer import analyze_metadata

logger = logging.getLogger(__name__)

# Base importance weights, ported from V.E.R.I.T.A.S's config.py
# ENSEMBLE_WEIGHTS -- neural is meant to dominate the verdict, not be one
# vote among four equal ones.
_BASE_WEIGHTS = {"neural": 0.50, "frequency": 0.25, "face": 0.15, "metadata": 0.10}


def _combine_scores_aggressive(
    nn_result: Optional[dict],
    freq_result: Optional[dict],
    face_result: Optional[dict],
    meta_result: Optional[dict],
) -> tuple[float, float]:
    """
    Ported from V.E.R.I.T.A.S's services/comprehensive_analyzer.py
    combine_scores_aggressive() -- AURA_BUILD_PLAN.md's reuse map calls
    this out as "reference pattern only, rewrite per-modality," but the
    override rules themselves (confidence-tiered neural weighting,
    cross-signal agreement boosts, stacked face-anomaly boost, EXIF/ELA
    boost) are exactly what made V.E.R.I.T.A.S commit to a confident
    High/Low verdict instead of hovering near the middle. jobs.py uses
    this fused (score, confidence) directly as overall_score/confidence
    for image submissions, instead of routing the four analyzer signals
    through services/reasoning.py's generic confidence-weighted average
    (which treats all four as equally-important votes and loses that
    decisiveness -- see reasoning.py's compute_overall docstring).

    One documented no-op from the original omitted here: its "if >=3
    analyzers pairwise-agree within 0.15, boost every active weight by
    1.2x" step is a uniform scale applied to all weights before they're
    normalized, so it cancels out in the normalization and never changes
    final_score. Left out rather than ported for fidelity's sake, since it
    does nothing in the original either.
    """
    scores: list[float] = []
    active_weights: list[float] = []
    confidences: list[float] = []

    nn_score = nn_result.get("score") if nn_result else None
    if nn_score is not None:
        nn_confidence = nn_result.get("confidence", 0.8)
        agreement = nn_result.get("model_agreement", "unknown")
        w = _BASE_WEIGHTS["neural"]
        if nn_confidence > 0.95 and agreement == "unanimous":
            w *= 2.5
        elif nn_confidence > 0.93 and agreement in ("unanimous", "strong_agreement"):
            w *= 2.0
        elif nn_confidence > 0.90:
            w *= 1.7
        elif nn_confidence > 0.85:
            w *= 1.4
        scores.append(nn_score)
        active_weights.append(w)
        confidences.append(nn_confidence)

    freq_score = freq_result.get("score") if freq_result else None
    if freq_score is not None:
        w = _BASE_WEIGHTS["frequency"]
        if nn_score is not None and (
            (nn_score > 0.7 and freq_score > 0.6) or (nn_score < 0.3 and freq_score < 0.4)
        ):
            w *= 1.4  # neural + frequency agree strongly (both high or both low)
        scores.append(freq_score)
        active_weights.append(w)
        confidences.append(0.7)

    face_detected = bool(face_result and face_result.get("face_detected"))
    face_score = face_result.get("score") if face_result else None
    if face_detected and face_score is not None:
        w = _BASE_WEIGHTS["face"]
        eye = face_result.get("eye_quality_score", 0.5)
        texture = face_result.get("skin_texture_score", 0.5)
        symmetry = face_result.get("symmetry_score", 0.5)
        high_anomalies = sum([eye > 0.7, texture > 0.7, symmetry > 0.65])
        if high_anomalies >= 2:
            w *= 1.5
            if nn_score is not None and nn_score > 0.7:
                w *= 1.3
        scores.append(face_score)
        active_weights.append(w)
        confidences.append(0.75)
    elif active_weights:
        # No face in frame -- redistribute its weight onto neural (index 0),
        # matching V.E.R.I.T.A.S's FACE_NOT_DETECTED_REDISTRIBUTE.
        active_weights[0] += _BASE_WEIGHTS["face"]

    meta_score = meta_result.get("score") if meta_result else None
    if meta_score is not None:
        w = _BASE_WEIGHTS["metadata"]
        if meta_result.get("exif_suspicious") or meta_result.get("ela_anomalies"):
            w *= 1.4
        scores.append(meta_score)
        active_weights.append(w)
        confidences.append(0.65)

    if not scores:
        return 0.5, 0.0

    total_weight = sum(active_weights)
    normalized = [w / total_weight for w in active_weights]
    final_score = sum(s * w for s, w in zip(scores, normalized))

    avg_confidence = sum(confidences) / len(confidences)
    if len(scores) >= 2:
        mean_s = sum(scores) / len(scores)
        variance = sum((s - mean_s) ** 2 for s in scores) / len(scores)
        if variance < 0.04:
            avg_confidence = min(avg_confidence * 1.3, 1.0)
        elif variance < 0.08:
            avg_confidence = min(avg_confidence * 1.15, 1.0)

    return final_score, avg_confidence


def analyze_image(content_ref: str):
    """
    content_ref: file path to the image (per SubmissionRequest.content_ref
    for modality == "image").

    Runs all four analyzers and returns (signals, meta). Each analyzer is
    independently try/excepted so one failing detector (e.g. no face in
    frame, corrupt EXIF, model download failure) doesn't drop the whole
    submission -- it just contributes fewer signals to both the display
    list and the fusion below.

    meta = {"fused_score", "fused_confidence"} -- computed by
    _combine_scores_aggressive() from the same four raw results, using
    V.E.R.I.T.A.S's original importance-weighted fusion rather than a
    plain confidence-weighted average. jobs.py uses meta's fused values as
    overall_score/confidence directly; the individual signals below still
    carry their own (unfused) score/confidence for evidence display.
    """
    signals: List[dict] = []
    ensemble_result = freq_result = face_result = meta_result = None

    # --- Neural ensemble (2 HuggingFace deepfake classifiers) ----------
    try:
        ensemble_result = predict_ensemble(content_ref, silent=True)
        if "error" in ensemble_result:
            ensemble_result = None
        else:
            signals.append({
                "modality": "image",
                "signal_name": "neural_ensemble",
                "raw_score": round(float(ensemble_result["score"]), 3),
                "confidence": round(float(ensemble_result["confidence"]), 3),
                "evidence_ref": None,
            })
    except Exception as e:
        logger.warning(f"Neural ensemble analysis failed: {e}")

    # --- Frequency-domain (FFT / DCT / high-frequency anomalies) -------
    try:
        freq_result = analyze_frequency_domain(content_ref)
        if "error" in freq_result:
            freq_result = None
        else:
            signals.append({
                "modality": "image",
                "signal_name": "frequency_domain",
                "raw_score": round(float(freq_result["score"]), 3),
                "confidence": 0.75,
                "evidence_ref": None,
            })
    except Exception as e:
        logger.warning(f"Frequency-domain analysis failed: {e}")

    # --- Face forensics (symmetry / eye region / skin texture / lighting)
    try:
        face_result = analyze_face(content_ref)
        if face_result.get("face_detected"):
            signals.append({
                "modality": "image",
                "signal_name": "face_forensics",
                "raw_score": round(float(face_result["score"]), 3),
                "confidence": 0.7,
                "evidence_ref": None,
            })
    except Exception as e:
        logger.warning(f"Face forensics analysis failed: {e}")
        face_result = None

    # --- Metadata forensics (EXIF / Error Level Analysis / compression) -
    try:
        meta_result = analyze_metadata(content_ref)
        if "error" in meta_result:
            meta_result = None
        else:
            signals.append({
                "modality": "image",
                "signal_name": "metadata_forensics",
                "raw_score": round(float(meta_result["score"]), 3),
                "confidence": 0.7,
                "evidence_ref": None,
            })
    except Exception as e:
        logger.warning(f"Metadata forensics analysis failed: {e}")

    if not signals:
        # All four analyzers failed (e.g. unreadable/corrupt file) --
        # return a single neutral signal rather than an empty list, so
        # jobs.py doesn't need a special case for image.
        signals.append({
            "modality": "image",
            "signal_name": "neural_ensemble",
            "raw_score": 0.5,
            "confidence": 0.0,
            "evidence_ref": None,
        })
        return signals, {"fused_score": 0.5, "fused_confidence": 0.0}

    fused_score, fused_confidence = _combine_scores_aggressive(
        ensemble_result, freq_result, face_result, meta_result
    )
    return signals, {"fused_score": round(fused_score, 3), "fused_confidence": round(fused_confidence, 3)}

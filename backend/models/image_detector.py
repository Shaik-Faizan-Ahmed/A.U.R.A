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
"raw text, or a file path/URL for image/video") and returns a list of
Signal-shaped dicts. All four underlying analyzers already accept either
a file path or a PIL.Image, so content_ref is passed straight through
with no extra loading step here.
"""

from __future__ import annotations
import logging
from typing import List

from models.ensemble_detector import predict_ensemble
from models.frequency_analyzer import analyze_frequency_domain
from models.face_analyzer import analyze_face
from models.metadata_analyzer import analyze_metadata

logger = logging.getLogger(__name__)


def analyze_image(content_ref: str) -> List[dict]:
    """
    content_ref: file path to the image (per SubmissionRequest.content_ref
    for modality == "image").

    Runs all four analyzers and returns Signal-shaped dicts. Each analyzer
    is independently try/excepted so one failing detector (e.g. no face in
    frame, corrupt EXIF, model download failure) doesn't drop the whole
    submission -- it just contributes fewer signals. reasoning.py never
    needs to know which analyzers ran.
    """
    signals: List[dict] = []

    # --- Neural ensemble (2 HuggingFace deepfake classifiers) ----------
    try:
        ensemble_result = predict_ensemble(content_ref, silent=True)
        if "error" not in ensemble_result:
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
        if "error" not in freq_result:
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

    # --- Metadata forensics (EXIF / Error Level Analysis / compression) -
    try:
        meta_result = analyze_metadata(content_ref)
        if "error" not in meta_result:
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
        # reasoning.py (which expects at least one signal) doesn't need
        # a special case for image.
        signals.append({
            "modality": "image",
            "signal_name": "neural_ensemble",
            "raw_score": 0.5,
            "confidence": 0.0,
            "evidence_ref": None,
        })

    return signals

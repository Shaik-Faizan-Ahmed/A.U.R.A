"""
Video deepfake-detection adapter for AURA's Phase 1b video module.

Wraps models/video/quick_detector.py, copied verbatim from V.E.R.I.T.A.S
(D:\\genai-media-verifier) along with its full models/video/ package and
shared deps (ensemble_detector.py, face_analyzer.py, frequency_analyzer.py,
progress_tracker.py), per AURA_BUILD_PLAN.md's reuse map.

Why quick_detector, not comprehensive_detector: comprehensive runs 9 layers
including MiDaS depth estimation and per-region compression analysis, and
is "genuinely slow" per the build plan -- exactly why submissions are async
jobs in the first place. quick_detector drops the physics/physiological/
boundary/compression layers and keeps metadata, frame-based (ensemble +
face + frequency), temporal consistency, VideoMAE 3D, and audio -- still a
real multi-layer analysis, just bounded to a demo-friendly runtime. Nothing
here is a rewrite of detection logic; analyze_video() takes the raw
per-layer scores quick_detector already computes and reshapes them into
AURA's common Signal schema, the same pattern image_detector.py uses.

analyze_video() does NOT reuse quick_detector's own quick_fusion() output
verbatim (that function also determines its own risk_level string, which
AURA doesn't need), but it DOES reimplement quick_fusion()'s importance-
weighted combination logic locally (see _combine_scores_aggressive() below)
rather than letting services/reasoning.py's generic confidence-weighted
average fuse the layers -- that average was diluting frame_based's
intended 40%-of-the-verdict dominance down to whatever its 0.85 confidence
worked out to relative to the other layers, which is why video verdicts
stopped landing as confidently High/Low as V.E.R.I.T.A.S's did. Each
layer's raw score still becomes its own Signal too, for evidence display.

analyze_video() takes content_ref (a file path, per SubmissionRequest's
"raw text, or a file path/URL for image/video") and returns (signals, meta),
meta = {"fused_score", "fused_confidence"} -- same shape as image_detector.py.
"""

from __future__ import annotations
import logging
import shutil
import tempfile
from typing import List

from models.video.quick_detector import analyze_video_quick

logger = logging.getLogger(__name__)

# Confidence per layer, carried over from quick_detector.quick_fusion()'s own
# per-layer confidence assignments (metadata 0.6, frame_based 0.85, temporal
# 0.75, audio 0.70) -- those values already encode how much V.E.R.I.T.A.S
# trusts each layer type; reusing them here avoids inventing new numbers.
# 3d_video's confidence isn't fixed -- quick_detector reports it per-run
# (VideoMAE's own entropy-derived confidence, or 0.5 for the temporal-features
# fallback when VideoMAE is unavailable) -- so it's read from the result
# rather than hardcoded.
_LAYER_CONFIDENCE = {
    "metadata": 0.6,
    "frame_based": 0.85,
    "temporal": 0.75,
    "audio": 0.70,
}

# quick_detector's internal breakdown keys -> AURA Signal signal_name.
_LAYER_SIGNAL_NAME = {
    "metadata": "metadata_forensics",
    "frame_based": "frame_based",
    "temporal": "temporal_consistency",
    "3d_video": "video_model_3d",
    "audio": "audio_analysis",
}

# Static importance weights, ported from V.E.R.I.T.A.S's quick_detector.py
# quick_fusion() -- frame_based is deliberately the dominant layer (40%),
# not just whichever layer happens to report the highest confidence.
_LAYER_IMPORTANCE = {
    "metadata": 0.10,
    "frame_based": 0.40,
    "temporal": 0.25,
    "3d_video": 0.10,
    "audio": 0.15,
}

# Fairness-audit quality group -- same mechanism and threshold as
# image_detector.py's _quality_group(), just reading width/height straight
# from layer1_metadata (populated by cv2.VideoCapture, always present
# regardless of whether ffprobe succeeded -- see the metadata_forensics
# 0.0-score investigation for why this can't depend on ffprobe). Reuses
# the low_bandwidth_video/standard_video group names bias_audit.py already
# seeds, now actually wired to real classification instead of only demo data.
_LOW_RES_THRESHOLD_PX = 480


def _quality_group(metadata_result: dict) -> str:
    meta = (metadata_result or {}).get("metadata", {})
    # metadata_analyzer.py (video) stores resolution as a single "WxH"
    # string, not separate width/height keys -- unlike image_detector.py's
    # PIL .size tuple. Parse it rather than assuming a shape that isn't
    # actually there (would've silently always fallen through to
    # "standard_video" otherwise).
    resolution = meta.get("resolution", "")
    try:
        width_str, height_str = resolution.lower().split("x", 1)
        width, height = int(width_str), int(height_str)
    except (ValueError, AttributeError):
        # cv2 reports 0x0 for an unopenable file, or resolution may be
        # absent entirely (V.E.R.I.T.A.S's own 'error' path returns a
        # bare {'score': 0.5, 'error': ...} with no 'metadata' key at
        # all) -- either way, don't guess low-bandwidth.
        return "standard_video"
    if width == 0 or height == 0:
        return "standard_video"
    return "low_bandwidth_video" if min(width, height) < _LOW_RES_THRESHOLD_PX else "standard_video"


def _combine_scores_aggressive(breakdown: dict, layer_confidence: dict) -> tuple[float, float]:
    """
    Ported from V.E.R.I.T.A.S's quick_detector.quick_fusion(). The critical
    difference from a plain confidence-weighted average: frame_based
    (which already folds in a peak-frame boost -- see analyze_video()'s own
    comment on frame_score = avg*0.4 + max*0.6) carries 40% of the final
    score by design, while metadata (the least informative layer) only
    carries 10% -- regardless of what confidence either happens to report.
    Treating those two as comparably influential (which a confidence-
    weighted average does, since their confidences of 0.6 and 0.85 aren't
    far apart) is most of why AURA's video verdicts stopped landing as
    confidently High/Low as V.E.R.I.T.A.S's did. jobs.py uses this fused
    (score, confidence) directly as overall_score/confidence for video.
    """
    scores, weights, confidences = [], [], []
    for layer, importance in _LAYER_IMPORTANCE.items():
        if layer not in breakdown:
            continue
        scores.append(breakdown[layer])
        weights.append(importance)
        confidences.append(layer_confidence.get(layer, 0.7))

    if not scores:
        return 0.5, 0.0

    total_weight = sum(weights)
    normalized = [w / total_weight for w in weights]
    final_score = sum(s * w for s, w in zip(scores, normalized))
    # quick_fusion() dampens its reported confidence by 0.8 across the
    # board -- kept here for fidelity even though it doesn't affect which
    # side of the flag threshold a submission lands on.
    avg_confidence = sum(c * w for c, w in zip(confidences, normalized)) * 0.8
    return final_score, avg_confidence


def analyze_video(content_ref: str):
    """
    content_ref: file path to the video (per SubmissionRequest.content_ref
    for modality == "video").

    Runs quick_detector's layers (frame extraction happens once, internally,
    and is shared across the frame-based/temporal/3D layers) and returns
    Signal-shaped dicts. Frame extraction writes to a per-call temp dir so
    concurrent video jobs (each in their own background thread, per jobs.py)
    don't clobber each other's frame files, and the dir is always cleaned up.
    """
    signals: List[dict] = []
    frame_dir = tempfile.mkdtemp(prefix="aura_video_frames_")

    try:
        try:
            result = analyze_video_quick(content_ref, output_dir=frame_dir)
        except Exception as e:
            logger.warning(f"Video analysis failed: {e}")
            result = None

        if not result or "error" in result:
            # Extraction/analysis failed outright (corrupt file, unreadable
            # codec, etc.) -- return a single neutral signal, same fallback
            # image_detector.py uses, so jobs.py never needs a special case
            # for an empty-signals video.
            signals.append({
                "modality": "video",
                "signal_name": "frame_based",
                "raw_score": 0.5,
                "confidence": 0.0,
                "evidence_ref": None,
            })
            return signals, {"fused_score": 0.5, "fused_confidence": 0.0, "quality_group": "standard_video"}

        breakdown = result.get("method_breakdown", {})
        num_frames = len(
            (result.get("layer2a_frame_based") or {}).get("ensemble_scores", [])
        )
        duration = (
            (result.get("layer1_metadata") or {}).get("metadata", {}).get("duration_seconds")
        )
        per_layer_confidence: dict = {}

        for layer_key, raw_score in breakdown.items():
            signal_name = _LAYER_SIGNAL_NAME.get(layer_key)
            if signal_name is None:
                continue  # unknown breakdown key -- skip rather than guess

            # Evidence ref: frame-based/temporal layers point at the frame
            # range that was actually analyzed; metadata/audio (whole-file
            # properties, not localized to specific frames) point at the
            # video's duration instead, when known.
            if layer_key in ("frame_based", "temporal") and num_frames:
                evidence_ref = {"frame_range": [0, num_frames]}
            elif layer_key in ("metadata", "audio") and duration:
                evidence_ref = {"timestamp": round(float(duration), 2)}
            else:
                evidence_ref = None

            if layer_key == "3d_video":
                confidence = (result.get("layer2a_3d_video") or {}).get("confidence", 0.5)
            else:
                confidence = _LAYER_CONFIDENCE.get(layer_key, 0.7)

            per_layer_confidence[layer_key] = confidence
            signals.append({
                "modality": "video",
                "signal_name": signal_name,
                "raw_score": round(float(raw_score), 3),
                "confidence": round(float(confidence), 3),
                "evidence_ref": evidence_ref,
            })

        if not signals:
            signals.append({
                "modality": "video",
                "signal_name": "frame_based",
                "raw_score": 0.5,
                "confidence": 0.0,
                "evidence_ref": None,
            })
            return signals, {"fused_score": 0.5, "fused_confidence": 0.0, "quality_group": _quality_group(result.get("layer1_metadata"))}

        fused_score, fused_confidence = _combine_scores_aggressive(breakdown, per_layer_confidence)
        return signals, {
            "fused_score": round(fused_score, 3),
            "fused_confidence": round(fused_confidence, 3),
            "quality_group": _quality_group(result.get("layer1_metadata")),
        }

    finally:
        shutil.rmtree(frame_dir, ignore_errors=True)

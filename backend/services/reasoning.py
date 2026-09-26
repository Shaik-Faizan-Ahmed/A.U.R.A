from typing import List, Dict, Tuple


def compute_overall(signals: List[Dict]) -> Tuple[float, float]:
    """
    Generic confidence-weighted average. Appropriate for text (paragraphs
    are homogeneous -- there's no analyzer that's supposed to dominate the
    others by design) but NOT for image/video, where V.E.R.I.T.A.S's
    original fusion assigns fixed importance weights per analyzer
    (frame-based = 40% of a video verdict, metadata = 10%) regardless of
    how confident any single analyzer happens to be. image_detector.py and
    video_detector.py compute their own fused score instead of using this.
    """
    if not signals:
        return 0.0, 0.0

    scores = [s["raw_score"] for s in signals]
    confidences = [s["confidence"] for s in signals]

    total_confidence = sum(confidences)
    if total_confidence > 0:
        overall_score = sum(s * c for s, c in zip(scores, confidences)) / total_confidence
    else:
        overall_score = sum(scores) / len(scores)

    avg_confidence = sum(confidences) / len(confidences)
    return overall_score, avg_confidence


def format_explanation(signals: List[Dict], overall_score: float, avg_confidence: float) -> str:
    """
    Builds the plain-language, evidence-referencing explanation from a set
    of signals plus an already-decided overall_score/avg_confidence. Split
    out from build_reasoning() so image/video can supply their own fused
    score (see compute_overall's docstring) while still getting the same
    explanation formatting text gets.
    """
    if not signals:
        return "No signals were available for this submission."

    lines = []
    for s in signals:
        name = s["signal_name"].replace("_", " ")
        ref = s.get("evidence_ref") or {}
        ref_desc = ""
        if ref.get("start") is not None:
            ref_desc = f" (evidence at characters {ref['start']}-{ref['end']})"
        elif ref.get("bbox") is not None:
            ref_desc = f" (evidence in region {ref['bbox']})"
        elif ref.get("frame_range") is not None:
            ref_desc = f" (evidence in frames {ref['frame_range']})"
        elif ref.get("timestamp") is not None:
            ref_desc = f" (evidence at {ref['timestamp']}s)"
        lines.append(f"- {name} scored {s['raw_score']:.2f} (confidence {s['confidence']:.2f}){ref_desc}")

    if overall_score >= 0.6:
        verdict = "likely AI-generated"
    elif overall_score >= 0.4:
        verdict = "borderline / inconclusive"
    else:
        verdict = "likely human-written"

    return (
        f"Overall assessment: {verdict} (score {overall_score:.2f}, confidence {avg_confidence:.2f}).\n"
        f"Contributing signals:\n" + "\n".join(lines) +
        "\n\nThis is evidence for human review, not an automated decision."
    )


def build_reasoning(signals: List[Dict]) -> Tuple[float, float, str]:
    """
    Phase 2: aggregates modality-agnostic signal objects (schemas.evidence.Signal
    shape) into an overall score, confidence, and explanation, using the
    generic confidence-weighted fusion (compute_overall). Used for text and
    as the fallback for unknown modalities. image_detector.py/video_detector.py
    compute their own fused score/confidence and call format_explanation()
    directly instead of this, since a plain confidence-weighted average is
    the wrong fusion for their analyzers (see compute_overall's docstring).
    """
    if not signals:
        return 0.0, 0.0, "No signals were available for this submission."

    overall_score, avg_confidence = compute_overall(signals)
    explanation = format_explanation(signals, overall_score, avg_confidence)
    return round(overall_score, 3), round(avg_confidence, 3), explanation

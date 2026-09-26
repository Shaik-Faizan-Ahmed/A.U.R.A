from typing import List, Dict, Tuple


def build_reasoning(signals: List[Dict]) -> Tuple[float, float, str]:
    """
    Phase 2: aggregates modality-agnostic signal objects (schemas.evidence.Signal
    shape) into an overall score, confidence, and a plain-language,
    evidence-referencing explanation. Works the same regardless of whether the
    signals came from the text, image, or video detector.
    """
    if not signals:
        return 0.0, 0.0, "No signals were available for this submission."

    scores = [s["raw_score"] for s in signals]
    confidences = [s["confidence"] for s in signals]

    total_confidence = sum(confidences)
    if total_confidence > 0:
        overall_score = sum(s * c for s, c in zip(scores, confidences)) / total_confidence
    else:
        overall_score = sum(scores) / len(scores)

    avg_confidence = sum(confidences) / len(confidences)

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

    explanation = (
        f"Overall assessment: {verdict} (score {overall_score:.2f}, confidence {avg_confidence:.2f}).\n"
        f"Contributing signals:\n" + "\n".join(lines) +
        "\n\nThis is evidence for human review, not an automated decision."
    )

    return round(overall_score, 3), round(avg_confidence, 3), explanation

"""
Regression test for jobs.py's fused-score wiring.

This exists because the same bug happened twice: jobs.py calling
build_reasoning(signals) unconditionally for every modality, silently
discarding image_detector.py/video_detector.py's own importance-weighted
fused (score, confidence) in favor of a plain confidence-weighted average
that dilutes a decisive frame_based/temporal signal down toward 0.5.
Neither test_image_detector.py/test_video_detector.py (which test the
detectors in isolation) nor test_submissions_api.py (which only exercises
the text path end-to-end) would ever catch that -- this fills that gap by
asserting what jobs.py actually does with a detector's return value.
"""

import time
from unittest.mock import patch

import pytest

import config
import jobs


FUSED_IMAGE_META = {"fused_score": 0.91, "fused_confidence": 0.8, "quality_group": "standard_image"}
FUSED_VIDEO_META = {"fused_score": 0.68, "fused_confidence": 0.62, "quality_group": "standard_video"}

# Deliberately chosen so a plain confidence-weighted average over these
# signals lands far from the fused_score above -- if jobs.py ever routes
# image/video through build_reasoning() again, this test's assertion on
# the *stored* overall_score will fail even though analyze_image/
# analyze_video themselves are working perfectly.
IMAGE_SIGNALS = [
    {"modality": "image", "signal_name": "neural_ensemble", "raw_score": 0.95, "confidence": 0.9, "evidence_ref": None},
    {"modality": "image", "signal_name": "metadata_forensics", "raw_score": 0.1, "confidence": 0.65, "evidence_ref": None},
]
VIDEO_SIGNALS = [
    {"modality": "video", "signal_name": "frame_based", "raw_score": 0.79, "confidence": 0.85, "evidence_ref": None},
    {"modality": "video", "signal_name": "temporal_consistency", "raw_score": 1.0, "confidence": 0.75, "evidence_ref": None},
    {"modality": "video", "signal_name": "video_model_3d", "raw_score": 0.14, "confidence": 0.7, "evidence_ref": None},
    {"modality": "video", "signal_name": "metadata_forensics", "raw_score": 0.0, "confidence": 0.6, "evidence_ref": None},
]


def _wait_for_completion(job_id: str, timeout_seconds: float = 5.0) -> dict:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        row = jobs.get_job(job_id)
        if row["status"] == "complete":
            return row["result"]
        time.sleep(0.05)
    pytest.fail(f"Job {job_id} did not complete within {timeout_seconds}s")


@patch("jobs.analyze_image")
def test_image_job_stores_the_fused_score_not_an_average(mock_analyze):
    mock_analyze.return_value = (IMAGE_SIGNALS, FUSED_IMAGE_META)

    job_id = jobs.create_submission_job(
        institution_id="college_a", student_ref="s1", modality="image", content_ref="fake.jpg",
    )
    result = _wait_for_completion(job_id)

    assert result["overall_score"] == FUSED_IMAGE_META["fused_score"]
    assert result["confidence"] == FUSED_IMAGE_META["fused_confidence"]


@patch("jobs.analyze_video")
def test_video_job_stores_the_fused_score_not_an_average(mock_analyze):
    mock_analyze.return_value = (VIDEO_SIGNALS, FUSED_VIDEO_META)

    job_id = jobs.create_submission_job(
        institution_id="college_a", student_ref="s1", modality="video", content_ref="fake.mp4",
    )
    result = _wait_for_completion(job_id)

    assert result["overall_score"] == FUSED_VIDEO_META["fused_score"]
    assert result["confidence"] == FUSED_VIDEO_META["fused_confidence"]

    # The actual complaint this whole bug caused: a signal set that should
    # read as decisively AI (frame_based 0.79 + temporal 1.00, both
    # high-importance layers) must clear FLAG_THRESHOLD once the real
    # fused score is used -- a plain confidence-weighted average of these
    # same four signals computes to ~0.524, which does NOT clear it.
    assert result["overall_score"] >= config.FLAG_THRESHOLD


@patch("jobs.analyze_video")
def test_video_falls_back_to_build_reasoning_when_meta_has_no_fused_score(mock_analyze):
    # The hard-failure path in _run_analysis sets meta = {} -- must not
    # KeyError, must fall through to the signals-only fallback instead.
    mock_analyze.side_effect = RuntimeError("boom")

    job_id = jobs.create_submission_job(
        institution_id="college_a", student_ref="s1", modality="video", content_ref="fake.mp4",
    )
    result = _wait_for_completion(job_id)

    assert result["overall_score"] == 0.5
    assert result["confidence"] == 0.0

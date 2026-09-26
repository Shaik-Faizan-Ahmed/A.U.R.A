"""
Unit tests for models/video_detector.py -- the Phase 1b video adapter.

These test the adapter's own logic (signal assembly, schema shape, temp-dir
lifecycle, failure fallback, and the aggressive fusion math), not the
underlying V.E.R.I.T.A.S video pipeline itself (quick_detector.py and
everything it calls are copied verbatim and unmodified, so their own
detection accuracy is out of scope here -- same reasoning as
test_image_detector.py not re-testing its four analyzers). analyze_video_quick
is mocked so this suite runs in milliseconds with no model downloads, no
GPU, no FFmpeg, and no real video file needed.
"""

import os
from unittest.mock import patch

from models.video_detector import analyze_video, _combine_scores_aggressive

FAKE_PATH = "fake_submission.mp4"


def _valid_schema(signal: dict) -> bool:
    return (
        signal["modality"] == "video"
        and isinstance(signal["signal_name"], str)
        and 0.0 <= signal["raw_score"] <= 1.0
        and 0.0 <= signal["confidence"] <= 1.0
    )


def _fake_result(**overrides):
    result = {
        "layer1_metadata": {"score": 0.2, "metadata": {"duration_seconds": 12.5}},
        "layer2a_frame_based": {
            "ensemble_scores": [0.3, 0.4, 0.9],
            "avg_ensemble": 0.53,
            "max_ensemble": 0.9,
        },
        "layer2a_3d_video": {"score": 0.45, "confidence": 0.7, "method": "videomae"},
        "layer2a_temporal": {"score": 0.35, "identity_shifts": 1},
        "layer2b_audio": {"has_audio": True, "score": 0.25},
        "method_breakdown": {
            "metadata": 0.2,
            "frame_based": 0.62,
            "temporal": 0.35,
            "3d_video": 0.45,
            "audio": 0.25,
        },
        "final_score": 0.4,
        "risk_level": "Medium",
        "confidence": 0.7,
    }
    result.update(overrides)
    return result


@patch("models.video_detector.analyze_video_quick")
def test_all_layers_succeed(mock_quick):
    mock_quick.return_value = _fake_result()

    signals, meta = analyze_video(FAKE_PATH)

    names = {s["signal_name"] for s in signals}
    assert names == {
        "metadata_forensics", "frame_based", "temporal_consistency",
        "video_model_3d", "audio_analysis",
    }
    assert all(_valid_schema(s) for s in signals)

    frame_signal = next(s for s in signals if s["signal_name"] == "frame_based")
    assert frame_signal["raw_score"] == 0.62
    assert frame_signal["evidence_ref"] == {"frame_range": [0, 3]}

    video_3d_signal = next(s for s in signals if s["signal_name"] == "video_model_3d")
    # 3d_video confidence is read from the layer's own result, not the fixed table
    assert video_3d_signal["confidence"] == 0.7

    metadata_signal = next(s for s in signals if s["signal_name"] == "metadata_forensics")
    assert metadata_signal["evidence_ref"] == {"timestamp": 12.5}

    assert 0.0 <= meta["fused_score"] <= 1.0
    assert 0.0 <= meta["fused_confidence"] <= 1.0


@patch("models.video_detector.analyze_video_quick")
def test_partial_breakdown_only_emits_present_layers(mock_quick):
    mock_quick.return_value = _fake_result(
        method_breakdown={"metadata": 0.2, "frame_based": 0.5},
        layer2b_audio={"has_audio": False, "score": 0.0},
    )

    signals, meta = analyze_video(FAKE_PATH)

    names = {s["signal_name"] for s in signals}
    assert names == {"metadata_forensics", "frame_based"}


@patch("models.video_detector.analyze_video_quick")
def test_extraction_failure_returns_single_neutral_signal(mock_quick):
    mock_quick.return_value = {"error": "Failed to extract frames", "final_score": 0.5}

    signals, meta = analyze_video(FAKE_PATH)

    assert len(signals) == 1
    assert signals[0]["signal_name"] == "frame_based"
    assert signals[0]["raw_score"] == 0.5
    assert signals[0]["confidence"] == 0.0
    assert meta == {"fused_score": 0.5, "fused_confidence": 0.0}


@patch("models.video_detector.analyze_video_quick")
def test_analyzer_exception_returns_single_neutral_signal(mock_quick):
    mock_quick.side_effect = RuntimeError("corrupt codec")

    signals, meta = analyze_video(FAKE_PATH)

    assert len(signals) == 1
    assert signals[0]["confidence"] == 0.0


@patch("models.video_detector.analyze_video_quick")
def test_frame_dir_is_created_and_cleaned_up(mock_quick):
    captured_dir = {}

    def _capture(content_ref, output_dir=None):
        captured_dir["path"] = output_dir
        assert os.path.isdir(output_dir)  # exists while analysis "runs"
        return _fake_result()

    mock_quick.side_effect = _capture

    analyze_video(FAKE_PATH)

    assert captured_dir["path"] is not None
    assert not os.path.isdir(captured_dir["path"])  # cleaned up after


# --- Fusion math: proves frame_based actually dominates the verdict,   --
# --- the way V.E.R.I.T.A.S's quick_fusion() does, rather than being    --
# --- diluted to "one layer among five" by a plain average.             --

def test_frame_based_dominates_a_plain_average():
    # frame_based (40% importance) says strongly fake; the other four
    # layers (metadata 10%, temporal 25%, 3d_video 10%, audio 15%) all
    # say strongly real. A plain average of five equal votes would land
    # at 0.28. frame_based's 40% share should pull the fused score well
    # above that.
    breakdown = {
        "metadata": 0.1, "frame_based": 0.9, "temporal": 0.1,
        "3d_video": 0.1, "audio": 0.1,
    }
    layer_confidence = {"metadata": 0.6, "frame_based": 0.85, "temporal": 0.75,
                         "3d_video": 0.5, "audio": 0.70}

    fused_score, _ = _combine_scores_aggressive(breakdown, layer_confidence)

    plain_average = (0.1 + 0.9 + 0.1 + 0.1 + 0.1) / 5  # 0.26
    assert fused_score > plain_average
    assert fused_score > 0.4  # commits toward "fake" despite 4-to-1 disagreement


def test_metadata_alone_barely_moves_the_score():
    # metadata is the least-important layer (10% base weight). With all
    # five layers present -- so metadata's weight isn't artificially
    # inflated by renormalizing over a smaller active set -- swinging it
    # from 0.1 to 0.9 alone should move the fused score far less than the
    # same swing on frame_based (40% base weight, 4x metadata's share).
    layer_confidence = {"metadata": 0.6, "frame_based": 0.85, "temporal": 0.75,
                         "3d_video": 0.5, "audio": 0.70}

    def breakdown(metadata_score):
        return {"metadata": metadata_score, "frame_based": 0.5, "temporal": 0.5,
                 "3d_video": 0.5, "audio": 0.5}

    low = _combine_scores_aggressive(breakdown(0.1), layer_confidence)[0]
    high = _combine_scores_aggressive(breakdown(0.9), layer_confidence)[0]

    assert (high - low) < 0.15


def test_confidence_is_dampened_by_fixed_factor():
    # quick_fusion()'s reported confidence is deliberately scaled down by
    # 0.8 across the board -- verifies that dampening survived the port.
    breakdown = {"frame_based": 0.5}
    layer_confidence = {"frame_based": 0.85}

    _, fused_confidence = _combine_scores_aggressive(breakdown, layer_confidence)

    assert fused_confidence == 0.85 * 0.8

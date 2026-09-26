"""
Unit tests for models/image_detector.py -- the Phase 1b adapter.

These test the adapter's own logic (signal assembly, schema shape,
per-analyzer failure isolation, and the aggressive fusion math), not the
underlying V.E.R.I.T.A.S analyzers themselves (ensemble_detector /
frequency_analyzer / face_analyzer / metadata_analyzer are copied verbatim
and unmodified, so their own accuracy is out of scope here -- same
reasoning as why test_text_detector.py doesn't re-test transformers). The
four analyzer calls are mocked so this suite runs in milliseconds with no
model downloads, no GPU, and no real image file needed.
"""

from unittest.mock import patch
from models.image_detector import analyze_image, _combine_scores_aggressive


FAKE_PATH = "fake_submission.jpg"


def _valid_schema(signal: dict) -> bool:
    return (
        signal["modality"] == "image"
        and isinstance(signal["signal_name"], str)
        and 0.0 <= signal["raw_score"] <= 1.0
        and 0.0 <= signal["confidence"] <= 1.0
    )


@patch("models.image_detector.analyze_metadata")
@patch("models.image_detector.analyze_face")
@patch("models.image_detector.analyze_frequency_domain")
@patch("models.image_detector.predict_ensemble")
def test_all_four_analyzers_succeed(mock_ensemble, mock_freq, mock_face, mock_meta):
    mock_ensemble.return_value = {"score": 0.82, "confidence": 0.91}
    mock_freq.return_value = {"score": 0.4}
    mock_face.return_value = {"score": 0.3, "face_detected": True}
    mock_meta.return_value = {"score": 0.6}

    signals, meta = analyze_image(FAKE_PATH)

    names = {s["signal_name"] for s in signals}
    assert names == {"neural_ensemble", "frequency_domain", "face_forensics", "metadata_forensics"}
    assert all(_valid_schema(s) for s in signals)
    ensemble_signal = next(s for s in signals if s["signal_name"] == "neural_ensemble")
    assert ensemble_signal["raw_score"] == 0.82
    assert ensemble_signal["confidence"] == 0.91
    assert 0.0 <= meta["fused_score"] <= 1.0
    assert 0.0 <= meta["fused_confidence"] <= 1.0


@patch("models.image_detector.analyze_metadata")
@patch("models.image_detector.analyze_face")
@patch("models.image_detector.analyze_frequency_domain")
@patch("models.image_detector.predict_ensemble")
def test_face_signal_omitted_when_no_face_detected(mock_ensemble, mock_freq, mock_face, mock_meta):
    mock_ensemble.return_value = {"score": 0.5, "confidence": 0.7}
    mock_freq.return_value = {"score": 0.5}
    mock_face.return_value = {"score": 0.5, "face_detected": False, "error": "No face detected"}
    mock_meta.return_value = {"score": 0.5}

    signals, meta = analyze_image(FAKE_PATH)

    names = {s["signal_name"] for s in signals}
    assert "face_forensics" not in names
    assert len(signals) == 3


@patch("models.image_detector.analyze_metadata")
@patch("models.image_detector.analyze_face")
@patch("models.image_detector.analyze_frequency_domain")
@patch("models.image_detector.predict_ensemble")
def test_one_failing_analyzer_does_not_drop_the_others(mock_ensemble, mock_freq, mock_face, mock_meta):
    mock_ensemble.side_effect = RuntimeError("model download failed")
    mock_freq.return_value = {"score": 0.5}
    mock_face.return_value = {"score": 0.5, "face_detected": True}
    mock_meta.return_value = {"score": 0.5}

    signals, meta = analyze_image(FAKE_PATH)

    names = {s["signal_name"] for s in signals}
    assert "neural_ensemble" not in names
    assert names == {"frequency_domain", "face_forensics", "metadata_forensics"}


@patch("models.image_detector.analyze_metadata")
@patch("models.image_detector.analyze_face")
@patch("models.image_detector.analyze_frequency_domain")
@patch("models.image_detector.predict_ensemble")
def test_all_analyzers_failing_returns_single_neutral_signal(mock_ensemble, mock_freq, mock_face, mock_meta):
    mock_ensemble.side_effect = RuntimeError("boom")
    mock_freq.side_effect = RuntimeError("boom")
    mock_face.side_effect = RuntimeError("boom")
    mock_meta.side_effect = RuntimeError("boom")

    signals, meta = analyze_image(FAKE_PATH)

    assert len(signals) == 1
    assert signals[0]["raw_score"] == 0.5
    assert signals[0]["confidence"] == 0.0
    assert meta["fused_score"] == 0.5
    assert meta["fused_confidence"] == 0.0


@patch("models.image_detector.analyze_metadata")
@patch("models.image_detector.analyze_face")
@patch("models.image_detector.analyze_frequency_domain")
@patch("models.image_detector.predict_ensemble")
def test_analyzer_internal_error_key_is_respected(mock_ensemble, mock_freq, mock_face, mock_meta):
    # Analyzers signal a soft failure by returning {"error": ...} in their
    # dict rather than raising -- the adapter must skip that signal too.
    mock_ensemble.return_value = {"score": 0.5, "confidence": 0.0, "error": "No models loaded"}
    mock_freq.return_value = {"score": 0.5}
    mock_face.return_value = {"score": 0.5, "face_detected": True}
    mock_meta.return_value = {"score": 0.5, "error": "corrupt EXIF"}

    signals, meta = analyze_image(FAKE_PATH)

    names = {s["signal_name"] for s in signals}
    assert names == {"frequency_domain", "face_forensics"}


# --- Fusion math: proves the weighting is actually aggressive/VERITAS- ---
# --- style, not a disguised plain average.                             --

def test_neural_dominates_a_plain_average():
    # Neural says strongly fake (0.9, high confidence, unanimous); the
    # other three say strongly real (0.1). A plain average of four equal
    # votes would land at 0.3. Neural's 50% base weight, boosted further
    # by the >0.95-confidence/unanimous tier (x2.5), should pull the
    # fused score much closer to neural's 0.9 than to the 0.3 a flat
    # average gives.
    nn = {"score": 0.9, "confidence": 0.97, "model_agreement": "unanimous"}
    freq = {"score": 0.1}
    face = {"score": 0.1, "face_detected": True, "eye_quality_score": 0.1,
            "skin_texture_score": 0.1, "symmetry_score": 0.1}
    meta = {"score": 0.1}

    fused_score, _ = _combine_scores_aggressive(nn, freq, face, meta)

    plain_average = (0.9 + 0.1 + 0.1 + 0.1) / 4  # 0.3
    assert fused_score > plain_average
    assert fused_score > 0.6  # should still commit toward "fake" despite 3-to-1 disagreement


def test_metadata_barely_moves_the_score_alone():
    # Metadata is the lowest-importance layer (10% base weight). With
    # neural neutral-ish and the other two silent, metadata swinging from
    # 0.1 to 0.9 should NOT swing the fused score anywhere near as much as
    # neural doing the same would.
    nn = {"score": 0.5, "confidence": 0.6, "model_agreement": "moderate_agreement"}

    low_meta_score, _ = _combine_scores_aggressive(nn, None, None, {"score": 0.1})
    high_meta_score, _ = _combine_scores_aggressive(nn, None, None, {"score": 0.9})

    assert (high_meta_score - low_meta_score) < 0.3


def test_face_not_detected_redistributes_weight_to_neural():
    # When no face is in frame, face's 15% base weight should fold into
    # neural (index 0 in the active list) rather than just vanishing --
    # this changes neural's effective share of the total, which changes
    # the fused score relative to the same inputs WITH a detected face at
    # a neutral 0.5 (which wouldn't move the average either way, so this
    # isolates the redistribution itself rather than face's raw score).
    nn = {"score": 0.8, "confidence": 0.6, "model_agreement": "moderate_agreement"}
    freq = {"score": 0.2}
    meta = {"score": 0.2}

    no_face_result, _ = _combine_scores_aggressive(nn, freq, None, meta)
    with_neutral_face_result, _ = _combine_scores_aggressive(
        nn, freq, {"score": 0.8, "face_detected": True, "eye_quality_score": 0.5,
                   "skin_texture_score": 0.5, "symmetry_score": 0.5}, meta
    )

    # Redistributing face's weight onto neural (which agrees with the high
    # score) should pull the no-face case at least as high as adding a
    # face signal that also happens to agree.
    assert no_face_result >= with_neutral_face_result - 0.05

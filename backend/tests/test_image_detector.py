"""
Unit tests for models/image_detector.py -- the Phase 1b adapter.

These test the adapter's own logic (signal assembly, schema shape,
per-analyzer failure isolation), not the underlying V.E.R.I.T.A.S
analyzers themselves (ensemble_detector / frequency_analyzer /
face_analyzer / metadata_analyzer are copied verbatim and unmodified,
so their own accuracy is out of scope here -- same reasoning as why
test_text_detector.py doesn't re-test transformers). The four analyzer
calls are mocked so this suite runs in milliseconds with no model
downloads, no GPU, and no real image file needed.
"""

from unittest.mock import patch
from models.image_detector import analyze_image


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

    signals = analyze_image(FAKE_PATH)

    names = {s["signal_name"] for s in signals}
    assert names == {"neural_ensemble", "frequency_domain", "face_forensics", "metadata_forensics"}
    assert all(_valid_schema(s) for s in signals)
    ensemble_signal = next(s for s in signals if s["signal_name"] == "neural_ensemble")
    assert ensemble_signal["raw_score"] == 0.82
    assert ensemble_signal["confidence"] == 0.91


@patch("models.image_detector.analyze_metadata")
@patch("models.image_detector.analyze_face")
@patch("models.image_detector.analyze_frequency_domain")
@patch("models.image_detector.predict_ensemble")
def test_face_signal_omitted_when_no_face_detected(mock_ensemble, mock_freq, mock_face, mock_meta):
    mock_ensemble.return_value = {"score": 0.5, "confidence": 0.7}
    mock_freq.return_value = {"score": 0.5}
    mock_face.return_value = {"score": 0.5, "face_detected": False, "error": "No face detected"}
    mock_meta.return_value = {"score": 0.5}

    signals = analyze_image(FAKE_PATH)

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

    signals = analyze_image(FAKE_PATH)

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

    signals = analyze_image(FAKE_PATH)

    assert len(signals) == 1
    assert signals[0]["raw_score"] == 0.5
    assert signals[0]["confidence"] == 0.0


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

    signals = analyze_image(FAKE_PATH)

    names = {s["signal_name"] for s in signals}
    assert names == {"frequency_domain", "face_forensics"}

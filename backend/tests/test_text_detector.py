from models.text_detector import analyze_text, TextAIDetector


def test_analyze_text_empty_returns_zero_score():
    signals, meta = analyze_text("")
    assert signals[0]["raw_score"] == 0.0
    assert meta["detected_language"] == "en"
    assert meta["suggested_demographic_group"] == "native_english"


def test_analyze_text_whitespace_only_returns_zero_score():
    signals, meta = analyze_text("   \n\n  ")
    assert signals[0]["raw_score"] == 0.0


def test_analyze_text_short_document_flags_ai_tells():
    text = (
        "This paper aims to delve into the intricate tapestry of modern "
        "computing. It underscores a meticulously robust paradigm shift "
        "that boasts unprecedented synergy across the domain. "
    ) * 3
    signals, meta = analyze_text(text)
    doc_signal = next(s for s in signals if s["signal_name"] == "ai_ensemble_document")
    assert doc_signal["raw_score"] > 0.4


def test_analyze_text_returns_paragraph_level_signals():
    text = (
        "This is a short plain paragraph written in an ordinary human style, "
        "with no unusual vocabulary or structure to speak of at all here. "
    ) * 4
    signals, meta = analyze_text(text)
    paragraph_signals = [s for s in signals if s["signal_name"] == "ai_ensemble_paragraph"]
    assert len(paragraph_signals) >= 1
    for sig in paragraph_signals:
        assert sig["evidence_ref"] is not None
        assert "start" in sig["evidence_ref"]
        assert "end" in sig["evidence_ref"]


def test_esl_calibration_not_applied_for_english():
    detector = TextAIDetector()
    result = detector.detect("Plain simple human writing here, nothing fancy at all.")
    assert result.calibration_applied is False
    assert result.detected_language == "en"


def test_document_verdict_score_in_range():
    signals, meta = analyze_text("Just a short ordinary sentence about the weather today.")
    doc_signal = next(s for s in signals if s["signal_name"] == "ai_ensemble_document")
    assert 0.0 <= doc_signal["raw_score"] <= 1.0


def test_authorship_consistency_needs_minimum_segments():
    from models.text_detector import authorship_consistency_signals

    short_text = "One short paragraph only, not enough segments to compare against itself."
    signals = authorship_consistency_signals(short_text, min_segments=3)
    assert signals == []

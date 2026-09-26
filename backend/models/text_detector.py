"""
Text AI-content detector for AURA's Phase 1a text module.

Detection technique (perplexity, burstiness, stylometric ensemble, ESL
threshold calibration, GPT-4/5-era lexical-tell density) adapted from the
AEGIS Academic Integrity Checker (github.com/sunilgentyala/aegis-integrity),
MIT License, Copyright (c) 2026 Sunil Gentyala. Ported into AURA's own
module tree per the project's reuse-map convention (see AURA_BUILD_PLAN.md,
same pattern used for V.E.R.I.T.A.S's progress_tracker.py). Original MIT
notice reproduced below as required by the license:

    Permission is hereby granted, free of charge, to any person obtaining a
    copy of this software and associated documentation files (the
    "Software"), to deal in the Software without restriction, including
    without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, subject to
    the condition that the above copyright notice and this permission
    notice shall be included in all copies or substantial portions of the
    Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

Underlying methods are published research, cited inline: perplexity/
burstiness (standard LLM-detection technique), ESL threshold calibration
(Liang et al., Stanford 2023, "GPT Detectors Are Biased Against Non-Native
English Writers", Patterns 4(7)).

detect() takes raw text directly (no file parsing) and returns per-paragraph
+ document-level scores. analyze_text() at the bottom adapts that result
into AURA's common Signal schema (schemas/evidence.py) for jobs.py to
consume — nothing downstream (reasoning.py, bias_audit.py) needs to know
this detector exists.
"""

from __future__ import annotations
import re
import math
import logging
import threading
from dataclasses import dataclass
from typing import List, Optional

logger = logging.getLogger(__name__)


# ESL calibration multipliers -- the AI-flagging threshold is multiplied by
# this factor for non-native English writing styles (languages where AI
# detectors over-flag human writers, per Liang et al. 2023). Values are >1.0
# so non-native text needs a *higher* ensemble score before it is flagged --
# raising the bar, not lowering it, is what corrects a false-positive bias.
ESL_THRESHOLD_MULTIPLIER = {
    "zh": 1.25, "ko": 1.25, "ja": 1.25,  # East Asian
    "ar": 1.22, "fa": 1.22,               # Arabic / Farsi
    "ru": 1.18, "uk": 1.18,               # Slavic
    "es": 1.14, "pt": 1.14, "it": 1.14,  # Romance
    "de": 1.11, "fr": 1.11,               # Germanic/Gallic
    "en": 1.00,                            # Native English (no adjustment)
}

HEDGE_PHRASES = [
    "may be", "might be", "could be", "seems to", "appears to",
    "suggests that", "it is possible", "arguably", "presumably",
    "to some extent", "in general", "typically", "often",
    "we believe", "we suggest", "we argue", "we propose",
]

# Lexical tells disproportionately common in ChatGPT/GPT-4/GPT-5-family
# output relative to human academic prose. Split into two tiers: STRONG are
# phrases rare in ordinary pre-LLM technical writing (full weight); WEAK are
# common formal-register vocabulary that LLMs still measurably overuse but
# is weak evidence alone (counted at WEAK_TELL_WEIGHT), so ordinary formal
# academic register -- exactly what ESL writing courses teach -- doesn't
# get penalized as heavily as idiosyncratic AI catchphrases.
GPT_TELL_PHRASES_STRONG = [
    "delve into", "delves into", "delving into", "boasts", "underscores",
    "underscore", "in the realm of", "realm of", "testament to",
    "a testament", "navigate the complexities", "navigating the complexities",
    "tapestry of", "harness the power", "unlock the potential",
    "game-changer", "meticulously",
]
GPT_TELL_PHRASES_WEAK = [
    "pivotal role", "rapidly evolving", "ever-evolving", "cutting-edge",
    "intricate", "multifaceted", "holistic", "synergy", "leverage",
    "leveraging", "seamless", "seamlessly", "robust", "unprecedented",
    "paradigm shift", "at the forefront", "foster", "bolster",
    "it is important to note", "it's important to note",
    "it is worth noting", "it's worth noting", "in conclusion", "in summary",
    "furthermore", "moreover", "notably", "comprehensive understanding",
    "nuanced",
]
WEAK_TELL_WEIGHT = 0.35


@dataclass
class ParagraphAIScore:
    text: str
    start: int
    end: int
    perplexity: float
    burstiness: float
    cross_perplexity_ratio: float
    stylometric_score: float
    gpt_tell_density: float
    ensemble_score: float
    verdict: str                   # HUMAN | UNCERTAIN | AI_LIKELY | AI_DETECTED
    calibrated_language: str
    threshold_used: float


@dataclass
class AIDetectionResult:
    document_verdict: str
    document_ensemble_score: float
    ai_fraction: float
    paragraph_scores: List[ParagraphAIScore]
    detected_language: str
    calibration_applied: bool
    summary: dict


class TextAIDetector:
    """
    Bias-aware, paragraph-level AI content detector for AURA's text modality.
    Automatically calibrates its flagging threshold for ESL writers.
    """

    BASE_MODEL = "gpt2"             # ~500 MB, CPU-friendly
    OBSERVER_MODEL = "gpt2-medium"  # ~1.5 GB, only loaded if use_cross_perplexity=True
    # Pinned revisions -- an unpinned from_pretrained() would silently pick
    # up whatever the repo points to at download time.
    BASE_MODEL_REVISION = "607a30d783dfa663caf39e06633721c8d4cfcd7e"
    OBSERVER_MODEL_REVISION = "6dcaa7a952f72f9298047fd5137cd6e4f05f41da"

    def __init__(
        self,
        base_perplexity_threshold: float = 45.0,
        burstiness_threshold: float = 0.35,
        ratio_threshold: float = 0.75,
        ensemble_threshold: float = 0.60,
        use_cross_perplexity: bool = False,  # keep False to avoid the 1.5GB observer model
        device: str = "cpu",
    ):
        self.base_ppl_thresh = base_perplexity_threshold
        self.burstiness_thresh = burstiness_threshold
        self.ratio_thresh = ratio_threshold
        self.ensemble_thresh = ensemble_threshold
        self.use_cross_ppl = use_cross_perplexity
        self.device = device
        self._base_model = None
        self._base_tokenizer = None
        self._obs_model = None
        self._obs_tokenizer = None
        self._lang_detector = None
        self._load_lock = threading.Lock()

    def _load_models(self):
        if self._base_model is not None:
            return
        with self._load_lock:
            if self._base_model is not None:
                return
            try:
                import torch
                from transformers import AutoModelForCausalLM, AutoTokenizer
                self._torch = torch
                self._base_tokenizer = AutoTokenizer.from_pretrained(
                    self.BASE_MODEL, revision=self.BASE_MODEL_REVISION)
                base_model = AutoModelForCausalLM.from_pretrained(
                    self.BASE_MODEL, revision=self.BASE_MODEL_REVISION).to(self.device)
                base_model.eval()
                if self.use_cross_ppl:
                    self._obs_tokenizer = AutoTokenizer.from_pretrained(
                        self.OBSERVER_MODEL, revision=self.OBSERVER_MODEL_REVISION)
                    obs_model = AutoModelForCausalLM.from_pretrained(
                        self.OBSERVER_MODEL, revision=self.OBSERVER_MODEL_REVISION
                    ).to(self.device)
                    obs_model.eval()
                    self._obs_model = obs_model
                self._base_model = base_model
            except ImportError:
                raise ImportError(
                    "transformers + torch required: pip install transformers torch")

    def _load_lang_detector(self):
        if self._lang_detector is not None:
            return
        with self._load_lock:
            if self._lang_detector is not None:
                return
            try:
                from langdetect import detect as langdetect
                self._lang_detector = langdetect
            except ImportError:
                self._lang_detector = lambda _: "en"

    def detect(self, text: str) -> AIDetectionResult:
        """Analyse a full submission. Returns per-paragraph + aggregate results."""
        self._load_models()
        self._load_lang_detector()

        try:
            lang = self._lang_detector(text[:500])
        except Exception:
            lang = "en"
        multiplier = ESL_THRESHOLD_MULTIPLIER.get(lang, 1.11)
        calibrated_thresh = self.ensemble_thresh * multiplier

        paragraphs = self._split_paragraphs(text)
        para_scores: List[ParagraphAIScore] = []

        for para_text, start, end in paragraphs:
            score = self._score_paragraph(para_text, start, end, lang, calibrated_thresh)
            para_scores.append(score)

        if not para_scores:
            return AIDetectionResult(
                document_verdict="UNCERTAIN",
                document_ensemble_score=0.5,
                ai_fraction=0.0,
                paragraph_scores=[],
                detected_language=lang,
                calibration_applied=(lang != "en"),
                summary={},
            )

        doc_score = sum(p.ensemble_score for p in para_scores) / len(para_scores)
        ai_count = sum(1 for p in para_scores if p.verdict in ("AI_LIKELY", "AI_DETECTED"))
        ai_frac = ai_count / len(para_scores)
        doc_verdict = self._ensemble_verdict(doc_score, calibrated_thresh)

        return AIDetectionResult(
            document_verdict=doc_verdict,
            document_ensemble_score=round(doc_score, 3),
            ai_fraction=round(ai_frac, 3),
            paragraph_scores=para_scores,
            detected_language=lang,
            calibration_applied=(lang != "en"),
            summary=self._build_summary(para_scores, ai_frac, lang),
        )

    def _score_paragraph(self, text: str, start: int, end: int, lang: str, threshold: float) -> ParagraphAIScore:
        ppl = self._perplexity(text, self._base_model, self._base_tokenizer)
        burstiness = self._burstiness(text)
        ratio = 1.0
        if self.use_cross_ppl and self._obs_model:
            obs_ppl = self._perplexity(text, self._obs_model, self._obs_tokenizer)
            ratio = ppl / obs_ppl if obs_ppl > 0 else 1.0

        style_score = self._stylometric_ai_score(text)
        tell_density = self._gpt_tell_density(text)

        ppl_score = min(1.0, max(0.0, 1.0 - (ppl / self.base_ppl_thresh)))
        burst_score = min(1.0, max(0.0, 1.0 - (burstiness / self.burstiness_thresh)))
        ratio_score = min(1.0, max(0.0, 1.0 - (ratio / self.ratio_thresh)))
        tell_score = min(tell_density / 3.0, 1.0)

        if self.use_cross_ppl and self._obs_model:
            ensemble = 0.15 * ppl_score + 0.10 * burst_score + \
                       0.10 * ratio_score + 0.40 * style_score + \
                       0.25 * tell_score
        else:
            ensemble = 0.20 * ppl_score + 0.15 * burst_score + \
                       0.40 * style_score + 0.25 * tell_score

        verdict = self._ensemble_verdict(ensemble, threshold)

        return ParagraphAIScore(
            text=text[:200],
            start=start,
            end=end,
            perplexity=round(ppl, 2),
            burstiness=round(burstiness, 3),
            cross_perplexity_ratio=round(ratio, 3),
            stylometric_score=round(style_score, 3),
            gpt_tell_density=round(tell_density, 3),
            ensemble_score=round(ensemble, 3),
            verdict=verdict,
            calibrated_language=lang,
            threshold_used=round(threshold, 3),
        )

    def _perplexity(self, text: str, model, tokenizer) -> float:
        import torch
        max_len = 512
        stride = 256
        encodings = tokenizer(text, return_tensors="pt", truncation=False)
        input_ids = encodings.input_ids.to(self.device)
        seq_len = input_ids.size(1)
        if seq_len == 0:
            return 100.0

        nlls = []
        prev_end_loc = 0
        for begin in range(0, seq_len, stride):
            end = min(begin + max_len, seq_len)
            target_len = end - prev_end_loc
            with torch.no_grad():
                out = model(input_ids[:, begin:end], labels=input_ids[:, begin:end])
                nll = out.loss * target_len
                nlls.append(nll)
            prev_end_loc = end
            if end == seq_len:
                break

        total_tokens = prev_end_loc
        mean_nll = torch.stack(nlls).sum() / total_tokens if nlls else torch.tensor(0.0)
        return math.exp(float(mean_nll)) if float(mean_nll) < 10 else 22026.0

    def _burstiness(self, text: str) -> float:
        sentences = re.split(r"(?<=[.!?])\s+", text)
        lengths = [len(s.split()) for s in sentences if len(s.split()) > 3]
        if len(lengths) < 3:
            return 0.5
        mean_len = sum(lengths) / len(lengths)
        variance = sum((ln - mean_len) ** 2 for ln in lengths) / len(lengths)
        std_len = variance ** 0.5
        cv = std_len / mean_len if mean_len > 0 else 0.0
        return round(min(cv, 1.0), 3)

    def _stylometric_ai_score(self, text: str) -> float:
        signals = []
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text)
                     if len(s.strip().split()) > 3]
        if not sentences:
            return 0.5

        lengths = [len(s.split()) for s in sentences]
        mean_len = sum(lengths) / len(lengths)
        cv = (sum((ln - mean_len) ** 2 for ln in lengths) / len(lengths)) ** 0.5 / max(mean_len, 1)
        signals.append(1.0 - min(cv / 0.5, 1.0))

        word_count = max(len(text.split()), 1)
        hedge_count = sum(text.lower().count(h) for h in HEDGE_PHRASES)
        hedge_density = hedge_count / (word_count / 100)
        signals.append(min(hedge_density / 5.0, 1.0))

        tokens = re.findall(r"\b[a-z]{2,}\b", text.lower())
        ttr = len(set(tokens)) / len(tokens) if tokens else 0.5
        signals.append(max(0.0, 1.0 - (ttr - 0.30) / 0.30))

        first_person = len(re.findall(r"\b[Ww]e\b|\b[Ii]\b", text))
        fp_density = first_person / (word_count / 100)
        signals.append(1.0 if fp_density < 0.5 else 0.0)

        return round(sum(signals) / len(signals), 3)

    def _gpt_tell_density(self, text: str) -> float:
        word_count = max(len(text.split()), 1)
        text_lower = text.lower()
        strong_hits = sum(text_lower.count(p) for p in GPT_TELL_PHRASES_STRONG)
        weak_hits = sum(text_lower.count(p) for p in GPT_TELL_PHRASES_WEAK)
        weighted_hits = strong_hits + WEAK_TELL_WEIGHT * weak_hits
        return weighted_hits / (word_count / 100)

    def _ensemble_verdict(self, score: float, threshold: float) -> str:
        if score < threshold * 0.5:
            return "HUMAN"
        elif score < threshold:
            return "UNCERTAIN"
        elif score < threshold * 1.25:
            return "AI_LIKELY"
        else:
            return "AI_DETECTED"

    def _split_paragraphs(self, text: str, min_words: int = 50):
        """Returns (paragraph_text, start_offset, end_offset) tuples, offsets
        into the original `text`, so evidence_ref can point at exact spans."""
        results = []
        cursor = 0
        for chunk in re.split(r"(\n\n+)", text):
            if chunk.strip() and not re.fullmatch(r"\n\n+", chunk):
                stripped = chunk.strip()
                if len(stripped.split()) >= min_words:
                    start = text.index(chunk, cursor)
                    results.append((stripped, start, start + len(chunk)))
            cursor += len(chunk)
        return results

    def _build_summary(self, scores, ai_frac, lang) -> dict:
        from collections import Counter
        verdicts = [s.verdict for s in scores]
        return {
            "verdict_distribution": dict(Counter(verdicts)),
            "mean_perplexity": round(sum(s.perplexity for s in scores) / len(scores), 2) if scores else 0,
            "mean_burstiness": round(sum(s.burstiness for s in scores) / len(scores), 3) if scores else 0,
            "mean_gpt_tell_density": round(sum(s.gpt_tell_density for s in scores) / len(scores), 3) if scores else 0,
            "ai_paragraph_fraction": ai_frac,
            "detected_language": lang,
            "esl_calibration_applied": lang != "en",
        }


# --- Phase 0 schema adapter --------------------------------------------
# Wraps TextAIDetector's output into AURA's common Signal shape
# (schemas/evidence.py) so jobs.py, reasoning.py and bias_audit.py never
# need to know a text-specific detector exists underneath.

_detector: Optional[TextAIDetector] = None


def _get_detector() -> TextAIDetector:
    global _detector
    if _detector is None:
        _detector = TextAIDetector(use_cross_perplexity=False, device="cpu")
    return _detector


# --- Authorship-consistency check (Burrows' Delta) ---------------------
# Distinct from the AI-ensemble score above: this asks "do different
# sections of this ONE submission sound like they were written by
# different people", not "does this text read as AI-generated". Catches
# ghostwriting / mixed-authorship (e.g. one paragraph pasted in from
# elsewhere) even when neither section trips the AI detector. Pure
# function-word frequency statistics, no model download required.

FUNCTION_WORDS = [
    "the", "of", "and", "to", "a", "in", "that", "is", "was", "for",
    "it", "with", "as", "on", "be", "at", "by", "this", "had", "not",
    "are", "but", "from", "or", "have", "an", "which", "one", "you", "were",
    "all", "there", "would", "their", "we", "been", "has", "when", "who", "will",
    "more", "if", "no", "so", "what", "up", "out", "into", "than", "can",
]


def _function_word_freqs(text: str) -> dict:
    """Relative frequency (per 1000 tokens) of each function word."""
    tokens = re.findall(r"\b[a-z']+\b", text.lower())
    total = max(len(tokens), 1)
    counts = {w: 0 for w in FUNCTION_WORDS}
    for t in tokens:
        if t in counts:
            counts[t] += 1
    return {w: (c / total) * 1000 for w, c in counts.items()}


def authorship_consistency_signals(content_ref: str, min_segments: int = 3) -> List[dict]:
    """
    Segments the submission (reusing the same paragraph splitter as the AI
    detector) and flags segments whose function-word usage diverges
    sharply from the document's own average -- Burrows' Delta > ~0.40 is
    the standard flag threshold in the stylometry literature. Needs at
    least `min_segments` qualifying paragraphs to be statistically
    meaningful; below that, returns no signals rather than a low-confidence
    guess on a document too short to compare against itself.
    """
    detector = _get_detector()
    segments = detector._split_paragraphs(content_ref, min_words=50)
    if len(segments) < min_segments:
        return []

    freqs = [_function_word_freqs(seg_text) for seg_text, _, _ in segments]

    means, stds = {}, {}
    for w in FUNCTION_WORDS:
        values = [f[w] for f in freqs]
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        means[w], stds[w] = mean, variance ** 0.5

    signals = []
    for (_, start, end), freq in zip(segments, freqs):
        z_scores = [
            abs(freq[w] - means[w]) / stds[w] if stds[w] > 0 else 0.0
            for w in FUNCTION_WORDS
        ]
        delta = sum(z_scores) / len(z_scores)
        normalized = min(delta / 0.8, 1.0)  # delta 0.40 (the literature's flag point) -> 0.5
        signals.append({
            "modality": "text",
            "signal_name": "authorship_consistency",
            "raw_score": round(normalized, 3),
            "confidence": round(min(0.5 + 0.05 * len(segments), 0.9), 2),
            "evidence_ref": {"start": start, "end": end},
        })
    return signals


def analyze_text(content_ref: str):
    """
    content_ref: raw submission text (per SubmissionRequest.content_ref for
    modality == "text").

    Returns (signals, meta):
      signals -- list of Signal-shaped dicts (ai_ensemble_document,
                 ai_ensemble_paragraph, authorship_consistency)
      meta    -- {detected_language, calibration_applied,
                  suggested_demographic_group} so callers (jobs.py) can
                  default the bias-audit demographic_group from the
                  detector's own language signal when the caller didn't
                  supply one, instead of falling back to "unspecified".
    """
    if not content_ref or not content_ref.strip():
        empty_meta = {
            "detected_language": "en",
            "calibration_applied": False,
            "suggested_demographic_group": "native_english",
        }
        return [{
            "modality": "text", "signal_name": "ai_ensemble",
            "raw_score": 0.0, "confidence": 0.0, "evidence_ref": None,
        }], empty_meta

    result = _get_detector().detect(content_ref)

    signals = [{
        "modality": "text",
        "signal_name": "ai_ensemble_document",
        "raw_score": result.document_ensemble_score,
        "confidence": 0.85 if not result.calibration_applied else 0.75,
        "evidence_ref": None,
    }]

    for p in result.paragraph_scores:
        signals.append({
            "modality": "text",
            "signal_name": "ai_ensemble_paragraph",
            "raw_score": p.ensemble_score,
            "confidence": 0.8,
            "evidence_ref": {"start": p.start, "end": p.end},
        })

    signals.extend(authorship_consistency_signals(content_ref))

    meta = {
        "detected_language": result.detected_language,
        "calibration_applied": result.calibration_applied,
        "suggested_demographic_group": (
            "native_english" if result.detected_language == "en" else "esl"
        ),
    }
    return signals, meta

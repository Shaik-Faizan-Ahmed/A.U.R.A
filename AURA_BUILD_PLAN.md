# A.U.R.A — AI-powered Unbiased Review & Assessment
### Build Plan (phase by phase)

**Product framing:** AURA is sold as an **API** — "AURA Core API" — built to be integrated into any college ERP/LMS's assessment-and-grading module.

**Team split (locked-in):** This team owns the **backend/API only**. The website ("AURA Console" reference client) is being built by another team member(s) against this API's contract — it is out of scope here, but the API contract in Phase 0 is what they'll build against, so it needs to be correct and stable early.

Based on a direct read of `D:\genai-media-verifier` (V.E.R.I.T.A.S) for reuse decisions.

---

## What changes because it's API-first

| Was assumed (website-first) | Now (API-first) |
|---|---|
| Review queue = a page in "our" UI | Review queue = an **API resource** (`GET /v1/flags`, `POST /v1/flags/{id}/decision`) |
| Analysis returns inline in the request | Video/comprehensive analysis is slow — must be an **async job**: `POST /v1/submissions` returns a `job_id` immediately, caller polls `GET /v1/submissions/{job_id}` or gets a webhook callback |
| One user, one dataset | **Multi-tenant from the start** — every request scoped by `institution_id` tied to an API key, including bias-audit stats |
| UI-driven demo | **API-driven demo** — curl/Postman first, website (someone else's) second |
| Auth: none needed | API-key header scheme (`X-AURA-Key`) — doesn't need production-grade OAuth for a hackathon, but must visibly exist |

FastAPI auto-generates OpenAPI docs at `/docs` (confirmed in V.E.R.I.T.A.S's `main.py`) — that's both your integration documentation and the contract the frontend team builds against.

---

## What V.E.R.I.T.A.S actually gives us (ground truth from the code)

**Backend:** FastAPI, `main.py` exposes `/analyze/image`, `/analyze/image/comprehensive`, `/analyze/video`, `/analyze/video/quick`, `/analyze/video/comprehensive`, `/analyze/progress` (SSE).

**Image pipeline** (`services/comprehensive_analyzer.py`): 4 analyzers (neural ensemble, frequency domain, face, metadata) fused by `combine_scores_aggressive()`. Neural ensemble (`models/ensemble_detector.py`) uses two HuggingFace models with confidence-weighted voting.

**Video pipeline** (`models/video/comprehensive_detector.py`): 9 layers fused by `intelligent_fusion()`, with hard override rules (e.g. any frame >0.95 fake → auto-High). This pipeline is genuinely slow — exactly why the API needs to be async, not request/response.

**Reusable infra, as-is:**
- `models/progress_tracker.py` — thread-safe pub/sub + SSE wiring in `main.py`. Modality-agnostic. **Reuse verbatim** — maps directly onto async-job status: job updates are progress-tracker events.
- `services/report_generator.py` — narrative structure reusable, wording is deepfake-specific. **Adapt, don't reuse verbatim.**
- Fusion pattern in `combine_scores_aggressive()` / `intelligent_fusion()` — reuse the *pattern* (weighted scores + confidence + override rules), rewrite the actual rules per modality.
- `config.py` pattern (env-driven flags, thresholds) — reuse the pattern, extend with per-institution config.

**Gaps — 100% new, nothing in V.E.R.I.T.A.S does this:**
- Text-detection analyzer (perplexity, burstiness, stylometry)
- Common cross-modality evidence schema
- Reasoning/explanation layer (evidence-referenced, not just prose-about-a-score)
- Bias-audit layer (per-institution)
- API key auth + async job queue + webhook callbacks + multi-tenant scoping

---

## Phase 0 — API contract, schema lock, project scaffold
- [ ] Lock demo submission types: text essay + video clip (+ optional image)
- [ ] Lock the public API contract (this is what the frontend team builds against — get it right first):
  - `POST /v1/submissions` — `{institution_id, student_ref, modality, content_ref}` → `{job_id, status: "queued"}`
  - `GET /v1/submissions/{job_id}` — status, and on completion: score + reasoning + evidence + fairness banner
  - `GET /v1/flags?institution_id=` — flagged submissions awaiting review
  - `POST /v1/flags/{id}/decision` — `{decision: "uphold"|"dismiss", reviewer_id}`
  - `GET /v1/audit/fairness?institution_id=` — per-group FPR/disparate-impact stats
  - Auth: `X-AURA-Key` header → `institution_id` (hardcoded lookup table is fine for the hackathon)
- [ ] Lock the common evidence schema:
  ```
  {
    modality: "text" | "image" | "video",
    signal_name: str,
    raw_score: float,
    confidence: float,
    evidence_ref: {...}   # text: {start,end}; image: {bbox}; video: {frame_range, timestamp}
  }
  ```
- [ ] Scaffold the backend folder structure (below) and share the OpenAPI contract with the frontend team as soon as `/docs` is live, even before detectors are implemented (stub endpoints returning fixture data unblocks them early)
- [ ] Copy `models/progress_tracker.py` into AURA's backend unchanged
- [ ] Build the synthetic labeled dataset: text tagged with language-background proxy; media tagged with lighting/resolution-tier proxy; all with known ground truth

**Exit check:** `/docs` is live with the full contract, even if every endpoint returns stub/fixture data — this unblocks the frontend team immediately.

---

## Phase 1 — Detection layer (background job, not inline)
**1a. Text module (new build):** perplexity/burstiness scoring, stylometric features, wrapped in the Phase 0 schema.
**1b. Image/video module (adapt V.E.R.I.T.A.S):** copy `models/ensemble_detector.py`, `frequency_analyzer.py`, `face_analyzer.py`, `metadata_analyzer.py`, `models/video/*`; wrap each in a thin adapter emitting the Phase 0 schema. Don't rewrite the analyzers — wrap them.
- Job runner: background thread + in-memory `job_id → status/result` dict, matching V.E.R.I.T.A.S's existing `ThreadPoolExecutor` pattern; wire `progress_tracker` updates into job status so polling/SSE shows live progress.

**Exit check:** `POST /v1/submissions` returns a `job_id` immediately regardless of modality; result lands in the common schema.

---

## Phase 2 — Reasoning layer
One aggregator, any modality, consuming the common schema → `overall_confidence` + evidence-referenced plain-language explanation. Adapt `report_generator.py`'s prose style but reference actual `evidence_ref` data. This is what `GET /v1/submissions/{job_id}` returns on completion.

---

## Phase 3 — Bias audit layer (per-institution)
- Per-group stats table scoped by `institution_id` — no cross-institution leakage
- `GET /v1/audit/fairness?institution_id=` returns FPR/disparate-impact breakdown
- Fairness banner attached to any flag from `GET /v1/flags`

**Exit check:** two different fake `institution_id`s show different fairness numbers.

---

## Phase 4 — Human review gate (API resource)
- `GET /v1/flags` / `POST /v1/flags/{id}/decision` as real, working endpoints — the frontend team's review screen is just a client of these
- Log every decision with `submission_id`, `reviewer_id`, `institution_id`, `timestamp`

**Exit check:** a decision made via curl and one made via the (eventual) website both show up identically in the log — proves the API is the real product.

---

## Phase 5 — Integration & polish
- Wire the full flow: `POST /v1/submissions` → Phase 1 job → Phase 2 reasoning → Phase 3 audit attached → `GET /v1/flags` → Phase 4 decision
- API key middleware (header-lookup dict is fine, must be visibly present)
- `progress_tracker.py` + SSE pattern reused for live job status
- Polish `/docs` endpoint descriptions — this is the integration documentation
- Seed demo data: obvious AI text, obvious human text, borderline case, one high-FPR-group example, across ≥2 fake `institution_id`s

---

## Phase 6 — Demo & pitch prep
1. Show `/docs` — "this is what a college's ERP team integrates against"
2. curl/Postman: `POST /v1/submissions` with an API key → `job_id`
3. Poll/SSE → job completes with reasoning + evidence
4. `GET /v1/audit/fairness` → disparate-impact numbers, scoped per institution
5. Website (frontend team's build) as the reference-client proof point
- Prep answers: "why deepfake code in an assessment API?" (infra reuse, not literal model reuse), "why not skin tone as a bias group?" (defensibility), "how would a real ERP integrate?" (API key issuance + webhook instead of polling, in production)
- Cut-list if asked: real OAuth, LTI (Learning Tools Interoperability) compliance, webhook delivery, live retraining loop

---

## Backend folder scaffold (proposed, not yet created)
```
D:\A.U.R.A\backend\
├── main.py                  # FastAPI app, route registration, CORS, API-key middleware
├── config.py                # env flags, risk thresholds, institution lookup table
├── auth.py                  # X-AURA-Key -> institution_id resolution        [new]
├── jobs.py                  # in-memory job queue / ThreadPoolExecutor       [new]
├── schemas/
│   ├── evidence.py          # common evidence schema (Phase 0)              [new]
│   └── api_models.py        # pydantic request/response models per endpoint [new]
├── models/
│   ├── progress_tracker.py  # copied verbatim from V.E.R.I.T.A.S
│   ├── ensemble_detector.py # copied + schema-adapter wrapper
│   ├── face_analyzer.py     # copied + schema-adapter wrapper
│   ├── frequency_analyzer.py# copied + schema-adapter wrapper
│   ├── metadata_analyzer.py # copied + schema-adapter wrapper
│   ├── text_detector.py     # new: perplexity/burstiness/stylometry         [new]
│   └── video/                # copied + schema-adapter wrappers per analyzer
├── services/
│   ├── reasoning.py          # Phase 2 aggregator                          [new]
│   ├── bias_audit.py         # Phase 3 per-institution stats               [new]
│   └── report_generator.py   # adapted from V.E.R.I.T.A.S wording
└── data/
    └── synthetic_dataset/    # Phase 0 labeled samples + proxy-group tags   [new]
```

---

## Explicit reuse map

| AURA needs | V.E.R.I.T.A.S source | Reuse level |
|---|---|---|
| Progress tracking / async job status | `models/progress_tracker.py` + `main.py` SSE + `ThreadPoolExecutor` pattern | Verbatim copy / directly adaptable |
| Image/video detectors | `models/*.py`, `models/video/*.py` | Copy + thin schema-adapter wrapper |
| Fusion logic pattern | `comprehensive_analyzer.py`, `video/comprehensive_detector.py` | Reference pattern only, rewrite per-modality |
| Report narrative style | `services/report_generator.py` | Adapt wording, add evidence references |
| API structure/CORS/error handling | `main.py` | Reuse conventions |
| Auto-generated API docs | FastAPI (free, already used) | Reuse directly, polish descriptions |
| Config/feature-flag pattern | `config.py` | Reuse pattern, extend per-institution |
| Text detection | — | New |
| Common evidence schema | — | New |
| Bias audit layer (per-institution) | — | New |
| API key auth + multi-tenancy | — | New |
| Async job queue + webhook callback | — | New |
| Human review gate (as API resource) | — | New |

---

## Phase 1a — Testing log

What's been built and verified for the text module so far, and what's still open.

### Files added

| File | Purpose |
|---|---|
| `backend/tests/test_text_detector.py` | Unit tests on `models/text_detector.py` directly — empty input, GPT-tell phrase detection, paragraph-level evidence refs, ESL calibration, authorship-consistency minimum-segment guard |
| `backend/tests/test_submissions_api.py` | Integration tests through the actual FastAPI app via `TestClient` — auth rejection, job creation, polling to completion, flag routing, cross-institution isolation |
| `backend/conftest.py` | Two unrelated fixes bundled in one file: (1) its presence puts `backend/` on `sys.path` so `from main import app` and `from models.text_detector import ...` resolve inside `tests/`; (2) sets `HF_HOME` to `backend/.hf_cache` so the `gpt2` model download lands on the same drive as the project instead of the default `C:\Users\<user>\.cache\huggingface`, which ran out of space during testing |

### Environment fixes (`requirements.txt`)

- `transformers==4.44.2` pinned `tokenizers<0.20`, which has no prebuilt wheel for Python 3.13 on Windows — pip fell back to a source build needing Rust + the MSVC linker, which isn't installed. Bumped to `transformers==4.48.0` + `tokenizers==0.21.4`, which ships prebuilt `abi3` wheels covering Python 3.13, so no compiler is needed.
- `torch` pin reconciled to `2.14.0` after it was installed unpinned outside `requirements.txt` partway through troubleshooting.

### Bug found and fixed: race condition in model loading

`TextAIDetector._load_models()` and `_load_lang_detector()` both used an unguarded lazy-init pattern (`if self._x is not None: return`, then load). Each submission runs in its own background thread (`jobs.py`), so two submissions landing close together could both pass the `is not None` check before either finished loading, and race into the same lazy import at once. This surfaced as a real, reproducible test failure: `ImportError: cannot import name 'AutoModelForCausalLM' from 'transformers'` — `transformers`' top-level module lazily imports its submodules on first attribute access, and that lazy loader isn't thread-safe.

Fix: both methods now use double-checked locking against a shared `self._load_lock`. The fast path (already loaded) still takes no lock; only the first, one-time load is serialized. `_load_models()` also now assigns `self._base_model` only after every load step succeeds, rather than partway through — the original ordering meant a failure after the base model loaded but before `.eval()` or the observer model would leave `_base_model` set, so the next call's fast-path check would wrongly treat loading as complete.

### Test status

All 14 tests pass (`pytest tests/ -v`, ~5.5s once the model is cached).

### What these tests do and don't prove

Important distinction, since it's easy to conflate "tests pass" with "the detector works":

- **What's verified:** the API and detector run correctly end-to-end — requests are accepted/rejected correctly, jobs complete, scores land in `[0,1]`, evidence refs point at real character offsets, institutions can't see each other's data, ESL calibration triggers only for non-English text, and a paragraph stuffed with known GPT-tell phrases ("delve into", "underscores", "meticulously"...) scores higher than plain text.
- **What's NOT verified:** actual detection accuracy. There's no labeled dataset of real human vs. real AI-generated text yet (Phase 0 calls for one; it hasn't been built), so false-positive/false-negative rates, robustness to paraphrasing, and whether the ESL threshold multipliers are well-calibrated (vs. just directionally correct) are all untested.
- **Image/video (Phase 1b): not started.** `jobs.py` returns `_fixture_signals()` — a formula, not a detector — for any modality other than `text`.


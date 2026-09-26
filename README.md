# A.U.R.A — AI-powered Unbiased Review & Assessment

AURA is an **API-first** plagiarism/AI-content detection service for college ERP/LMS
assessment-and-grading modules — text, image, and video submissions go in, an
evidence-backed score + explanation + per-institution fairness audit comes out,
with a human review gate in front of any automated action.

Full design rationale and phase-by-phase build log: [`AURA_BUILD_PLAN.md`](./AURA_BUILD_PLAN.md).
This README is the practical "how do I run it / test it / what's left" doc.

Detection logic for the image/video modalities is adapted from
[V.E.R.I.T.A.S](../genai-media-verifier) — see the reuse map in the build plan
for exactly what was copied verbatim vs. adapted vs. built new.

---

## Status

| Layer | Status | Notes |
|---|---|---|
| API contract (`/v1/submissions`, `/v1/flags`, `/v1/audit/fairness`) | ✅ Done | See `schemas/api_models.py` |
| Auth (`X-AURA-Key` → institution) | ✅ Done | Hardcoded lookup table in `config.py`, fine for the demo |
| Async job queue | ✅ Done | Thread-per-job, in-memory (`jobs.py`) — no persistence, resets on restart |
| Text detection | ✅ Done | `models/text_detector.py` — perplexity/burstiness/stylometry, ESL calibration |
| Image detection | ✅ Done | `models/image_detector.py` — 4 analyzers from V.E.R.I.T.A.S |
| Video detection | ✅ Done | `models/video_detector.py` — wraps `quick_detector.py` (5 of V.E.R.I.T.A.S's 9 layers; see "Why quick_detector" below) |
| Reasoning layer | ✅ Done | `services/reasoning.py` — modality-agnostic, confidence-weighted fusion + plain-language explanation |
| Bias audit | ✅ Done | `services/bias_audit.py` — per-institution FPR by group, seeded with synthetic baseline stats |
| Human review gate | ✅ Done | `/v1/flags`, `/v1/flags/{id}/decision` |
| Reference frontend ("AURA Console") | ✅ Done | `frontend/` — Submit / Job Status / Review Queue / Fairness Dashboard, all wired to the real API |
| Live progress (SSE) | ❌ Not built | `models/progress_tracker.py` was copied but isn't wired to an SSE route yet — job status is polling-only today (works fine; console polls every 1.5s) |
| File upload endpoint | ❌ Not built | `content_ref` for image/video is a server-side file path string, not an uploaded file — fine for local demo, not for a real multi-machine deployment |
| Real accuracy validation | 🟡 Text started | `backend/validation/run_text_eval.py` + `backend/data/validation/text/samples.jsonl` (36 labeled samples, EN/ES/FR) validate the text detector against ground truth — run it and check `RESULTS.md` for numbers. Image/video validation not built yet — see "What's next" |
| Webhook callbacks, real OAuth, LTI compliance | ❌ Not built | On the build plan's explicit cut-list for the hackathon |

---

## Repo layout

```
D:\A.U.R.A\
├── AURA_BUILD_PLAN.md      # design doc + phase log
├── backend/                # FastAPI app — this is the actual product
│   ├── main.py              # routes, CORS, app instance
│   ├── env_setup.py         # pins HF_HOME/TORCH_HOME off the C: drive — import first, always
│   ├── config.py             # institution keys, thresholds
│   ├── auth.py                # X-AURA-Key -> institution_id
│   ├── jobs.py                 # async job runner, modality dispatch, flag queue
│   ├── conftest.py              # pytest bootstrap (imports env_setup, sets sys.path)
│   ├── requirements.txt
│   ├── schemas/                 # pydantic request/response + common Signal schema
│   ├── models/                  # detectors (text/image/video) + copied V.E.R.I.T.A.S code
│   │   └── video/                # video-only layers, copied verbatim from V.E.R.I.T.A.S
│   ├── services/                 # reasoning.py, bias_audit.py, report_generator.py
│   └── tests/                     # pytest — all detector adapters are mocked, run in seconds
└── frontend/                # React/Vite reference client ("AURA Console")
    └── src/
        ├── api.js            # the only file that knows endpoint URLs/headers
        └── pages/            # Submit, JobStatus, ReviewQueue, FairnessDashboard
```

---

## Setup

### Backend

```powershell
cd backend
python -m venv venv          # if not already created
venv\Scripts\activate
pip install -r requirements.txt
```

**Runtime dependency, not a pip package:** install [FFmpeg](https://ffmpeg.org/) and
put it on PATH (or set `FFMPEG_PATH`) — needed for video audio extraction.
Without it, video submissions still complete, just missing the `audio_analysis` signal.

**First run will be slow** for image/video submissions — the neural models
(two HuggingFace deepfake classifiers, VideoMAE, MediaPipe's face landmarker,
OpenCV's DNN face detector) all self-download on first use. Everything is
pinned to land under `backend/.hf_cache` and `backend/.torch_cache`
(via `env_setup.py`) rather than your user profile's C: drive cache — worth
spot-checking those two folders after your first run to confirm.

Run it:
```powershell
python main.py
```
API docs at `http://localhost:8000/docs`.

### Frontend

```powershell
cd frontend
npm install     # already done if node_modules exists
npm run dev
```
Console at `http://localhost:5173`. Points at `http://localhost:8000` — CORS
is wide open in `config.py` for the demo, no proxy config needed.

---

## Testing

```powershell
cd backend
pytest tests/ -v
```

All detector adapters (`test_text_detector.py`, `test_image_detector.py`,
`test_video_detector.py`) mock the underlying model calls, so this runs in
seconds with no downloads, no GPU, no FFmpeg, no real media files needed —
they test the *adapter* logic (schema shape, evidence refs, failure
fallbacks), not the underlying V.E.R.I.T.A.S detection accuracy, which is
out of scope for these tests (see each file's docstring).

`test_submissions_api.py` runs real integration tests through the FastAPI
app (`TestClient`) — auth, job lifecycle, cross-institution isolation.

For a real end-to-end pass (actual models, actual inference):
1. Start the backend (`python main.py`)
2. Either use the frontend Submit page, or hit the API directly:
   ```powershell
   $body = @{ student_ref = "t1"; modality = "video"; content_ref = "D:\path\to\video.mp4" } | ConvertTo-Json
   $r = Invoke-RestMethod -Uri "http://localhost:8000/v1/submissions" -Method Post `
        -Headers @{ "X-AURA-Key" = "demo-key-college-a" } -ContentType "application/json" -Body $body
   Invoke-RestMethod -Uri "http://localhost:8000/v1/submissions/$($r.job_id)" -Headers @{ "X-AURA-Key" = "demo-key-college-a" }
   ```
3. Poll until `status: "complete"`.

---

## Why `quick_detector`, not `comprehensive_detector`, for video

V.E.R.I.T.A.S's full pipeline runs 9 layers including MiDaS depth estimation
and per-region compression analysis, and is genuinely slow — exactly why
submissions are async jobs in the first place. `quick_detector.py` keeps 5
layers (metadata, frame-based ensemble/face/frequency, temporal consistency,
VideoMAE 3D, audio) and drops physics/physiological/boundary/compression.
See `models/video_detector.py`'s docstring for the full reasoning. This is a
config choice, not a limitation baked into the schema — swapping to
`comprehensive_detector.py` later is a one-function change in
`video_detector.py` if accuracy turns out to matter more than latency.

## Known limitations to keep in mind when reading scores

- **`temporal_consistency` uses a crude fallback.** `facenet-pytorch` isn't
  installed (it hard-pins `numpy<2.0.0`, incompatible with the
  `numpy==2.1.3` the other analyzers need on Python 3.13/Windows — see
  `requirements.txt`'s comments). `temporal_analyzer.py`'s identity-shift
  check falls back to histogram correlation between frames instead of real
  face-embedding similarity, which is more prone to false positives on
  heavily-edited clips (jump cuts, zooms, text overlays). Revisit if
  facenet-pytorch ever relaxes that pin.
- **No override rules.** `comprehensive_detector.py`'s "any single frame
  >0.95 fake → auto-High" style rules aren't in `quick_fusion`, and
  `video_detector.py` doesn't reimplement them either — `reasoning.py`'s
  generic confidence-weighted average is the only fusion video gets right
  now, same as text and image.
- **Nothing here has been checked against ground truth.** Every "does it
  actually detect AI content correctly" question is open — see below.

---

## What's next

Roughly in priority order:

1. **Build a labeled validation set and measure real accuracy.** Text is
   started: `backend/validation/run_text_eval.py` runs the real detector
   against 36 labeled samples (`backend/data/validation/text/`) and reports
   accuracy/FPR/FNR/AUC, including a per-language breakdown that checks
   whether the ESL calibration actually fires. Run it and read
   `backend/data/validation/text/RESULTS.md` for the real numbers — nobody
   has run it yet as of this note. Image and video are still fully
   unvalidated; see `backend/data/validation/{image,video}/README.md` for
   what's needed there.
2. **Decide if the video false-positive risk (histogram-based temporal
   fallback) is acceptable for a demo, or worth chasing a facenet-pytorch
   fix for.** Options: pin an older numpy just for a venv used in video
   testing, look for a facenet-pytorch fork/replacement with numpy 2.x
   support, or accept the fallback and just document it prominently
   (already done in this README).
3. **Seed richer, multi-institution demo data** so the Fairness Dashboard
   and Review Queue show something compelling in a live demo instead of
   the placeholder synthetic baseline in `bias_audit.py`. Build plan Phase
   5's exit check: two different fake `institution_id`s should show
   different fairness numbers with real submitted data, not just the seed.
4. **Decide on SSE vs. polling for job status**, and build it if SSE is
   wanted — `progress_tracker.py` is already copied and unused. Low
   priority since polling already works fine for a demo.
5. **Rehearse the Phase 6 demo script** in `AURA_BUILD_PLAN.md` end-to-end
   through the actual frontend now that it's confirmed working: `/docs` →
   submit via console → watch it complete → check Review Queue → check
   Fairness Dashboard.
6. **Cut-list items** (real OAuth, LTI compliance, webhook delivery, live
   retraining loop) — intentionally out of scope per the build plan; only
   worth revisiting if this moves past hackathon-demo stage.

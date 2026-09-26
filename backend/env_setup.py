"""
Central place to pin every ML-library cache directory onto this project's
own drive, before anything else in the process gets a chance to import
torch/transformers/huggingface_hub and lock in their default (which is
under the user's home dir -- C:\\Users\\<user>\\.cache\\... on Windows).

Why this exists: most of the copied-from-V.E.R.I.T.A.S detectors already
pin their own cache location explicitly --
  - models/ensemble_detector.py passes cache_dir="./models_cache/huggingface"
    to from_pretrained() directly, so it's unaffected by HF_HOME either way.
  - models/face_analyzer.py downloads its assets itself, to an explicit
    path under backend/models_cache/.
But two copied files do NOT pin a cache_dir, and so fall back to whatever
the environment (or, absent that, the OS default) says:
  - models/video/video_3d_model.py's VideoMAE load
    (`VideoMAEImageProcessor.from_pretrained("MCG-NJU/videomae-base")`,
    no cache_dir) -- honors HF_HOME.
  - models/video/temporal_analyzer.py's identity-persistence check
    (`InceptionResnetV1(pretrained='vggface2')` via facenet-pytorch) --
    facenet-pytorch resolves its download dir via torch's own
    get_dir()/get_torch_home(), which honors TORCH_HOME.
This is exactly the C:-drive-fills-up problem the build plan's Phase 1a
testing log already hit once with gpt2 (see AURA_BUILD_PLAN.md's "Phase 1a
-- Testing log" section) -- conftest.py works around it for pytest by
setting HF_HOME before tests import anything, but that fix only applies
under pytest. A plain `uvicorn main:app` run had no equivalent guard until
this module, so VideoMAE/facenet-pytorch would silently start downloading
to C: the first time a video submission ran.

Usage: `import env_setup` MUST be the very first import in any entrypoint
that might end up importing torch or transformers (main.py; conftest.py
already does its own equivalent for pytest) -- the env vars only take
effect if set before huggingface_hub/torch read them at import time.
os.environ.setdefault() is used throughout so an operator's own explicit
HF_HOME/TORCH_HOME (e.g. to point at a shared model cache) always wins.
"""

import os

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))

HF_HOME = os.environ.setdefault("HF_HOME", os.path.join(_BASE_DIR, ".hf_cache"))
TORCH_HOME = os.environ.setdefault("TORCH_HOME", os.path.join(_BASE_DIR, ".torch_cache"))

os.makedirs(HF_HOME, exist_ok=True)
os.makedirs(TORCH_HOME, exist_ok=True)

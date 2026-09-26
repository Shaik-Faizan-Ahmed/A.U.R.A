"""
File-upload endpoint support for AURA's image/video modalities.

Why this exists: SubmissionRequest.content_ref for image/video is a
server-side file path string (see README's "known limitations" /
AURA_BUILD_PLAN's cut-list -- "file upload endpoint: not built"). That's
fine for a caller that already has a file sitting on the same machine as
the API, but a browser can never hand over a real filesystem path for a
file picked via <input type="file">, only the file's bytes. This module
closes that specific gap: it accepts the uploaded bytes over multipart
form data, writes them to a server-side path scoped by institution, and
hands back that path as a content_ref -- so the existing
POST /v1/submissions contract (and everything downstream of it) doesn't
need to change at all.

This is intentionally minimal: local disk, no size/type enforcement beyond
what the frontend already checks, no cleanup job. Fine for a demo; a real
deployment would want virus scanning, object storage, and a retention
policy before accepting arbitrary uploads from a browser.
"""

from __future__ import annotations
import io
import os
import uuid
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException

import config
from auth import get_institution_id

router = APIRouter()


@router.post("/v1/uploads", tags=["submissions"])
async def upload_file(
    file: UploadFile = File(...),
    institution_id: str = Depends(get_institution_id),
):
    """
    Accepts a raw image/video file and returns a content_ref path that can
    be passed straight into POST /v1/submissions. Scoped per institution
    (each institution's uploads land in their own subfolder) so this
    doesn't become a new cross-institution leakage path.
    """
    suffix = os.path.splitext(file.filename or "")[1]
    dest_dir = os.path.join(config.UPLOAD_DIR, institution_id)
    os.makedirs(dest_dir, exist_ok=True)

    dest_path = os.path.join(dest_dir, f"{uuid.uuid4()}{suffix}")

    size = 0
    with open(dest_path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > config.MAX_UPLOAD_BYTES:
                out.close()
                os.remove(dest_path)
                raise HTTPException(status_code=413, detail="File too large (50MB limit)")
            out.write(chunk)

    return {"content_ref": dest_path, "filename": file.filename, "size": size}


@router.post("/v1/uploads/document", tags=["submissions"])
async def upload_document(
    file: UploadFile = File(...),
    institution_id: str = Depends(get_institution_id),
):
    """
    Accepts an essay/report as PDF, DOCX, or TXT and returns its extracted
    text as content_ref -- ready to pass straight into POST /v1/submissions
    with modality="text". This is deliberately different from /v1/uploads
    above: image/video analyzers read the file itself, so that endpoint
    hands back a path, but text's content_ref (per schemas/api_models.py)
    is the raw text itself, so this endpoint does the extraction instead
    of a path handoff -- the caller never needs to know PDF/DOCX parsing
    happened at all.

    Legacy .doc (pre-2007 binary Word format) is NOT supported -- only
    modern .docx. python-docx can only read .docx's XML-based format;
    parsing old binary .doc would need a separate tool (antiword, or a
    LibreOffice conversion step), which is out of scope for a demo.
    A scanned/image-only PDF with no embedded text layer will also come
    back empty -- that would need OCR, also out of scope here.
    """
    suffix = os.path.splitext(file.filename or "")[1].lower()

    if suffix not in (".pdf", ".docx", ".txt"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported document type '{suffix}'. Use .pdf, .docx, or "
                ".txt -- legacy .doc and scanned/image-only PDFs aren't supported."
            ),
        )

    raw = await file.read()
    if len(raw) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (50MB limit)")

    if suffix == ".txt":
        text = raw.decode("utf-8", errors="replace")
    elif suffix == ".pdf":
        text = _extract_pdf_text(raw)
    else:  # .docx
        text = _extract_docx_text(raw)

    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail="No extractable text found in document (scanned/image-only PDF?)",
        )

    return {"content_ref": text, "filename": file.filename, "size": len(raw)}


def _extract_pdf_text(raw: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_docx_text(raw: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(raw))
    return "\n".join(p.text for p in doc.paragraphs)

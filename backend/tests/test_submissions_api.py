import time

import pytest
from fastapi.testclient import TestClient

import config
from main import app

VALID_KEY = "demo-key-college-a"
HEADERS = {"X-AURA-Key": VALID_KEY}

client = TestClient(app)


def _poll_until_complete(job_id: str, timeout_seconds: float = 30.0):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        response = client.get(f"/v1/submissions/{job_id}", headers=HEADERS)
        assert response.status_code == 200
        body = response.json()
        if body["status"] == "complete":
            return body
        time.sleep(0.5)
    pytest.fail(f"Job {job_id} did not complete within {timeout_seconds}s")


def test_missing_api_key_is_rejected():
    response = client.post(
        "/v1/submissions",
        json={"student_ref": "s1", "modality": "text", "content_ref": "hello"},
    )
    assert response.status_code == 422


def test_invalid_api_key_is_rejected():
    response = client.post(
        "/v1/submissions",
        headers={"X-AURA-Key": "not-a-real-key"},
        json={"student_ref": "s1", "modality": "text", "content_ref": "hello"},
    )
    assert response.status_code == 401


def test_text_submission_returns_job_id():
    response = client.post(
        "/v1/submissions",
        headers=HEADERS,
        json={
            "student_ref": "s1",
            "modality": "text",
            "content_ref": "This is an ordinary human-written sentence.",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert "job_id" in body


def test_text_submission_completes_with_expected_fields():
    response = client.post(
        "/v1/submissions",
        headers=HEADERS,
        json={
            "student_ref": "s2",
            "modality": "text",
            "content_ref": "Plain simple human writing here, nothing fancy at all.",
        },
    )
    job_id = response.json()["job_id"]
    result = _poll_until_complete(job_id)

    assert result["modality"] == "text"
    assert 0.0 <= result["overall_score"] <= 1.0
    assert result["confidence"] is not None
    assert result["explanation"]
    assert result["signals"]


def test_ai_sounding_text_submission_flags_for_review():
    ai_like_text = (
        "This paper aims to delve into the intricate tapestry of modern "
        "computing. It underscores a meticulously robust paradigm shift "
        "that boasts unprecedented synergy across the domain. "
    ) * 3
    response = client.post(
        "/v1/submissions",
        headers=HEADERS,
        json={
            "student_ref": "s3",
            "modality": "text",
            "content_ref": ai_like_text,
        },
    )
    job_id = response.json()["job_id"]
    result = _poll_until_complete(job_id)
    assert result["overall_score"] > 0.4

    flags_response = client.get("/v1/flags", headers=HEADERS)
    assert flags_response.status_code == 200
    flagged_job_ids = [f["job_id"] for f in flags_response.json()]
    # Text now uses config.TEXT_FLAG_THRESHOLD (recalibrated to 0.30 against
    # real validation data), not the old hardcoded 0.6 -- see config.py.
    if result["overall_score"] >= config.TEXT_FLAG_THRESHOLD:
        assert job_id in flagged_job_ids


def test_job_not_found_returns_404():
    response = client.get("/v1/submissions/does-not-exist", headers=HEADERS)
    assert response.status_code == 404


def test_job_from_other_institution_is_not_visible():
    response = client.post(
        "/v1/submissions",
        headers=HEADERS,
        json={"student_ref": "s4", "modality": "text", "content_ref": "hello there"},
    )
    job_id = response.json()["job_id"]

    other_institution_response = client.get(
        f"/v1/submissions/{job_id}",
        headers={"X-AURA-Key": "demo-key-college-b"},
    )
    assert other_institution_response.status_code == 404

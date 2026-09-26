// Thin client for the AURA Core API. This is the ONLY file that knows about
// endpoint URLs/headers — pages call these functions, never fetch() directly.
// Design teammates should not need to touch this file.

const BASE_URL = 'http://localhost:8000'

// Swap this for a real login/institution-picker later; hardcoded for the demo.
let apiKey = 'demo-key-college-a'

export function setApiKey(key) {
  apiKey = key
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-AURA-Key': apiKey,
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }
  return res.json()
}

export function createSubmission({ student_ref, modality, content_ref, demographic_group }) {
  return request('/v1/submissions', {
    method: 'POST',
    body: JSON.stringify({ student_ref, modality, content_ref, demographic_group }),
  })
}

export function getSubmission(jobId) {
  return request(`/v1/submissions/${jobId}`)
}

export function getFlags() {
  return request('/v1/flags')
}

export function decideFlag(flagId, decision, reviewer_id) {
  return request(`/v1/flags/${flagId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, reviewer_id }),
  })
}

export function getFairness() {
  return request('/v1/audit/fairness')
}

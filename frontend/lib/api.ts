// Thin client for the AURA Core API. This is the ONLY file that should know
// about endpoint URLs/headers -- pages/components call these functions,
// never fetch() directly against the backend. Mirrors the pattern used by
// the original Vite console's src/api.js.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Swap for a real login/institution-picker later; hardcoded for the demo,
// same as the rest of this codebase's auth story. Mutable (not const) so a
// UI institution-picker can switch it at runtime -- see setApiKey below.
let API_KEY = process.env.NEXT_PUBLIC_AURA_API_KEY || 'demo-key-college-a'

export function setApiKey(key: string) {
  API_KEY = key
}

export function getApiKey(): string {
  return API_KEY
}

export type Modality = 'text' | 'image' | 'video'

export interface EvidenceRef {
  start?: number | null
  end?: number | null
  bbox?: number[] | null
  frame_range?: number[] | null
  timestamp?: number | null
}

export interface Signal {
  modality: Modality
  signal_name: string
  raw_score: number
  confidence: number
  evidence_ref?: EvidenceRef | null
}

export interface SubmissionResult {
  job_id: string
  status: 'queued' | 'processing' | 'complete' | string
  modality?: Modality
  overall_score?: number
  confidence?: number
  explanation?: string
  signals?: Signal[]
  fairness_banner?: string | null
}

export interface FlagItem {
  flag_id: string
  job_id: string
  student_ref: string
  modality: Modality
  overall_score: number
  explanation: string
  fairness_banner?: string | null
  status: 'pending' | 'upheld' | 'dismissed'
}

export interface GroupStat {
  group: string
  fpr: number
  fnr: number
  sample_size: number
}

export interface FairnessResponse {
  institution_id: string
  groups: GroupStat[]
  disparate_impact_ratio: number
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      'X-AURA-Key': API_KEY,
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }
  return res.json()
}

/** Uploads a raw image/video file, returns a content_ref path to submit with. */
export function uploadFile(file: File): Promise<{ content_ref: string; filename: string; size: number }> {
  const formData = new FormData()
  formData.append('file', file)
  return request('/v1/uploads', { method: 'POST', body: formData })
}

export function createSubmission(params: {
  student_ref: string
  modality: Modality
  content_ref: string
  demographic_group?: string | null
}): Promise<{ job_id: string; status: string }> {
  return request('/v1/submissions', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export function getSubmission(jobId: string): Promise<SubmissionResult> {
  return request(`/v1/submissions/${jobId}`)
}

export function getFairness(): Promise<FairnessResponse> {
  return request('/v1/audit/fairness')
}

export function getFlags(): Promise<FlagItem[]> {
  return request('/v1/flags')
}

export function decideFlag(
  flagId: string,
  decision: 'uphold' | 'dismiss',
  reviewerId: string,
): Promise<FlagItem> {
  return request(`/v1/flags/${flagId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, reviewer_id: reviewerId }),
  })
}

/** Polls GET /v1/submissions/{jobId} every intervalMs until status is 'complete'. */
export function pollSubmission(
  jobId: string,
  onUpdate: (result: SubmissionResult) => void,
  intervalMs = 1500,
  timeoutMs = 5 * 60 * 1000,
): { cancel: () => void } {
  let cancelled = false
  const start = Date.now()

  const tick = async () => {
    if (cancelled) return
    try {
      const result = await getSubmission(jobId)
      if (cancelled) return
      onUpdate(result)
      if (result.status === 'complete') return
    } catch (err) {
      if (!cancelled) onUpdate({ job_id: jobId, status: 'error', explanation: (err as Error).message })
      return
    }
    if (Date.now() - start > timeoutMs) {
      onUpdate({ job_id: jobId, status: 'error', explanation: 'Timed out waiting for analysis to complete.' })
      return
    }
    setTimeout(tick, intervalMs)
  }
  tick()

  return { cancel: () => { cancelled = true } }
}

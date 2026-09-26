"use client"

import { useState, useRef } from 'react'
import { FileText, Image, Video, Code, X, BookOpen, CheckCircle2, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

type SubmitState = 'idle' | 'processing' | 'complete'
type FileCategory = 'essay' | 'image' | 'video' | 'code'

interface UploadedFile {
  file: File
  category: FileCategory
}

interface SubmissionSignal {
  modality: string
  signal_name: string
  raw_score: number
  confidence: number
  evidence_ref?: Record<string, any> | null
}

interface SubmissionResult {
  fileName: string
  category: FileCategory
  status: 'ok' | 'error'
  jobId?: string
  overallScore?: number
  confidence?: number
  explanation?: string
  signals?: SubmissionSignal[]
  fairnessBanner?: string | null
  errorMessage?: string
}

// Demo-only: AURA has no login flow yet, so the caller's institution is
// fixed to a single hardcoded X-AURA-Key (see backend/config.py's
// INSTITUTIONS dict — "hardcoded for hackathon demo"). Swap for a real
// auth flow before this goes anywhere beyond a demo.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const AURA_KEY = process.env.NEXT_PUBLIC_AURA_KEY || 'demo-key-college-a'

const categoryConfig: Record<FileCategory, { label: string; icon: React.ElementType; accept: string; desc: string; connected: boolean }> = {
  essay: {
    label: 'Essay / Report',
    icon: FileText,
    accept: '.pdf,.docx,.txt',
    desc: 'PDF, DOCX, TXT — text extracted and analyzed',
    connected: true,
  },
  image: {
    label: 'Image Attachment',
    icon: Image,
    accept: '.jpg,.jpeg,.png,.webp',
    desc: 'JPG, PNG, WEBP — scanned for AI generation',
    connected: true,
  },
  video: {
    label: 'Video Attachment',
    icon: Video,
    accept: '.mp4,.mov,.avi',
    desc: 'MP4, MOV — deepfake analysis',
    connected: true,
  },
  code: {
    label: 'Code File',
    icon: Code,
    accept: '.py,.js,.ts,.java,.cpp,.c,.cs',
    desc: 'Source file — not connected yet',
    connected: false,
  },
}

// Real backend flow for image/video, per schemas/api_models.py + uploads.py:
//   1. POST /v1/uploads (multipart) -- browser can only hand over bytes,
//      not a filesystem path, so this endpoint writes the file server-side
//      and hands back the content_ref path SubmissionRequest needs.
//   2. POST /v1/submissions (JSON) -- queues the async analysis job.
//   3. GET /v1/submissions/{job_id} -- poll until status is "complete".
async function uploadAndAnalyze(file: File, modality: 'image' | 'video', studentRef: string): Promise<SubmissionResult> {
  const uploadForm = new FormData()
  uploadForm.append('file', file)

  const uploadRes = await fetch(`${API_URL}/v1/uploads`, {
    method: 'POST',
    headers: { 'X-AURA-Key': AURA_KEY },
    body: uploadForm,
  })
  if (!uploadRes.ok) {
    throw new Error(`Upload failed (${uploadRes.status})`)
  }
  const { content_ref } = await uploadRes.json()

  const submitRes = await fetch(`${API_URL}/v1/submissions`, {
    method: 'POST',
    headers: { 'X-AURA-Key': AURA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_ref: studentRef || 'anonymous',
      modality,
      content_ref,
    }),
  })
  if (!submitRes.ok) {
    throw new Error(`Submission failed (${submitRes.status})`)
  }
  const { job_id } = await submitRes.json()

  const maxAttempts = 80
  const pollIntervalMs = 1500
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pollRes = await fetch(`${API_URL}/v1/submissions/${job_id}`, {
      headers: { 'X-AURA-Key': AURA_KEY },
    })
    if (!pollRes.ok) {
      throw new Error(`Status check failed (${pollRes.status})`)
    }
    const data = await pollRes.json()
    if (data.status === 'complete') {
      return {
        fileName: file.name,
        category: modality,
        status: 'ok',
        jobId: job_id,
        overallScore: data.overall_score,
        confidence: data.confidence,
        explanation: data.explanation,
        signals: data.signals,
        fairnessBanner: data.fairness_banner,
      }
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }
  throw new Error('Analysis timed out')
}

// Essay/report flow: unlike image/video, text's content_ref is the raw
// text itself (see schemas/api_models.py), not a file path -- so this
// goes through /v1/uploads/document first, which extracts the PDF/DOCX/TXT
// text server-side and hands back that text as content_ref, then submits
// it exactly like a hand-typed text submission would be.
async function extractAndAnalyzeEssay(file: File, studentRef: string): Promise<SubmissionResult> {
  const uploadForm = new FormData()
  uploadForm.append('file', file)

  const extractRes = await fetch(`${API_URL}/v1/uploads/document`, {
    method: 'POST',
    headers: { 'X-AURA-Key': AURA_KEY },
    body: uploadForm,
  })
  if (!extractRes.ok) {
    const detail = await extractRes.text().catch(() => '')
    throw new Error(`Text extraction failed (${extractRes.status})${detail ? `: ${detail}` : ''}`)
  }
  const { content_ref } = await extractRes.json()

  const submitRes = await fetch(`${API_URL}/v1/submissions`, {
    method: 'POST',
    headers: { 'X-AURA-Key': AURA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_ref: studentRef || 'anonymous',
      modality: 'text',
      content_ref,
    }),
  })
  if (!submitRes.ok) {
    throw new Error(`Submission failed (${submitRes.status})`)
  }
  const { job_id } = await submitRes.json()

  const maxAttempts = 80
  const pollIntervalMs = 1500
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pollRes = await fetch(`${API_URL}/v1/submissions/${job_id}`, {
      headers: { 'X-AURA-Key': AURA_KEY },
    })
    if (!pollRes.ok) {
      throw new Error(`Status check failed (${pollRes.status})`)
    }
    const data = await pollRes.json()
    if (data.status === 'complete') {
      return {
        fileName: file.name,
        category: 'essay',
        status: 'ok',
        jobId: job_id,
        overallScore: data.overall_score,
        confidence: data.confidence,
        explanation: data.explanation,
        signals: data.signals,
        fairnessBanner: data.fairness_banner,
      }
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }
  throw new Error('Analysis timed out')
}

export default function SubmitPage() {
  const [state, setState] = useState<SubmitState>('idle')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [rubricText, setRubricText] = useState('')
  const [studentId, setStudentId] = useState('')
  const [dragging, setDragging] = useState<FileCategory | null>(null)
  const [results, setResults] = useState<SubmissionResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<FileCategory, HTMLInputElement | null>>({
    essay: null, image: null, video: null, code: null,
  })

  const handleFileAdd = (file: File, category: FileCategory) => {
    setUploadedFiles(prev => {
      if (category === 'essay' || category === 'code') {
        return [...prev.filter(f => f.category !== category), { file, category }]
      }
      return [...prev, { file, category }]
    })
  }

  const handleDrop = (e: React.DragEvent, category: FileCategory) => {
    e.preventDefault()
    setDragging(null)
    const file = e.dataTransfer.files[0]
    if (file) handleFileAdd(file, category)
  }

  const removeFile = (idx: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    const connectedFiles = uploadedFiles.filter(
      f => f.category === 'image' || f.category === 'video' || f.category === 'essay'
    )

    if (connectedFiles.length === 0) {
      setError(
        uploadedFiles.length > 0
          ? 'Only Essay, Image, and Video attachments are connected to analysis right now — code submission isn\'t wired up yet.'
          : 'Please upload at least one essay, image, or video file before submitting.'
      )
      return
    }

    setError(null)
    setResults([])
    setState('processing')

    const settled = await Promise.allSettled(
      connectedFiles.map(({ file, category }) =>
        category === 'essay'
          ? extractAndAnalyzeEssay(file, studentId)
          : uploadAndAnalyze(file, category as 'image' | 'video', studentId)
      )
    )

    const finalResults: SubmissionResult[] = settled.map((outcome, i) => {
      if (outcome.status === 'fulfilled') return outcome.value
      return {
        fileName: connectedFiles[i].file.name,
        category: connectedFiles[i].category,
        status: 'error',
        errorMessage: (outcome.reason as Error)?.message || 'Analysis failed',
      }
    })

    setResults(finalResults)
    setState('complete')
  }

  const canSubmit = uploadedFiles.length > 0

  return (
    <main className="light-surface min-h-screen overflow-x-hidden">

      {state === 'complete' && results.length > 0 ? (
        /* ── RESULTS VIEW ── */
        <div className="relative z-10 container max-w-4xl mx-auto px-6 py-16 space-y-10">
          <div className="text-center space-y-3">
            <CheckCircle2 className="mx-auto text-indigo-400" size={48} />
            <h1 className="text-3xl font-bold">Analysis Complete</h1>
            <p className="text-slate-400">{studentId || 'Anonymous'} — {results.length} file{results.length > 1 ? 's' : ''} analyzed</p>
          </div>

          <div className="space-y-6">
            {results.map((r, i) => (
              <div key={i} className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{r.fileName}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-[2px]">{r.category}</p>
                  </div>
                  {r.status === 'error' ? (
                    <span className="text-sm px-3 py-1 rounded-full bg-red-500/20 text-red-400 flex items-center gap-1">
                      <AlertTriangle size={14} /> Failed
                    </span>
                  ) : (
                    <span className={`text-sm px-3 py-1 rounded-full ${
                      (r.overallScore ?? 0) >= 0.6 ? 'bg-red-500/20 text-red-400' :
                      (r.overallScore ?? 0) >= 0.4 ? 'bg-amber-500/20 text-amber-400' :
                      'bg-green-500/20 text-green-400'
                    }`}>
                      {(r.overallScore ?? 0) >= 0.6 ? 'Likely AI' : (r.overallScore ?? 0) >= 0.4 ? 'Borderline' : 'Likely Human'}
                    </span>
                  )}
                </div>

                {r.status === 'error' ? (
                  <p className="text-red-400 text-sm">{r.errorMessage}</p>
                ) : (
                  <>
                    <div className="flex items-end gap-3">
                      <span className="text-4xl font-bold text-white">
                        {Math.round((r.overallScore ?? 0) * 100)}<span className="text-xl text-slate-400">%</span>
                      </span>
                      <span className="text-xs text-slate-500 mb-1">confidence {Math.round((r.confidence ?? 0) * 100)}%</span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-1000 ${
                          (r.overallScore ?? 0) >= 0.6 ? 'bg-red-500' :
                          (r.overallScore ?? 0) >= 0.4 ? 'bg-amber-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.round((r.overallScore ?? 0) * 100)}%` }}
                      />
                    </div>
                    {r.explanation && (
                      <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{r.explanation}</p>
                    )}
                    {r.fairnessBanner && (
                      <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
                        {r.fairnessBanner}
                      </p>
                    )}
                    {r.signals && r.signals.length > 0 && (
                      <details className="text-xs text-slate-400">
                        <summary className="cursor-pointer text-slate-500 uppercase tracking-[1px] mb-2">
                          {r.signals.length} contributing signal{r.signals.length > 1 ? 's' : ''}
                        </summary>
                        <ul className="space-y-1 mt-2">
                          {r.signals.map((s, si) => (
                            <li key={si} className="flex justify-between">
                              <span>{s.signal_name.replace(/_/g, ' ')}</span>
                              <span>{s.raw_score.toFixed(2)} (conf {s.confidence.toFixed(2)})</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-4 justify-center pt-4">
            <button
              onClick={() => { setState('idle'); setResults([]); setUploadedFiles([]) }}
              className="px-8 py-3 border border-indigo-500/40 bg-indigo-500/10 text-white hover:bg-indigo-500/20 transition-all text-sm uppercase tracking-[1px]"
            >
              New Submission
            </button>
            <Link href="/dashboard">
              <button className="px-8 py-3 border border-white/15 text-white/70 hover:text-white hover:border-white/30 transition-all text-sm uppercase tracking-[1px]">
                View Dashboard
              </button>
            </Link>
          </div>
        </div>
      ) : (
        /* ── UPLOAD VIEW ── */
        <div className="relative z-10 container max-w-4xl mx-auto px-6 py-16 space-y-10">
          <div className="text-center space-y-3">
            <p className="text-xs text-indigo-400/70 uppercase tracking-[4px]">Student Portal</p>
            <h1 className="text-4xl font-bold">Submit Your Work</h1>
            <p className="text-slate-400 max-w-lg mx-auto text-sm leading-relaxed">
              Upload your essay, images, video, or code for AI integrity analysis, plagiarism check, and auto-grading.
            </p>
          </div>

          {/* Student Details */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-[2px] mb-2 block">Student ID / Name</label>
            <input
              type="text"
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              placeholder="e.g. STU2024001 or John Doe"
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>

          {/* File Upload Zones */}
          <div className="grid md:grid-cols-2 gap-4">
            {(Object.keys(categoryConfig) as FileCategory[]).map(category => {
              const cfg = categoryConfig[category]
              const Icon = cfg.icon
              const existing = uploadedFiles.filter(f => f.category === category)
              const isDragging = dragging === category

              return (
                <div
                  key={category}
                  onDragOver={e => { e.preventDefault(); setDragging(category) }}
                  onDragLeave={() => setDragging(null)}
                  onDrop={e => handleDrop(e, category)}
                  onClick={() => fileInputRefs.current[category]?.click()}
                  className={`relative border rounded-xl p-6 cursor-pointer transition-all duration-200 ${
                    isDragging
                      ? 'border-indigo-500/60 bg-indigo-500/10'
                      : existing.length > 0
                      ? 'border-indigo-500/30 bg-indigo-500/5'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20'
                  }`}
                >
                  <input
                    ref={el => { fileInputRefs.current[category] = el }}
                    type="file"
                    accept={cfg.accept}
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleFileAdd(f, category)
                    }}
                  />
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      existing.length > 0 ? 'bg-indigo-500/20' : 'bg-white/5'
                    }`}>
                      <Icon size={22} className={existing.length > 0 ? 'text-indigo-400' : 'text-white/40'} strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{cfg.label}</p>
                        {!cfg.connected && (
                          <span className="text-[10px] uppercase tracking-[1px] text-slate-500 border border-white/10 rounded px-1.5 py-0.5">
                            not connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{cfg.desc}</p>
                      {existing.length > 0 ? (
                        <div className="mt-3 space-y-1">
                          {existing.map((uf, i) => (
                            <div key={i} className="flex items-center justify-between gap-2">
                              <span className="text-xs text-indigo-300 truncate">{uf.file.name}</span>
                              <button
                                onClick={e => { e.stopPropagation(); removeFile(uploadedFiles.indexOf(uf)) }}
                                className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600 mt-3">
                          {isDragging ? 'Drop to add' : 'Click or drag to upload'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Rubric Input */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-[2px] mb-2 block flex items-center gap-2">
              <BookOpen size={12} /> Grading Rubric <span className="text-slate-600 normal-case tracking-normal ml-1">(optional — not connected yet)</span>
            </label>
            <textarea
              value={rubricText}
              onChange={e => setRubricText(e.target.value)}
              placeholder="e.g.&#10;Introduction (20 pts): Clear thesis statement, well-defined scope...&#10;Analysis (40 pts): Depth of argument, use of evidence...&#10;Conclusion (20 pts): Summarizes key points..."
              rows={5}
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="relative rounded-lg overflow-hidden border border-zinc-200 bg-white p-8 text-center space-y-4">
            <div className="relative z-10 flex flex-col items-center gap-3">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || state === 'processing'}
                className={`px-16 py-4 text-[14px] font-medium tracking-[2px] uppercase border transition-all duration-300 rounded-lg ${
                  canSubmit
                    ? 'border-indigo-400/60 bg-indigo-600/30 text-white hover:bg-indigo-600/50 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(99,102,241,0.3)] cursor-pointer'
                    : 'border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed'
                }`}
              >
                {state === 'processing' ? 'Analyzing...' : 'Analyze Submission'}
              </button>
              <p className="text-slate-400 text-xs tracking-wide">
                Essay, Image, and Video analysis are live. Code submission isn't connected yet.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

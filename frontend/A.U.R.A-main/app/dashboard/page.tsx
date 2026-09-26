"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { CheckCircle2, AlertTriangle, Clock, Eye, ThumbsUp, Flag, Search, RefreshCw } from 'lucide-react'

interface SubmissionListItem {
  job_id: string
  student_ref: string
  modality: string
  status: string
  overall_score: number | null
  confidence: number | null
  fairness_banner: string | null
  demographic_group: string | null
  created_at: string
  flag_id: string | null
  review_status: 'pending_review' | 'approved' | 'flagged' | 'escalated'
}

interface SubmissionDetail {
  job_id: string
  status: string
  modality?: string
  overall_score?: number
  confidence?: number
  explanation?: string
  fairness_banner?: string | null
  signals?: { signal_name: string; raw_score: number; confidence: number }[]
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Single-institution for this demo (see backend/config.py's INSTITUTIONS
// dict -- "hardcoded for hackathon demo"). Matches /upload (Audit Data).
const INSTITUTION_KEY = 'demo-key-college-a'

const statusConfig = {
  pending_review: { label: 'Pending Review', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: Clock },
  approved: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', icon: CheckCircle2 },
  flagged: { label: 'Flagged', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: AlertTriangle },
  escalated: { label: 'Escalated', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', icon: Flag },
}

export default function DashboardPage() {
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([])
  const [selected, setSelected] = useState<SubmissionListItem | null>(null)
  const [detail, setDetail] = useState<SubmissionDetail | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/v1/submissions`, {
        headers: { 'X-AURA-Key': INSTITUTION_KEY },
      })
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`)
      setSubmissions(await res.json())
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }, [])

  // Live-updates: poll on an interval so newly submitted/analyzed work
  // shows up without a manual reload.
  useEffect(() => {
    setLoading(true)
    fetchSubmissions()
    pollRef.current = setInterval(fetchSubmissions, 4000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchSubmissions])

  // Fetch full reasoning/explanation for whichever row is selected --
  // the list endpoint stays lightweight, detail is fetched on demand.
  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    let cancelled = false
    fetch(`${API_URL}/v1/submissions/${selected.job_id}`, {
      headers: { 'X-AURA-Key': INSTITUTION_KEY },
    })
      .then(res => res.json())
      .then(data => { if (!cancelled) setDetail(data) })
      .catch(() => { if (!cancelled) setDetail(null) })
    return () => { cancelled = true }
  }, [selected])

  async function handleDecision(flagId: string, decision: 'uphold' | 'dismiss') {
    try {
      await fetch(`${API_URL}/v1/flags/${flagId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-AURA-Key': INSTITUTION_KEY },
        body: JSON.stringify({ decision, reviewer_id: 'demo-reviewer' }),
      })
      fetchSubmissions()
    } catch {
      setError('Failed to record decision')
    }
  }

  const filtered = submissions.filter(s => {
    const matchFilter = filter === 'all' || s.review_status === filter
    const matchSearch = s.student_ref.toLowerCase().includes(search.toLowerCase()) ||
      s.job_id.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const stats = {
    total: submissions.length,
    pending: submissions.filter(s => s.review_status === 'pending_review').length,
    flagged: submissions.filter(s => s.review_status === 'flagged' || s.review_status === 'escalated').length,
    approved: submissions.filter(s => s.review_status === 'approved').length,
    avgAi: submissions.length
      ? Math.round(
          (submissions.reduce((a, b) => a + (b.overall_score ?? 0), 0) / submissions.length) * 100
        )
      : 0,
  }

  return (
    <main className="light-surface min-h-screen overflow-x-hidden">
      <div className="relative z-10 container max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[3px] text-indigo-400/80 font-medium">Academic Portal</p>
            <h1 className="text-3xl font-bold text-white mt-1">Instructor Review Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                Live — updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchSubmissions}
              className="p-2 rounded-lg border border-white/10 bg-white/[0.02] text-slate-400 hover:text-white hover:border-white/20 transition-all cursor-pointer"
              title="Refresh now"
            >
              <RefreshCw size={14} />
            </button>
            <Link href="/submit">
              <button className="px-5 py-2.5 text-xs uppercase tracking-[1.5px] font-medium border border-indigo-500/40 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 hover:text-white rounded-lg backdrop-blur-md transition-all cursor-pointer">
                + New Submission
              </button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error} — is the backend running on {API_URL}?
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total', value: stats.total, color: 'text-white' },
            { label: 'Pending', value: stats.pending, color: 'text-amber-400' },
            { label: 'Flagged', value: stats.flagged, color: 'text-red-400' },
            { label: 'Approved', value: stats.approved, color: 'text-green-400' },
            { label: 'Avg AI Score', value: `${stats.avgAi}%`, color: 'text-indigo-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-white/[0.02] border border-white/10 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-slate-500 mt-1 uppercase tracking-[2px]">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filter + Search */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by student or job ID..."
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending_review', 'flagged', 'escalated', 'approved'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 text-xs uppercase tracking-[1px] rounded-lg border transition-all cursor-pointer ${
                  filter === f
                    ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                    : 'border-white/10 bg-white/[0.02] text-slate-500 hover:text-white hover:border-white/20'
                }`}
              >
                {f === 'all' ? 'All' :
                 f === 'pending_review' ? 'Pending' :
                 f === 'flagged' ? 'Flagged' :
                 f === 'escalated' ? 'Escalated' : 'Approved'}
              </button>
            ))}
          </div>
        </div>

        {loading && submissions.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading submissions...</div>
        ) : (
          <div className="grid md:grid-cols-5 gap-6">
            {/* Submission List */}
            <div className="md:col-span-2 space-y-3">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-sm">No submissions match your filter.</div>
              ) : filtered.map(sub => {
                const sc = statusConfig[sub.review_status]
                const StatusIcon = sc.icon
                const scorePct = sub.overall_score != null ? Math.round(sub.overall_score * 100) : null
                return (
                  <div
                    key={sub.job_id}
                    onClick={() => setSelected(sub)}
                    className={`bg-white/[0.02] border rounded-xl p-4 cursor-pointer transition-all hover:bg-white/[0.04] ${
                      selected?.job_id === sub.job_id ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-sm font-medium text-white">{sub.student_ref}</p>
                        <p className="text-xs text-slate-500">{sub.modality} · {sub.job_id.slice(0, 8)}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded border flex items-center gap-1 flex-shrink-0 ${sc.bg} ${sc.color}`}>
                        <StatusIcon size={10} />
                        {sc.label}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span>
                        AI:{' '}
                        {scorePct == null ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <span className={scorePct > 60 ? 'text-red-400' : scorePct > 40 ? 'text-amber-400' : 'text-green-400'}>
                            {scorePct}%
                          </span>
                        )}
                      </span>
                      {sub.demographic_group && <span>Group: {sub.demographic_group}</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Detail Panel */}
            <div className="md:col-span-3">
              {selected ? (
                <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-6 sticky top-24">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-[2px] mb-1">{selected.job_id.slice(0, 8)}</p>
                      <h2 className="text-xl font-bold text-white">{selected.student_ref}</h2>
                      <p className="text-sm text-slate-400">{selected.modality}</p>
                      <p className="text-xs text-slate-600 mt-1">{new Date(selected.created_at).toLocaleString()}</p>
                    </div>
                    {selected.fairness_banner && (
                      <div className="text-xs text-amber-400 max-w-[220px] text-right">Fairness alert</div>
                    )}
                  </div>

                  {selected.overall_score != null && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">AI Content Score</span>
                        <span className={
                          selected.overall_score >= 0.6 ? 'text-red-400' :
                          selected.overall_score >= 0.4 ? 'text-amber-400' : 'text-green-400'
                        }>
                          {Math.round(selected.overall_score * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            selected.overall_score >= 0.6 ? 'bg-red-500' :
                            selected.overall_score >= 0.4 ? 'bg-amber-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.round(selected.overall_score * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {selected.fairness_banner && (
                    <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
                      {selected.fairness_banner}
                    </p>
                  )}

                  {detail?.explanation && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-[2px] mb-2">Reasoning</p>
                      <pre className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">{detail.explanation}</pre>
                    </div>
                  )}

                  {detail?.signals && detail.signals.length > 0 && (
                    <details className="text-xs text-slate-400">
                      <summary className="cursor-pointer text-slate-500 uppercase tracking-[1px] mb-2">
                        {detail.signals.length} contributing signal{detail.signals.length > 1 ? 's' : ''}
                      </summary>
                      <ul className="space-y-1 mt-2">
                        {detail.signals.map((s, i) => (
                          <li key={i} className="flex justify-between">
                            <span>{s.signal_name.replace(/_/g, ' ')}</span>
                            <span>{s.raw_score.toFixed(2)} (conf {s.confidence.toFixed(2)})</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {/* Actions only apply to a submission that's actually flagged --
                      approve/escalate aren't real states the API can move a
                      non-flagged submission into. */}
                  {selected.review_status === 'flagged' && selected.flag_id && (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        onClick={() => handleDecision(selected.flag_id!, 'dismiss')}
                        className="flex items-center justify-center gap-2 py-3 text-xs uppercase tracking-[1px] border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all rounded-lg cursor-pointer"
                      >
                        <ThumbsUp size={13} /> Dismiss (approve)
                      </button>
                      <button
                        onClick={() => handleDecision(selected.flag_id!, 'uphold')}
                        className="flex items-center justify-center gap-2 py-3 text-xs uppercase tracking-[1px] border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-all rounded-lg cursor-pointer"
                      >
                        <Flag size={13} /> Uphold (escalate)
                      </button>
                    </div>
                  )}

                  {selected.review_status === 'pending_review' && (
                    <p className="text-xs text-slate-500 text-center">Still analyzing — check back shortly.</p>
                  )}
                </div>
              ) : (
                <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 h-full flex items-center justify-center min-h-[300px]">
                  <div className="text-center space-y-3">
                    <Eye size={32} className="mx-auto text-slate-600" />
                    <p className="text-slate-500 text-sm">Select a submission to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

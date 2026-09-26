"use client"

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react'
import UtilityNav from '@/components/utility-nav'
import { getFlags, decideFlag, setApiKey, type FlagItem } from '@/lib/api'

// Same demo institution switcher as the upload page (lib/api.ts's API_KEY
// maps 1:1 to config.py's INSTITUTIONS lookup table on the backend).
const DEMO_INSTITUTIONS = [
  { key: 'demo-key-college-a', label: 'College A' },
  { key: 'demo-key-college-b', label: 'College B' },
]

// Stand-in for a real reviewer login -- AURA's contract needs a
// reviewer_id per decision, there's no auth system in this reference console.
const DEMO_REVIEWER_ID = 'demo-reviewer-01'

function statusBadge(status: FlagItem['status']) {
  if (status === 'upheld') return { label: 'Upheld', color: 'text-red-400 border-red-500/40' }
  if (status === 'dismissed') return { label: 'Dismissed', color: 'text-white/40 border-white/20' }
  return { label: 'Pending Review', color: 'text-yellow-400 border-yellow-500/40' }
}

export default function ReviewPage() {
  const [institutionKey, setInstitutionKey] = useState(DEMO_INSTITUTIONS[0].key)
  const [flags, setFlags] = useState<FlagItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const loadFlags = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getFlags()
      setFlags(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setApiKey(institutionKey)
    loadFlags()
  }, [institutionKey, loadFlags])

  const handleDecision = async (flagId: string, decision: 'uphold' | 'dismiss') => {
    setDecidingId(flagId)
    try {
      const updated = await decideFlag(flagId, decision, DEMO_REVIEWER_ID)
      setFlags((prev) => prev.map((f) => (f.flag_id === flagId ? updated : f)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record decision')
    } finally {
      setDecidingId(null)
    }
  }

  const pending = flags.filter((f) => f.status === 'pending')
  const resolved = flags.filter((f) => f.status !== 'pending')

  return (
    <main className="min-h-screen bg-black text-white px-6 py-32">
      <UtilityNav />

      <div className="max-w-4xl mx-auto space-y-10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm font-light tracking-[3px] uppercase text-white/50">Human Review Gate</p>
            <h1 className="text-4xl font-light tracking-[6px] uppercase">Review Queue</h1>
          </div>

          <select
            value={institutionKey}
            onChange={(e) => setInstitutionKey(e.target.value)}
            className="glass-card rounded-full px-4 py-2 text-sm bg-transparent text-white/80 outline-none"
          >
            {DEMO_INSTITUTIONS.map((inst) => (
              <option key={inst.key} value={inst.key} className="bg-black">
                {inst.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="glass-card border-red-500/30 bg-red-500/10 rounded-2xl p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && <p className="text-white/50 text-sm">Loading flagged submissions...</p>}

        {!loading && flags.length === 0 && !error && (
          <div className="glass-card rounded-3xl p-10 text-center text-white/50 text-sm">
            No flagged submissions for this institution yet. A submission lands here automatically
            once its overall score crosses the review threshold.
          </div>
        )}

        {pending.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs tracking-[2px] uppercase text-white/40">
              Pending &middot; {pending.length}
            </h2>
            {pending.map((flag) => (
              <div key={flag.flag_id} className="glass-card rounded-3xl p-6 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm text-white/90">
                      {flag.student_ref} &middot; <span className="capitalize">{flag.modality}</span>
                    </p>
                    <p className="text-xs text-white/40 mt-1">Job {flag.job_id.slice(0, 8)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-light">{(flag.overall_score * 100).toFixed(0)}%</p>
                    <p className="text-[10px] uppercase tracking-wide text-white/40">overall score</p>
                  </div>
                </div>

                <p className="text-sm text-white/70 leading-relaxed">{flag.explanation}</p>

                {flag.fairness_banner && (
                  <div className="flex items-start gap-2 glass-card border-yellow-500/40 bg-yellow-500/5 rounded-xl p-3">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-200/90 leading-relaxed">{flag.fairness_banner}</p>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => handleDecision(flag.flag_id, 'uphold')}
                    disabled={decidingId === flag.flag_id}
                    className="flex items-center gap-2 px-5 py-2.5 glass-card border-red-500/30 text-red-300 text-xs uppercase tracking-wide hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  >
                    <XCircle className="w-4 h-4" />
                    Uphold Flag
                  </button>
                  <button
                    onClick={() => handleDecision(flag.flag_id, 'dismiss')}
                    disabled={decidingId === flag.flag_id}
                    className="flex items-center gap-2 px-5 py-2.5 glass-card border-emerald-500/30 text-emerald-300 text-xs uppercase tracking-wide hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <div className="space-y-3 pt-6">
            <h2 className="text-xs tracking-[2px] uppercase text-white/40">
              Resolved &middot; {resolved.length}
            </h2>
            {resolved.map((flag) => {
              const badge = statusBadge(flag.status)
              return (
                <div
                  key={flag.flag_id}
                  className="glass-card rounded-2xl p-4 flex items-center justify-between gap-4 opacity-70"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-white/30" />
                    <p className="text-sm text-white/70">
                      {flag.student_ref} &middot; <span className="capitalize">{flag.modality}</span>
                    </p>
                  </div>
                  <span className={`text-xs uppercase tracking-wide border rounded-full px-3 py-1 ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

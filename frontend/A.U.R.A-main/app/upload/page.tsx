"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { Shield, RefreshCw, AlertTriangle, Flag, Clock, CheckCircle2 } from 'lucide-react'

interface GroupStat {
  group: string
  fpr: number
  fnr: number
  sample_size: number
}

interface FairnessResponse {
  institution_id: string
  groups: GroupStat[]
  disparate_impact_ratio: number
}

interface FlagItem {
  flag_id: string
  job_id: string
  student_ref: string
  modality: string
  overall_score: number
  explanation: string
  fairness_banner?: string | null
  status: 'pending' | 'upheld' | 'dismissed'
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Single-institution for this demo (see backend/config.py's INSTITUTIONS
// dict -- "hardcoded for hackathon demo"). Was previously a switcher between
// college_a/college_b; simplified to one institution per product decision.
const INSTITUTION_KEY = 'demo-key-college-a'

// Classifies a group name into a section for display. Matches the actual
// naming conventions the backend produces:
//   - text_detector.py's analyze_text() meta.suggested_demographic_group
//     and bias_audit.py's seed data both use "native_english" / "esl" /
//     "unspecified" -- words, not ISO codes -- for the text modality.
//   - image_detector.py / video_detector.py's _quality_group() suffix
//     their groups with "_image" / "_video".
// A raw ISO code (en/es/zh/...) is also accepted for forward-compatibility
// with any detector that emits language codes directly instead of the
// native_english/esl labels.
const TEXT_GROUP_LABELS: Record<string, string> = {
  native_english: 'Native English',
  esl: 'ESL / Non-native English',
  unspecified: 'Unspecified',
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  zh: 'Chinese', ar: 'Arabic', pt: 'Portuguese', it: 'Italian',
  ru: 'Russian', uk: 'Ukrainian', ko: 'Korean', ja: 'Japanese', fa: 'Farsi',
}

function classifyGroup(group: string): { section: 'Text (by language)' | 'Image (by quality)' | 'Video (by quality)' | 'Other'; label: string } {
  if (group.endsWith('_image')) return { section: 'Image (by quality)', label: group.replace(/_/g, ' ') }
  if (group.endsWith('_video')) return { section: 'Video (by quality)', label: group.replace(/_/g, ' ') }
  if (group in TEXT_GROUP_LABELS) return { section: 'Text (by language)', label: TEXT_GROUP_LABELS[group] }
  return { section: 'Other', label: group.replace(/_/g, ' ') }
}

// Mirrors backend/config.py's FAIRNESS_ALERT_RATIO (1.25) -- the API
// doesn't expose the threshold itself, only the computed ratio, so this
// is a display-only approximation of the same line the backend uses to
// decide whether to attach a fairness_banner to a live flag.
const FAIRNESS_ALERT_RATIO = 1.25

function fprColor(fpr: number, maxFpr: number): string {
  if (maxFpr === 0) return 'bg-emerald-500'
  const ratio = fpr / maxFpr
  if (ratio >= 0.8) return 'bg-red-500'
  if (ratio >= 0.5) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export default function AuditDataPage() {
  const [fairness, setFairness] = useState<FairnessResponse | null>(null)
  const [flags, setFlags] = useState<FlagItem[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [fairnessRes, flagsRes] = await Promise.all([
        fetch(`${API_URL}/v1/audit/fairness`, { headers: { 'X-AURA-Key': INSTITUTION_KEY } }),
        fetch(`${API_URL}/v1/flags`, { headers: { 'X-AURA-Key': INSTITUTION_KEY } }),
      ])
      if (!fairnessRes.ok) throw new Error(`Fairness fetch failed (${fairnessRes.status})`)
      if (!flagsRes.ok) throw new Error(`Flags fetch failed (${flagsRes.status})`)

      setFairness(await fairnessRes.json())
      setFlags(await flagsRes.json())
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Live-updates: re-fetch on a fixed interval so this reflects new
  // submissions landing (via record_outcome() in bias_audit.py) without
  // requiring a manual reload.
  useEffect(() => {
    setLoading(true)
    fetchAll()
    pollRef.current = setInterval(fetchAll, 4000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchAll])

  const sections: Record<string, GroupStat[]> = {}
  if (fairness) {
    for (const g of fairness.groups) {
      const { section } = classifyGroup(g.group)
      sections[section] = sections[section] || []
      sections[section].push(g)
    }
    for (const key of Object.keys(sections)) {
      sections[key].sort((a, b) => b.fpr - a.fpr)
    }
  }
  const maxFpr = fairness ? Math.max(0, ...fairness.groups.map(g => g.fpr)) : 0
  const isElevated = (fairness?.disparate_impact_ratio ?? 1) >= FAIRNESS_ALERT_RATIO
  const pendingFlags = flags.filter(f => f.status === 'pending')

  return (
    <main className="light-surface min-h-screen overflow-x-hidden">
      <div className="relative z-10 container max-w-6xl mx-auto px-6 py-16 space-y-10">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <Shield className="text-indigo-400" size={28} />
            <div>
              <p className="text-xs uppercase tracking-[3px] text-indigo-400/80 font-medium">Bias & Fairness</p>
              <h1 className="text-3xl font-bold text-white mt-0.5">Audit Data</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                Live — updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchAll}
              className="p-2 rounded-lg border border-white/10 bg-white/[0.02] text-slate-400 hover:text-white hover:border-white/20 transition-all cursor-pointer"
              title="Refresh now"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error} — is the backend running on {API_URL}?
          </div>
        )}

        {loading && !fairness ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading audit data...</div>
        ) : fairness && (
          <>
            {/* Disparate impact summary */}
            <div className={`rounded-2xl border p-6 flex items-center justify-between gap-4 ${
              isElevated ? 'border-red-500/30 bg-red-500/[0.04]' : 'border-emerald-500/30 bg-emerald-500/[0.04]'
            }`}>
              <div className="flex items-center gap-4">
                {isElevated ? <AlertTriangle className="text-red-400" size={32} /> : <CheckCircle2 className="text-emerald-400" size={32} />}
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-[2px]">Disparate Impact Ratio</p>
                  <p className={`text-3xl font-bold ${isElevated ? 'text-red-400' : 'text-emerald-400'}`}>
                    {fairness.disparate_impact_ratio.toFixed(2)}x
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-400 max-w-sm text-right">
                {isElevated
                  ? `Worst-performing group's false-positive rate is ${fairness.disparate_impact_ratio.toFixed(1)}x the best-performing group's — above the ${FAIRNESS_ALERT_RATIO}x alert line.`
                  : `Groups are within ${FAIRNESS_ALERT_RATIO}x of each other — no disparate-impact alert at this institution right now.`}
              </p>
            </div>

            {/* Per-group FPR breakdown, sectioned by modality */}
            {(['Text (by language)', 'Image (by quality)', 'Video (by quality)', 'Other'] as const).map(section =>
              sections[section]?.length ? (
                <div key={section} className="space-y-3">
                  <h2 className="text-sm uppercase tracking-[2px] text-slate-400">{section}</h2>
                  <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 space-y-4">
                    {sections[section].map(g => {
                      const { label } = classifyGroup(g.group)
                      return (
                        <div key={g.group}>
                          <div className="flex justify-between items-baseline text-xs mb-1">
                            <span className="text-slate-300">{label}</span>
                            <span className="text-slate-500">
                              FPR <span className="text-white font-medium">{(g.fpr * 100).toFixed(1)}%</span>
                              {' · '}n={g.sample_size}
                            </span>
                          </div>
                          <div className="w-full bg-white/5 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${fprColor(g.fpr, maxFpr)}`}
                              style={{ width: `${maxFpr > 0 ? (g.fpr / maxFpr) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null
            )}

            {/* Pending review queue -- also part of the audit picture, and
                also updates live via the same poll */}
            <div className="space-y-3">
              <h2 className="text-sm uppercase tracking-[2px] text-slate-400 flex items-center gap-2">
                <Flag size={14} /> Pending Review ({pendingFlags.length})
              </h2>
              {pendingFlags.length === 0 ? (
                <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 text-center text-slate-500 text-sm">
                  No submissions currently awaiting human review.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingFlags.map(f => (
                    <div key={f.flag_id} className="bg-white/[0.02] border border-white/10 rounded-xl p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-[1px] mb-1">
                          <span>{f.modality}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Clock size={10} /> pending</span>
                        </div>
                        <p className="text-sm text-white truncate">{f.student_ref}</p>
                        {f.fairness_banner && (
                          <p className="text-xs text-amber-400/90 mt-1">{f.fairness_banner}</p>
                        )}
                      </div>
                      <span className="text-sm font-bold text-red-400 flex-shrink-0">
                        {Math.round(f.overall_score * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

"use client"

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import UtilityNav from '@/components/utility-nav'
import { getFairness, setApiKey, type FairnessResponse } from '@/lib/api'

const DEMO_INSTITUTIONS = [
  { key: 'demo-key-college-a', label: 'College A' },
  { key: 'demo-key-college-b', label: 'College B' },
]

// Matches config.py's FAIRNESS_ALERT_RATIO -- the disparate-impact ratio
// (worst-group FPR / best-group FPR) at/above which the backend attaches a
// fairness banner to flagged submissions. Mirrored here purely for display
// styling; the backend is the source of truth for whether a banner actually
// gets attached.
const FAIRNESS_ALERT_RATIO = 1.25

export default function AuditPage() {
  const [institutionKey, setInstitutionKey] = useState(DEMO_INSTITUTIONS[0].key)
  const [data, setData] = useState<FairnessResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getFairness()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fairness audit')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setApiKey(institutionKey)
    load()
  }, [institutionKey, load])

  const alertActive = (data?.disparate_impact_ratio ?? 0) >= FAIRNESS_ALERT_RATIO
  const maxFpr = data ? Math.max(...data.groups.map((g) => g.fpr), 0.0001) : 1

  return (
    <main className="min-h-screen bg-black text-white px-6 py-32">
      <UtilityNav />

      <div className="max-w-4xl mx-auto space-y-10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm font-light tracking-[3px] uppercase text-white/50">Per-Institution Bias Audit</p>
            <h1 className="text-4xl font-light tracking-[6px] uppercase">Fairness Audit</h1>
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

        {loading && <p className="text-white/50 text-sm">Loading fairness stats...</p>}

        {data && (
          <>
            <div
              className={`glass-card rounded-3xl p-8 text-center space-y-2 border ${
                alertActive ? 'border-yellow-500/40' : 'border-emerald-500/30'
              }`}
            >
              <p className="text-xs tracking-[2px] uppercase text-white/40">Disparate Impact Ratio</p>
              <p className={`text-5xl font-light ${alertActive ? 'text-yellow-400' : 'text-emerald-400'}`}>
                {data.disparate_impact_ratio.toFixed(2)}&times;
              </p>
              <p className="text-xs text-white/40">worst-group FPR &divide; best-group FPR</p>

              <div className="flex items-center justify-center gap-2 pt-3">
                {alertActive ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs text-yellow-300">
                      At or above the {FAIRNESS_ALERT_RATIO}&times; alert threshold -- flagged submissions
                      from this institution now carry a fairness banner for reviewers.
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-emerald-300">Below the {FAIRNESS_ALERT_RATIO}&times; alert threshold.</span>
                  </>
                )}
              </div>
            </div>

            <div className="glass-card rounded-3xl p-8 space-y-5">
              <h2 className="text-xs tracking-[2px] uppercase text-white/40">Per-Group Breakdown</h2>
              <div className="space-y-4">
                {data.groups.map((g) => (
                  <div key={g.group} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/80 capitalize">{g.group.replace(/_/g, ' ')}</span>
                      <span className="text-white/50 text-xs">
                        FPR {(g.fpr * 100).toFixed(1)}% &middot; FNR {(g.fnr * 100).toFixed(1)}% &middot; n={g.sample_size}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${g.fpr / maxFpr >= 0.99 && alertActive ? 'bg-yellow-400/70' : 'bg-cyan-400/60'}`}
                        style={{ width: `${Math.max((g.fpr / maxFpr) * 100, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-3xl p-6">
              <p className="text-xs text-white/50 leading-relaxed">
                FPR (false-positive rate) is the share of this group's genuinely human submissions that AURA
                still scored above the flag threshold. A gap between groups here is exactly what the fairness
                banner and this dashboard exist to surface -- catching it doesn't mean the model is
                unusable, it means this institution should review threshold calibration for the affected group.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

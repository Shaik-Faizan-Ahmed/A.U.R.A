"use client"

import { Download, RotateCcw, AlertTriangle } from 'lucide-react'
import type { SubmissionResult, Signal, Modality } from '@/lib/api'

interface AuraResultsProps {
  results: SubmissionResult
  onReset: () => void
}

function verdictLabel(score: number) {
  if (score >= 0.6) return { label: 'Likely AI-Generated', color: 'text-red-400', border: 'border-red-500/40' }
  if (score >= 0.4) return { label: 'Borderline / Inconclusive', color: 'text-yellow-400', border: 'border-yellow-500/40' }
  return { label: 'Likely Human / Authentic', color: 'text-emerald-400', border: 'border-emerald-500/40' }
}

function evidenceLabel(ref?: Signal['evidence_ref']) {
  if (!ref) return null
  if (ref.start !== undefined && ref.start !== null) return `characters ${ref.start}\u2013${ref.end}`
  if (ref.bbox) return `region [${ref.bbox.join(', ')}]`
  if (ref.frame_range) return `frames ${ref.frame_range[0]}\u2013${ref.frame_range[1]}`
  if (ref.timestamp !== undefined && ref.timestamp !== null) return `${ref.timestamp}s`
  return null
}

function modalityLabel(modality?: Modality) {
  if (modality === 'text') return 'Text Submission'
  if (modality === 'image') return 'Image Submission'
  if (modality === 'video') return 'Video Submission'
  return 'Submission'
}

export default function AuraResults({ results, onReset }: AuraResultsProps) {
  const score = results.overall_score ?? 0
  const confidence = results.confidence ?? 0
  const verdict = verdictLabel(score)
  const signals = results.signals || []

  const handleDownload = () => {
    const dataStr = JSON.stringify(results, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `aura-result-${results.job_id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section id="results-section" className="relative py-20 px-6 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-20" />

      <div className="relative max-w-5xl mx-auto space-y-10 z-10">
        <div className="text-center space-y-4 animate-fade-in-up">
          <p className="text-sm font-light tracking-[3px] uppercase text-white/50">
            {modalityLabel(results.modality)} &middot; Job {results.job_id.slice(0, 8)}
          </p>
          <h2 className="text-5xl md:text-6xl font-light tracking-[8px] text-white uppercase">
            RESULTS
          </h2>
        </div>

        {/* Score + confidence + verdict */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card rounded-3xl p-8 text-center space-y-2">
            <p className="text-xs tracking-[2px] uppercase text-white/40">Overall Score</p>
            <p className="text-4xl font-light text-white">{(score * 100).toFixed(0)}%</p>
          </div>
          <div className="glass-card rounded-3xl p-8 text-center space-y-2">
            <p className="text-xs tracking-[2px] uppercase text-white/40">Confidence</p>
            <p className="text-4xl font-light text-white">{(confidence * 100).toFixed(0)}%</p>
          </div>
          <div className={`glass-card rounded-3xl p-8 text-center space-y-2 border ${verdict.border}`}>
            <p className="text-xs tracking-[2px] uppercase text-white/40">Verdict</p>
            <p className={`text-lg font-light tracking-wide ${verdict.color}`}>{verdict.label}</p>
          </div>
        </div>

        {/* Fairness banner -- shown prominently, before the evidence, same as
            the reviewer sees it in the review queue */}
        {results.fairness_banner && (
          <div className="glass-card border-yellow-500/40 bg-yellow-500/5 rounded-2xl p-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-200/90 leading-relaxed">{results.fairness_banner}</p>
          </div>
        )}

        {/* Reasoning -- plain-language explanation, not just the score */}
        <div className="glass-card rounded-3xl p-8 space-y-3">
          <h3 className="text-sm font-light tracking-[3px] uppercase text-white/60">Reasoning</h3>
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">
            {results.explanation || 'No explanation available.'}
          </p>
        </div>

        {/* Evidence signals -- the underlying detector outputs, each with its
            evidence reference so a reviewer can go check it against the
            original submission */}
        {signals.length > 0 && (
          <div className="glass-card rounded-3xl p-8 space-y-4">
            <h3 className="text-sm font-light tracking-[3px] uppercase text-white/60">Contributing Signals</h3>
            <div className="space-y-3">
              {signals.map((s, i) => {
                const ev = evidenceLabel(s.evidence_ref)
                return (
                  <div key={i} className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 last:border-none last:pb-0">
                    <div>
                      <p className="text-sm text-white/90 capitalize">{s.signal_name.replace(/_/g, ' ')}</p>
                      {ev && <p className="text-[11px] text-white/40 tracking-wide">Evidence at {ev}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-white/70">{(s.raw_score * 100).toFixed(0)}%</p>
                      <p className="text-[10px] text-white/30 uppercase tracking-wide">conf {(s.confidence * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="glass-card rounded-3xl p-8">
          <p className="text-sm text-white/60 leading-relaxed">
            This assessment is evidence for human review, not an automated decision. If flagged, this
            submission goes to the review queue where a human reviewer sees this same evidence, reasoning,
            and fairness context before any action is taken.
          </p>
        </div>

        <div className="flex items-center justify-center gap-6 pt-4">
          <button
            onClick={onReset}
            className="group relative px-10 py-4 glass-card border-white/20 overflow-hidden transition-all duration-300 hover:bg-white/[0.12] hover:border-white/35 hover:-translate-y-0.5"
          >
            <span className="relative z-10 flex items-center gap-3 text-white tracking-[1px] uppercase text-sm">
              <RotateCcw className="w-4 h-4" />
              New Submission
            </span>
          </button>

          <button
            onClick={handleDownload}
            className="group relative px-10 py-4 glass-card border-neon-blue overflow-hidden transition-all duration-300 hover:bg-cyan-500/10 hover:-translate-y-0.5"
          >
            <span className="relative z-10 flex items-center gap-3 text-neon-blue tracking-[1px] uppercase text-sm">
              <Download className="w-4 h-4" />
              Download JSON
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}

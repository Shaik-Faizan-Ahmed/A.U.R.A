"use client"

interface FullReportProps {
  report: string
}

export default function FullReport({ report }: FullReportProps) {
  if (!report) return null

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-light tracking-[4px] uppercase text-white">Full Report</h2>
        <p className="text-white/50 mt-2 tracking-wide">Complete technical findings</p>
      </div>

      <div className="glass-card border-white/10 rounded-2xl p-8">
        <div className="prose prose-sm max-w-none">
          <div className="whitespace-pre-wrap text-white/70 leading-relaxed font-light">
            {report}
          </div>
        </div>
      </div>

      <div className="glass-card border-cyan-500/30 bg-cyan-500/10 rounded-2xl p-8">
        <p className="text-sm text-cyan-100 leading-relaxed font-light">
          <strong className="text-cyan-400 font-normal">Disclaimer:</strong> This assessment is probabilistic and should not be considered 
          definitive proof of authenticity or manipulation. Results should be interpreted by trained 
          professionals alongside contextual analysis, source verification, and chain of custody validation.
        </p>
      </div>
    </div>
  )
}

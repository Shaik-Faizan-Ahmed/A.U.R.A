"use client"

import { useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import UploadSection from '@/components/upload/upload-section'
import ProcessingSection from '@/components/upload/processing-section'
import AuraResults from '@/components/upload/aura-results'
import UtilityNav from '@/components/utility-nav'
import { uploadFile, createSubmission, pollSubmission, setApiKey, type SubmissionResult, type Modality } from '@/lib/api'

// Dynamic imports for background effects
const AnoAI = dynamic(() => import("@/components/ui/animated-shader-background"), { 
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-0 bg-gradient-to-br from-slate-900/50 to-transparent" />
  )
})

const SnowParticles = dynamic(
  () => import("@/components/ui/snow-particles").then(mod => ({ default: mod.SnowParticles })),
  { ssr: false }
)

type AnalysisState = 'idle' | 'uploading' | 'processing' | 'complete' | 'error'
type AnalysisMode = 'quick' | 'deep'

// Demo-only stand-in for a real student login/roster lookup -- AURA's
// contract needs a student_ref per submission, there's no auth/identity
// system in this reference console.
const DEMO_STUDENT_REF = 'demo-student-01'

// Matches config.py's INSTITUTIONS lookup table on the backend -- these are
// the two demo institutions seeded with different baseline fairness stats
// in bias_audit.py, so switching here is what lets the same essay/file show
// different fairness numbers depending on which institution submitted it.
const DEMO_INSTITUTIONS = [
  { key: 'demo-key-college-a', label: 'College A' },
  { key: 'demo-key-college-b', label: 'College B' },
]

export default function UploadPage() {
  const [state, setState] = useState<AnalysisState>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [fileType, setFileType] = useState<Modality | null>(null)
  const [text, setText] = useState<string>('')
  const [results, setResults] = useState<SubmissionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [currentStage, setCurrentStage] = useState<string>('')
  const [institutionKey, setInstitutionKey] = useState<string>(DEMO_INSTITUTIONS[0].key)
  const resultsRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<{ cancel: () => void } | null>(null)

  const handleInstitutionChange = (key: string) => {
    setInstitutionKey(key)
    setApiKey(key)
  }

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile)
    setError(null)
    const type = selectedFile.type.startsWith('image/') ? 'image' : 'video'
    setFileType(type)
  }

  const scrollToResults = () => {
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 300)
  }

  const runSubmission = async (modality: Modality, content_ref: string) => {
    try {
      setState('processing')
      setCurrentStage('Queued for analysis...')
      setUploadProgress(30)

      const created = await createSubmission({
        student_ref: DEMO_STUDENT_REF,
        modality,
        content_ref,
      })

      setCurrentStage(`Analyzing (${modality})...`)
      setUploadProgress(50)

      pollRef.current = pollSubmission(created.job_id, (result) => {
        if (result.status === 'complete') {
          setUploadProgress(100)
          setCurrentStage('Analysis Complete!')
          setResults(result)
          setState('complete')
          scrollToResults()
        } else if (result.status === 'error') {
          setState('error')
          setError(result.explanation || 'Analysis failed')
        } else {
          // still queued/processing -- nudge the bar forward so it doesn't
          // look stuck while the background job runs
          setUploadProgress((p) => Math.min(p + 5, 90))
        }
      })
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Submission failed')
    }
  }

  // Called for image/video (the file-based path). `mode` (quick/deep) is
  // preserved from the original UI but AURA's video pipeline doesn't
  // distinguish them server-side -- both map to the same modality submission.
  const handleAnalyze = async (_mode: AnalysisMode) => {
    if (!file || !fileType) return

    setState('uploading')
    setError(null)
    setUploadProgress(10)
    setCurrentStage('Uploading file...')

    try {
      const uploaded = await uploadFile(file)
      await runSubmission(fileType, uploaded.content_ref)
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  // Called for text -- no upload step, content_ref is the raw text itself.
  const handleAnalyzeText = async () => {
    if (!text.trim()) return
    setError(null)
    await runSubmission('text', text)
  }

  const resetAll = () => {
    pollRef.current?.cancel()
    setState('idle')
    setFile(null)
    setFileType(null)
    setText('')
    setResults(null)
    setError(null)
    setUploadProgress(0)
    setCurrentStage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="min-h-screen bg-black text-white selection:bg-cyan-500/30 overflow-x-hidden font-sans">
      <UtilityNav />

      {/* Global background effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <AnoAI className="opacity-90" />
        <SnowParticles quantity={80} />
      </div>

      {/* Noise texture overlay */}
      <div 
        className="fixed inset-0 pointer-events-none z-[9999] opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Upload Section - Always visible in idle state (image/video + text) */}
        {state === 'idle' && (
          <UploadSection
            file={file}
            onFileSelect={handleFileSelect}
            onAnalyze={handleAnalyze}
            disabled={state !== 'idle'}
            error={error}
            text={text}
            onTextChange={setText}
            onAnalyzeText={handleAnalyzeText}
          />
        )}

        {/* Processing Section - Shows during upload/processing (file or text) */}
        {(state === 'uploading' || state === 'processing' || state === 'complete') && (
          <ProcessingSection 
            file={file}
            progress={currentStage}
            uploadProgress={uploadProgress}
            currentStage={currentStage}
            onCancel={resetAll}
          />
        )}

        {/* Results Section - AURA's actual output: score, confidence,
            reasoning, evidence-referenced signals, fairness banner */}
        {state === 'complete' && results && (
          <div ref={resultsRef}>
            <AuraResults results={results} onReset={resetAll} />
          </div>
        )}

        {state === 'error' && error && (
          <div className="min-h-screen flex items-center justify-center px-6">
            <div className="glass-card border-red-500/30 bg-red-500/10 rounded-2xl p-8 max-w-md text-center space-y-4">
              <p className="text-red-400 text-sm">{error}</p>
              <button
                onClick={resetAll}
                className="px-6 py-3 glass-card border-white/20 text-white/80 text-sm tracking-wider uppercase hover:bg-white/10 transition-all duration-300"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

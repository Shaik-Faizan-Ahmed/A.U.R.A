import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getSubmission } from '../api.js'

export default function JobStatus() {
  const { jobId } = useParams()
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    let timer

    async function poll() {
      try {
        const data = await getSubmission(jobId)
        if (cancelled) return
        setJob(data)
        if (data.status !== 'complete') {
          timer = setTimeout(poll, 1500)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [jobId])

  if (error) return <p style={{ color: 'red' }}>{error}</p>
  if (!job) return <p>Loading...</p>

  return (
    <div>
      <h2>Job {jobId}</h2>
      <p>Status: {job.status}</p>

      {job.status === 'complete' && (
        <div>
          <p><strong>Overall score:</strong> {job.overall_score}</p>
          <p><strong>Confidence:</strong> {job.confidence}</p>
          {job.fairness_banner && (
            <p style={{ background: '#fff3cd', padding: 8 }}>{job.fairness_banner}</p>
          )}
          <h3>Explanation</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{job.explanation}</pre>

          <h3>Signals</h3>
          <ul>
            {(job.signals || []).map((s, i) => (
              <li key={i}>
                {s.signal_name}: {s.raw_score} (confidence {s.confidence})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

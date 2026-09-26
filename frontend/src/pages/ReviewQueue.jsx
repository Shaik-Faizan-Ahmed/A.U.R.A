import { useEffect, useState } from 'react'
import { getFlags, decideFlag } from '../api.js'

export default function ReviewQueue() {
  const [flags, setFlags] = useState([])
  const [error, setError] = useState(null)

  async function load() {
    try {
      setFlags(await getFlags())
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDecision(flagId, decision) {
    try {
      await decideFlag(flagId, decision, 'demo-reviewer')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h2>Review Queue</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {flags.length === 0 && <p>No flagged submissions.</p>}

      {flags.map((flag) => (
        <div key={flag.flag_id} style={{ border: '1px solid #ccc', padding: 12, marginBottom: 12 }}>
          <p><strong>Student:</strong> {flag.student_ref} ({flag.modality})</p>
          <p><strong>Score:</strong> {flag.overall_score}</p>
          <p><strong>Status:</strong> {flag.status}</p>
          {flag.fairness_banner && (
            <p style={{ background: '#fff3cd', padding: 8 }}>{flag.fairness_banner}</p>
          )}
          <pre style={{ whiteSpace: 'pre-wrap' }}>{flag.explanation}</pre>

          {flag.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleDecision(flag.flag_id, 'uphold')}>Uphold flag</button>
              <button onClick={() => handleDecision(flag.flag_id, 'dismiss')}>Dismiss (false positive)</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

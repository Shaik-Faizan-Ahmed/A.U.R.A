import { useEffect, useState } from 'react'
import { getFairness } from '../api.js'

export default function FairnessDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getFairness().then(setData).catch((err) => setError(err.message))
  }, [])

  if (error) return <p style={{ color: 'red' }}>{error}</p>
  if (!data) return <p>Loading...</p>

  const maxFpr = Math.max(...data.groups.map((g) => g.fpr), 0.01)

  return (
    <div>
      <h2>Fairness Dashboard — {data.institution_id}</h2>
      <p><strong>Disparate impact ratio:</strong> {data.disparate_impact_ratio}x</p>

      {/* Bare-bones bar chart via divs — design team can replace with a real chart lib */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.groups.map((g) => (
          <div key={g.group}>
            <span>{g.group} — FPR {g.fpr} (n={g.sample_size})</span>
            <div style={{ background: '#eee', height: 16, width: 300 }}>
              <div
                style={{
                  background: '#c0392b',
                  height: '100%',
                  width: `${(g.fpr / maxFpr) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

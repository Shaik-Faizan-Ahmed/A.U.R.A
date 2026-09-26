import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSubmission } from '../api.js'

export default function Submit() {
  const navigate = useNavigate()
  const [studentRef, setStudentRef] = useState('')
  const [modality, setModality] = useState('text')
  const [contentRef, setContentRef] = useState('')
  const [demographicGroup, setDemographicGroup] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { job_id } = await createSubmission({
        student_ref: studentRef,
        modality,
        content_ref: contentRef,
        demographic_group: demographicGroup || undefined,
      })
      navigate(`/jobs/${job_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>Submit for Analysis</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
        <label>
          Student reference
          <input value={studentRef} onChange={(e) => setStudentRef(e.target.value)} required />
        </label>

        <label>
          Modality
          <select value={modality} onChange={(e) => setModality(e.target.value)}>
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </label>

        <label>
          Content (text body, or a file path/URL for image/video)
          <textarea value={contentRef} onChange={(e) => setContentRef(e.target.value)} rows={6} required />
        </label>

        <label>
          Demographic / proxy group (optional, demo only)
          <input
            value={demographicGroup}
            onChange={(e) => setDemographicGroup(e.target.value)}
            placeholder="e.g. esl, native_english, low_bandwidth_video"
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Submitting...' : 'Submit'}
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
    </div>
  )
}

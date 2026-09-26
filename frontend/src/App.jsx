import { Routes, Route, Link } from 'react-router-dom'
import Submit from './pages/Submit.jsx'
import JobStatus from './pages/JobStatus.jsx'
import ReviewQueue from './pages/ReviewQueue.jsx'
import FairnessDashboard from './pages/FairnessDashboard.jsx'

// Intentionally unstyled beyond basic layout — design pass happens on top of
// this structure, not instead of it. Don't remove data-testid-style hooks
// (ids/classes) without checking with the design team first.
export default function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <h1>A.U.R.A Console</h1>
      <nav style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <Link to="/">Submit</Link>
        <Link to="/review">Review Queue</Link>
        <Link to="/fairness">Fairness Dashboard</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Submit />} />
        <Route path="/jobs/:jobId" element={<JobStatus />} />
        <Route path="/review" element={<ReviewQueue />} />
        <Route path="/fairness" element={<FairnessDashboard />} />
      </Routes>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import '../styles/auth.css'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setStatus('error')
      setMessage('No verification token provided.')
      return
    }
    api.post<{ message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`, {})
      .then(res => {
        setStatus('success')
        setMessage(res.message)
      })
      .catch(err => {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Verification failed. The link may have expired.')
      })
  }, [params])

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Email Verification</h1>
        {status === 'loading' && <p className="auth-hint">Verifying your email…</p>}
        {status === 'success' && (
          <>
            <p style={{ color: 'var(--income)', fontWeight: 500 }}>✓ {message}</p>
            <Link to="/dashboard" className="btn-primary" style={{ display: 'block', textAlign: 'center', marginTop: '1rem' }}>
              Go to Dashboard
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <p style={{ color: 'var(--expense)', fontWeight: 500 }}>✗ {message}</p>
            <Link to="/dashboard" style={{ display: 'block', textAlign: 'center', marginTop: '1rem', color: 'var(--accent)' }}>
              Return to app
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

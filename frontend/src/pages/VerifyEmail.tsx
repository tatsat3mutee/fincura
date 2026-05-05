import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import '../styles/auth.css'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  // Resend state — pre-fill email if coming from the register check-inbox page
  const [resendEmail, setResendEmail] = useState(() => params.get('email') ?? '')
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    // Coming from register check-inbox page — skip verification, show resend form
    if (params.get('resend') === '1') {
      setStatus('error')
      setMessage('Enter your email below to get a new verification link.')
      return
    }
    const token = params.get('token')
    if (!token) {
      setStatus('error')
      setMessage('No verification token found in this link.')
      return
    }
    api.post<{ message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`, {})
      .then(res => {
        setStatus('success')
        setMessage(res.message)
      })
      .catch(err => {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'This link is invalid or has expired.')
      })
  }, [params])

  async function handleResend(e: FormEvent) {
    e.preventDefault()
    setResendError('')
    setResendStatus('sending')
    try {
      await api.post('/auth/resend-verification-public', { email: resendEmail })
      setResendStatus('sent')
    } catch {
      setResendError('Something went wrong. Please try again.')
      setResendStatus('idle')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Email Verification</h1>

        {status === 'loading' && (
          <p className="auth-hint" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            Verifying your email…
          </p>
        )}

        {status === 'success' && (
          <>
            <p style={{ color: 'var(--income)', fontWeight: 500, textAlign: 'center', margin: '0.75rem 0 1.25rem' }}>
              ✓ {message}
            </p>
            <Link to="/dashboard" className="btn-primary btn-full">
              Go to Dashboard
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <p style={{ color: 'var(--expense)', fontWeight: 500, textAlign: 'center', margin: '0.75rem 0 1.5rem' }}>
              ✗ {message}
            </p>

            {resendStatus === 'sent' ? (
              <p style={{ color: 'var(--income)', fontSize: '0.9rem', textAlign: 'center' }}>
                ✓ If that email has an unverified account, a new link is on its way.
              </p>
            ) : (
              <>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginBottom: '1rem', textAlign: 'center' }}>
                  Enter your email to get a fresh verification link.
                </p>
                <form onSubmit={handleResend} className="auth-form">
                  <label>
                    <span>Email address</span>
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={e => setResendEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoFocus
                    />
                  </label>
                  {resendError && <p className="auth-error">{resendError}</p>}
                  <button type="submit" disabled={resendStatus === 'sending'} className="auth-btn">
                    {resendStatus === 'sending' ? 'Sending…' : 'Resend verification email'}
                  </button>
                </form>
              </>
            )}

            <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.85rem' }}>
              <Link to="/dashboard" style={{ color: 'var(--color-muted)', textDecoration: 'underline' }}>
                Skip for now
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

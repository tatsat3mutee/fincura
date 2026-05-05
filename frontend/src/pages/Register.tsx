import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import '../styles/auth.css'

interface RegisterResponse {
  access_token: string
  user: { id: number; name: string; email: string; currency: string; created_at: string; email_verified: boolean }
}

export default function Register() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post<RegisterResponse>('/auth/register', { name, email, password })
      login(res.access_token, res.user)
      setRegistered(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const GOOGLE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/auth/google`

  if (registered) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div style={{ textAlign: 'center', marginBottom: '1.25rem', fontSize: '2.5rem' }}>📬</div>
          <h1 className="auth-title" style={{ marginBottom: '0.5rem' }}>Check your inbox</h1>
          <p className="auth-heading" style={{ marginBottom: '1.5rem' }}>
            We sent a verification link to<br />
            <strong style={{ color: 'var(--color-text)' }}>{email}</strong>
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', textAlign: 'center', marginBottom: '1.75rem', lineHeight: 1.6 }}>
            Click the link in the email to verify your account. The link expires in 24 hours.
            You can still use Fincura while unverified.
          </p>
          <button
            className="btn-primary btn-full"
            onClick={() => navigate('/dashboard')}
          >
            Go to Dashboard
          </button>
          <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
            Didn't get it?{' '}
            <Link to={`/verify-email?resend=1&email=${encodeURIComponent(email)}`} style={{ color: 'var(--color-primary)' }}>
              Resend email
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Fincura</h1>
        <h2 className="auth-heading">Create account</h2>

        <a href={GOOGLE_URL} className="google-btn">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </a>

        <div className="auth-divider"><span>or</span></div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            <span>Name</span>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </label>
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </label>
          <label>
            <span>Password <span className="auth-hint">(min. 8 characters)</span></span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  )
}

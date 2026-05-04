import { useEffect, useState, type FormEvent } from 'react'
import { api, getAccessToken } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { User, UserStats } from '../types'
import { formatCurrency } from '../types'
import '../styles/profile.css'

export default function Profile() {
  const { user, login } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [currency, setCurrency] = useState(user?.currency ?? 'INR')
  const [profileErr, setProfileErr] = useState('')
  const [profileOk, setProfileOk] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdErr, setPwdErr] = useState('')
  const [pwdOk, setPwdOk] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [verifyMsg, setVerifyMsg] = useState('')
  const [resending, setResending] = useState(false)

  useEffect(() => {
    api.get<UserStats>('/profile/stats').then(setStats).catch(() => {})
  }, [])

  async function handleProfile(e: FormEvent) {
    e.preventDefault()
    setProfileErr(''); setProfileOk(false)
    setSavingProfile(true)
    try {
      const updated = await api.put<User>('/profile', { name, currency })
      login(getAccessToken() ?? '', updated)
      setProfileOk(true)
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault()
    setPwdErr(''); setPwdOk(false)
    if (newPwd !== confirmPwd) { setPwdErr('Passwords do not match'); return }
    setSavingPwd(true)
    try {
      await api.put('/profile/password', { old_password: oldPwd, new_password: newPwd })
      setPwdOk(true)
      setOldPwd(''); setNewPwd(''); setConfirmPwd('')
    } catch (err) {
      setPwdErr(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setSavingPwd(false)
    }
  }

  async function handleResendVerification() {
    setResending(true); setVerifyMsg('')
    try {
      const res = await api.post<{ message: string }>('/auth/resend-verification', {})
      setVerifyMsg(res.message)
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="profile-page">
      <h1 className="page-title">Profile</h1>

      {user && !user.email_verified && (
        <div className="profile-verify-banner">
          <span>⚠ Your email is not verified.</span>
          <button className="btn-secondary" onClick={handleResendVerification} disabled={resending} style={{ marginLeft: '1rem', padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}>
            {resending ? 'Sending…' : 'Resend verification email'}
          </button>
          {verifyMsg && <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--income)' }}>{verifyMsg}</span>}
        </div>
      )}

      {stats && (
        <div className="profile-stats">
          <div className="profile-stat-card">
            <span className="profile-stat-val">{stats.total_txns}</span>
            <span className="profile-stat-label">Transactions</span>
          </div>
          <div className="profile-stat-card">
            <span className="profile-stat-val">{formatCurrency(stats.total_earned, currency)}</span>
            <span className="profile-stat-label">Total earned</span>
          </div>
          <div className="profile-stat-card">
            <span className="profile-stat-val">{formatCurrency(stats.total_spent, currency)}</span>
            <span className="profile-stat-label">Total spent</span>
          </div>
        </div>
      )}

      <div className="profile-section">
        <h2 className="profile-section-title">Account details</h2>
        <p className="profile-since">Member since {user?.created_at?.slice(0, 10)}</p>
        <form onSubmit={handleProfile} className="profile-form">
          <label className="form-label">
            Display name
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="form-input" required />
          </label>
          <label className="form-label">
            Currency
            <select value={currency} onChange={e => setCurrency(e.target.value)} className="form-input">
              <option value="INR">₹ Indian Rupee (INR)</option>
              <option value="USD">$ US Dollar (USD)</option>
              <option value="EUR">€ Euro (EUR)</option>
              <option value="GBP">£ British Pound (GBP)</option>
              <option value="JPY">¥ Japanese Yen (JPY)</option>
            </select>
          </label>
          {profileErr && <p className="form-error">{profileErr}</p>}
          {profileOk && <p className="profile-success">Changes saved!</p>}
          <button type="submit" disabled={savingProfile} className="btn-primary">
            {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      <div className="profile-section">
        <h2 className="profile-section-title">Change password</h2>
        <p className="profile-section-desc">Leave blank if you signed in with Google.</p>
        <form onSubmit={handlePassword} className="profile-form">
          <label className="form-label">
            Current password
            <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} className="form-input" required />
          </label>
          <label className="form-label">
            New password
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} className="form-input" required minLength={8} />
          </label>
          <label className="form-label">
            Confirm new password
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} className="form-input" required />
          </label>
          {pwdErr && <p className="form-error">{pwdErr}</p>}
          {pwdOk && <p className="profile-success">Password changed successfully!</p>}
          <button type="submit" disabled={savingPwd} className="btn-primary">
            {savingPwd ? 'Changing…' : 'Change password'}
          </button>
        </form>
      </div>

      <div className="profile-section">
        <h2 className="profile-section-title">Export your data</h2>
        <p className="profile-section-desc">Download all your transactions, budgets and goals as a JSON file.</p>
        <button
          className="btn-secondary"
          onClick={async () => {
            try {
              const BASE = import.meta.env.VITE_API_URL ?? ''
              const res = await fetch(`${BASE}/api/export/json`, {
                headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
                credentials: 'include',
              })
              if (!res.ok) return
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = 'fincura-export.json'; a.click()
              URL.revokeObjectURL(url)
            } catch { /* best-effort */ }
          }}
        >
          ↓ Export all data (JSON)
        </button>
      </div>
    </div>
  )
}

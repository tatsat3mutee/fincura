import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Household } from '../types'
import '../styles/household.css'

export default function HouseholdPage() {
  const [household, setHousehold] = useState<Household | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle')
  const [houseName, setHouseName] = useState('')
  const [inviteInput, setInviteInput] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  function load() {
    setLoading(true)
    api.get<Household>('/household/me')
      .then(setHousehold)
      .catch(() => setHousehold(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const h = await api.post<Household>('/household', { name: houseName })
      setHousehold(h)
      setMode('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const h = await api.post<Household>('/household/join', { invite_code: inviteInput.trim().toUpperCase() })
      setHousehold(h)
      setMode('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid invite code')
    } finally {
      setSaving(false)
    }
  }

  async function handleLeave() {
    if (!confirm('Leave this household? You will lose access to shared data.')) return
    try {
      await api.del('/household/leave')
      setHousehold(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Cannot leave household')
    }
  }

  function copyCode() {
    if (!household) return
    navigator.clipboard.writeText(household.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="household-page"><p className="empty-state">Loading…</p></div>

  if (!household) {
    return (
      <div className="household-page">
        <h1 className="page-title">Household</h1>
        <p className="household-intro">Track finances together with your partner or family.</p>

        {mode === 'idle' && (
          <div className="household-options">
            <div className="household-option-card" onClick={() => { setMode('create'); setError('') }}>
              <span className="household-option-icon">⌂</span>
              <span className="household-option-title">Create household</span>
              <span className="household-option-desc">Start a new shared household</span>
            </div>
            <div className="household-option-card" onClick={() => { setMode('join'); setError('') }}>
              <span className="household-option-icon">⇢</span>
              <span className="household-option-title">Join household</span>
              <span className="household-option-desc">Enter an invite code to join</span>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="household-form">
            <h2 className="household-form-title">Create household</h2>
            <label className="form-label">
              Household name
              <input type="text" value={houseName} onChange={e => setHouseName(e.target.value)} className="form-input" required autoFocus placeholder="e.g. The Patel Family" />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="household-form-actions">
              <button type="button" className="btn-secondary" onClick={() => setMode('idle')}>Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating…' : 'Create'}</button>
            </div>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoin} className="household-form">
            <h2 className="household-form-title">Join household</h2>
            <label className="form-label">
              Invite code
              <input type="text" value={inviteInput} onChange={e => setInviteInput(e.target.value)} className="form-input" required autoFocus placeholder="e.g. ABC12345" maxLength={8} style={{ textTransform: 'uppercase' }} />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="household-form-actions">
              <button type="button" className="btn-secondary" onClick={() => setMode('idle')}>Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Joining…' : 'Join'}</button>
            </div>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="household-page">
      <div className="household-header">
        <h1 className="page-title">{household.name}</h1>
        <span className={`household-role-badge household-role-badge--${household.role}`}>{household.role}</span>
      </div>

      <div className="household-invite-card">
        <div>
          <p className="household-invite-label">Invite code</p>
          <p className="household-invite-code">{household.invite_code}</p>
          <p className="household-invite-hint">Share this code to let others join</p>
        </div>
        <button className="btn-primary" onClick={copyCode}>{copied ? '✓ Copied' : 'Copy'}</button>
      </div>

      <div className="household-members-section">
        <h2 className="section-title">Members ({household.members.length})</h2>
        <div className="txn-list">
          {household.members.map(m => (
            <div key={m.id} className="household-member-row">
              <div className="sidebar-avatar household-member-avatar">{m.name[0].toUpperCase()}</div>
              <div className="household-member-info">
                <span className="household-member-name">{m.name}</span>
                <span className="household-member-email">{m.email}</span>
              </div>
              <span className={`household-role-badge household-role-badge--${m.role}`}>{m.role}</span>
            </div>
          ))}
        </div>
      </div>

      <button className="household-leave-btn" onClick={handleLeave}>Leave household</button>
    </div>
  )
}

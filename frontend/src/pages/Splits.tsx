import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Split, SplitMember } from '../types'
import '../styles/splits.css'

interface MemberDraft {
  name: string
  share_amount: string
}

export default function Splits() {
  const [splits, setSplits] = useState<Split[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [title, setTitle] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [members, setMembers] = useState<MemberDraft[]>([
    { name: '', share_amount: '' },
    { name: '', share_amount: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function load() {
    setLoading(true)
    api.get<Split[]>('/splits')
      .then(setSplits)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const totalAssigned = members.reduce((s, m) => s + (parseFloat(m.share_amount) || 0), 0)
  const total = parseFloat(totalAmount) || 0
  const myShare = total > 0 ? Math.max(0, total - totalAssigned) : 0

  function updateMember(idx: number, field: keyof MemberDraft, val: string) {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, [field]: val } : m))
  }
  function addMember() {
    setMembers(prev => [...prev, { name: '', share_amount: '' }])
  }
  function removeMember(idx: number) {
    setMembers(prev => prev.filter((_, i) => i !== idx))
  }

  // Auto-split evenly
  function splitEvenly() {
    if (!total || members.length === 0) return
    const share = Math.round((total / (members.length + 1)) * 100) / 100
    setMembers(prev => prev.map(m => ({ ...m, share_amount: String(share) })))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const validMembers = members.filter(m => m.name.trim() && parseFloat(m.share_amount) > 0)
    if (!validMembers.length) { setFormError('Add at least one person with a valid share'); return }
    if (!total) { setFormError('Enter the total bill amount'); return }
    setSaving(true)
    try {
      await api.post('/splits', {
        title,
        total_amount: total,
        members: validMembers.map(m => ({ name: m.name.trim(), share_amount: parseFloat(m.share_amount) })),
      })
      setShowModal(false)
      resetForm()
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setTitle('')
    setTotalAmount('')
    setMembers([{ name: '', share_amount: '' }, { name: '', share_amount: '' }])
    setFormError('')
  }

  async function togglePaid(splitId: number, memberId: number) {
    await api.patch(`/splits/${splitId}/members/${memberId}/paid`, {})
    setSplits(prev => prev.map(s =>
      s.id !== splitId ? s : {
        ...s,
        members: s.members.map((m: SplitMember) =>
          m.id !== memberId ? m : { ...m, paid: !m.paid }
        ),
      }
    ))
  }

  async function deleteSplit(id: number) {
    await api.del(`/splits/${id}`)
    setSplits(prev => prev.filter(s => s.id !== id))
  }

  const totalOwed = splits.reduce((sum, s) =>
    sum + s.members.filter(m => !m.paid).reduce((ss, m) => ss + m.share_amount, 0), 0)

  return (
    <div className="splits-page">
      <div className="splits-header">
        <div>
          <h1 className="splits-title">Bill Splits</h1>
          {totalOwed > 0 && (
            <p className="splits-owed">₹{totalOwed.toLocaleString('en-IN', { maximumFractionDigits: 2 })} still owed to you</p>
          )}
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowModal(true) }}>
          + New split
        </button>
      </div>

      {error && <p className="splits-error">{error}</p>}

      {loading ? (
        <div className="splits-empty">Loading…</div>
      ) : splits.length === 0 ? (
        <div className="splits-empty">
          <div className="splits-empty-icon">🧾</div>
          <p>No splits yet. Add a bill to track who owes what.</p>
        </div>
      ) : (
        <div className="splits-list">
          {splits.map(split => {
            const pendingTotal = split.members.filter(m => !m.paid).reduce((s, m) => s + m.share_amount, 0)
            const myPart = split.total_amount - split.members.reduce((s, m) => s + m.share_amount, 0)
            const allSettled = split.members.every(m => m.paid)
            return (
              <div key={split.id} className={'split-card' + (allSettled ? ' split-card--settled' : '')}>
                <div className="split-card-header">
                  <div>
                    <h3 className="split-card-title">{split.title}</h3>
                    <p className="split-card-meta">
                      Total ₹{split.total_amount.toLocaleString('en-IN')}
                      {myPart > 0 && <> · Your share ₹{myPart.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</>}
                      {allSettled
                        ? <span className="split-settled-badge">✓ Settled</span>
                        : <> · <span className="split-pending-amt">₹{pendingTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })} pending</span></>}
                    </p>
                  </div>
                  <button
                    className="split-delete-btn"
                    onClick={() => deleteSplit(split.id)}
                    title="Delete split"
                  >✕</button>
                </div>

                <div className="split-members-list">
                  {split.members.map(m => (
                    <div key={m.id} className={'split-member-row' + (m.paid ? ' split-member-row--paid' : '')}>
                      <div className="split-member-info">
                        <span className="split-member-name">{m.name}</span>
                        <span className="split-member-amount">
                          ₹{m.share_amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <button
                        className={'split-paid-btn' + (m.paid ? ' split-paid-btn--done' : '')}
                        onClick={() => togglePaid(split.id, m.id)}
                      >
                        {m.paid ? '✓ Paid' : 'Mark paid'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card modal-card--wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">New bill split</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className="splits-form">
              <label className="form-label">
                What was this for?
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="form-input"
                  placeholder="e.g. Dinner at Taj, Goa trip"
                  required
                  autoFocus
                />
              </label>

              <label className="form-label">
                Total bill amount
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  className="form-input"
                  placeholder="e.g. 727"
                  required
                />
              </label>

              <div className="splits-people-header">
                <span className="form-label" style={{ margin: 0 }}>People who owe you</span>
                <button type="button" className="splits-evenly-btn" onClick={splitEvenly}>
                  Split evenly
                </button>
              </div>

              <div className="splits-people-list">
                {members.map((m, i) => (
                  <div key={i} className="splits-person-row">
                    <input
                      type="text"
                      value={m.name}
                      onChange={e => updateMember(i, 'name', e.target.value)}
                      className="form-input"
                      placeholder={`Person ${i + 1}`}
                    />
                    <div className="splits-amount-wrap">
                      <span className="splits-currency">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={m.share_amount}
                        onChange={e => updateMember(i, 'share_amount', e.target.value)}
                        className="form-input"
                        placeholder="0"
                      />
                    </div>
                    {members.length > 1 && (
                      <button type="button" className="split-remove" onClick={() => removeMember(i)}>✕</button>
                    )}
                  </div>
                ))}
              </div>

              <button type="button" className="split-add" onClick={addMember}>+ Add person</button>

              {total > 0 && (
                <div className="splits-my-share">
                  <span>Your share</span>
                  <strong>₹{myShare.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                  {Math.abs(totalAssigned - (total - myShare)) > 0.01 && (
                    <span className="splits-unassigned"> (₹{Math.abs(total - totalAssigned - myShare).toLocaleString('en-IN', { maximumFractionDigits: 2 })} unassigned)</span>
                  )}
                </div>
              )}

              {formError && <p className="form-error">{formError}</p>}

              <button type="submit" className="btn-primary btn-full" disabled={saving}>
                {saving ? 'Saving…' : 'Create split'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

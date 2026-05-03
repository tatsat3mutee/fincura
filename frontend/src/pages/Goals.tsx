import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import GoalCard from '../components/GoalCard'
import type { Goal } from '../types'
import '../styles/goals.css'

const ICONS = ['◎', '🏠', '✈️', '🚗', '💍', '📚', '💻', '🏋️', '🎯', '💰', '🎓', '🌴']
const COLORS = ['#1a472a', '#2e7d52', '#357abd', '#c17f24', '#8b5e83', '#c0392b', '#d97706', '#0891b2']

export default function Goals() {
  const { user } = useAuth()
  const currency = user?.currency ?? 'INR'
  const [goals, setGoals] = useState<Goal[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [depositGoal, setDepositGoal] = useState<Goal | null>(null)
  const [depositAmt, setDepositAmt] = useState('')
  const [depositErr, setDepositErr] = useState('')
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [saved, setSaved] = useState('0')
  const [targetDate, setTargetDate] = useState('')
  const [icon, setIcon] = useState('◎')
  const [color, setColor] = useState('#1a472a')
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    api.get<Goal[]>('/goals').then(setGoals)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditing(null)
    setName(''); setTarget(''); setSaved('0'); setTargetDate('')
    setIcon('◎'); setColor('#1a472a'); setFormErr('')
    setShowForm(true)
  }

  function openEdit(g: Goal) {
    setEditing(g)
    setName(g.name); setTarget(String(g.target_amount)); setSaved(String(g.saved_amount))
    setTargetDate(g.target_date ?? ''); setIcon(g.icon); setColor(g.color); setFormErr('')
    setShowForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormErr('')
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/goals/${editing.id}`, { name, target_amount: parseFloat(target), target_date: targetDate || null, icon, color })
      } else {
        await api.post('/goals', { name, target_amount: parseFloat(target), saved_amount: parseFloat(saved) || 0, target_date: targetDate || null, icon, color })
      }
      setShowForm(false)
      load()
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this goal?')) return
    await api.del(`/goals/${id}`)
    load()
  }

  async function handleDeposit(e: FormEvent) {
    e.preventDefault()
    setDepositErr('')
    if (!depositGoal) return
    try {
      await api.post(`/goals/${depositGoal.id}/deposit`, { amount: parseFloat(depositAmt) })
      setDepositGoal(null)
      setDepositAmt('')
      load()
    } catch (err) {
      setDepositErr(err instanceof Error ? err.message : 'Failed to deposit')
    }
  }

  return (
    <div className="goals-page">
      <div className="goals-header">
        <h1 className="page-title">Savings Goals</h1>
        <button className="btn-primary" onClick={openAdd}>+ New goal</button>
      </div>

      {goals.length === 0 ? (
        <div className="empty-state">No savings goals yet. Create one to start tracking!</div>
      ) : (
        <div className="goals-grid">
          {goals.map(g => (
            <GoalCard
              key={g.id}
              goal={g}
              currency={currency}
              onDeposit={() => { setDepositGoal(g); setDepositAmt(''); setDepositErr('') }}
              onEdit={() => openEdit(g)}
              onDelete={() => handleDelete(g.id)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Edit goal' : 'New goal'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="txn-form">
              <label className="form-label">
                Goal name
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="form-input" required autoFocus placeholder="e.g. Emergency Fund" />
              </label>
              <label className="form-label">
                Target amount
                <input type="number" min="1" step="0.01" value={target} onChange={e => setTarget(e.target.value)} className="form-input" required placeholder="0" />
              </label>
              {!editing && (
                <label className="form-label">
                  Already saved <span className="form-hint">(optional)</span>
                  <input type="number" min="0" step="0.01" value={saved} onChange={e => setSaved(e.target.value)} className="form-input" placeholder="0" />
                </label>
              )}
              <label className="form-label">
                Target date <span className="form-hint">(optional)</span>
                <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="form-input" />
              </label>
              <div className="form-label">
                Icon
                <div className="icon-picker">
                  {ICONS.map(ic => (
                    <button key={ic} type="button" className={`icon-btn ${icon === ic ? 'icon-btn--active' : ''}`} onClick={() => setIcon(ic)}>{ic}</button>
                  ))}
                </div>
              </div>
              <div className="form-label">
                Color
                <div className="color-picker">
                  {COLORS.map(c => (
                    <button key={c} type="button" className={`color-btn ${color === c ? 'color-btn--active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
                  ))}
                </div>
              </div>
              {formErr && <p className="form-error">{formErr}</p>}
              <button type="submit" disabled={saving} className="btn-primary btn-full">
                {saving ? 'Saving…' : (editing ? 'Save changes' : 'Create goal')}
              </button>
            </form>
          </div>
        </div>
      )}

      {depositGoal && (
        <div className="modal-overlay" onClick={() => setDepositGoal(null)}>
          <div className="modal-card modal-card--sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Deposit to "{depositGoal.name}"</h2>
              <button className="modal-close" onClick={() => setDepositGoal(null)}>✕</button>
            </div>
            <form onSubmit={handleDeposit} className="txn-form">
              <label className="form-label">
                Amount
                <input type="number" min="1" step="0.01" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} className="form-input" required autoFocus placeholder="0" />
              </label>
              {depositErr && <p className="form-error">{depositErr}</p>}
              <button type="submit" className="btn-primary btn-full">Deposit</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

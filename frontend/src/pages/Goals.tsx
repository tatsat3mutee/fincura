import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useAppStore } from '../store/useAppStore'
import GoalCard from '../components/GoalCard'
import type { Goal } from '../types'
import '../styles/goals.css'

const ICONS = ['◎', '🏠', '✈️', '🚗', '💍', '📚', '💻', '🏋️', '🎯', '💰', '🎓', '🌴']
const COLORS = ['#1a472a', '#2e7d52', '#357abd', '#c17f24', '#8b5e83', '#c0392b', '#d97706', '#0891b2']

const SCHEME_TYPES = [
  'PPF (Public Provident Fund)',
  'NPS (National Pension System)',
  'ELSS Mutual Fund',
  'Fixed Deposit (FD)',
  'Recurring Deposit (RD)',
  'Sukanya Samriddhi Yojana',
  'NSC (National Savings Certificate)',
  'Sovereign Gold Bond',
  'Index Fund / ETF',
  'Liquid Fund',
  'Savings Account',
  'Other',
]

const SCHEME_TIPS: Record<string, { returns: string; lock: string; tax: string; tip: string }> = {
  'PPF (Public Provident Fund)':   { returns: '7.1% p.a.', lock: '15 years', tax: 'EEE (fully tax-free)', tip: 'Best for long-term, risk-free, tax-free savings.' },
  'NPS (National Pension System)': { returns: '8–12% p.a.', lock: 'Till retirement', tax: '₹50K extra deduction u/s 80CCD(1B)', tip: 'Extra ₹50K deduction beyond 80C limit.' },
  'ELSS Mutual Fund':              { returns: '12–15% p.a. (market-linked)', lock: '3 years', tax: '80C deduction up to ₹1.5L', tip: 'Shortest lock-in among 80C options; equity growth.' },
  'Fixed Deposit (FD)':            { returns: '6.5–8.5% p.a.', lock: '7 days – 10 years', tax: 'Interest taxable as income', tip: 'Safe, predictable. Compare senior-citizen rates.' },
  'Recurring Deposit (RD)':        { returns: '6–7.5% p.a.', lock: 'Flexible', tax: 'Interest taxable as income', tip: 'Great for building a habit with monthly deposits.' },
  'Sukanya Samriddhi Yojana':      { returns: '8.2% p.a.', lock: 'Till girl turns 21', tax: 'EEE (fully tax-free)', tip: 'Highest guaranteed rate; only for girl children.' },
  'NSC (National Savings Certificate)': { returns: '7.7% p.a.', lock: '5 years', tax: '80C + interest auto-reinvested (deductible)', tip: 'Good for conservative investors.' },
  'Sovereign Gold Bond':           { returns: '2.5% p.a. + gold price gain', lock: '8 years (exit at 5)', tax: 'Capital gains tax-free at maturity', tip: 'Digital gold without storage risk.' },
  'Index Fund / ETF':              { returns: '10–13% p.a. (historical)', lock: 'None (recommended 5+ years)', tax: 'LTCG 10% above ₹1L/year', tip: 'Low cost, market returns. Nifty50 / Sensex funds.' },
  'Liquid Fund':                   { returns: '6.5–7.5% p.a.', lock: 'None (T+1 withdrawal)', tax: 'Gains taxed as per income slab', tip: 'Better than savings account for emergency fund.' },
  'Savings Account':               { returns: '3–7% p.a.', lock: 'None', tax: '₹10K interest exempt u/s 80TTA', tip: 'Use high-interest accounts (DFB, IDFC, etc.).' },
}

export default function Goals() {
  const { user } = useAuth()
  const addToast = useAppStore((s) => s.addToast)
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
  const [schemeType, setSchemeType] = useState('')
  const [institution, setInstitution] = useState('')
  const [schemeNotes, setSchemeNotes] = useState('')
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    api.get<Goal[]>('/goals').then(setGoals)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditing(null)
    setName(''); setTarget(''); setSaved('0'); setTargetDate('')
    setIcon('◎'); setColor('#1a472a')
    setSchemeType(''); setInstitution(''); setSchemeNotes('')
    setFormErr('')
    setShowForm(true)
  }

  function openEdit(g: Goal) {
    setEditing(g)
    setName(g.name); setTarget(String(g.target_amount)); setSaved(String(g.saved_amount))
    setTargetDate(g.target_date ?? ''); setIcon(g.icon); setColor(g.color)
    setSchemeType(g.scheme_type ?? ''); setInstitution(g.institution ?? ''); setSchemeNotes(g.scheme_notes ?? '')
    setFormErr('')
    setShowForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormErr('')
    setSaving(true)
    try {
      const schemePayload = {
        scheme_type: schemeType || null,
        institution: institution || null,
        scheme_notes: schemeNotes || null,
      }
      if (editing) {
        await api.put(`/goals/${editing.id}`, { name, target_amount: parseFloat(target), target_date: targetDate || null, icon, color, ...schemePayload })
      } else {
        await api.post('/goals', { name, target_amount: parseFloat(target), saved_amount: parseFloat(saved) || 0, target_date: targetDate || null, icon, color, ...schemePayload })
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
      const amt = parseFloat(depositAmt)
      setDepositGoal(null)
      setDepositAmt('')
      load()
      addToast('success', `Deposited ₹${amt.toLocaleString()} — recorded as expense in Transactions`)
    } catch (err) {
      setDepositErr(err instanceof Error ? err.message : 'Failed to deposit')
    }
  }

  const schemeTip = SCHEME_TIPS[schemeType]

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
          <div className="modal-card modal-card--wide" onClick={e => e.stopPropagation()}>
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

              {/* Savings scheme section */}
              <div className="scheme-section">
                <p className="scheme-heading">Where will you save? <span className="form-hint">(optional)</span></p>
                <label className="form-label">
                  Scheme / instrument
                  <select value={schemeType} onChange={e => setSchemeType(e.target.value)} className="form-input">
                    <option value="">Select scheme…</option>
                    {SCHEME_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>

                {schemeTip && (
                  <div className="scheme-tip">
                    <div className="scheme-tip-row"><span>📈 Returns</span><strong>{schemeTip.returns}</strong></div>
                    <div className="scheme-tip-row"><span>🔒 Lock-in</span><strong>{schemeTip.lock}</strong></div>
                    <div className="scheme-tip-row"><span>💸 Tax</span><strong>{schemeTip.tax}</strong></div>
                    <p className="scheme-tip-note">{schemeTip.tip}</p>
                  </div>
                )}

                <label className="form-label">
                  Bank / institution <span className="form-hint">(optional)</span>
                  <input type="text" value={institution} onChange={e => setInstitution(e.target.value)} className="form-input" placeholder="e.g. SBI, HDFC, Zerodha" />
                </label>
                <label className="form-label">
                  Notes <span className="form-hint">(account number, folio, etc.)</span>
                  <input type="text" value={schemeNotes} onChange={e => setSchemeNotes(e.target.value)} className="form-input" placeholder="e.g. PPF Account #XXXXX" />
                </label>
              </div>

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
              <p className="form-hint">This will also add an expense transaction in the <strong>Savings</strong> category.</p>
              {depositErr && <p className="form-error">{depositErr}</p>}
              <button type="submit" className="btn-primary btn-full">Deposit</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

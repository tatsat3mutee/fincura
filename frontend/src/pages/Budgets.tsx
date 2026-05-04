import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useAppStore } from '../store/useAppStore'
import BudgetBar from '../components/BudgetBar'
import type { Budget, Category } from '../types'
import '../styles/budgets.css'

const PERIOD_OPTIONS = [
  { value: 1,  label: '1 month' },
  { value: 2,  label: '2 months' },
  { value: 3,  label: '3 months' },
  { value: 6,  label: '6 months' },
  { value: 12, label: '1 year' },
]

interface Toast { id: number; msg: string; level: 'warn' | 'danger' }

export default function Budgets() {
  const { user } = useAuth()
  const currency = user?.currency ?? 'INR'
  const month = useAppStore((s) => s.selectedMonth)
  const setMonth = useAppStore((s) => s.setSelectedMonth)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [selectedCatIds, setSelectedCatIds] = useState<number[]>([])
  const [amount, setAmount] = useState('')
  const [periodMonths, setPeriodMonths] = useState(1)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const alertedBudgets = useRef(new Set<string>())

  function addToast(msg: string, level: 'warn' | 'danger') {
    const id = ++toastId.current
    setToasts(t => [...t, { id, msg, level }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }

  function load() {
    api.get<Budget[]>(`/budgets?month=${month}`).then(data => {
      setBudgets(data)
      // Fire alerts for newly crossed thresholds
      data.forEach(b => {
        const pct = b.limit_amount > 0 ? (b.spent / b.limit_amount) * 100 : 0
        const key50 = `${b.id}-50`, key75 = `${b.id}-75`, key100 = `${b.id}-100`
        if (pct >= 100 && !alertedBudgets.current.has(key100)) {
          alertedBudgets.current.add(key100)
          addToast(`🚨 ${b.category_name}: budget fully spent (100%)`, 'danger')
        } else if (pct >= 75 && !alertedBudgets.current.has(key75)) {
          alertedBudgets.current.add(key75)
          addToast(`⚠️ ${b.category_name}: 75% of budget used`, 'warn')
        } else if (pct >= 50 && !alertedBudgets.current.has(key50)) {
          alertedBudgets.current.add(key50)
          addToast(`💡 ${b.category_name}: 50% of budget used`, 'warn')
        }
      })
    })
  }

  useEffect(() => {
    alertedBudgets.current.clear()
    load()
  }, [month])

  useEffect(() => {
    api.get<Category[]>('/categories').then(cats => setCategories(cats.filter(c => c.type !== 'income')))
  }, [])

  function openAdd() {
    setEditing(null)
    setSelectedCatIds([])
    setAmount('')
    setPeriodMonths(1)
    setError('')
    setShowForm(true)
  }

  function openEdit(b: Budget) {
    setEditing(b)
    setSelectedCatIds([b.category_id])
    setAmount(String(b.limit_amount))
    setPeriodMonths(b.period_months ?? 1)
    setError('')
    setShowForm(true)
  }

  function toggleCat(id: number) {
    setSelectedCatIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!editing && selectedCatIds.length === 0) { setError('Select at least one category'); return }
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/budgets/${editing.id}`, { amount: parseFloat(amount) })
      } else {
        // Create one budget per selected category
        await Promise.all(
          selectedCatIds.map(catId =>
            api.post('/budgets', { category_id: catId, month, amount: parseFloat(amount), period_months: periodMonths })
          )
        )
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this budget?')) return
    await api.del(`/budgets/${id}`)
    load()
  }

  const usedCatIds = new Set(budgets.map(b => b.category_id))
  const availableCats = editing ? categories : categories.filter(c => !usedCatIds.has(c.id))

  return (
    <div className="budgets-page">
      {/* Toast alerts */}
      <div className="budget-toasts">
        {toasts.map(t => (
          <div key={t.id} className={`budget-toast budget-toast--${t.level}`}>
            {t.msg}
            <button onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))}>✕</button>
          </div>
        ))}
      </div>

      <div className="budgets-header">
        <h1 className="page-title">Budgets</h1>
        <div className="budgets-header-right">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="filter-input"
          />
          <button className="btn-primary" onClick={openAdd}>+ Add budget</button>
        </div>
      </div>

      {budgets.length === 0 ? (
        <div className="empty-state">No budgets for this month. Add one to track spending.</div>
      ) : (
        <div className="budgets-list">
          {budgets.map(b => (
            <BudgetBar
              key={b.id}
              budget={b}
              currency={currency}
              onEdit={() => openEdit(b)}
              onDelete={() => handleDelete(b.id)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Edit budget' : 'New budget'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="txn-form">

              {!editing && (
                <div className="form-label">
                  Categories
                  <p className="form-hint" style={{ marginTop: '0.25rem' }}>Select one or more to track together</p>
                  <div className="budget-cat-grid">
                    {availableCats.length === 0 && (
                      <p className="form-hint">All categories already have a budget this month.</p>
                    )}
                    {availableCats.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={'budget-cat-chip' + (selectedCatIds.includes(c.id) ? ' budget-cat-chip--on' : '')}
                        style={selectedCatIds.includes(c.id) ? { borderColor: c.color, background: c.color + '18', color: c.color } : {}}
                        onClick={() => toggleCat(c.id)}
                      >
                        <span>{c.icon}</span> {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!editing && (
                <label className="form-label">
                  Budget period
                  <div className="budget-period-row">
                    {PERIOD_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        className={'budget-period-btn' + (periodMonths === opt.value ? ' budget-period-btn--on' : '')}
                        onClick={() => setPeriodMonths(opt.value)}
                      >{opt.label}</button>
                    ))}
                  </div>
                </label>
              )}

              <label className="form-label">
                {editing ? 'Monthly limit' : `Total limit for ${PERIOD_OPTIONS.find(o => o.value === periodMonths)?.label}`}
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="form-input"
                  required
                  autoFocus={!!editing}
                  placeholder="0"
                />
              </label>

              {error && <p className="form-error">{error}</p>}
              <button type="submit" disabled={saving || (!editing && selectedCatIds.length === 0)} className="btn-primary btn-full">
                {saving ? 'Saving…' : (editing ? 'Save changes' : `Add budget${selectedCatIds.length > 1 ? 's (' + selectedCatIds.length + ')' : ''}`)}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

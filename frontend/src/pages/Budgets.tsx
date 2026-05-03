import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import BudgetBar from '../components/BudgetBar'
import type { Budget, Category } from '../types'
import { currentMonth } from '../types'
import '../styles/budgets.css'

export default function Budgets() {
  const { user } = useAuth()
  const currency = user?.currency ?? 'INR'
  const [month, setMonth] = useState(currentMonth())
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [catId, setCatId] = useState<number | ''>('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    api.get<Budget[]>(`/budgets?month=${month}`).then(setBudgets)
  }

  useEffect(() => { load() }, [month])
  useEffect(() => {
    api.get<Category[]>('/categories').then(cats => setCategories(cats.filter(c => c.type !== 'income')))
  }, [])

  function openAdd() {
    setEditing(null)
    setCatId('')
    setAmount('')
    setError('')
    setShowForm(true)
  }

  function openEdit(b: Budget) {
    setEditing(b)
    setCatId(b.category_id)
    setAmount(String(b.limit_amount))
    setError('')
    setShowForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!catId) { setError('Select a category'); return }
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/budgets/${editing.id}`, { amount: parseFloat(amount) })
      } else {
        await api.post('/budgets', { category_id: catId, month, amount: parseFloat(amount) })
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
  const availableCats = editing
    ? categories
    : categories.filter(c => !usedCatIds.has(c.id))

  return (
    <div className="budgets-page">
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
                <label className="form-label">
                  Category
                  <select
                    value={catId}
                    onChange={e => setCatId(Number(e.target.value))}
                    className="form-input"
                    required
                  >
                    <option value="">Select category…</option>
                    {availableCats.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="form-label">
                Monthly limit
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
              <button type="submit" disabled={saving} className="btn-primary btn-full">
                {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add budget')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

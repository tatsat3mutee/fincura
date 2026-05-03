import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Category, Transaction } from '../types'
import { todayISO } from '../types'
import '../styles/form.css'

interface Props {
  transaction?: Transaction | null
  onClose: () => void
  onSuccess: () => void
}

export default function TransactionForm({ transaction, onClose, onSuccess }: Props) {
  const editing = !!transaction
  const [type, setType] = useState<'expense' | 'income'>(transaction?.type ?? 'expense')
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '')
  const [categoryId, setCategoryId] = useState<number | ''>(transaction?.category_id ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
  const [txnDate, setTxnDate] = useState(transaction?.txn_date ?? todayISO())
  const [categories, setCategories] = useState<Category[]>([])
  const [catsLoading, setCatsLoading] = useState(true)
  const [catsError, setCatsError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function loadCategories() {
    setCatsLoading(true)
    setCatsError('')
    api.get<Category[]>('/categories')
      .then(setCategories)
      .catch(err => setCatsError(err instanceof Error ? err.message : 'Failed to load categories'))
      .finally(() => setCatsLoading(false))
  }

  useEffect(() => { loadCategories() }, [])

  const filtered = categories.filter(c => c.type === type || c.type === 'both')

  useEffect(() => {
    if (categoryId && !filtered.find(c => c.id === categoryId)) {
      setCategoryId('')
    }
  }, [type])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!categoryId) { setError('Please select a category'); return }
    const body = { type, amount: parseFloat(amount), category_id: categoryId, note: note || null, txn_date: txnDate }
    setLoading(true)
    try {
      if (editing && transaction) {
        await api.put(`/transactions/${transaction.id}`, body)
      } else {
        await api.post('/transactions', body)
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{editing ? 'Edit transaction' : 'New transaction'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="txn-form">
          <div className="type-toggle">
            <button
              type="button"
              className={'type-btn' + (type === 'expense' ? ' type-btn--active-expense' : '')}
              onClick={() => setType('expense')}
            >Expense</button>
            <button
              type="button"
              className={'type-btn' + (type === 'income' ? ' type-btn--active-income' : '')}
              onClick={() => setType('income')}
            >Income</button>
          </div>

          <label className="form-label">
            Amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="form-input"
              required
              autoFocus
              placeholder="0"
            />
          </label>

          <label className="form-label">
            Category
            {catsError ? (
              <div className="form-cats-error">
                {catsError} — <button type="button" onClick={loadCategories} className="form-retry">retry</button>
              </div>
            ) : (
              <select
                value={categoryId}
                onChange={e => setCategoryId(Number(e.target.value))}
                className="form-input"
                required
                disabled={catsLoading}
              >
                <option value="">{catsLoading ? 'Loading…' : 'Select category…'}</option>
                {filtered.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            )}
          </label>

          <label className="form-label">
            Note <span className="form-hint">(optional)</span>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="form-input"
              placeholder="e.g. Lunch with team"
            />
          </label>

          <label className="form-label">
            Date
            <input
              type="date"
              value={txnDate}
              onChange={e => setTxnDate(e.target.value)}
              className="form-input"
              required
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary btn-full">
            {loading ? 'Saving…' : (editing ? 'Save changes' : 'Add transaction')}
          </button>
        </form>
      </div>
    </div>
  )
}

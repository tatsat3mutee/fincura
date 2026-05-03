import { useEffect, useRef, useState, type FormEvent } from 'react'
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

  // Split calculator (expense only, not editing)
  const [showCalc, setShowCalc] = useState(false)
  const [calcTotal, setCalcTotal] = useState('')
  const [calcPeople, setCalcPeople] = useState(2)
  const calcShare = calcTotal ? Math.round((parseFloat(calcTotal) / calcPeople) * 100) / 100 : 0

  const filtered = categories.filter(c => c.type === type || c.type === 'both')
  const selectedCat = filtered.find(c => c.id === categoryId)
  const isOther = selectedCat?.name === 'Other'

  const typeChangedRef = useRef(false)

  function loadCategories() {
    setCatsLoading(true)
    setCatsError('')
    api.get<Category[]>('/categories')
      .then(setCategories)
      .catch(err => setCatsError(err instanceof Error ? err.message : 'Failed to load categories'))
      .finally(() => setCatsLoading(false))
  }

  useEffect(() => { loadCategories() }, [])

  useEffect(() => {
    if (!typeChangedRef.current) { typeChangedRef.current = true; return }
    if (categoryId && !filtered.find(c => c.id === categoryId)) {
      setCategoryId('')
    }
  }, [type])

  function applyShare() {
    if (calcShare > 0) {
      setAmount(String(calcShare))
      setShowCalc(false)
      setCalcTotal('')
      setCalcPeople(2)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!categoryId) { setError('Please select a category'); return }
    if (isOther && !note.trim()) { setError('Please describe what "Other" is'); return }
    const finalAmount = parseFloat(amount)
    if (!finalAmount || finalAmount <= 0) { setError('Enter a valid amount'); return }
    const body = { type, amount: finalAmount, category_id: categoryId, note: note || null, txn_date: txnDate }
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

          {/* Amount + split calculator */}
          <label className="form-label">
            Amount
            <div className="amount-row">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="form-input amount-input"
                required
                autoFocus
                placeholder="0"
              />
              {type === 'expense' && !editing && (
                <button
                  type="button"
                  className={'split-calc-btn' + (showCalc ? ' split-calc-btn--on' : '')}
                  onClick={() => { setShowCalc(v => !v); setCalcTotal(''); setCalcPeople(2) }}
                  title="Split calculator — enter a total bill and divide it"
                >÷</button>
              )}
            </div>
          </label>

          {/* Inline split calculator */}
          {showCalc && (
            <div className="split-calc-panel">
              <div className="split-calc-row">
                <label className="split-calc-field">
                  <span className="split-calc-label">Total bill</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={calcTotal}
                    onChange={e => setCalcTotal(e.target.value)}
                    className="form-input"
                    placeholder="e.g. 1200"
                    autoFocus
                  />
                </label>
                <label className="split-calc-field">
                  <span className="split-calc-label">People</span>
                  <div className="split-calc-people">
                    <button type="button" className="split-calc-step" onClick={() => setCalcPeople(p => Math.max(2, p - 1))}>−</button>
                    <span className="split-calc-count">{calcPeople}</span>
                    <button type="button" className="split-calc-step" onClick={() => setCalcPeople(p => Math.min(20, p + 1))}>+</button>
                  </div>
                </label>
              </div>
              {calcShare > 0 && (
                <div className="split-calc-result">
                  <span>Your share: <strong>₹{calcShare.toLocaleString('en-IN')}</strong></span>
                  <button type="button" className="split-calc-use" onClick={applyShare}>Use this →</button>
                </div>
              )}
            </div>
          )}

          {/* Category chips */}
          <div className="form-label">
            Category
            {catsError ? (
              <div className="form-cats-error">
                {catsError} — <button type="button" onClick={loadCategories} className="form-retry">retry</button>
              </div>
            ) : catsLoading ? (
              <p className="form-hint" style={{ marginTop: '0.4rem' }}>Loading…</p>
            ) : (
              <div className="cat-chip-grid">
                {filtered.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={'cat-chip' + (categoryId === c.id ? ' cat-chip--on' : '')}
                    style={categoryId === c.id
                      ? { borderColor: c.color, background: c.color + '18', color: c.color }
                      : undefined}
                    onClick={() => setCategoryId(c.id)}
                  >
                    <span>{c.icon}</span>
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {isOther ? (
            <label className="form-label">
              What is this? <span className="form-required">*</span>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="form-input"
                required
                placeholder="e.g. Cash withdrawal, miscellaneous purchase"
              />
            </label>
          ) : (
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
          )}

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


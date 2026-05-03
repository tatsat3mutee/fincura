import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import TransactionRow from '../components/TransactionRow'
import TransactionForm from '../components/TransactionForm'
import BudgetBar from '../components/BudgetBar'
import type { Transaction, Budget, Category } from '../types'
import { currentMonth, formatCurrency } from '../types'
import '../styles/transactions.css'
import '../styles/budgets.css'

const PERIOD_OPTIONS = [
  { value: 1,  label: '1 month' },
  { value: 2,  label: '2 months' },
  { value: 3,  label: '3 months' },
  { value: 6,  label: '6 months' },
  { value: 12, label: '1 year' },
]

interface Toast { id: number; msg: string; level: 'warn' | 'danger' }

export default function Transactions() {
  const { user } = useAuth()
  const currency = user?.currency ?? 'INR'
  const [activeTab, setActiveTab] = useState<'transactions' | 'budgets'>('transactions')
  const [month, setMonth] = useState(currentMonth())

  // — Transaction state —
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [typeFilter, setTypeFilter] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [listLoading, setListLoading] = useState(false)

  // — Budget state —
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [selectedCatIds, setSelectedCatIds] = useState<number[]>([])
  const [budgetAmount, setBudgetAmount] = useState('')
  const [periodMonths, setPeriodMonths] = useState(1)
  const [budgetError, setBudgetError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const alertedBudgets = useRef(new Set<string>())

  function addToast(msg: string, level: 'warn' | 'danger') {
    const id = ++toastId.current
    setToasts(t => [...t, { id, msg, level }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }

  function loadTransactions() {
    setListLoading(true)
    const params = new URLSearchParams({ month, limit: '100' })
    if (typeFilter) params.set('type', typeFilter)
    api.get<Transaction[]>(`/transactions?${params}`)
      .then(setTransactions)
      .finally(() => setListLoading(false))
  }

  function loadBudgets() {
    return api.get<Budget[]>(`/budgets?month=${month}`).then(data => {
      setBudgets(data)
      data.forEach(b => {
        const pct = b.limit_amount > 0 ? (b.spent / b.limit_amount) * 100 : 0
        const k50 = `${b.id}-50`, k75 = `${b.id}-75`, k100 = `${b.id}-100`
        if (pct >= 100 && !alertedBudgets.current.has(k100)) {
          alertedBudgets.current.add(k100)
          addToast(`🚨 ${b.category_name}: budget fully spent`, 'danger')
        } else if (pct >= 75 && !alertedBudgets.current.has(k75)) {
          alertedBudgets.current.add(k75)
          addToast(`⚠️ ${b.category_name}: 75% of budget used`, 'warn')
        } else if (pct >= 50 && !alertedBudgets.current.has(k50)) {
          alertedBudgets.current.add(k50)
          addToast(`💡 ${b.category_name}: 50% of budget used`, 'warn')
        }
      })
    })
  }

  useEffect(() => {
    alertedBudgets.current.clear()
    loadTransactions()
    loadBudgets()
  }, [month, typeFilter])

  useEffect(() => {
    api.get<Category[]>('/categories').then(cats =>
      setCategories(cats.filter(c => c.type !== 'income'))
    )
  }, [])

  // Transaction handlers
  function openEdit(t: Transaction) { setEditing(t); setShowForm(true) }
  async function handleDelete(id: number) {
    if (!confirm('Delete this transaction?')) return
    await api.del(`/transactions/${id}`)
    loadTransactions(); loadBudgets()
  }
  function closeForm() { setShowForm(false); setEditing(null) }

  // Budget handlers
  function openAddBudget() {
    setEditingBudget(null); setSelectedCatIds([]); setBudgetAmount('')
    setPeriodMonths(1); setBudgetError(''); setShowBudgetForm(true)
  }
  function openEditBudget(b: Budget) {
    setEditingBudget(b); setSelectedCatIds([b.category_id])
    setBudgetAmount(String(b.limit_amount)); setPeriodMonths(b.period_months ?? 1)
    setBudgetError(''); setShowBudgetForm(true)
  }
  function toggleCat(id: number) {
    setSelectedCatIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  async function handleBudgetSubmit(e: FormEvent) {
    e.preventDefault(); setBudgetError('')
    if (!editingBudget && selectedCatIds.length === 0) { setBudgetError('Select at least one category'); return }
    const amt = parseFloat(budgetAmount)
    if (!amt || amt <= 0) { setBudgetError('Enter a valid amount'); return }
    setSaving(true)
    try {
      if (editingBudget) {
        await api.put(`/budgets/${editingBudget.id}`, { amount: amt })
        setShowBudgetForm(false); loadBudgets()
      } else {
        // Use allSettled so a duplicate conflict on one category doesn't block others
        const results = await Promise.allSettled(
          selectedCatIds.map(catId =>
            api.post('/budgets', { category_id: catId, month, amount: amt, period_months: periodMonths })
          )
        )
        const failed = results.filter(r => r.status === 'rejected')
        setShowBudgetForm(false)
        await loadBudgets()
        if (failed.length > 0) {
          const reason = failed[0].status === 'rejected'
            ? (failed[0].reason instanceof Error ? failed[0].reason.message : String(failed[0].reason))
            : ''
          addToast(`⚠️ ${failed.length} budget(s) not saved: ${reason}`, 'warn')
        }
      }
    } catch (err) {
      setBudgetError(err instanceof Error ? err.message : 'Failed to save')
    } finally { setSaving(false) }
  }
  async function handleDeleteBudget(id: number) {
    if (!confirm('Delete this budget?')) return
    await api.del(`/budgets/${id}`); loadBudgets()
  }

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const usedCatIds = new Set(budgets.map(b => b.category_id))
  const availableCats = editingBudget ? categories : categories.filter(c => !usedCatIds.has(c.id))

  return (
    <div className="txn-page">
      {/* Toast alerts */}
      <div className="budget-toasts">
        {toasts.map(t => (
          <div key={t.id} className={`budget-toast budget-toast--${t.level}`}>
            {t.msg}
            <button onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))}>✕</button>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="txn-page-header">
        <div>
          <h1 className="page-title">{activeTab === 'budgets' ? 'Budgets' : 'Transactions'}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="filter-input" />
          {activeTab === 'transactions' && (
            <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>+ Add</button>
          )}
          {activeTab === 'budgets' && (
            <button className="btn-primary" onClick={openAddBudget}>+ Add budget</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="money-tabs">
        <button
          className={'money-tab' + (activeTab === 'transactions' ? ' money-tab--on' : '')}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
        <button
          className={'money-tab' + (activeTab === 'budgets' ? ' money-tab--on' : '')}
          onClick={() => setActiveTab('budgets')}
        >
          Budgets
          {budgets.length > 0 && <span className="money-tab-badge">{budgets.length}</span>}
        </button>
      </div>

      {/* ── TRANSACTIONS TAB ── */}
      {activeTab === 'transactions' && (
        <>
          {/* Mini budget health strip */}
          {budgets.length > 0 && (typeFilter === '' || typeFilter === 'expense') && (
            <div className="txn-budget-strip">
              {budgets.map(b => {
                const pct = b.limit_amount > 0 ? Math.min((b.spent / b.limit_amount) * 100, 100) : 0
                const color = pct >= 100 ? 'var(--expense)' : pct >= 75 ? '#d97706' : 'var(--income)'
                return (
                  <button
                    key={b.id}
                    className="txn-budget-chip"
                    onClick={() => setActiveTab('budgets')}
                    title={`${b.category_name}: ${formatCurrency(b.spent, currency)} of ${formatCurrency(b.limit_amount, currency)}`}
                  >
                    <span className="txn-budget-chip-name">{b.category_name}</span>
                    <div className="txn-budget-chip-bar">
                      <div style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="txn-budget-chip-pct" style={{ color }}>{Math.round(pct)}%</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="txn-filters">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="filter-input">
              <option value="">All types</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </select>
            <div className="txn-totals">
              <span className="income-badge">+{formatCurrency(totalIncome, currency)}</span>
              <span className="expense-badge">−{formatCurrency(totalExpense, currency)}</span>
            </div>
          </div>

          {listLoading ? (
            <div className="txn-skeleton-list">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="txn-skeleton-row">
                  <div className="txn-skeleton-icon" />
                  <div className="txn-skeleton-body">
                    <div className="txn-skeleton-line txn-skeleton-line--title" />
                    <div className="txn-skeleton-line txn-skeleton-line--sub" />
                  </div>
                  <div className="txn-skeleton-amount" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <p className="empty-state">No transactions found.</p>
          ) : (
            <div className="txn-list">
              {transactions.map(t => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  currency={currency}
                  onEdit={() => openEdit(t)}
                  onDelete={() => handleDelete(t.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── BUDGETS TAB ── */}
      {activeTab === 'budgets' && (
        budgets.length === 0 ? (
          <div className="empty-state">No budgets for this month. Add one to track spending.</div>
        ) : (
          <div className="budgets-list">
            {budgets.map(b => (
              <BudgetBar
                key={b.id}
                budget={b}
                currency={currency}
                onEdit={() => openEditBudget(b)}
                onDelete={() => handleDeleteBudget(b.id)}
              />
            ))}
          </div>
        )
      )}

      {/* Transaction form modal */}
      {showForm && (
        <TransactionForm
          transaction={editing}
          onClose={closeForm}
          onSuccess={() => { closeForm(); loadTransactions(); loadBudgets() }}
        />
      )}

      {/* Budget form modal */}
      {showBudgetForm && (
        <div className="modal-overlay" onClick={() => setShowBudgetForm(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingBudget ? 'Edit budget' : 'New budget'}</h2>
              <button className="modal-close" onClick={() => setShowBudgetForm(false)}>✕</button>
            </div>
            <form onSubmit={handleBudgetSubmit} className="txn-form">
              {budgetError && <p className="form-error" style={{ marginTop: 0 }}>{budgetError}</p>}
              {!editingBudget && (
                <div className="form-label">
                  Categories
                  <p className="form-hint" style={{ marginTop: '0.25rem' }}>Select one or more</p>
                  <div className="budget-cat-grid">
                    {availableCats.length === 0 && (
                      <p className="form-hint">All categories already have a budget this month.</p>
                    )}
                    {availableCats.map(c => (
                      <button
                        key={c.id} type="button"
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

              {!editingBudget && (
                <label className="form-label">
                  Budget period
                  <div className="budget-period-row">
                    {PERIOD_OPTIONS.map(opt => (
                      <button
                        key={opt.value} type="button"
                        className={'budget-period-btn' + (periodMonths === opt.value ? ' budget-period-btn--on' : '')}
                        onClick={() => setPeriodMonths(opt.value)}
                      >{opt.label}</button>
                    ))}
                  </div>
                </label>
              )}

              <label className="form-label">
                {editingBudget ? 'Monthly limit' : `Total limit for ${PERIOD_OPTIONS.find(o => o.value === periodMonths)?.label}`}
                <input
                  type="number" min="1" step="0.01" value={budgetAmount}
                  onChange={e => setBudgetAmount(e.target.value)}
                  className="form-input" required autoFocus={!!editingBudget} placeholder="0"
                />
              </label>

              <button
                type="submit"
                disabled={saving || (!editingBudget && selectedCatIds.length === 0)}
                className="btn-primary btn-full"
              >
                {saving ? 'Saving…' : editingBudget ? 'Save changes' : `Add budget${selectedCatIds.length > 1 ? 's (' + selectedCatIds.length + ')' : ''}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

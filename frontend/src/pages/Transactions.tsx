import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import TransactionRow from '../components/TransactionRow'
import TransactionForm from '../components/TransactionForm'
import type { Transaction } from '../types'
import { currentMonth, formatCurrency } from '../types'
import '../styles/transactions.css'

export default function Transactions() {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [month, setMonth] = useState(currentMonth())
  const [typeFilter, setTypeFilter] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [showForm, setShowForm] = useState(false)

  const currency = user?.currency ?? 'INR'

  function load() {
    const params = new URLSearchParams({ month, limit: '100' })
    if (typeFilter) params.set('type', typeFilter)
    api.get<Transaction[]>(`/transactions?${params}`).then(setTransactions)
  }

  useEffect(() => { load() }, [month, typeFilter])

  function openEdit(t: Transaction) {
    setEditing(t)
    setShowForm(true)
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this transaction?')) return
    await api.del(`/transactions/${id}`)
    load()
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
  }

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  return (
    <div className="txn-page">
      <div className="txn-page-header">
        <h1 className="page-title">Transactions</h1>
        <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
          + Add
        </button>
      </div>

      <div className="txn-filters">
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="filter-input"
        />
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

      {transactions.length === 0 ? (
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

      {showForm && (
        <TransactionForm
          transaction={editing}
          onClose={closeForm}
          onSuccess={() => { closeForm(); load() }}
        />
      )}
    </div>
  )
}

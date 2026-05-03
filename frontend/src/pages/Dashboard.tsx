import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import StatCard from '../components/StatCard'
import MonthlyTrendChart from '../components/charts/MonthlyTrendChart'
import CategoryDonutChart from '../components/charts/CategoryDonutChart'
import DailySpendChart from '../components/charts/DailySpendChart'
import TransactionRow from '../components/TransactionRow'
import TransactionForm from '../components/TransactionForm'
import type { MonthlySummary, Transaction } from '../types'
import { currentMonth, formatCurrency } from '../types'
import '../styles/dashboard.css'

function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  return new Date(+y, +mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
}

function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}

export default function Dashboard() {
  const { user } = useAuth()
  const [month, setMonth] = useState(currentMonth())
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [recent, setRecent] = useState<Transaction[]>([])
  const [showForm, setShowForm] = useState(false)
  const [chartKey, setChartKey] = useState(0)

  function load() {
    api.get<MonthlySummary>(`/charts/summary?month=${month}`).then(setSummary)
    api.get<Transaction[]>(`/transactions?month=${month}&limit=5`).then(setRecent)
    setChartKey(k => k + 1)
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this transaction?')) return
    await api.del(`/transactions/${id}`)
    load()
  }

  useEffect(() => { load() }, [month])

  const currency = user?.currency ?? 'INR'

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="month-nav">
          <button className="month-btn" onClick={() => setMonth(prevMonth(month))}>‹</button>
          <span className="month-label">{monthLabel(month)}</span>
          <button
            className="month-btn"
            onClick={() => setMonth(nextMonth(month))}
            disabled={month >= currentMonth()}
          >›</button>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add transaction</button>
      </div>

      <div className="stat-cards">
        <StatCard
          label="Income"
          value={formatCurrency(summary?.income ?? 0, currency)}
          color="income"
        />
        <StatCard
          label="Expenses"
          value={formatCurrency(summary?.expense ?? 0, currency)}
          color="expense"
        />
        <StatCard
          label="Net"
          value={formatCurrency(summary?.net ?? 0, currency)}
          color={summary && summary.net >= 0 ? 'income' : 'expense'}
        />
      </div>

      <div className="chart-row">
        <div className="chart-card chart-card--wide">
          <h3 className="chart-title">Monthly Trend</h3>
          <MonthlyTrendChart currency={currency} refreshKey={chartKey} />
        </div>
        <div className="chart-card">
          <h3 className="chart-title">By Category</h3>
          <CategoryDonutChart month={month} currency={currency} refreshKey={chartKey} />
        </div>
      </div>

      <div className="chart-card chart-card--full">
        <h3 className="chart-title">Daily Spending — {monthLabel(month)}</h3>
        <DailySpendChart month={month} currency={currency} refreshKey={chartKey} />
      </div>

      <div className="recent-section">
        <div className="recent-header">
          <h3 className="section-title">Recent transactions</h3>
          <a href="/transactions" className="recent-viewall">View all →</a>
        </div>
        {recent.length === 0 ? (
          <p className="empty-state">No transactions this month yet.</p>
        ) : (
          <div className="txn-list">
            {recent.map(t => <TransactionRow key={t.id} transaction={t} currency={currency} onDelete={() => handleDelete(t.id)} />)}
          </div>
        )}
      </div>

      {showForm && (
        <TransactionForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}

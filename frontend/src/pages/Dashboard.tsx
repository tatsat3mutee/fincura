import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useAppStore } from '../store/useAppStore'
import StatCard from '../components/StatCard'
import MonthlyTrendChart from '../components/charts/MonthlyTrendChart'
import CategoryDonutChart from '../components/charts/CategoryDonutChart'
import DailySpendChart from '../components/charts/DailySpendChart'
import TransactionRow from '../components/TransactionRow'
import TransactionForm from '../components/TransactionForm'
import type { MonthlySummary, Transaction } from '../types'
import { formatCurrency, currentMonth } from '../types'
import '../styles/dashboard.css'

interface MonthProjection {
  spent_so_far: number
  day_of_month: number
  days_in_month: number
  daily_rate: number
  projected_month_total: number
}

interface Anomaly {
  category: string
  icon: string
  avg_3m: number
  current_month: number
  ratio: number
}

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
  const uid = user?.id ?? 'guest'
  const month = useAppStore((s) => s.selectedMonth)
  const setMonth = useAppStore((s) => s.setSelectedMonth)
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [recent, setRecent] = useState<Transaction[]>([])
  const [showForm, setShowForm] = useState(false)
  const [chartKey, setChartKey] = useState(0)
  const [plannedIncome, setPlannedIncome] = useState<number | null>(null)
  const [monthProjection, setMonthProjection] = useState<MonthProjection | null>(null)
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])

  function load() {
    api.get<MonthlySummary>(`/charts/summary?month=${month}`).then(setSummary)
    api.get<Transaction[]>(`/transactions?month=${month}&limit=5`).then(setRecent)
    setChartKey(k => k + 1)
    const stored = localStorage.getItem(`fincura_income_${uid}_${month}`)
    setPlannedIncome(stored ? parseFloat(stored) || null : null)
    if (month === currentMonth()) {
      api.get<MonthProjection>('/insights/month-projection').then(setMonthProjection).catch(() => {})
      api.get<Anomaly[]>('/insights/anomalies').then(setAnomalies).catch(() => {})
    } else {
      setMonthProjection(null)
      setAnomalies([])
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this transaction?')) return
    await api.del(`/transactions/${id}`)
    load()
  }

  useEffect(() => { load() }, [month])

  const currency = user?.currency ?? 'INR'
  const expense = summary?.expense ?? 0
  const income = summary?.income ?? 0
  const budget = plannedIncome ?? income
  const budgetUsed = budget > 0 ? Math.min((expense / budget) * 100, 100) : 0
  const budgetRemaining = budget - expense

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
          label={plannedIncome ? 'Monthly Budget' : 'Income'}
          value={formatCurrency(budget, currency)}
          color="income"
          sub={plannedIncome ? `₹${income.toLocaleString('en-IN')} received` : undefined}
        />
        <StatCard
          label="Spent"
          value={formatCurrency(expense, currency)}
          color="expense"
          sub={budget > 0 ? `${Math.round(budgetUsed)}% of budget` : undefined}
        />
        <StatCard
          label={budgetRemaining >= 0 ? 'Remaining' : 'Over budget'}
          value={formatCurrency(Math.abs(budgetRemaining), currency)}
          color={budgetRemaining >= 0 ? 'income' : 'expense'}
          sub={plannedIncome ? undefined : `Net: ${formatCurrency(summary?.net ?? 0, currency)}`}
        />
      </div>

      {plannedIncome !== null && budget > 0 && (
        <div className="dash-budget-bar-wrap">
          <div className="dash-budget-bar-bg">
            <div
              className="dash-budget-bar-fill"
              style={{
                width: `${budgetUsed}%`,
                background: budgetUsed >= 100 ? 'var(--expense)' : budgetUsed >= 75 ? '#d97706' : 'var(--income)'
              }}
            />
          </div>
          <span className="dash-budget-bar-label">
            {Math.round(budgetUsed)}% of {formatCurrency(budget, currency)} budget used
          </span>
        </div>
      )}

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

      {(monthProjection !== null || anomalies.length > 0) && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Insights</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {monthProjection && (
              <div style={{
                flex: '1 1 220px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '1rem 1.25rem',
              }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.35rem' }}>
                  Month Projection
                </div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: budget > 0 && monthProjection.projected_month_total > budget ? 'var(--expense)' : 'var(--text)',
                }}>
                  {formatCurrency(monthProjection.projected_month_total, currency)}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  ₹{monthProjection.daily_rate.toLocaleString('en-IN')}/day · day {monthProjection.day_of_month} of {monthProjection.days_in_month}
                </div>
              </div>
            )}
            {anomalies.length > 0 && (
              <div style={{
                flex: '1 1 220px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '1rem 1.25rem',
              }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
                  Spending Alerts
                </div>
                {anomalies.slice(0, 3).map(a => (
                  <div key={a.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0' }}>
                    <span style={{ fontSize: '0.85rem' }}>{a.icon} {a.category}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--expense)', fontWeight: 600 }}>{a.ratio}× avg</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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

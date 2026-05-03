import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { MonthlySummary, Transaction } from '../types'
import { currentMonth, formatCurrency } from '../types'
import '../styles/income.css'

interface Bucket { label: string; pct: number; color: string; icon: string }

const PRESETS = {
  '50/30/20': [
    { label: 'Essentials', pct: 50, color: '#1a472a', icon: '🏠' },
    { label: 'Wants',      pct: 30, color: '#4a7fa5', icon: '🎬' },
    { label: 'Savings',    pct: 20, color: '#2e7d52', icon: '💰' },
  ],
  '60/20/20': [
    { label: 'Essentials', pct: 60, color: '#1a472a', icon: '🏠' },
    { label: 'Savings',    pct: 20, color: '#2e7d52', icon: '💰' },
    { label: 'Investments',pct: 20, color: '#357abd', icon: '📈' },
  ],
  'Custom': [
    { label: 'Essentials',    pct: 50, color: '#1a472a', icon: '🏠' },
    { label: 'Savings',       pct: 20, color: '#2e7d52', icon: '💰' },
    { label: 'Emergency Fund', pct: 10, color: '#c0392b', icon: '🆘' },
    { label: 'Family',        pct: 20, color: '#8b5e83', icon: '👨‍👩‍👧' },
  ],
}

function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
}
function nextMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}
function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  return new Date(+y, +mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function Income() {
  const { user } = useAuth()
  const currency = user?.currency ?? 'INR'
  const [month, setMonth] = useState(currentMonth())
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [incomeTxns, setIncomeTxns] = useState<Transaction[]>([])
  const [preset, setPreset] = useState<keyof typeof PRESETS>('Custom')
  const [buckets, setBuckets] = useState<Bucket[]>(PRESETS['Custom'].map(b => ({ ...b })))

  function load() {
    api.get<MonthlySummary>(`/charts/summary?month=${month}`).then(setSummary)
    api.get<Transaction[]>(`/transactions?month=${month}&type=income&limit=100`).then(setIncomeTxns)
  }

  useEffect(() => { load() }, [month])

  function applyPreset(key: keyof typeof PRESETS) {
    setPreset(key)
    setBuckets(PRESETS[key].map(b => ({ ...b })))
  }

  function updatePct(idx: number, val: string) {
    setBuckets(prev => prev.map((b, i) => i === idx ? { ...b, pct: Math.max(0, Math.min(100, Number(val) || 0)) } : b))
  }
  function updateLabel(idx: number, val: string) {
    setBuckets(prev => prev.map((b, i) => i === idx ? { ...b, label: val } : b))
  }
  function addBucket() {
    setBuckets(prev => [...prev, { label: 'New bucket', pct: 0, color: '#6b6b6b', icon: '◎' }])
    setPreset('Custom')
  }
  function removeBucket(idx: number) {
    setBuckets(prev => prev.filter((_, i) => i !== idx))
  }

  const totalIncome = summary?.income ?? 0
  const totalExpense = summary?.expense ?? 0
  const totalPct = buckets.reduce((s, b) => s + b.pct, 0)

  return (
    <div className="income-page">
      {/* Header */}
      <div className="income-header">
        <div>
          <h1 className="income-title">Income</h1>
          <p className="income-subtitle">Track earnings and plan your distribution</p>
        </div>
        <div className="income-month-nav">
          <button className="month-btn" onClick={() => setMonth(prevMonth(month))}>‹</button>
          <span className="income-month-label">{monthLabel(month)}</span>
          <button className="month-btn" onClick={() => setMonth(nextMonth(month))} disabled={month >= currentMonth()}>›</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="income-summary-row">
        <div className="income-stat-card income-stat-card--income">
          <span className="income-stat-label">Total Income</span>
          <span className="income-stat-value">{formatCurrency(totalIncome, currency)}</span>
        </div>
        <div className="income-stat-card income-stat-card--expense">
          <span className="income-stat-label">Total Spent</span>
          <span className="income-stat-value">{formatCurrency(totalExpense, currency)}</span>
        </div>
        <div className={`income-stat-card income-stat-card--${totalIncome - totalExpense >= 0 ? 'net' : 'deficit'}`}>
          <span className="income-stat-label">{totalIncome - totalExpense >= 0 ? 'Remaining' : 'Deficit'}</span>
          <span className="income-stat-value">{formatCurrency(Math.abs(totalIncome - totalExpense), currency)}</span>
        </div>
      </div>

      <div className="income-body">
        {/* Distribution planner */}
        <div className="income-planner">
          <div className="income-planner-header">
            <h2 className="income-section-title">Distribution Plan</h2>
            <div className="income-presets">
              {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map(key => (
                <button
                  key={key}
                  className={'income-preset-btn' + (preset === key ? ' income-preset-btn--on' : '')}
                  onClick={() => applyPreset(key)}
                >{key}</button>
              ))}
            </div>
          </div>

          {/* Visual bar */}
          {totalPct > 0 && (
            <div className="income-dist-bar">
              {buckets.map((b, i) => (
                <div
                  key={i}
                  className="income-dist-segment"
                  style={{ width: `${(b.pct / Math.max(totalPct, 100)) * 100}%`, background: b.color }}
                  title={`${b.label}: ${b.pct}%`}
                />
              ))}
            </div>
          )}

          <div className="income-buckets">
            {buckets.map((b, i) => {
              const amount = totalIncome > 0 ? (totalIncome * b.pct) / 100 : 0
              return (
                <div key={i} className="income-bucket-row">
                  <span className="income-bucket-icon">{b.icon}</span>
                  <input
                    type="text"
                    value={b.label}
                    onChange={e => { updateLabel(i, e.target.value); setPreset('Custom') }}
                    className="income-bucket-label-input"
                  />
                  <div className="income-bucket-pct-wrap">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={b.pct}
                      onChange={e => { updatePct(i, e.target.value); setPreset('Custom') }}
                      className="income-bucket-pct-input"
                    />
                    <span className="income-bucket-pct-sign">%</span>
                  </div>
                  <span className="income-bucket-amount" style={{ color: b.color }}>
                    {totalIncome > 0 ? formatCurrency(amount, currency) : '—'}
                  </span>
                  <button className="income-bucket-remove" onClick={() => removeBucket(i)}>✕</button>
                </div>
              )
            })}
          </div>

          <div className="income-planner-footer">
            <div className={`income-pct-total ${totalPct !== 100 ? 'income-pct-total--warn' : 'income-pct-total--ok'}`}>
              Total: {totalPct}%{totalPct !== 100 && ` — ${totalPct < 100 ? 100 - totalPct + '% unallocated' : totalPct - 100 + '% over'}`}
            </div>
            <button className="income-add-bucket-btn" onClick={addBucket}>+ Add bucket</button>
          </div>
        </div>

        {/* Income transactions */}
        <div className="income-txns">
          <h2 className="income-section-title">Earnings this month</h2>
          {incomeTxns.length === 0 ? (
            <div className="income-empty">No income recorded for {monthLabel(month)}.</div>
          ) : (
            <div className="income-txn-list">
              {incomeTxns.map(t => (
                <div key={t.id} className="income-txn-row">
                  <div className="income-txn-icon" style={{ background: t.category_color + '18', color: t.category_color }}>
                    {t.category_icon}
                  </div>
                  <div className="income-txn-info">
                    <span className="income-txn-name">{t.note || t.category_name}</span>
                    <span className="income-txn-meta">{t.category_name} · {t.txn_date}</span>
                  </div>
                  <span className="income-txn-amount">+{formatCurrency(t.amount, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

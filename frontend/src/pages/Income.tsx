import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { MonthlySummary, Transaction } from '../types'
import { currentMonth, formatCurrency } from '../types'
import '../styles/income.css'

interface Bucket {
  label: string
  pct: number
  color: string
  icon: string
}

const PRESETS: Record<string, Bucket[]> = {
  '50/30/20': [
    { label: 'Living Expenses', pct: 50, color: '#1a472a', icon: '🏠' },
    { label: 'Wants',           pct: 30, color: '#4a7fa5', icon: '🎬' },
    { label: 'Savings',         pct: 20, color: '#2e7d52', icon: '💰' },
  ],
  '60/20/20': [
    { label: 'Living Expenses', pct: 60, color: '#1a472a', icon: '🏠' },
    { label: 'Savings',         pct: 20, color: '#2e7d52', icon: '💰' },
    { label: 'Investments',     pct: 20, color: '#357abd', icon: '📈' },
  ],
  'Custom': [
    { label: 'Daily Budget',    pct: 50, color: '#1a472a', icon: '🏠' },
    { label: 'Savings',         pct: 20, color: '#2e7d52', icon: '💰' },
    { label: 'Emergency Fund',  pct: 10, color: '#c0392b', icon: '🆘' },
    { label: 'Family',          pct: 20, color: '#8b5e83', icon: '👨‍👩‍👧' },
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
function daysInMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo, 0).getDate()
}
function daysLeft(m: string) {
  const today = new Date()
  const [y, mo] = m.split('-').map(Number)
  if (today.getFullYear() !== y || today.getMonth() + 1 !== mo) return null
  return daysInMonth(m) - today.getDate() + 1
}

// Transfer modal
interface TransferState { fromIdx: number; toIdx: number; amount: string }

export default function Income() {
  const { user } = useAuth()
  const currency = user?.currency ?? 'INR'
  const uid = user?.id ?? 'guest'
  const [month, setMonth] = useState(currentMonth())
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [expenseTxns, setExpenseTxns] = useState<Transaction[]>([])
  const [incomeTxns, setIncomeTxns] = useState<Transaction[]>([])
  const [preset, setPreset] = useState<string>(() => localStorage.getItem(`fincura_preset_${uid}`) ?? 'Custom')
  const [buckets, setBuckets] = useState<Bucket[]>(() => {
    try {
      const raw = localStorage.getItem(`fincura_buckets_${uid}`)
      if (raw) return JSON.parse(raw) as Bucket[]
    } catch { /* ignore */ }
    return PRESETS['Custom'].map(b => ({ ...b }))
  })
  const [transfer, setTransfer] = useState<TransferState | null>(null)
  const [editIncome, setEditIncome] = useState(false)
  const [manualIncome, setManualIncome] = useState<string>(() =>
    localStorage.getItem(`fincura_income_${uid}_${currentMonth()}`) ?? ''
  )

  function load() {
    api.get<MonthlySummary>(`/charts/summary?month=${month}`).then(s => {
      setSummary(s)
      // Only fall back to actual income if no manual value is stored for this month
      const stored = localStorage.getItem(`fincura_income_${uid}_${month}`)
      if (!stored) setManualIncome(String(s.income || ''))
    })
    api.get<Transaction[]>(`/transactions?month=${month}&type=expense&limit=200`).then(setExpenseTxns)
    api.get<Transaction[]>(`/transactions?month=${month}&type=income&limit=100`).then(setIncomeTxns)
  }

  useEffect(() => {
    // Restore persisted income for this month before loading
    const stored = localStorage.getItem(`fincura_income_${uid}_${month}`)
    if (stored) setManualIncome(stored)
    load()
  }, [month])

  function applyPreset(key: string) {
    setPreset(key)
    const next = PRESETS[key].map(b => ({ ...b }))
    setBuckets(next)
    localStorage.setItem(`fincura_buckets_${uid}`, JSON.stringify(next))
    localStorage.setItem(`fincura_preset_${uid}`, key)
  }

  function updatePct(idx: number, val: string) {
    setBuckets(prev => {
      const next = prev.map((b, i) => i === idx ? { ...b, pct: Math.max(0, Math.min(100, Number(val) || 0)) } : b)
      localStorage.setItem(`fincura_buckets_${uid}`, JSON.stringify(next))
      return next
    })
    setPreset('Custom')
    localStorage.setItem(`fincura_preset_${uid}`, 'Custom')
  }
  function updateLabel(idx: number, val: string) {
    setBuckets(prev => {
      const next = prev.map((b, i) => i === idx ? { ...b, label: val } : b)
      localStorage.setItem(`fincura_buckets_${uid}`, JSON.stringify(next))
      return next
    })
  }
  function addBucket() {
    setBuckets(prev => {
      const next = [...prev, { label: 'New bucket', pct: 0, color: '#6b6b6b', icon: '◎' }]
      localStorage.setItem(`fincura_buckets_${uid}`, JSON.stringify(next))
      return next
    })
    setPreset('Custom')
    localStorage.setItem(`fincura_preset_${uid}`, 'Custom')
  }
  function removeBucket(idx: number) {
    setBuckets(prev => {
      const next = prev.filter((_, i) => i !== idx)
      localStorage.setItem(`fincura_buckets_${uid}`, JSON.stringify(next))
      return next
    })
  }

  function doTransfer() {
    if (!transfer) return
    const amt = parseFloat(transfer.amount) || 0
    if (amt <= 0) { setTransfer(null); return }
    const totalIncome = parseFloat(manualIncome) || summary?.income || 0
    if (totalIncome <= 0) { setTransfer(null); return }
    setBuckets(prev => {
      const next = prev.map(b => ({ ...b }))
      const fromPctDelta = (amt / totalIncome) * 100
      next[transfer.fromIdx].pct = Math.max(0, next[transfer.fromIdx].pct - fromPctDelta)
      next[transfer.toIdx].pct = next[transfer.toIdx].pct + fromPctDelta
      // Round to 1 decimal
      next[transfer.fromIdx].pct = Math.round(next[transfer.fromIdx].pct * 10) / 10
      next[transfer.toIdx].pct = Math.round(next[transfer.toIdx].pct * 10) / 10
      localStorage.setItem(`fincura_buckets_${uid}`, JSON.stringify(next))
      return next
    })
    setTransfer(null)
    setPreset('Custom')
  }

  const totalIncome = parseFloat(manualIncome) || summary?.income || 0
  const totalExpense = summary?.expense ?? 0
  const totalPct = Math.round(buckets.reduce((s, b) => s + b.pct, 0) * 10) / 10
  const remaining = totalIncome - totalExpense

  // "Daily budget" is the first bucket that looks like a spending bucket
  const dailyBucket = buckets[0]
  const dailyAlloc = totalIncome > 0 ? (totalIncome * dailyBucket.pct) / 100 : 0
  const left = daysLeft(month)
  const dailyRemaining = dailyAlloc - totalExpense
  const dailyRate = left && dailyRemaining > 0 ? dailyRemaining / left : null

  return (
    <div className="income-page">
      {/* Header */}
      <div className="income-header">
        <div>
          <h1 className="income-title">Income & Budget Plan</h1>
          <p className="income-subtitle">Set your income once · allocate buckets · track actual spend</p>
        </div>
        <div className="income-month-nav">
          <button className="month-btn" onClick={() => setMonth(prevMonth(month))}>‹</button>
          <span className="income-month-label">{monthLabel(month)}</span>
          <button className="month-btn" onClick={() => setMonth(nextMonth(month))} disabled={month >= currentMonth()}>›</button>
        </div>
      </div>

      {/* Income setter */}
      <div className="income-set-row">
        <div className="income-set-label">Monthly income</div>
        {editIncome ? (
          <div className="income-set-edit">
            <span className="income-set-symbol">{currency === 'INR' ? '₹' : '$'}</span>
            <input
              type="number"
              className="income-set-input"
              value={manualIncome}
              onChange={e => setManualIncome(e.target.value)}
              autoFocus
              placeholder="0"
            />
          <button className="income-set-save" onClick={() => {
              localStorage.setItem(`fincura_income_${uid}_${month}`, manualIncome)
              setEditIncome(false)
            }}>Done</button>
          </div>
        ) : (
          <div className="income-set-display">
            <span className="income-set-value">{formatCurrency(totalIncome, currency)}</span>
            <button className="income-set-edit-btn" onClick={() => setEditIncome(true)}>Edit</button>
          </div>
        )}
      </div>

      {/* Summary strip */}
      <div className="income-summary-row">
        <div className="income-stat-card income-stat-card--income">
          <span className="income-stat-label">Allocated</span>
          <span className="income-stat-value">{formatCurrency(totalIncome, currency)}</span>
        </div>
        <div className="income-stat-card income-stat-card--expense">
          <span className="income-stat-label">Spent so far</span>
          <span className="income-stat-value">{formatCurrency(totalExpense, currency)}</span>
        </div>
        <div className={`income-stat-card income-stat-card--${remaining >= 0 ? 'net' : 'deficit'}`}>
          <span className="income-stat-label">{remaining >= 0 ? 'Remaining' : 'Over budget'}</span>
          <span className="income-stat-value">{formatCurrency(Math.abs(remaining), currency)}</span>
        </div>
        {dailyRate !== null && (
          <div className="income-stat-card income-stat-card--daily">
            <span className="income-stat-label">Daily budget left</span>
            <span className="income-stat-value">{formatCurrency(Math.round(dailyRate), currency)}/day</span>
            <span className="income-stat-sub">{left} days left</span>
          </div>
        )}
      </div>

      <div className="income-body">
        {/* Bucket planner */}
        <div className="income-planner">
          <div className="income-planner-header">
            <h2 className="income-section-title">Budget Buckets</h2>
            <div className="income-presets">
              {Object.keys(PRESETS).map(key => (
                <button
                  key={key}
                  className={'income-preset-btn' + (preset === key ? ' income-preset-btn--on' : '')}
                  onClick={() => applyPreset(key)}
                >{key}</button>
              ))}
            </div>
          </div>

          {/* Visual allocation bar */}
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

          {/* Bucket rows with spend tracking */}
          <div className="income-buckets">
            {buckets.map((b, i) => {
              const alloc = totalIncome > 0 ? (totalIncome * b.pct) / 100 : 0
              // First bucket = daily expenses, so compare to total expense spend
              const spent = i === 0 ? totalExpense : 0
              const bucketRemaining = alloc - spent
              const spentPct = alloc > 0 ? Math.min((spent / alloc) * 100, 100) : 0
              const barColor = spentPct >= 100 ? 'var(--expense)' : spentPct >= 75 ? '#d97706' : b.color

              return (
                <div key={i} className="income-bucket-card">
                  <div className="income-bucket-top">
                    <span className="income-bucket-icon">{b.icon}</span>
                    <input
                      type="text"
                      value={b.label}
                      onChange={e => updateLabel(i, e.target.value)}
                      className="income-bucket-label-input"
                    />
                    <div className="income-bucket-pct-wrap">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={b.pct}
                        onChange={e => updatePct(i, e.target.value)}
                        className="income-bucket-pct-input"
                      />
                      <span className="income-bucket-pct-sign">%</span>
                    </div>
                    <span className="income-bucket-alloc" style={{ color: b.color }}>
                      {totalIncome > 0 ? formatCurrency(alloc, currency) : '—'}
                    </span>
                    <button className="income-bucket-remove" onClick={() => removeBucket(i)} title="Remove">✕</button>
                  </div>

                  {/* Spend bar — only for first bucket (expenses) */}
                  {i === 0 && totalIncome > 0 && (
                    <div className="income-bucket-spend">
                      <div className="income-bucket-bar-bg">
                        <div className="income-bucket-bar-fill" style={{ width: `${spentPct}%`, background: barColor }} />
                      </div>
                      <div className="income-bucket-spend-row">
                        <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>
                          Spent {formatCurrency(spent, currency)}
                        </span>
                        <span style={{ color: bucketRemaining >= 0 ? b.color : 'var(--expense)', fontSize: '0.75rem', fontWeight: 600 }}>
                          {bucketRemaining >= 0 ? `${formatCurrency(bucketRemaining, currency)} left` : `${formatCurrency(Math.abs(bucketRemaining), currency)} over`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Transfer button */}
                  {totalIncome > 0 && buckets.length > 1 && (
                    <button
                      className="income-transfer-btn"
                      onClick={() => setTransfer({ fromIdx: i === 0 ? 1 : 0, toIdx: i === 0 ? 0 : i, amount: '' })}
                    >
                      ⇄ Move budget
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="income-planner-footer">
            <div className={`income-pct-total ${totalPct !== 100 ? 'income-pct-total--warn' : 'income-pct-total--ok'}`}>
              Total: {totalPct}%{totalPct < 100 ? ` · ${Math.round((100 - totalPct) * 10) / 10}% unallocated` : totalPct > 100 ? ` · ${Math.round((totalPct - 100) * 10) / 10}% over` : ''}
            </div>
            <button className="income-add-bucket-btn" onClick={addBucket}>+ Add bucket</button>
          </div>
        </div>

        {/* Earnings list */}
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

          {/* Recent expenses summary */}
          {expenseTxns.length > 0 && (
            <>
              <h2 className="income-section-title" style={{ marginTop: '1.25rem' }}>Recent expenses</h2>
              <div className="income-txn-list">
                {expenseTxns.slice(0, 5).map(t => (
                  <div key={t.id} className="income-txn-row">
                    <div className="income-txn-icon" style={{ background: t.category_color + '18', color: t.category_color }}>
                      {t.category_icon}
                    </div>
                    <div className="income-txn-info">
                      <span className="income-txn-name">{t.note || t.category_name}</span>
                      <span className="income-txn-meta">{t.category_name} · {t.txn_date}</span>
                    </div>
                    <span className="income-txn-amount" style={{ color: 'var(--expense)' }}>−{formatCurrency(t.amount, currency)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Transfer modal */}
      {transfer && (
        <div className="modal-overlay" onClick={() => setTransfer(null)}>
          <div className="modal-card" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Move budget</h2>
              <button className="modal-close" onClick={() => setTransfer(null)}>✕</button>
            </div>
            <div style={{ padding: '0 0 1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label className="form-label">
                From bucket
                <select
                  className="form-input"
                  value={transfer.fromIdx}
                  onChange={e => setTransfer(t => t ? { ...t, fromIdx: parseInt(e.target.value) } : null)}
                >
                  {buckets.map((b, i) => i !== transfer.toIdx && (
                    <option key={i} value={i}>{b.icon} {b.label} ({formatCurrency((totalIncome * b.pct) / 100, currency)})</option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                To bucket
                <select
                  className="form-input"
                  value={transfer.toIdx}
                  onChange={e => setTransfer(t => t ? { ...t, toIdx: parseInt(e.target.value) } : null)}
                >
                  {buckets.map((b, i) => i !== transfer.fromIdx && (
                    <option key={i} value={i}>{b.icon} {b.label}</option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Amount to move
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="form-input"
                  value={transfer.amount}
                  onChange={e => setTransfer(t => t ? { ...t, amount: e.target.value } : null)}
                  autoFocus
                  placeholder="0"
                />
              </label>
              <button className="btn-primary btn-full" onClick={doTransfer}>Move budget</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

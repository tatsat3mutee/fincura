import type { Goal } from '../types'
import { formatCurrency } from '../types'

interface Props {
  goal: Goal
  currency: string
  onDeposit: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function GoalCard({ goal, currency, onDeposit, onEdit, onDelete }: Props) {
  const pct = goal.target_amount > 0 ? Math.min((goal.saved_amount / goal.target_amount) * 100, 100) : 0
  const remaining = goal.target_amount - goal.saved_amount
  const daysLeft = goal.target_date
    ? Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / 86400000)
    : null

  return (
    <div className={`goal-card goal-card--${goal.status}`}>
      <div className="goal-card-top">
        <div className="goal-icon" style={{ background: goal.color + '22', color: goal.color }}>
          {goal.icon}
        </div>
        <div className="goal-info">
          <span className="goal-name">{goal.name}</span>
          {goal.status !== 'active' && (
            <span className={`goal-status-badge goal-status-badge--${goal.status}`}>
              {goal.status}
            </span>
          )}
        </div>
        <div className="goal-actions">
          <button className="txn-action-btn" onClick={onEdit} title="Edit">✎</button>
          <button className="txn-action-btn txn-action-btn--del" onClick={onDelete} title="Delete">✕</button>
        </div>
      </div>

      <div className="goal-progress-track">
        <div className="goal-progress-fill" style={{ width: `${pct}%`, background: goal.color }} />
      </div>

      <div className="goal-stats">
        <div className="goal-stat">
          <span className="goal-stat-val" style={{ color: goal.color }}>{formatCurrency(goal.saved_amount, currency)}</span>
          <span className="goal-stat-label">saved</span>
        </div>
        <div className="goal-stat goal-stat--center">
          <span className="goal-stat-val">{Math.round(pct)}%</span>
          <span className="goal-stat-label">complete</span>
        </div>
        <div className="goal-stat goal-stat--right">
          <span className="goal-stat-val">{formatCurrency(goal.target_amount, currency)}</span>
          <span className="goal-stat-label">target</span>
        </div>
      </div>

      {remaining > 0 && (
        <div className="goal-footer">
          <span className="goal-remaining">{formatCurrency(remaining, currency)} to go</span>
          {daysLeft !== null && (
            <span className={`goal-days ${daysLeft < 0 ? 'goal-days--overdue' : ''}`}>
              {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
            </span>
          )}
        </div>
      )}

      {(goal.scheme_type || goal.institution) && (
        <div className="goal-scheme-row">
          {goal.scheme_type && <span className="goal-scheme-badge">{goal.scheme_type}</span>}
          {goal.institution && <span className="goal-scheme-inst">@ {goal.institution}</span>}
        </div>
      )}

      {goal.status === 'active' && (
        <button className="goal-deposit-btn" onClick={onDeposit}>+ Deposit</button>
      )}
    </div>
  )
}

import type { Budget } from '../types'
import { formatCurrency } from '../types'

interface Props {
  budget: Budget
  currency: string
  onEdit: () => void
  onDelete: () => void
}

const PERIOD_LABELS: Record<number, string> = { 1: '1 mo', 2: '2 mo', 3: '3 mo', 6: '6 mo', 12: '1 yr' }

export default function BudgetBar({ budget, currency, onEdit, onDelete }: Props) {
  const pct = budget.limit_amount > 0 ? (budget.spent / budget.limit_amount) * 100 : 0
  const color = pct >= 100 ? '#c0392b' : pct >= 75 ? '#d97706' : '#2e7d52'
  const periodLabel = PERIOD_LABELS[budget.period_months] ?? `${budget.period_months} mo`

  return (
    <div className="budget-row">
      <div className="budget-row-top">
        <div className="budget-cat">
          <span className="budget-cat-icon" style={{ background: budget.category_color + '22', color: budget.category_color }}>
            {budget.category_icon}
          </span>
          <span className="budget-cat-name">{budget.category_name}</span>
          {budget.period_months > 1 && (
            <span className="budget-period-badge">{periodLabel}</span>
          )}
        </div>
        <div className="budget-row-actions">
          <button className="txn-action-btn" onClick={onEdit} title="Edit">✎</button>
          <button className="txn-action-btn txn-action-btn--del" onClick={onDelete} title="Delete">✕</button>
        </div>
      </div>
      <div className="budget-bar-track">
        <div
          className="budget-bar-fill"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
        {/* Marker lines at 50% and 75% */}
        <div className="budget-bar-marker" style={{ left: '50%' }} />
        <div className="budget-bar-marker" style={{ left: '75%' }} />
      </div>
      <div className="budget-bar-labels">
        <span style={{ color }}>{formatCurrency(budget.spent, currency)}</span>
        <span className="budget-bar-limit">of {formatCurrency(budget.limit_amount, currency)} · {Math.round(pct)}%</span>
      </div>
    </div>
  )
}

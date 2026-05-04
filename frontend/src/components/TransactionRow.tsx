import type { Transaction } from '../types'
import { formatCurrency } from '../types'

interface Props {
  transaction: Transaction
  currency: string
  onEdit?: () => void
  onDelete?: () => void
}

export default function TransactionRow({ transaction: t, currency, onEdit, onDelete }: Props) {
  return (
    <div className="txn-row">
      <div className="txn-row-icon" style={{ background: t.category_color + '22', color: t.category_color }}>
        {t.category_icon}
      </div>
      <div className="txn-row-info">
        <span className="txn-row-note">{t.note || t.category_name}{t.is_recurring && <span className="txn-recurring-badge" title={`Repeats ${t.recurrence_rule}`}>↻</span>}</span>
        <span className="txn-row-meta">{t.category_name} · {t.txn_date}</span>
      </div>
      <div className={`txn-row-amount txn-row-amount--${t.type}`}>
        {t.type === 'expense' ? '−' : '+'}{formatCurrency(t.amount, currency)}
      </div>
      {(onEdit || onDelete) && (
        <div className="txn-row-actions">
          {onEdit && <button className="txn-action-btn" onClick={onEdit} title="Edit">✎</button>}
          {onDelete && <button className="txn-action-btn txn-action-btn--del" onClick={onDelete} title="Delete">✕</button>}
        </div>
      )}
    </div>
  )
}

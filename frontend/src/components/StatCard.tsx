interface Props {
  label: string
  value: string
  color: 'income' | 'expense' | 'neutral'
  sub?: string
}

export default function StatCard({ label, value, color, sub }: Props) {
  return (
    <div className={`stat-card stat-card--${color}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

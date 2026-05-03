interface Props {
  label: string
  value: string
  color: 'income' | 'expense' | 'neutral'
}

export default function StatCard({ label, value, color }: Props) {
  return (
    <div className={`stat-card stat-card--${color}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}

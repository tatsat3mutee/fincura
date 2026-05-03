import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../../api/client'
import type { CategoryBreakdown } from '../../types'
import { formatCurrency } from '../../types'

interface Props { month: string; currency: string; refreshKey?: number }

export default function CategoryDonutChart({ month, currency, refreshKey }: Props) {
  const [data, setData] = useState<CategoryBreakdown | null>(null)

  useEffect(() => {
    setData(null)
    api.get<CategoryBreakdown>(`/charts/category-breakdown?month=${month}`).then(setData)
  }, [month, refreshKey])

  if (!data || data.labels.length === 0) {
    return <div className="chart-placeholder">No expense data.</div>
  }

  const chartData = data.labels.map((label, i) => ({
    name: label,
    value: data.amounts[i],
    color: data.colors[i],
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
          dataKey="value"
        >
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
      </PieChart>
    </ResponsiveContainer>
  )
}

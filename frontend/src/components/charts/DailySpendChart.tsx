import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../../api/client'
import type { DailySpend } from '../../types'
import { formatCurrency } from '../../types'

interface Props { month: string; currency: string; refreshKey?: number }

export default function DailySpendChart({ month, currency, refreshKey }: Props) {
  const [data, setData] = useState<DailySpend | null>(null)

  useEffect(() => {
    setData(null)
    api.get<DailySpend>(`/charts/daily-spend?month=${month}`).then(setData)
  }, [month, refreshKey])

  if (!data) return <div className="chart-placeholder">Loading…</div>

  const chartData = data.labels.map((label, i) => ({
    day: label,
    amount: data.amounts[i],
  }))

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={chartData} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#e2ddd5" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6b6b6b' }} axisLine={false} tickLine={false}
          interval={Math.floor(chartData.length / 10)} />
        <YAxis tick={{ fontSize: 11, fill: '#6b6b6b' }} axisLine={false} tickLine={false}
          tickFormatter={v => formatCurrency(v, currency)} width={80} />
        <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
        <Bar dataKey="amount" fill="#c0392b" radius={[3, 3, 0, 0]} name="Spent" />
      </BarChart>
    </ResponsiveContainer>
  )
}

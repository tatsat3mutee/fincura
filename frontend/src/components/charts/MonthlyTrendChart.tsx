import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { api } from '../../api/client'
import type { MonthlyTrendData } from '../../types'
import { formatCurrency } from '../../types'

interface Props { currency: string }

export default function MonthlyTrendChart({ currency }: Props) {
  const [data, setData] = useState<MonthlyTrendData | null>(null)

  useEffect(() => {
    api.get<MonthlyTrendData>('/charts/monthly-trend?months=6').then(setData)
  }, [])

  if (!data) return <div className="chart-placeholder">Loading…</div>

  const chartData = data.labels.map((label, i) => ({
    month: label,
    income: data.income[i],
    expense: data.expense[i],
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2ddd5" />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6b6b6b' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#6b6b6b' }} axisLine={false} tickLine={false}
          tickFormatter={v => formatCurrency(v, currency)} width={80} />
        <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
        <Legend />
        <Line type="monotone" dataKey="income" stroke="#2e7d52" strokeWidth={2} dot={false} name="Income" />
        <Line type="monotone" dataKey="expense" stroke="#c0392b" strokeWidth={2} dot={false} name="Expense" />
      </LineChart>
    </ResponsiveContainer>
  )
}

export interface User {
  id: number
  name: string
  email: string
  currency: string
  created_at: string
}

export interface Transaction {
  id: number
  user_id: number
  category_id: number
  type: 'expense' | 'income'
  amount: number
  note: string | null
  txn_date: string
  visibility: 'personal' | 'shared'
  created_at: string
  updated_at: string
  category_name: string
  category_icon: string
  category_color: string
}

export interface Category {
  id: number
  name: string
  icon: string
  color: string
  type: 'expense' | 'income' | 'both'
}

export interface MonthlySummary {
  income: number
  expense: number
  net: number
}

export interface MonthlyTrendData {
  labels: string[]
  income: number[]
  expense: number[]
}

export interface CategoryBreakdown {
  labels: string[]
  amounts: number[]
  colors: string[]
  icons: string[]
}

export interface DailySpend {
  labels: string[]
  amounts: number[]
}

export interface Budget {
  id: number
  category_id: number
  month: string
  limit_amount: number
  period_months: number
  spent: number
  category_name: string
  category_icon: string
  category_color: string
}

export interface Goal {
  id: number
  name: string
  target_amount: number
  saved_amount: number
  target_date: string | null
  icon: string
  color: string
  status: 'active' | 'completed' | 'paused'
  scheme_type: string | null
  institution: string | null
  scheme_notes: string | null
  created_at: string
  updated_at: string
}

export interface HouseholdMember {
  id: number
  name: string
  email: string
  role: 'owner' | 'member'
  joined_at: string
}

export interface Household {
  id: number
  name: string
  invite_code: string
  created_by: number
  created_at: string
  role: string
  members: HouseholdMember[]
}

export interface UserStats {
  total_txns: number
  total_spent: number
  total_earned: number
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface SplitMember {
  id: number
  name: string
  share_amount: number
  paid: boolean
}

export interface Split {
  id: number
  title: string
  total_amount: number
  created_at: string
  members: SplitMember[]
}


export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}


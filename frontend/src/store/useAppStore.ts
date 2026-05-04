import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

export interface HouseholdState {
  id: number
  name: string
  invite_code: string
  role: 'owner' | 'member'
}

interface AppStore {
  // ── Month selector — shared across Dashboard, Transactions, Budgets, Charts ──
  selectedMonth: string   // YYYY-MM
  setSelectedMonth: (month: string) => void

  // ── Household — needed across Transactions, Goals, Budgets, Household page ──
  household: HouseholdState | null
  setHousehold: (h: HouseholdState | null) => void

  // ── Global toast queue ─────────────────────────────────────────────────────
  toasts: Toast[]
  addToast: (type: Toast['type'], message: string) => void
  removeToast: (id: string) => void

  // ── Mutation signal — pages re-fetch when this changes ────────────────────
  lastMutatedAt: number
  triggerRefresh: () => void
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const useAppStore = create<AppStore>()(
  devtools(
    (set) => ({
      selectedMonth: currentMonth(),
      setSelectedMonth: (month) => set({ selectedMonth: month }, false, 'setSelectedMonth'),

      household: null,
      setHousehold: (h) => set({ household: h }, false, 'setHousehold'),

      toasts: [],
      addToast: (type, message) =>
        set(
          (s) => ({
            toasts: [...s.toasts, { id: `${Date.now()}-${Math.random()}`, type, message }],
          }),
          false,
          'addToast',
        ),
      removeToast: (id) =>
        set(
          (s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }),
          false,
          'removeToast',
        ),

      lastMutatedAt: 0,
      triggerRefresh: () => set({ lastMutatedAt: Date.now() }, false, 'triggerRefresh'),
    }),
    { name: 'FincuraStore' },
  ),
)

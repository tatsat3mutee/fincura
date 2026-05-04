import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setAccessToken, attemptTokenRefresh } from '../api/client'

export interface User {
  id: number
  name: string
  email: string
  currency: string
  created_at: string
  email_verified: boolean
}

interface AuthState {
  user: User | null
  loading: boolean
  login: (accessToken: string, user: User) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // On mount: try to get a fresh access token via the httpOnly refresh cookie.
    // No localStorage reads — the cookie is sent automatically by the browser.
    attemptTokenRefresh()
      .then(async (ok) => {
        if (ok) {
          const me = await api.get<User>('/auth/me').catch(() => null)
          setUser(me)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  function login(accessToken: string, newUser: User) {
    setAccessToken(accessToken)
    setUser(newUser)
  }

  async function logout() {
    try {
      await api.post('/auth/logout', {})
    } catch {
      // ignore — clear local state regardless
    }
    setAccessToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}


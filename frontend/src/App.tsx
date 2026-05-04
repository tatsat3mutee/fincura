import { type ReactNode, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { pingBackend } from './api/client'
import Sidebar from './components/Sidebar'
import { ToastContainer } from './components/ToastContainer'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import Transactions from './pages/Transactions'
import OAuthCallback from './pages/OAuthCallback'
import Goals from './pages/Goals'
import Household from './pages/Household'
import Profile from './pages/Profile'
import Calculators from './pages/Calculators'
import Splits from './pages/Splits'
import Income from './pages/Income'
import Import from './pages/Import'
import VerifyEmail from './pages/VerifyEmail'
import './styles/layout.css'

function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  function close() { setSidebarOpen(false) }

  return (
    <div className="app-layout">
      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <span className="mobile-topbar-logo">Fincura</span>
        <button
          className={`mobile-menu-btn ${sidebarOpen ? 'open' : ''}`}
          onClick={() => setSidebarOpen(v => !v)}
          aria-label="Toggle menu"
        >
          <span /><span /><span />
        </button>
      </div>

      {/* Overlay behind sidebar on mobile */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'sidebar-overlay--visible' : ''}`}
        onClick={close}
      />

      <Sidebar open={sidebarOpen} onNavClick={close} />
      <main className="app-main" key={location.pathname}>{children}</main>
    </div>
  )
}

function PrivateRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-loading">Loading…</div>
  return user ? <AppLayout>{children}</AppLayout> : <Navigate to="/login" replace />
}

function WakeUpBanner() {
  const [show, setShow] = useState(false)
  const [done, setDone] = useState(false)
  const pinged = useRef(false)

  useEffect(() => {
    if (pinged.current || !import.meta.env.VITE_API_URL) return
    pinged.current = true
    // Only show banner if backend takes > 1.5s to respond
    const timer = setTimeout(() => setShow(true), 1500)
    pingBackend().then(() => {
      clearTimeout(timer)
      if (show) { setDone(true); setTimeout(() => setShow(false), 2000) }
      else { clearTimeout(timer); setShow(false) }
    })
    return () => clearTimeout(timer)
  }, [])

  if (!show) return null
  return (
    <div className="wakeup-banner">
      <span className="wakeup-dot" />
      {done ? '✓ Server ready' : 'Server waking up — first load may take ~30s…'}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <WakeUpBanner />
      <AuthProvider>
        <ToastContainer />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/oauth-callback" element={<OAuthCallback />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
          <Route path="/income" element={<PrivateRoute><Income /></PrivateRoute>} />
          <Route path="/budgets" element={<Navigate to="/transactions" replace />} />
          <Route path="/goals" element={<PrivateRoute><Goals /></PrivateRoute>} />
          <Route path="/household" element={<PrivateRoute><Household /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="/calculators" element={<PrivateRoute><Calculators /></PrivateRoute>} />
          <Route path="/splits" element={<PrivateRoute><Splits /></PrivateRoute>} />
          <Route path="/import" element={<PrivateRoute><Import /></PrivateRoute>} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

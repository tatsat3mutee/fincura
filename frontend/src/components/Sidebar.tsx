import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/sidebar.css'

function NavIcon({ name }: { name: string }) {
  const s = { width: 16, height: 16, fill: 'none' as const, stroke: 'currentColor' as const, strokeWidth: 1.75, viewBox: '0 0 24 24' }
  switch (name) {
    case 'dashboard': return (
      <svg {...s}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    )
    case 'transactions': return (
      <svg {...s}><path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4"/></svg>
    )
    case 'income': return (
      <svg {...s}><path d="M12 19V5m-7 7 7-7 7 7"/></svg>
    )
    case 'goals': return (
      <svg {...s}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>
    )
    case 'budgets': return (
      <svg {...s}><rect x="3" y="14" width="4" height="7" rx="1"/><rect x="10" y="9" width="4" height="12" rx="1"/><rect x="17" y="4" width="4" height="17" rx="1"/></svg>
    )
    case 'splits': return (
      <svg {...s}><path d="M16 3h5v5M8 21H3v-5"/><path d="M21 3 9 15M3 21l6-6"/></svg>
    )
    case 'import': return (
      <svg {...s}><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M20 21H4"/></svg>
    )
    case 'calculators': return (
      <svg {...s}><rect x="4" y="2" width="16" height="20" rx="2"/><rect x="7" y="5" width="10" height="4" rx="1"/><circle cx="8" cy="14" r="1" fill="currentColor"/><circle cx="12" cy="14" r="1" fill="currentColor"/><circle cx="16" cy="14" r="1" fill="currentColor"/><circle cx="8" cy="18" r="1" fill="currentColor"/><circle cx="12" cy="18" r="1" fill="currentColor"/><circle cx="16" cy="18" r="1" fill="currentColor"/></svg>
    )
    case 'household': return (
      <svg {...s}><path d="M3 12 12 3l9 9"/><path d="M9 21V12h6v9"/><path d="M3 21h18"/></svg>
    )
    case 'referral': return (
      <svg {...s}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
    )
    case 'profile': return (
      <svg {...s}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
    )
    default: return null
  }
}

const NAV = [
  { to: '/dashboard',    label: 'Dashboard',    icon: 'dashboard' },
  { to: '/transactions', label: 'Transactions', icon: 'transactions' },
  { to: '/income',       label: 'Income',       icon: 'income' },
  { to: '/budgets',      label: 'Budgets',      icon: 'budgets' },
  { to: '/goals',        label: 'Goals',        icon: 'goals' },
  { to: '/splits',       label: 'Splits',       icon: 'splits' },
  { to: '/import',       label: 'Import',       icon: 'import' },
  { to: '/calculators',  label: 'Calculators',  icon: 'calculators' },
  { to: '/household',    label: 'Household',    icon: 'household' },
  { to: '/referral',     label: 'Refer & Earn', icon: 'referral' },
  { to: '/profile',      label: 'Profile',      icon: 'profile' },
]

interface Props {
  open?: boolean
  onNavClick?: () => void
}

export default function Sidebar({ open, onNavClick }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <nav className={`sidebar ${open ? 'sidebar--open' : ''}`}>
      <div className="sidebar-logo">Fincura</div>

      <ul className="sidebar-nav">
        {NAV.map(({ to, label, icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              onClick={onNavClick}
              className={({ isActive }) =>
                'sidebar-link' + (isActive ? ' sidebar-link--active' : '')
              }
            >
              <span className="sidebar-icon"><NavIcon name={icon} /></span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{user?.name[0].toUpperCase()}</div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{user?.name}</span>
            <span className="sidebar-user-email">{user?.email}</span>
          </div>
        </div>
        <button className="sidebar-logout" onClick={handleLogout}>Sign out</button>
      </div>
    </nav>
  )
}

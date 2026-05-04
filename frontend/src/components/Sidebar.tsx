import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/sidebar.css'

const NAV = [
  { to: '/dashboard',    label: 'Dashboard',    icon: '◈' },
  { to: '/transactions', label: 'Transactions',  icon: '⇄' },
  { to: '/income',       label: 'Income',        icon: '↑' },
  { to: '/goals',        label: 'Goals',         icon: '◎' },
  { to: '/splits',       label: 'Splits',        icon: '⊕' },
  { to: '/import',       label: 'Import',        icon: '⤵' },
  { to: '/calculators',  label: 'Calculators',   icon: '◧' },
  { to: '/household',    label: 'Household',     icon: '⌂' },
  { to: '/profile',      label: 'Profile',       icon: '◉' },
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
              <span className="sidebar-icon">{icon}</span>
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


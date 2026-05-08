import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/landing.css'

function FincuraLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect width="40" height="40" rx="9" fill="#1a472a"/>
      <circle cx="20" cy="21" r="13" fill="white"/>
      <rect x="12" y="23" width="4.5" height="7" rx="1" fill="#2e7d52"/>
      <rect x="18.5" y="18" width="4.5" height="12" rx="1" fill="#2e7d52"/>
      <rect x="25" y="12" width="4.5" height="18" rx="1" fill="#1a472a"/>
      <polygon points="27.25,9 30.5,14.5 24,14.5" fill="#1a472a"/>
    </svg>
  )
}

const FEATURES = [
  {
    icon: '📊',
    name: 'Track every rupee',
    desc: 'Log income and expenses in under 30 seconds. 15 smart categories, sorted by what you use most.',
  },
  {
    icon: '🎯',
    name: 'Monthly budgets',
    desc: 'Set limits per category. Get a visual warning before you overspend, not after.',
  },
  {
    icon: '💰',
    name: 'Savings goals',
    desc: 'Create goals, deposit progress, watch the bar fill. Vacation fund, laptop, emergency cushion.',
  },
  {
    icon: '🤝',
    name: 'Share with anyone',
    desc: 'Create a household, invite others. Shared transactions, split bills, one view of group finances.',
  },
]

export default function Landing() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />

  return (
    <div className="landing">
      {/* Nav */}
      <nav className="landing-nav">
        <span className="landing-nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FincuraLogo size={26} />
          <span>Fincura</span>
        </span>
        <div className="landing-nav-actions">
          <Link to="/login" className="landing-nav-link">Sign in</Link>
          <Link to="/register" className="btn-primary">Get started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <span className="landing-badge">Personal Finance Tracker</span>
        <h1 className="landing-headline">
          Know where your{' '}
          <span className="landing-headline-accent">money goes</span>
        </h1>
        <p className="landing-subtext">
          Track income, expenses, and savings in one place. Set budgets, reach goals,
          and share finances with anyone you live or spend with — without the spreadsheet headache.
        </p>
        <div className="landing-ctas">
          <Link to="/register" className="landing-cta-primary">
            Start tracking free →
          </Link>
          <Link to="/login" className="landing-cta-secondary">
            Sign in
          </Link>
        </div>

        {/* Mock dashboard */}
        <div className="landing-preview">
          <div className="landing-preview-bar">
            <div className="landing-preview-dot" />
            <div className="landing-preview-dot" />
            <div className="landing-preview-dot" />
          </div>
          <div className="landing-preview-body">
            <div className="landing-stat">
              <div className="landing-stat-label">Income</div>
              <div className="landing-stat-value landing-stat-value--income">₹52,000</div>
            </div>
            <div className="landing-stat">
              <div className="landing-stat-label">Spent</div>
              <div className="landing-stat-value landing-stat-value--expense">₹31,450</div>
            </div>
            <div className="landing-stat">
              <div className="landing-stat-label">Saved</div>
              <div className="landing-stat-value">₹20,550</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features">
        <h2 className="landing-features-title">Everything you actually need</h2>
        <p className="landing-features-sub">No bank connections that break. No overwhelming dashboards. Just fast, honest tracking.</p>
        <div className="landing-feature-grid">
          {FEATURES.map(f => (
            <div key={f.name} className="landing-feature-card">
              <span className="landing-feature-icon">{f.icon}</span>
              <div className="landing-feature-name">{f.name}</div>
              <div className="landing-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section className="landing-who">
        <h2 className="landing-who-title">Built for real life</h2>
        <p className="landing-who-sub">
          Whether you're tracking solo, splitting costs with roommates,
          managing a family budget, or planning with a partner — Fincura fits.
        </p>
        <div className="landing-who-pills">
          <span className="landing-who-pill">Individuals</span>
          <span className="landing-who-pill">Couples</span>
          <span className="landing-who-pill">Families</span>
          <span className="landing-who-pill">Roommates</span>
        </div>
        <Link to="/register" className="landing-who-cta">
          Create your free account
        </Link>
      </section>

      <footer className="landing-footer">
        © {new Date().getFullYear()} Fincura · Track every rupee. Own your finances.
      </footer>
    </div>
  )
}

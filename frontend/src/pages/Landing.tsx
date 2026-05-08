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
    color: '#e8f5ee',
    name: 'Instant expense tracking',
    desc: 'Log any transaction in seconds. 15 smart categories, auto-sorted by what you use most.',
  },
  {
    icon: '🎯',
    color: '#e8eaf6',
    name: 'Proactive budgets',
    desc: 'Set monthly limits per category. Get warned before you overspend — not after.',
  },
  {
    icon: '💰',
    color: '#fff8e1',
    name: 'Savings goals',
    desc: 'Create goals, track progress, celebrate milestones. Vacation, laptop, emergency fund.',
  },
  {
    icon: '🤝',
    color: '#fce4ec',
    name: 'Household sharing',
    desc: 'Invite your partner, roommates, or family. Shared transactions, split bills, one clear view.',
  },
  {
    icon: '📈',
    color: '#e3f2fd',
    name: 'Visual insights',
    desc: 'Spending trends, category breakdowns, monthly comparisons. See your habits at a glance.',
  },
  {
    icon: '📤',
    color: '#f3e5f5',
    name: 'Export anytime',
    desc: 'Download your data as CSV or PDF statements. Your data, always accessible.',
  },
]

const STEPS = [
  {
    num: '01',
    title: 'Create your free account',
    desc: 'Sign up in 30 seconds. No bank login, no credit card, no subscription required.',
  },
  {
    num: '02',
    title: 'Log your transactions',
    desc: 'Add income and expenses manually. Quick, private, and completely in your control.',
  },
  {
    num: '03',
    title: 'Watch the picture emerge',
    desc: 'Budgets, goals, and charts update automatically. Know exactly where you stand.',
  },
]

const TESTIMONIALS = [
  {
    quote: "Finally a finance app that doesn't ask for my bank password. I log everything in 2 minutes a day and actually understand my spending now.",
    name: 'Priya S.',
    role: 'Software Engineer, Bengaluru',
    avatar: 'PS',
  },
  {
    quote: 'My partner and I used to argue about money. Fincura showed us both the same picture — shared transactions changed everything.',
    name: 'Arjun & Neha',
    role: 'Couple, Mumbai',
    avatar: 'AN',
  },
  {
    quote: "I've tried 6 budget apps. This is the only one I still use after 4 months. Fast, simple, no nonsense.",
    name: 'Rahul M.',
    role: 'Freelancer, Delhi',
    avatar: 'RM',
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
        <span className="landing-nav-brand">
          <FincuraLogo size={28} />
          <span>Fincura</span>
        </span>
        <div className="landing-nav-actions">
          <Link to="/login" className="landing-nav-link">Sign in</Link>
          <Link to="/register" className="landing-nav-cta">Get started free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-text">
            <span className="landing-badge">✦ Free forever · No bank login needed</span>
            <h1 className="landing-headline">
              Take control of{' '}
              <span className="landing-headline-accent">every rupee</span>
            </h1>
            <p className="landing-subtext">
              The personal finance tracker that's honest, fast, and actually enjoyable to use.
              Track income, set budgets, hit your savings goals — alone or with your household.
            </p>
            <div className="landing-ctas">
              <Link to="/register" className="landing-cta-primary">
                Start tracking free →
              </Link>
              <Link to="/login" className="landing-cta-secondary">
                Sign in
              </Link>
            </div>
            <div className="landing-trust">
              <span className="landing-trust-item">✓ Free to use</span>
              <span className="landing-trust-item">✓ No bank connections</span>
              <span className="landing-trust-item">✓ Private by design</span>
            </div>
          </div>

          {/* Mock dashboard */}
          <div className="landing-preview">
            <div className="landing-preview-bar">
              <div className="landing-preview-dot" style={{ background: '#ff5f57' }} />
              <div className="landing-preview-dot" style={{ background: '#ffbd2e' }} />
              <div className="landing-preview-dot" style={{ background: '#28c840' }} />
              <span className="landing-preview-title">Fincura · May 2026</span>
            </div>
            <div className="landing-preview-body">
              <div className="landing-preview-stats">
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
                  <div className="landing-stat-value landing-stat-value--saved">₹20,550</div>
                </div>
              </div>

              <div className="landing-preview-chart">
                <div className="landing-chart-label">Spend by category</div>
                <div className="landing-chart-bars">
                  <div className="landing-chart-row">
                    <span className="landing-chart-cat">Food</span>
                    <div className="landing-chart-track">
                      <div className="landing-chart-fill" style={{ width: '72%', background: 'var(--income)' }} />
                    </div>
                    <span className="landing-chart-amt">₹8,640</span>
                  </div>
                  <div className="landing-chart-row">
                    <span className="landing-chart-cat">Rent</span>
                    <div className="landing-chart-track">
                      <div className="landing-chart-fill" style={{ width: '58%', background: '#f59e0b' }} />
                    </div>
                    <span className="landing-chart-amt">₹7,000</span>
                  </div>
                  <div className="landing-chart-row">
                    <span className="landing-chart-cat">Travel</span>
                    <div className="landing-chart-track">
                      <div className="landing-chart-fill" style={{ width: '35%', background: '#3b82f6' }} />
                    </div>
                    <span className="landing-chart-amt">₹4,200</span>
                  </div>
                  <div className="landing-chart-row">
                    <span className="landing-chart-cat">Shopping</span>
                    <div className="landing-chart-track">
                      <div className="landing-chart-fill" style={{ width: '24%', background: 'var(--expense)' }} />
                    </div>
                    <span className="landing-chart-amt">₹2,900</span>
                  </div>
                </div>
              </div>

              <div className="landing-preview-txns">
                <div className="landing-txn">
                  <span className="landing-txn-icon">🛒</span>
                  <span className="landing-txn-name">Grocery store</span>
                  <span className="landing-txn-amt landing-txn-amt--expense">−₹1,240</span>
                </div>
                <div className="landing-txn">
                  <span className="landing-txn-icon">💼</span>
                  <span className="landing-txn-name">Salary — May</span>
                  <span className="landing-txn-amt landing-txn-amt--income">+₹52,000</span>
                </div>
                <div className="landing-txn">
                  <span className="landing-txn-icon">🚌</span>
                  <span className="landing-txn-name">Metro card top-up</span>
                  <span className="landing-txn-amt landing-txn-amt--expense">−₹500</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <div className="landing-stats-bar">
        <div className="landing-stats-bar-inner">
          <div className="landing-stat-pill">
            <span className="landing-stat-pill-num">₹0</span>
            <span className="landing-stat-pill-label">Cost, ever</span>
          </div>
          <div className="landing-stat-divider" />
          <div className="landing-stat-pill">
            <span className="landing-stat-pill-num">30 sec</span>
            <span className="landing-stat-pill-label">To log a transaction</span>
          </div>
          <div className="landing-stat-divider" />
          <div className="landing-stat-pill">
            <span className="landing-stat-pill-num">15</span>
            <span className="landing-stat-pill-label">Smart categories</span>
          </div>
          <div className="landing-stat-divider" />
          <div className="landing-stat-pill">
            <span className="landing-stat-pill-num">100%</span>
            <span className="landing-stat-pill-label">Private, no bank access</span>
          </div>
        </div>
      </div>

      {/* Features */}
      <section className="landing-features">
        <div className="landing-section-label">Features</div>
        <h2 className="landing-features-title">Everything you actually need</h2>
        <p className="landing-features-sub">
          No bank connections that break. No overwhelming dashboards. Just fast, honest tracking that works.
        </p>
        <div className="landing-feature-grid">
          {FEATURES.map(f => (
            <div key={f.name} className="landing-feature-card">
              <span className="landing-feature-icon" style={{ background: f.color }}>{f.icon}</span>
              <div className="landing-feature-name">{f.name}</div>
              <div className="landing-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="landing-how">
        <div className="landing-section-label">How it works</div>
        <h2 className="landing-how-title">Up and running in minutes</h2>
        <p className="landing-how-sub">No setup friction. No integrations to break. Just open and start.</p>
        <div className="landing-steps">
          {STEPS.map(s => (
            <div key={s.num} className="landing-step">
              <div className="landing-step-num">{s.num}</div>
              <div className="landing-step-title">{s.title}</div>
              <div className="landing-step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="landing-testimonials">
        <div className="landing-section-label">Stories</div>
        <h2 className="landing-testimonials-title">Loved by people who track carefully</h2>
        <div className="landing-testimonials-grid">
          {TESTIMONIALS.map(t => (
            <div key={t.name} className="landing-testimonial-card">
              <p className="landing-testimonial-quote">"{t.quote}"</p>
              <div className="landing-testimonial-author">
                <div className="landing-testimonial-avatar">{t.avatar}</div>
                <div>
                  <div className="landing-testimonial-name">{t.name}</div>
                  <div className="landing-testimonial-role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section className="landing-who">
        <h2 className="landing-who-title">Built for real life</h2>
        <p className="landing-who-sub">
          Solo or together. Fincura works for how you actually spend and save.
        </p>
        <div className="landing-who-pills">
          <span className="landing-who-pill">👤 Individuals</span>
          <span className="landing-who-pill">💑 Couples</span>
          <span className="landing-who-pill">👨‍👩‍👧 Families</span>
          <span className="landing-who-pill">🏠 Roommates</span>
          <span className="landing-who-pill">💼 Freelancers</span>
        </div>
        <Link to="/register" className="landing-who-cta">
          Create your free account →
        </Link>
      </section>

      {/* Final CTA */}
      <section className="landing-final-cta">
        <h2 className="landing-final-cta-title">
          Start tracking today.<br />
          It takes 30 seconds.
        </h2>
        <p className="landing-final-cta-sub">Free forever. No bank login. No hidden charges.</p>
        <Link to="/register" className="landing-cta-primary landing-cta-primary--large">
          Get started — it's free →
        </Link>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span className="landing-footer-brand">
            <FincuraLogo size={20} />
            Fincura
          </span>
          <span className="landing-footer-copy">
            © {new Date().getFullYear()} Fincura · Track every rupee. Own your finances.
          </span>
        </div>
      </footer>
    </div>
  )
}

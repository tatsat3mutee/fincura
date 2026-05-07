import { useEffect, useState } from 'react'
import { api } from '../api/client'
import '../styles/referral.css'

interface ReferralData {
  code: string | null
  total_referred: number
}

export default function Referral() {
  const [data, setData] = useState<ReferralData | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get<{ code: string }>('/referral/code').then(r => setCode(r.code))
    api.get<ReferralData>('/referral/stats').then(setData)
  }, [])

  const shareUrl = code ? `${window.location.origin}/register?ref=${code}` : ''

  async function copyLink() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(
      `I use Fincura to track my money — expenses, budgets, savings goals. Join free: ${shareUrl}`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  function shareX() {
    const text = encodeURIComponent(
      `Track your finances with Fincura — no bank login, free forever. ${shareUrl}`
    )
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank')
  }

  return (
    <div className="referral-page">
      <div className="referral-header">
        <h1 className="referral-title">Refer &amp; Earn</h1>
        <p className="referral-subtitle">
          Share Fincura with friends. Help them take control of their money.
        </p>
      </div>

      <div className="referral-card">
        <div className="referral-stat-row">
          <div className="referral-stat">
            <div className="referral-stat-value">{data?.total_referred ?? '—'}</div>
            <div className="referral-stat-label">Friends joined</div>
          </div>
        </div>

        <div className="referral-code-section">
          <label className="referral-code-label">Your referral link</label>
          <div className="referral-code-box">
            <span className="referral-code-text">{shareUrl || 'Generating…'}</span>
            <button className="referral-copy-btn" onClick={copyLink} disabled={!code}>
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="referral-share-row">
          <button
            className="referral-share-btn referral-share-btn--whatsapp"
            onClick={shareWhatsApp}
            disabled={!code}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.554 4.118 1.523 5.845L.057 23.882l6.186-1.62A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.817 9.817 0 0 1-5.012-1.376l-.36-.213-3.674.963.979-3.578-.234-.368A9.817 9.817 0 0 1 2.182 12C2.182 6.567 6.567 2.182 12 2.182S21.818 6.567 21.818 12 17.433 21.818 12 21.818z"/>
            </svg>
            WhatsApp
          </button>
          <button
            className="referral-share-btn referral-share-btn--x"
            onClick={shareX}
            disabled={!code}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Share on X
          </button>
        </div>
      </div>

      <div className="referral-info">
        <h3 className="referral-info-title">How it works</h3>
        <ol className="referral-steps">
          <li>Copy your referral link above</li>
          <li>Share it with a friend who wants to track their money</li>
          <li>They sign up using your link</li>
          <li>You both track finances better — together</li>
        </ol>
      </div>
    </div>
  )
}

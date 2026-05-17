import { useRef, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Category } from '../types'
import { useAppStore } from '../store/useAppStore'
import { useEffect } from 'react'
import '../styles/transactions.css'

interface PreviewRow {
  txn_date: string
  type: string
  amount: number
  note: string
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export default function Import() {
  const addToast = useAppStore((s) => s.addToast)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get<Category[]>('/categories').then(setCategories).catch(() => {})
  }, [])

  async function uploadFile(file: File, pwd?: string) {
    setError('')
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      if (pwd) form.append('password', pwd)
      const rows = await api.postForm<PreviewRow[]>('/import/preview', form)
      if (!rows.length) { setError('No transactions found in this file.'); return }
      setPreview(rows)
      setStep('preview')
      setNeedsPassword(false)
      setPendingFile(null)
      setPassword('')
      if (rows.length >= 1000) {
        addToast('info', 'Showing first 1,000 transactions. Your statement may have more.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      if (msg === 'password_required') {
        setNeedsPassword(true)
        setPendingFile(file)
        setError('')
      } else if (msg === 'wrong_password') {
        setError('Incorrect password. Please try again.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Please select a file.'); return }
    if (file.size > MAX_FILE_SIZE) {
      setError('File too large. Maximum size is 5 MB.')
      return
    }
    await uploadFile(file)
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    if (!pendingFile) return
    if (!password.trim()) { setError('Please enter the password.'); return }
    await uploadFile(pendingFile, password)
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault()
    if (!categoryId) { setError('Please select a category.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ imported: number }>('/import/confirm', {
        rows: preview,
        category_id: categoryId,
      })
      setStep('done')
      addToast('success', `Imported ${res.imported} transactions`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  const expenseCategories = categories.filter(c => c.type === 'expense' || c.type === null)

  return (
    <div className="page-content">
      <h1 className="page-title" style={{ marginBottom: '1.5rem' }}>Import Bank Statement</h1>

      {step === 'upload' && (
        <div className="card" style={{ maxWidth: 520 }}>
          <p style={{ color: 'var(--color-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Upload a CSV, Excel, or PDF statement from your bank (SBI, HDFC, ICICI, Axis, Kotak, BOB, PNB or any standard format).
            We'll preview the transactions before saving.
          </p>

          {!needsPassword ? (
            <form onSubmit={handleUpload}>
              <label className="form-label">
                Statement file (CSV, XLSX, XLS, or PDF)
                <input type="file" accept=".csv,.xlsx,.xls,.pdf" ref={fileRef} className="form-input" required />
              </label>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.78rem', marginTop: '0.25rem' }}>
                Max 5 MB. Password-protected files are supported.
              </p>
              {error && <p className="form-error">{error}</p>}
              <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '1rem' }}>
                {loading ? 'Parsing…' : 'Preview'}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit}>
              <div style={{ background: 'var(--color-bg)', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>🔒 This file is password-protected</p>
                <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  Enter the password to unlock <strong>{pendingFile?.name}</strong>
                </p>
                <label className="form-label">
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="form-input"
                    placeholder="Enter file password"
                    autoFocus
                    required
                  />
                </label>
              </div>
              {error && <p className="form-error">{error}</p>}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Unlocking…' : 'Unlock & Preview'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => {
                  setNeedsPassword(false); setPendingFile(null); setPassword(''); setError('')
                }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {step === 'preview' && (
        <div>
          <p style={{ color: 'var(--color-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Found <strong>{preview.length}</strong> transactions. Assign a category and confirm to save.
          </p>
          <form onSubmit={handleConfirm} style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <label className="form-label" style={{ flex: '0 0 auto' }}>
              Assign category
              <select
                value={categoryId}
                onChange={e => setCategoryId(Number(e.target.value))}
                className="filter-input"
                required
              >
                <option value="">Select…</option>
                {expenseCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Importing…' : `Import ${preview.length} transactions`}
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setStep('upload'); setPreview([]) }}>
              Cancel
            </button>
          </form>
          {error && <p className="form-error">{error}</p>}

          <div className="txn-list" style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)' }}>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 500 }}>Date</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 500 }}>Type</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--color-muted)', fontWeight: 500 }}>Amount</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 500 }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.45rem 0.75rem' }}>{row.txn_date}</td>
                    <td style={{ padding: '0.45rem 0.75rem', color: row.type === 'income' ? 'var(--income)' : 'var(--expense)' }}>
                      {row.type}
                    </td>
                    <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>
                      {row.amount.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.45rem 0.75rem', color: 'var(--color-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="card" style={{ maxWidth: 420, textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>Import complete</h2>
          <p style={{ color: 'var(--color-muted)', marginBottom: '1.5rem' }}>
            Your transactions have been added. Head to Transactions to review them.
          </p>
          <button className="btn-primary" onClick={() => { setStep('upload'); setPreview([]) }}>
            Import another file
          </button>
        </div>
      )}
    </div>
  )
}

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

export default function Import() {
  const addToast = useAppStore((s) => s.addToast)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get<Category[]>('/categories').then(setCategories).catch(() => {})
  }, [])

  async function handleUpload(e: FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Please select a file.'); return }
    setError('')
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const rows = await api.postForm<PreviewRow[]>('/import/preview', form)
      if (!rows.length) { setError('No transactions found in this file.'); return }
      setPreview(rows)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
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
            Upload a CSV or Excel file from your bank (HDFC, ICICI, Axis or any standard format).
            We'll preview the transactions before saving.
          </p>
          <form onSubmit={handleUpload}>
            <label className="form-label">
              Statement file (CSV or XLSX)
              <input type="file" accept=".csv,.xlsx,.xls" ref={fileRef} className="form-input" required />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '1rem' }}>
              {loading ? 'Parsing…' : 'Preview'}
            </button>
          </form>
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

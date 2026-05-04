// In dev, Vite proxies /api → localhost:8000.
// In production, VITE_API_URL is set to the deployed backend base URL.
const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'
const ROOT = import.meta.env.VITE_API_URL ?? ''

// ── In-memory access token ────────────────────────────────────────────────────
// Never stored in localStorage or cookies — lives only in React module scope.
// XSS cannot read it; gone on tab close (fine — refresh cookie re-hydrates it).
let _accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  _accessToken = token
}

export function getAccessToken(): string | null {
  return _accessToken
}

// ── Silent refresh (deduped) ──────────────────────────────────────────────────
let _refreshPromise: Promise<boolean> | null = null

async function attemptTokenRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // sends httpOnly refresh cookie automatically
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        _accessToken = null
        return false
      }
      const data = await res.json()
      _accessToken = data.access_token
      return true
    } catch {
      _accessToken = null
      return false
    } finally {
      _refreshPromise = null
    }
  })()
  return _refreshPromise
}

// ── Core request function ─────────────────────────────────────────────────────
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

async function request<T>(method: Method, path: string, body?: unknown, retries = 3): Promise<T> {
  const makeHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (_accessToken) h['Authorization'] = `Bearer ${_accessToken}`
    return h
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: makeHeaders(),
        credentials: 'include', // needed for cookie on refresh path
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (networkErr) {
      // Pure network failure — retry with backoff
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
        continue
      }
      throw networkErr
    }

    // On 401: try silent refresh once, then retry the original request
    if (res.status === 401 && attempt === 0) {
      const refreshed = await attemptTokenRefresh()
      if (refreshed) continue // retry with new token
      // Refresh failed — redirect to login
      window.location.href = '/login'
      throw new Error('Session expired')
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      const msg = err.detail ?? 'Request failed'
      // 5xx → retry; 4xx → throw immediately
      if (res.status >= 500 && attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
        continue
      }
      throw new Error(msg)
    }

    if (res.status === 204 || res.status === 205) return undefined as T
    return res.json() as Promise<T>
  }
  throw new Error('Request failed after retries')
}

// ── Health ping (used on cold-start splash) ───────────────────────────────────
export async function pingBackend(timeoutMs = 60_000): Promise<boolean> {
  const url = `${ROOT}/health`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (res.ok) return true
    } catch {
      // still waking up
    }
    await new Promise(r => setTimeout(r, 3000))
  }
  return false
}

export { attemptTokenRefresh }

export const api = {
  get:   <T>(path: string)                  => request<T>('GET', path),
  post:  <T>(path: string, body: unknown)   => request<T>('POST', path, body),
  put:   <T>(path: string, body: unknown)   => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown)   => request<T>('PATCH', path, body),
  del:   <T>(path: string)                  => request<T>('DELETE', path),

  /** Upload a FormData payload (e.g. file uploads). Does NOT set Content-Type header. */
  postForm: async <T>(path: string, form: FormData): Promise<T> => {
    const headers: Record<string, string> = {}
    if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: form,
    })
    if (res.status === 401) {
      const refreshed = await attemptTokenRefresh()
      if (refreshed) return api.postForm<T>(path, form)
      window.location.href = '/login'
      throw new Error('Session expired')
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail ?? 'Upload failed')
    }
    return res.json() as Promise<T>
  },
}


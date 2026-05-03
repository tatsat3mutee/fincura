// In dev, Vite proxies /api → localhost:8000.
// In production, VITE_API_URL is set to the deployed backend base URL.
const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

// Base URL without /api, used for health ping
const ROOT = import.meta.env.VITE_API_URL ?? ''

function token(): string | null {
  return localStorage.getItem('token')
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

async function request<T>(method: Method, path: string, body?: unknown, retries = 3): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = token()
  if (t) headers['Authorization'] = `Bearer ${t}`

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })

      if (res.status === 401) {
        localStorage.removeItem('token')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? 'Request failed')
      }

      if (res.status === 204 || res.status === 205) {
        return undefined as T
      }

      return res.json() as Promise<T>
    } catch (err) {
      if (attempt === retries) throw err
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }
  throw new Error('Request failed after retries')
}

/** Ping the backend health endpoint. Returns true when server is up. */
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

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

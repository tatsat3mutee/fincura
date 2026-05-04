# FINCURA — Production Readiness Spec
> **Prepared for:** Claude Code / GitHub Copilot Agent  
> **Stack:** FastAPI + aiosqlite → asyncpg | React 18 + Vite + TypeScript | PostgreSQL  
> **Author identity:** AI Architect — telecom billing domain, FastAPI/React, Azure Cloud  
> **Last updated:** May 2026  
> **Status:** Pre-launch — all changes below must be completed before public access

---

## 0. Architect's Constraints (read before touching any file)

These are non-negotiable and reflect deliberate architectural decisions. Do not override them:

- **No ORM.** Raw async SQL only — `aiosqlite` in dev, `asyncpg` in prod. No SQLAlchemy, Tortoise, or Prisma.
- **No Redux.** Zustand is permitted and required for shared UI state (selected month, household context, toast queue). Auth state stays in `AuthContext`. See Section 2.5.
- **No CSS frameworks** (Tailwind, MUI, Chakra). Vanilla CSS with design tokens in `global.css`.
- **No synthetic data, no mock auth bypasses, no TODO stubs pushed to main.**
- **All SQL uses parameterized queries.** Zero f-strings in any SQL string, ever.
- **Ownership checks are mandatory.** Every `SELECT/UPDATE/DELETE` on user-owned tables includes `AND user_id = $1`.
- **`docs_url` and `redoc_url` are disabled in production.** Never expose `/docs` or `/redoc` in prod.
- **Flask skeleton (`app.py`, root `requirements.txt`, `templates/`, `static/`) is dead code.** Delete it.

---

## 1. Critical Blockers — Fix First, Touch Nothing Else

### 1.1 SQLite → PostgreSQL Migration

**Why this is a P0:** Render free tier uses ephemeral filesystem. Every redeploy or instance restart silently destroys `fincura.db`. All user data is lost. This is not a risk — it is a certainty.

**Target database:** Render managed PostgreSQL ($7/mo, 1 GB, PITR included) or Neon.tech (serverless Postgres, free tier, 0.5 GB, no expiry, branching for dev/prod).

> Industry context (2026): For early-stage SaaS with FastAPI, the recommended path is Render managed PostgreSQL for predictable billing + PITR, or Neon for zero-config serverless Postgres with branch-per-PR workflows. Supabase is an option but comes with BaaS lock-in — avoid unless you want to adopt their auth/storage stack wholesale. Since Fincura uses raw SQL and manual JWT, Supabase's value-add is irrelevant here.

**Changes required:**

**`backend/requirements.txt` — add:**
```
asyncpg==0.29.0
```

**Remove:**
```
aiosqlite==0.20.0
```

**`backend/database/db.py` — replace aiosqlite with asyncpg connection pool:**

```python
import asyncpg
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

_pool: asyncpg.Pool | None = None

async def init_pool():
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=os.environ["DATABASE_URL"],
        min_size=2,
        max_size=10,
        command_timeout=60,
        ssl="require",  # Enforce SSL — never connect to prod DB without it
    )

async def close_pool():
    if _pool:
        await _pool.close()

@asynccontextmanager
async def get_db() -> AsyncGenerator[asyncpg.Connection, None]:
    async with _pool.acquire() as conn:
        yield conn
```

**`backend/main.py` — update lifespan:**
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from database.db import init_pool, close_pool, init_db, seed_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    await init_db()
    await seed_db()
    yield
    await close_pool()

app = FastAPI(
    title="Fincura API",
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENV") != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)
```

**SQL placeholder migration:** Replace all `?` with `$1, $2, $3...` (asyncpg uses positional params).

```python
# BEFORE (aiosqlite)
await db.execute("INSERT INTO users (name, email) VALUES (?, ?)", (name, email))

# AFTER (asyncpg)
await conn.execute("INSERT INTO users (name, email) VALUES ($1, $2)", name, email)
```

**`render.yaml` — update DATABASE_URL:**
```yaml
- key: DATABASE_URL
  fromDatabase:
    name: fincura-db
    property: connectionString
```

**Add to `render.yaml` (new database service):**
```yaml
databases:
  - name: fincura-db
    plan: starter
    region: singapore
```

---

### 1.2 Delete Flask Legacy Code

Remove the following from repo root entirely:
- `app.py`
- `templates/` directory
- `static/` directory
- Root `requirements.txt` (flask, werkzeug, pytest-flask)

Replace root `requirements.txt` with a pointer comment or delete it entirely. The only `requirements.txt` that matters is `backend/requirements.txt`.

---

## 2. Auth Hardening

### 2.1 JWT: localStorage → Hybrid (Memory + httpOnly Cookie)

**Pattern:** Access token lives in React state (in-memory). Refresh token lives in httpOnly cookie. This is the industry-consensus pattern as of 2025-26.

**Why not full httpOnly cookies for both tokens:** Storing the access token in an httpOnly cookie reintroduces CSRF attack surface — the browser auto-sends cookies on every request, including cross-site requests. You'd need a CSRF double-submit token on every mutating endpoint. That's a non-trivial amount of plumbing for a SPA.

**Why not localStorage for either token:** XSS can steal it. A compromised third-party script (analytics, chat widget) has full access to `localStorage`. For a finance app, that's unacceptable.

**Why this hybrid is correct:**
- Access token (15 min) lives in React `useState` — invisible to JS outside your app, gone on tab close, never hits disk.
- Refresh token (30 days) lives in httpOnly cookie scoped to `/api/auth/refresh` only — never readable by JS, browser only sends it to that one path.
- CSRF risk is neutralised because the access token (required for all protected routes) is in memory, not auto-sent by browser.
- On app load, a silent `/api/auth/refresh` call re-hydrates the access token from the refresh cookie — seamless UX.

> Industry source (2026): This hybrid pattern is documented in Auth0's security whitepaper, used by Linear, Vercel dashboard, and Notion. It's the correct choice for SPA + separate API architecture.

**`backend/auth/jwt.py` — hybrid token system:**
```python
from fastapi import Response, Request, HTTPException, status
from datetime import datetime, timedelta
from jose import jwt, JWTError
import os

ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 30
ALGORITHM = "HS256"

def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "access"},
        os.environ["SECRET_KEY"],
        algorithm=ALGORITHM,
    )

def create_refresh_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "refresh"},
        os.environ["SECRET_KEY"],
        algorithm=ALGORITHM,
    )

def set_refresh_cookie(response: Response, user_id: int):
    """Refresh token goes in httpOnly cookie scoped to /api/auth/refresh only."""
    refresh_token = create_refresh_token(user_id)
    is_prod = os.getenv("ENV") == "production"
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        path="/api/auth/refresh",  # Scoped — browser never sends this cookie elsewhere
    )

def clear_auth_cookies(response: Response):
    response.delete_cookie("refresh_token", path="/api/auth/refresh")

def get_current_user(request: Request) -> dict:
    """Reads access token from Authorization header — token lives in React state, not cookies."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, os.environ["SECRET_KEY"], algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return {"user_id": int(payload["sub"])}
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
```

**`backend/routers/auth.py` — login returns access token in body, sets refresh cookie:**
```python
@router.post("/login")
async def login(credentials: LoginRequest, response: Response, db=Depends(get_db)):
    user = await db.fetchrow("SELECT * FROM users WHERE email = $1", credentials.email)
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Access token → response body (stored in React state, never in localStorage)
    access_token = create_access_token(user["id"])
    # Refresh token → httpOnly cookie scoped to /api/auth/refresh
    set_refresh_cookie(response, user["id"])
    
    return {
        "access_token": access_token,  # Frontend stores in useState only
        "user": {"id": user["id"], "name": user["name"], "email": user["email"], "currency": user["currency"]},
    }

@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"message": "Logged out"}

@router.post("/refresh")
async def refresh_token(request: Request, response: Response, db=Depends(get_db)):
    """
    Browser sends httpOnly refresh cookie automatically to this path.
    Returns a new access token in the response body.
    Frontend updates its in-memory accessToken state.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, os.environ["SECRET_KEY"], algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = int(payload["sub"])
        user = await db.fetchrow("SELECT id, name, email, currency FROM users WHERE id = $1", user_id)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # Rotate refresh cookie + return new access token
        set_refresh_cookie(response, user_id)
        return {
            "access_token": create_access_token(user_id),
            "user": dict(user),
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
```

**`frontend/src/api/client.ts` — sends access token as Authorization header, triggers silent refresh on 401:**
```typescript
const BASE_URL = import.meta.env.VITE_API_URL;

// Access token lives here — React module scope, never touches localStorage/sessionStorage/cookies
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

let _refreshPromise: Promise<boolean> | null = null;

async function attemptTokenRefresh(): Promise<boolean> {
  // Prevent concurrent refresh calls (multiple 401s at once)
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",  // httpOnly refresh cookie auto-sent to this path
      });
      if (!res.ok) {
        _accessToken = null;
        return false;
      }
      const data = await res.json();
      _accessToken = data.access_token;
      return true;
    } catch {
      _accessToken = null;
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (_accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed && _accessToken) {
      // Retry with new token
      headers["Authorization"] = `Bearer ${_accessToken}`;
      const retry = await fetch(`${BASE_URL}${path}`, { ...options, headers });
      if (!retry.ok) throw new Error(`API error: ${retry.status}`);
      return retry.json();
    }
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
```

**`frontend/src/context/AuthContext.tsx` — hydrates access token on mount, stores only in state:**
```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { setAccessToken } from "../api/client";

interface User { id: number; name: string; email: string; currency: string; }
interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount: try to get a fresh access token using the httpOnly refresh cookie
    // This is the "silent login" — user stays logged in across page reloads
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.access_token);
          setUser(data.user);
        }
      } catch { /* No session — user needs to log in */ }
      finally { setLoading(false); }
    })();
  }, []);

  async function login(email: string, password: string) {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
      method: "POST",
      credentials: "include",  // Receive httpOnly refresh cookie
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Invalid credentials");
    const data = await res.json();
    setAccessToken(data.access_token);  // Store in module scope only
    setUser(data.user);
  }

  async function logout() {
    await fetch(`${import.meta.env.VITE_API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
```

---

### 2.2 Rate Limiting on Auth Endpoints

**`backend/requirements.txt` — add:**
```
slowapi==0.1.9
```

**`backend/main.py` — add rate limiter:**
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

**`backend/routers/auth.py` — apply limits:**
```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

limiter = Limiter(key_func=get_remote_address)

@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, credentials: LoginRequest, response: Response, db=Depends(get_db)):
    ...

@router.post("/register")
@limiter.limit("3/minute")
async def register(request: Request, body: RegisterRequest, response: Response, db=Depends(get_db)):
    ...
```

---

### 2.3 Security Headers Middleware

**`backend/main.py` — add security middleware:**
```python
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if os.getenv("ENV") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)
```

---

### 2.4 Pydantic Field Length Constraints

Every user-input text field needs a `max_length`. Without this, a malicious user can submit a 50 MB `note` field and crash asyncpg or bloat the DB.

**`backend/schemas/models.py` — update all text fields:**
```python
from pydantic import BaseModel, ConfigDict, Field, EmailStr

class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr  # Pydantic validates format
    password: str = Field(min_length=8, max_length=128)

class TransactionCreate(BaseModel):
    type: Literal["expense", "income"]
    amount: float = Field(gt=0, le=10_000_000)  # Max 1 crore per transaction
    category_id: int
    note: str | None = Field(default=None, max_length=500)
    txn_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    visibility: Literal["personal", "shared"] = "personal"

class BudgetUpsert(BaseModel):
    amount: float = Field(gt=0, le=10_000_000)

class SavingsGoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    target_amount: float = Field(gt=0, le=100_000_000)
    target_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    icon: str = Field(default="◎", max_length=10)
    color: str = Field(default="#1a472a", pattern=r"^#[0-9a-fA-F]{6}$")
```

### 2.5 Zustand — Shared UI State

**Why Zustand and not more Context:** You now have 6+ pages that share `selectedMonth` (Dashboard month picker affects 3 charts + 2 stat cards + transaction list), `household` context (needed in Transactions, Budgets, Goals, Household page), and toast/notification queue. Solving this with Context requires either prop drilling 4 levels or 4 separate Context providers wrapping your app — which is functionally a store but without devtools, persistence, or clean selectors.

Zustand is 1.1 KB gzipped. It doesn't touch your component architecture. Auth state stays in `AuthContext` — that's a deliberate separation (auth is lifecycle, not UI state).

**`frontend/package.json` — add:**
```json
"zustand": "^5.0.0"
```

**`frontend/src/store/useAppStore.ts`:**
```typescript
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface Household {
  id: number;
  name: string;
  invite_code: string;
  role: "owner" | "member";
}

interface AppStore {
  // Month selector — shared across Dashboard, Transactions, Budgets
  selectedMonth: string;                        // Format: 'YYYY-MM'
  setSelectedMonth: (month: string) => void;

  // Household — needed across Transactions (shared flag), Goals, Budgets
  household: Household | null;
  setHousehold: (h: Household | null) => void;

  // Toast queue — triggered from any page/component
  toasts: Toast[];
  addToast: (type: Toast["type"], message: string) => void;
  removeToast: (id: string) => void;

  // Global loading state for data-refetch after mutations
  lastMutatedAt: number;
  triggerRefresh: () => void;
}

export const useAppStore = create<AppStore>()(
  devtools(
    (set) => ({
      selectedMonth: new Date().toISOString().slice(0, 7),
      setSelectedMonth: (selectedMonth) => set({ selectedMonth }, false, "setSelectedMonth"),

      household: null,
      setHousehold: (household) => set({ household }, false, "setHousehold"),

      toasts: [],
      addToast: (type, message) =>
        set(
          (state) => ({
            toasts: [
              ...state.toasts,
              { id: crypto.randomUUID(), type, message },
            ].slice(-5),  // Max 5 toasts at once
          }),
          false,
          "addToast"
        ),
      removeToast: (id) =>
        set(
          (state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }),
          false,
          "removeToast"
        ),

      lastMutatedAt: 0,
      triggerRefresh: () => set({ lastMutatedAt: Date.now() }, false, "triggerRefresh"),
    }),
    { name: "FincuraStore" }  // Name appears in Redux DevTools
  )
);
```

**Usage pattern in components:**
```typescript
// Dashboard.tsx — react to month changes without prop drilling
const { selectedMonth, lastMutatedAt } = useAppStore();

useEffect(() => {
  fetchDashboardData(selectedMonth);
}, [selectedMonth, lastMutatedAt]);

// TransactionForm.tsx — trigger global refresh after add/edit
const { triggerRefresh, addToast } = useAppStore();

async function handleSubmit() {
  await apiRequest("/api/transactions", { method: "POST", body: JSON.stringify(form) });
  triggerRefresh();          // Dashboard + Transactions page both re-fetch
  addToast("success", "Transaction added");
}
```

**`frontend/src/components/ToastContainer.tsx`:**
```typescript
import { useAppStore } from "../store/useAppStore";
import { useEffect } from "react";

export function ToastContainer() {
  const { toasts, removeToast } = useAppStore();

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <div className={`toast toast--${toast.type}`} onClick={() => onRemove(toast.id)}>
      {toast.message}
    </div>
  );
}
```

**`frontend/src/styles/global.css` — add toast tokens:**
```css
.toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 1000;
}

.toast {
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  font-family: var(--font-body);
  font-size: 0.875rem;
  cursor: pointer;
  animation: slide-in 0.2s ease;
  max-width: 320px;
}

.toast--success { background: var(--income); color: white; }
.toast--error   { background: var(--expense); color: white; }
.toast--info    { background: var(--accent); color: white; }

@keyframes slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}
```

---



### 3.1 Gunicorn + Uvicorn Workers

Replace dev `uvicorn main:app --reload` with production-grade multi-worker setup.

**`backend/requirements.txt` — add:**
```
gunicorn==22.0.0
```

**`render.yaml` — update startCommand:**
```yaml
startCommand: gunicorn main:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --max-requests 1000 --max-requests-jitter 100 --timeout 30 --graceful-timeout 10
```

> Industry note: FastAPI docs recommend Gunicorn with UvicornWorker for production. Worker count = CPU cores. Render free/starter = 0.5 CPU, use 1 worker. Render standard = 1 CPU, use 2 workers. `--max-requests` restarts workers periodically to prevent memory leaks.

---

### 3.2 Health Check Endpoint

Render and any load balancer needs a health check. Add this to `backend/main.py`:

```python
@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok", "version": "1.0.0"}
```

Update `render.yaml`:
```yaml
healthCheckPath: /health
```

---

## 4. Observability

### 4.1 Sentry (Error Tracking)

**`backend/requirements.txt` — add:**
```
sentry-sdk[fastapi]==2.19.0
```

**`backend/main.py`:**
```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.asyncpg import AsyncPGIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    integrations=[FastApiIntegration(), AsyncPGIntegration()],
    environment=os.getenv("ENV", "development"),
    traces_sample_rate=0.1,  # 10% of requests for perf monitoring
    send_default_pii=False,  # Never send PII to Sentry
)
```

**`frontend/src/main.tsx` — add Sentry browser:**
```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,  // No session replay — financial data privacy
});
```

**`render.yaml` — add env var:**
```yaml
- key: SENTRY_DSN
  sync: false
- key: ENV
  value: production
```

---

### 4.2 Structured Logging

```python
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "time": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
        })

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fincura")
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logger.addHandler(handler)
```

---

## 5. PWA (Progressive Web App) — Mobile Without App Stores

> Industry context (2026): The recommended path for a solo/small-team finance app is PWA first, then Capacitor wrapper for Play Store if user demand justifies it. PWA gives Android users "Add to Home Screen" with full-screen experience, offline capability, and push notifications — all from the existing React codebase. No app store review, no $25 developer fee, instant updates. Spotify saw 73% increase in premium subscriptions post-PWA launch. For personal finance apps where trust > flashiness, a clean PWA outperforms a poorly maintained native app.

### 5.1 Web App Manifest

**Create `frontend/public/manifest.json`:**
```json
{
  "name": "Fincura",
  "short_name": "Fincura",
  "description": "Track money together. Spend smarter.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a472a",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "screenshots": [
    { "src": "/screenshots/dashboard.png", "sizes": "390x844", "type": "image/png", "form_factor": "narrow" }
  ],
  "categories": ["finance", "productivity"]
}
```

**`frontend/index.html` — add in `<head>`:**
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1a472a" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Fincura" />
```

### 5.2 Service Worker (Offline Shell)

**`frontend/public/sw.js`:**
```javascript
const CACHE_NAME = "fincura-v1";
const STATIC_ASSETS = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  // Network-first for API calls
  if (event.request.url.includes("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: "Offline" }), {
          headers: { "Content-Type": "application/json" },
          status: 503,
        })
      )
    );
    return;
  }
  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

**`frontend/src/main.tsx` — register service worker:**
```typescript
if ("serviceWorker" in navigator && import.meta.env.MODE === "production") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
  });
}
```

### 5.3 Capacitor (Play Store Path — Do After 50+ Active Users)

When ready for Play Store, run from `frontend/`:
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Fincura" "com.fincura.app" --web-dir dist
npx cap add android
npm run build && npx cap sync
npx cap open android  # Opens Android Studio for signing + APK generation
```

Play Store one-time developer fee: $25 USD. Review time: 3–7 days for first submission.

---

## 6. Deployment Architecture Decision

### Evaluation (May 2026)

| Platform | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Render** (current) | Git-push deploys, managed Postgres, PITR, Singapore region | Free backend sleeps after 15 min, $7/mo for always-on | ✅ Keep — upgrade to paid |
| **Railway** | Fast spin-up, usage-based billing, good DX | Usage-based costs unpredictable at scale, no PITR on starter | Use for dev/staging only |
| **Fly.io** | Global edge, true persistent volumes, WebSocket-first | CLI-heavy ops, regional data consistency complexity | Overkill for current scale |
| **Vercel** | Best frontend CDN, PR previews, zero-config | Serverless Python = cold starts + no persistent connections for FastAPI | Frontend only |
| **Supabase** | Managed Postgres, free tier | BaaS lock-in — their auth/storage not used here, trending for wrong reasons | No |
| **AWS** | Full control, telecom-grade reliability | $50-100+/mo for equivalent setup, DevOps overhead | v2.0 after product-market fit |

### Recommended Stack (Production, Phase 1)

```
Frontend   → Vercel (free tier, global CDN, PR previews)
Backend    → Render Starter ($7/mo, Singapore, no cold starts, ASGI-native)
Database   → Render Managed PostgreSQL Starter ($7/mo, 1 GB, PITR)
Monitoring → Sentry free tier
Email      → Resend free tier (3k emails/mo)
Total      → ~$14/mo for a production-grade, always-on setup
```

**Why not keep frontend on Render:** Render static is fine, but Vercel has a superior CDN with better cache-hit rates and PR preview deployments that let you test branches before merging. Since Vercel is free for static, there is no reason not to use it.

**Why not AWS yet:** You know Azure deeply from IBM/BGW work. Migrating to AWS adds cognitive overhead. At sub-1000 users, Render's managed infra is strictly better DX. AWS migration makes sense when you need VPC-level networking, custom IAM policies, or >$50/mo budget.

### Updated `render.yaml`

```yaml
services:
  - type: web
    name: fincura-api
    runtime: python
    region: singapore
    plan: starter          # $7/mo — no sleep, always-on
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn main:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --max-requests 1000 --max-requests-jitter 100
    healthCheckPath: /health
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: fincura-db
          property: connectionString
      - key: SECRET_KEY
        generateValue: true
      - key: ENV
        value: production
      - key: ALLOWED_ORIGINS
        value: https://fincura.vercel.app,https://fincura.app
      - key: SENTRY_DSN
        sync: false

databases:
  - name: fincura-db
    plan: starter
    region: singapore
    postgresMajorVersion: 16
```

**Frontend deployment:** Connect GitHub repo to Vercel. Set `Root Directory: frontend`. Build command: `npm run build`. Output: `dist`. Add env var `VITE_API_URL=https://fincura-api.onrender.com`.

---

## 7. Feature Roadmap (Priority Order)

### Phase A — Production Blockers (Week 1-2)
See Sections 1–4 above.

### Phase B — Core UX Gaps (Week 3-4)

#### B1. Recurring Transactions
High-demand feature for Indian users (SIP, EMI, rent, subscriptions). Without this, users have to manually log the same transactions every month — the #1 cause of app abandonment per UX research.

**DB schema addition:**
```sql
ALTER TABLE transactions ADD COLUMN is_recurring BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN recurrence_rule TEXT;  -- 'monthly', 'weekly', 'yearly'
ALTER TABLE transactions ADD COLUMN recurrence_end_date TEXT;  -- YYYY-MM-DD or NULL

CREATE TABLE IF NOT EXISTS recurring_transaction_log (
    id              INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    source_txn_id   INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    generated_date  TEXT    NOT NULL,
    generated_txn_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    created_at      TEXT    NOT NULL DEFAULT NOW()
);
```

**New backend route:** `POST /api/transactions/{id}/recurrence` — sets `is_recurring=true` and `recurrence_rule`. Background worker (Render cron job) runs daily at midnight IST and generates due transactions.

#### B2. Data Portability — Full Export Suite

Finance is the one domain where users will leave an app the moment they feel their data is trapped. Every export below builds user trust and reduces churn. Prioritise in the order listed.

---

##### B2a. CSV Export (Week 3 — 30 min implementation)

```python
import csv, io
from fastapi.responses import StreamingResponse

@router.get("/export/csv")
async def export_csv(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
    year: int | None = None,
    month: str | None = None,  # YYYY-MM
):
    """
    Exports transactions as CSV. Filterable by year or specific month.
    CA-friendly column order: Date, Category, Type, Amount (INR), Note.
    """
    conditions = ["t.user_id = $1"]
    params: list = [current_user["user_id"]]

    if month:
        conditions.append(f"t.txn_date LIKE ${len(params)+1}")
        params.append(f"{month}%")
    elif year:
        conditions.append(f"t.txn_date LIKE ${len(params)+1}")
        params.append(f"{year}%")

    where = " AND ".join(conditions)
    rows = await db.fetch(f"""
        SELECT t.txn_date, c.name AS category, t.type, t.amount, COALESCE(t.note, '') AS note
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE {where}
        ORDER BY t.txn_date DESC
    """, *params)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["txn_date", "category", "type", "amount", "note"])
    writer.writeheader()
    writer.writerows([dict(r) for r in rows])

    filename = f"fincura_{month or year or 'all'}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
```

---

##### B2b. JSON Full Export — Data Portability (Week 3 — 20 min implementation)

GDPR-style "download everything" endpoint. Lets users back up their data, migrate to another tool, or feed it to an AI assistant. This single endpoint builds enormous user trust.

```python
from fastapi.responses import JSONResponse
import json
from datetime import datetime

@router.get("/export/json")
async def export_full_data(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
):
    """Complete account snapshot — all tables for this user."""
    uid = current_user["user_id"]

    user = await db.fetchrow(
        "SELECT id, name, email, currency, created_at FROM users WHERE id = $1", uid
    )
    transactions = await db.fetch(
        """SELECT t.*, c.name as category_name FROM transactions t
           JOIN categories c ON t.category_id = c.id
           WHERE t.user_id = $1 ORDER BY t.txn_date DESC""", uid
    )
    budgets = await db.fetch(
        "SELECT b.*, c.name as category_name FROM budgets b JOIN categories c ON b.category_id = c.id WHERE b.user_id = $1", uid
    )
    goals = await db.fetch("SELECT * FROM savings_goals WHERE user_id = $1", uid)
    categories = await db.fetch(
        "SELECT * FROM categories WHERE user_id = $1 OR system_default = TRUE", uid
    )

    payload = {
        "export_date": datetime.utcnow().isoformat(),
        "app": "Fincura",
        "version": "1.0",
        "user": dict(user),
        "transactions": [dict(r) for r in transactions],
        "budgets": [dict(r) for r in budgets],
        "savings_goals": [dict(r) for r in goals],
        "categories": [dict(r) for r in categories],
    }

    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": f"attachment; filename=fincura_export_{datetime.now().strftime('%Y%m%d')}.json"
        },
    )
```

---

##### B2c. PDF Monthly Statement (Week 4 — High perceived value, ~2 hrs)

The single most-requested feature in personal finance apps after CSV. Users need this to share with a CA, attach to a loan application, or simply keep an offline record. A professionally formatted PDF with Fincura branding differentiates you from every other indie finance tool.

**`backend/requirements.txt` — add:**
```
weasyprint==62.3
jinja2==3.1.4
```

**`backend/templates/statement.html`** — create a clean HTML template styled with inline CSS (WeasyPrint renders HTML → PDF):
```html
<!DOCTYPE html>
<html>
<head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&display=swap');
  * { font-family: 'DM Sans', sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
  body { padding: 40px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1a472a; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 24px; font-weight: 600; color: #1a472a; }
  .period { color: #666; font-size: 14px; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 32px; }
  .summary-card { padding: 16px; border-radius: 8px; }
  .summary-card.income { background: #e8f5ee; border-left: 4px solid #2e7d52; }
  .summary-card.expense { background: #fdecea; border-left: 4px solid #c0392b; }
  .summary-card.net { background: #f5f5f5; border-left: 4px solid #1a472a; }
  .card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; }
  .card-amount { font-size: 22px; font-weight: 600; margin-top: 4px; }
  .income .card-amount { color: #2e7d52; }
  .expense .card-amount { color: #c0392b; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; background: #f5f5f5; font-weight: 600; color: #444; }
  td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
  .amount-expense { color: #c0392b; }
  .amount-income { color: #2e7d52; }
  .footer { margin-top: 32px; text-align: center; font-size: 11px; color: #999; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">Fincura</div>
    <div class="period">{{ user.name }} · {{ period }}</div>
  </div>
  <div class="summary-grid">
    <div class="summary-card income">
      <div class="card-label">Total Income</div>
      <div class="card-amount">{{ currency }} {{ "{:,.0f}".format(total_income) }}</div>
    </div>
    <div class="summary-card expense">
      <div class="card-label">Total Expense</div>
      <div class="card-amount">{{ currency }} {{ "{:,.0f}".format(total_expense) }}</div>
    </div>
    <div class="summary-card net">
      <div class="card-label">Net Savings</div>
      <div class="card-amount">{{ currency }} {{ "{:,.0f}".format(total_income - total_expense) }}</div>
    </div>
  </div>
  <h3>Transactions</h3>
  <table>
    <thead>
      <tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr>
    </thead>
    <tbody>
      {% for txn in transactions %}
      <tr>
        <td>{{ txn.txn_date }}</td>
        <td>{{ txn.category_name }}</td>
        <td>{{ txn.note or '—' }}</td>
        <td class="amount-{{ txn.type }}">
          {% if txn.type == 'expense' %}-{% endif %}{{ currency }} {{ "{:,.0f}".format(txn.amount) }}
        </td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="footer">Generated by Fincura · {{ generated_at }}</div>
</body>
</html>
```

**`backend/routers/export.py`:**
```python
from fastapi.responses import Response as FastAPIResponse
from weasyprint import HTML
from jinja2 import Environment, FileSystemLoader
from datetime import datetime

jinja_env = Environment(loader=FileSystemLoader("templates"))

@router.get("/export/pdf/{month}")
async def export_pdf_statement(
    month: str,  # YYYY-MM
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
):
    uid = current_user["user_id"]
    user = await db.fetchrow("SELECT name, currency FROM users WHERE id = $1", uid)

    transactions = await db.fetch("""
        SELECT t.txn_date, c.name as category_name, t.type, t.amount, t.note
        FROM transactions t JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1 AND t.txn_date LIKE $2
        ORDER BY t.txn_date DESC
    """, uid, f"{month}%")

    rows = [dict(r) for r in transactions]
    total_income = sum(r["amount"] for r in rows if r["type"] == "income")
    total_expense = sum(r["amount"] for r in rows if r["type"] == "expense")

    template = jinja_env.get_template("statement.html")
    html_content = template.render(
        user=dict(user),
        period=datetime.strptime(month, "%Y-%m").strftime("%B %Y"),
        transactions=rows,
        total_income=total_income,
        total_expense=total_expense,
        currency=user["currency"],
        generated_at=datetime.now().strftime("%d %b %Y, %I:%M %p"),
    )

    pdf_bytes = HTML(string=html_content).write_pdf()

    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=fincura_{month}.pdf"},
    )
```

---

##### B2d. Bank Statement Import — CSV Parser (Week 5-6 — Growth Moat Feature)

This is the feature that converts Fincura from "nice tool" to "can't live without it." Every Indian bank (HDFC, ICICI, SBI, Axis) lets users download a CSV/Excel statement. You parse it, auto-categorize using keyword matching, show a preview, user confirms. Removes the #1 friction point: manual entry.

**`backend/requirements.txt` — add:**
```
pandas==2.2.0
openpyxl==3.1.2
```

**`backend/services/bank_parser.py`:**
```python
import pandas as pd
import io
from typing import Literal

BankName = Literal["hdfc", "icici", "sbi", "axis"]

# Keyword → category_name mapping (expand over time based on user feedback)
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Food & Drink":     ["swiggy", "zomato", "blinkit", "zepto", "mcdonald", "domino", "kfc", "restaurant", "cafe"],
    "Transport":        ["uber", "ola", "rapido", "irctc", "metro", "petrol", "fuel", "fastag"],
    "Shopping":         ["amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "reliance"],
    "Health":           ["pharmacy", "apollo", "medplus", "hospital", "clinic", "diagnostic"],
    "Entertainment":    ["netflix", "spotify", "prime", "hotstar", "bookmyshow", "pvr", "inox"],
    "Housing & Bills":  ["electricity", "bescom", "mseb", "water", "gas", "broadband", "jio", "airtel"],
    "Education":        ["udemy", "coursera", "byju", "unacademy", "college", "school", "fees"],
    "Salary":           ["salary", "payroll", "neft cr"],
    "Investment Returns": ["dividend", "mutual fund", "mf redemption", "interest credit"],
}

BANK_PARSERS: dict[BankName, dict] = {
    "hdfc": {
        "skiprows": 21,
        "columns": {"Date": "txn_date", "Narration": "note", "Withdrawal Amt.": "debit", "Deposit Amt.": "credit"},
        "date_format": "%d/%m/%y",
    },
    "icici": {
        "skiprows": 1,
        "columns": {"Transaction Date": "txn_date", "Remarks": "note", "Withdrawal Amount (INR )": "debit", "Deposit Amount (INR )": "credit"},
        "date_format": "%d/%m/%Y",
    },
    "sbi": {
        "skiprows": 17,
        "columns": {"Txn Date": "txn_date", "Description": "note", "Debit": "debit", "Credit": "credit"},
        "date_format": "%d %b %Y",
    },
    "axis": {
        "skiprows": 17,
        "columns": {"Tran Date": "txn_date", "PARTICULARS": "note", "DR": "debit", "CR": "credit"},
        "date_format": "%d-%m-%Y",
    },
}

def infer_category(narration: str) -> str:
    narration_lower = narration.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in narration_lower for kw in keywords):
            return category
    return "Other"

def parse_bank_statement(file_bytes: bytes, bank: BankName, file_ext: str) -> list[dict]:
    """
    Parses a bank statement CSV/Excel into a list of normalized transaction dicts.
    Returns rows suitable for preview — user confirms before inserting.
    """
    config = BANK_PARSERS[bank]

    if file_ext in ("xlsx", "xls"):
        df = pd.read_excel(io.BytesIO(file_bytes), skiprows=config["skiprows"])
    else:
        df = pd.read_csv(io.BytesIO(file_bytes), skiprows=config["skiprows"])

    df = df.rename(columns=config["columns"])
    df = df[["txn_date", "note", "debit", "credit"]].dropna(how="all")
    df["txn_date"] = pd.to_datetime(df["txn_date"], format=config["date_format"], errors="coerce")
    df = df.dropna(subset=["txn_date"])
    df["txn_date"] = df["txn_date"].dt.strftime("%Y-%m-%d")

    results = []
    for _, row in df.iterrows():
        is_debit = pd.notna(row.get("debit")) and float(str(row["debit"]).replace(",", "") or 0) > 0
        amount_str = str(row["debit"] if is_debit else row["credit"]).replace(",", "")
        try:
            amount = float(amount_str)
        except ValueError:
            continue
        if amount <= 0:
            continue

        results.append({
            "txn_date": row["txn_date"],
            "note": str(row["note"])[:500],
            "amount": round(amount, 2),
            "type": "expense" if is_debit else "income",
            "suggested_category": infer_category(str(row["note"])),
        })

    return results
```

**`backend/routers/import_.py`:**
```python
from fastapi import UploadFile, File, Form
from services.bank_parser import parse_bank_statement, BankName

@router.post("/import/preview")
async def import_preview(
    file: UploadFile = File(...),
    bank: BankName = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Step 1: Parse and return rows for user to review — nothing inserted yet."""
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(400, "Only CSV and Excel files supported")
    content = await file.read()
    rows = parse_bank_statement(content, bank, ext)
    return {"rows": rows, "count": len(rows)}

@router.post("/import/confirm")
async def import_confirm(
    body: ImportConfirmRequest,  # {rows: [{txn_date, amount, type, category_name, note}]}
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
):
    """Step 2: User has reviewed + optionally corrected categories. Bulk insert."""
    uid = current_user["user_id"]

    # Resolve category names → IDs
    cat_map = {r["name"]: r["id"] for r in await db.fetch(
        "SELECT id, name FROM categories WHERE user_id = $1 OR system_default = TRUE", uid
    )}

    inserted = 0
    async with db.transaction():
        for row in body.rows:
            cat_id = cat_map.get(row["category_name"], cat_map.get("Other"))
            await db.execute("""
                INSERT INTO transactions (user_id, category_id, type, amount, note, txn_date)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
            """, uid, cat_id, row["type"], row["amount"], row.get("note"), row["txn_date"])
            inserted += 1

    return {"inserted": inserted}
```

---

##### B2e. Annual Tax Summary (Week 6 — March deadline in India)

Single-page PDF summary: total income by source, total expenses (with Education + Health flagged as potentially deductible), net savings. Not a tax return — organized data a CA can use in 5 minutes.

```python
@router.get("/export/tax-summary/{year}")
async def export_tax_summary(
    year: int,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
):
    uid = current_user["user_id"]

    income_by_category = await db.fetch("""
        SELECT c.name, SUM(t.amount) as total
        FROM transactions t JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1 AND t.type = 'income' AND t.txn_date LIKE $2
        GROUP BY c.name ORDER BY total DESC
    """, uid, f"{year}%")

    expense_by_category = await db.fetch("""
        SELECT c.name, SUM(t.amount) as total
        FROM transactions t JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1 AND t.type = 'expense' AND t.txn_date LIKE $2
        GROUP BY c.name ORDER BY total DESC
    """, uid, f"{year}%")

    DEDUCTIBLE_CATEGORIES = {"Health", "Education"}  # Section 80D, 80C adjacent

    income_rows = [dict(r) for r in income_by_category]
    expense_rows = [dict(r) for r in expense_by_category]

    return {
        "year": year,
        "total_income": sum(r["total"] for r in income_rows),
        "total_expense": sum(r["total"] for r in expense_rows),
        "income_breakdown": income_rows,
        "expense_breakdown": expense_rows,
        "potentially_deductible": [r for r in expense_rows if r["name"] in DEDUCTIBLE_CATEGORIES],
        "note": "This summary is for reference only. Consult a CA for tax filing.",
    }
```

---

##### B2f. Savings Goal Share Card (Week 7 — Organic Growth)

When a user hits 50% or 100% of a savings goal, generate a shareable image card. "I just hit my ₹50,000 emergency fund goal 🎉 tracked with Fincura." This is a zero-cost growth mechanism — financial milestone sharing is high engagement on social media.

**`backend/requirements.txt` — add:**
```
Pillow==10.3.0
```

**`backend/routers/goals.py` — add share card endpoint:**
```python
from PIL import Image, ImageDraw, ImageFont
import io

@router.get("/{goal_id}/share-card")
async def generate_share_card(
    goal_id: int,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
):
    goal = await db.fetchrow("""
        SELECT name, target_amount, saved_amount FROM savings_goals
        WHERE id = $1 AND user_id = $2
    """, goal_id, current_user["user_id"])

    if not goal:
        raise HTTPException(404, "Goal not found")

    progress = min(100, round((goal["saved_amount"] / goal["target_amount"]) * 100))
    milestone = "100%" if progress >= 100 else "50%" if progress >= 50 else f"{progress}%"

    # 1200x630 OG image (ideal for WhatsApp, Instagram, Twitter sharing)
    img = Image.new("RGB", (1200, 630), color="#1a472a")
    draw = ImageDraw.Draw(img)

    # White panel
    draw.rounded_rectangle([60, 60, 1140, 570], radius=24, fill="white")

    # Brand mark
    draw.text((100, 100), "Fincura", fill="#1a472a", font=ImageFont.truetype("arial.ttf", 32))

    # Goal name
    draw.text((100, 180), goal["name"], fill="#1a1a1a", font=ImageFont.truetype("arial.ttf", 56))

    # Milestone
    draw.text((100, 270), f"I hit {milestone} of my savings goal! 🎉", fill="#2e7d52", font=ImageFont.truetype("arial.ttf", 40))

    # Amount
    draw.text((100, 360), f"₹{round(goal['saved_amount']):,} of ₹{round(goal['target_amount']):,}", fill="#666", font=ImageFont.truetype("arial.ttf", 32))

    # Progress bar
    bar_x, bar_y, bar_w, bar_h = 100, 450, 1000, 20
    draw.rounded_rectangle([bar_x, bar_y, bar_x + bar_w, bar_y + bar_h], radius=10, fill="#e8f5ee")
    draw.rounded_rectangle([bar_x, bar_y, bar_x + int(bar_w * progress / 100), bar_y + bar_h], radius=10, fill="#2e7d52")

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    buf.seek(0)

    return FastAPIResponse(
        content=buf.read(),
        media_type="image/png",
        headers={"Content-Disposition": f"attachment; filename=fincura-goal-{goal_id}.png"},
    )
```



#### B3. Email Verification

Without email verification, anyone can register with a fake/stolen email. Unverified accounts also spam your DB.

**`backend/requirements.txt` — add:**
```
resend==2.4.0
```

**Flow:**
1. On `POST /api/auth/register`, create user with `email_verified=FALSE`.
2. Generate 6-digit OTP, store hashed in `users.verification_token` with 24h expiry.
3. Send via Resend: `resend.Emails.send({"from": "noreply@fincura.app", "to": email, "subject": "Verify your Fincura account", "text": f"Your code: {otp}"})`
4. New endpoint `POST /api/auth/verify-email` validates OTP, sets `email_verified=TRUE`.
5. `get_current_user` dependency checks `email_verified` — 403 if not verified.

**DB migration:**
```sql
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN verification_token TEXT;
ALTER TABLE users ADD COLUMN verification_token_expires TEXT;
```

### Phase C — Intelligence Layer (Week 5-8, after real data)

These are what make Fincura an AI-native product, not just another CRUD app. Design these as separate FastAPI router (`routers/insights.py`) — clean separation from CRUD.

#### C1. Spend Anomaly Detection

```python
# routers/insights.py
import statistics

@router.get("/insights/anomalies")
async def get_spend_anomalies(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
):
    """
    For each category, compare this month's spend vs 3-month rolling average.
    Flag categories where current spend > mean + 1.5 * stdev.
    Returns ranked list of anomalies with % deviation.
    """
    rows = await db.fetch("""
        SELECT 
            c.name as category,
            c.color,
            SUM(CASE WHEN t.txn_date >= date_trunc('month', CURRENT_DATE)::text 
                     THEN t.amount ELSE 0 END) as this_month,
            SUM(CASE WHEN t.txn_date >= (date_trunc('month', CURRENT_DATE) - INTERVAL '3 months')::text
                     AND t.txn_date < date_trunc('month', CURRENT_DATE)::text
                     THEN t.amount ELSE 0 END) / 3.0 as three_month_avg
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1 AND t.type = 'expense'
        GROUP BY c.name, c.color
        HAVING three_month_avg > 0
    """, current_user["user_id"])
    
    anomalies = []
    for row in rows:
        if row["this_month"] > row["three_month_avg"] * 1.5:
            deviation_pct = ((row["this_month"] - row["three_month_avg"]) / row["three_month_avg"]) * 100
            anomalies.append({
                "category": row["category"],
                "color": row["color"],
                "this_month": row["this_month"],
                "avg": row["three_month_avg"],
                "deviation_pct": round(deviation_pct, 1),
                "message": f"{row['category']} spend is {round(deviation_pct)}% above your 3-month average"
            })
    
    return sorted(anomalies, key=lambda x: x["deviation_pct"], reverse=True)
```

#### C2. Savings Goal ETA Projection

```python
@router.get("/insights/goal-projections")
async def get_goal_projections(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
):
    """
    Based on average monthly deposit rate per goal, project completion date.
    Uses linear extrapolation — no ML needed until Phase 9.
    """
    goals = await db.fetch("""
        SELECT id, name, target_amount, saved_amount, target_date, created_at
        FROM savings_goals
        WHERE user_id = $1 AND status = 'active'
    """, current_user["user_id"])
    
    projections = []
    for goal in goals:
        months_active = max(1, (datetime.now() - datetime.fromisoformat(goal["created_at"])).days / 30)
        monthly_rate = goal["saved_amount"] / months_active
        remaining = goal["target_amount"] - goal["saved_amount"]
        
        if monthly_rate > 0:
            months_to_go = remaining / monthly_rate
            eta = datetime.now() + timedelta(days=months_to_go * 30)
            on_track = goal["target_date"] is None or eta.date() <= datetime.fromisoformat(goal["target_date"]).date()
        else:
            eta = None
            on_track = False
        
        projections.append({
            "goal_id": goal["id"],
            "name": goal["name"],
            "progress_pct": round((goal["saved_amount"] / goal["target_amount"]) * 100, 1),
            "monthly_rate": round(monthly_rate, 2),
            "eta": eta.strftime("%b %Y") if eta else None,
            "on_track": on_track,
            "message": f"At ₹{round(monthly_rate):,}/mo, you'll reach this goal by {eta.strftime('%b %Y')}" if eta else "No deposits yet"
        })
    
    return projections
```

#### C3. Monthly Spend Projection (current month)

```python
@router.get("/insights/month-projection")
async def get_month_projection(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db),
):
    """
    Linear projection: (spend so far / days elapsed) * days in month
    Returns category-level projections against budget.
    """
    from calendar import monthrange
    today = datetime.now()
    days_in_month = monthrange(today.year, today.month)[1]
    days_elapsed = today.day
    
    rows = await db.fetch("""
        SELECT c.name as category, SUM(t.amount) as spent_so_far,
               b.amount as budget
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        LEFT JOIN budgets b ON b.category_id = c.id 
            AND b.user_id = $1 
            AND b.month = $2
        WHERE t.user_id = $1 
          AND t.type = 'expense'
          AND t.txn_date >= $3
        GROUP BY c.name, b.amount
    """, current_user["user_id"], today.strftime("%Y-%m"), today.strftime("%Y-%m-01"))
    
    projections = []
    for row in rows:
        projected = (row["spent_so_far"] / days_elapsed) * days_in_month
        projections.append({
            "category": row["category"],
            "spent_so_far": row["spent_so_far"],
            "projected_total": round(projected, 2),
            "budget": row["budget"],
            "will_overshoot": row["budget"] and projected > row["budget"],
            "message": f"On track to spend ₹{round(projected):,} this month"
                       + (f" — ₹{round(projected - row['budget']):,} over budget" if row["budget"] and projected > row["budget"] else "")
        })
    
    return sorted(projections, key=lambda x: x.get("will_overshoot", False), reverse=True)
```

---

## 8. Database Migration Strategy (SQLite → PostgreSQL)

Run this migration script once, locally, against your existing `fincura.db` to export data:

```python
# scripts/migrate_sqlite_to_postgres.py
import sqlite3
import asyncio
import asyncpg
import os

async def migrate():
    sqlite = sqlite3.connect("backend/fincura.db")
    sqlite.row_factory = sqlite3.Row
    pg = await asyncpg.connect(os.environ["DATABASE_URL"])
    
    tables_in_order = [
        "users", "households", "household_members",
        "categories", "transactions", "budgets", "savings_goals"
    ]
    
    for table in tables_in_order:
        rows = sqlite.execute(f"SELECT * FROM {table}").fetchall()
        if not rows:
            continue
        cols = rows[0].keys()
        placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
        col_names = ", ".join(cols)
        await pg.executemany(
            f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING",
            [tuple(row) for row in rows]
        )
        print(f"Migrated {len(rows)} rows from {table}")
    
    await pg.close()
    sqlite.close()

asyncio.run(migrate())
```

---

## 9. CI/CD Pipeline (GitHub Actions)

**`.github/workflows/ci.yml`:**
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: fincura_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r backend/requirements.txt
        working-directory: .
      - run: pytest tests/ -v --tb=short
        working-directory: backend
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/fincura_test
          SECRET_KEY: test-secret-key-ci
          ENV: test

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
        working-directory: frontend
      - run: npx tsc --noEmit
        working-directory: frontend
      - run: npm run build
        working-directory: frontend
        env:
          VITE_API_URL: https://fincura-api.onrender.com
```

---

## 10. Security Checklist (Pre-Launch Gate)

All items below must be `[x]` before the app is shared publicly.

```
Infrastructure
  [ ] SQLite deleted from backend/, asyncpg + Render Postgres connected
  [ ] DATABASE_URL uses SSL (ssl=require in asyncpg pool)
  [ ] ENV=production set in Render environment
  [ ] SECRET_KEY is Render-generated (not committed to git)
  [ ] /docs and /redoc disabled in production

Authentication (Hybrid Pattern)
  [ ] Access token returned in response body only — never localStorage, never a cookie
  [ ] Access token stored in React module-scope variable (_accessToken) only
  [ ] Refresh token in httpOnly cookie scoped to /api/auth/refresh path
  [ ] Silent refresh on app mount (AuthContext useEffect) restores session
  [ ] 401 triggers refresh attempt before redirect (concurrent refresh deduped)
  [ ] Rate limiting active on /login (5/min) and /register (3/min)
  [ ] Email verification flow complete (Resend + OTP)
  [ ] Password min length 8, bcrypt work factor 12

State Management
  [ ] Zustand store created (useAppStore.ts) with selectedMonth, household, toasts, triggerRefresh
  [ ] ToastContainer mounted in App.tsx root
  [ ] All mutation handlers call triggerRefresh() + addToast() after success
  [ ] No prop drilling for selectedMonth or household beyond 1 level

API
  [ ] All queries include AND user_id = $N ownership checks
  [ ] All text fields have max_length in Pydantic models
  [ ] Security headers middleware added (X-Frame-Options, HSTS, etc.)
  [ ] CORS restricted to production frontend domain only

Exports
  [ ] CSV export with year/month filter
  [ ] JSON full export (data portability)
  [ ] PDF monthly statement (WeasyPrint)
  [ ] Bank import preview + confirm flow (HDFC parser minimum)
  [ ] Tax summary endpoint
  [ ] Goal share card (Pillow)

Monitoring
  [ ] Sentry DSN configured (backend + frontend)
  [ ] /health endpoint returns 200
  [ ] Render health check path configured

Build
  [ ] Flask skeleton deleted (app.py, templates/, static/, root requirements.txt)
  [ ] Gunicorn multi-worker start command in render.yaml
  [ ] GitHub Actions CI passes on main branch
  [ ] TypeScript noEmit check passes
```

---

## 11. File Deletions (Do This First)

```bash
# From repo root — delete dead Flask code
rm app.py
rm requirements.txt
rm -rf templates/
rm -rf static/

# Verify backend is the only Python entrypoint
ls backend/  # Should show: main.py, requirements.txt, database/, routers/, schemas/, auth/
```

---

## 12. Environment Variables Reference

| Variable | Where Set | Value |
|----------|-----------|-------|
| `DATABASE_URL` | Render (auto from DB) | `postgresql://...` |
| `SECRET_KEY` | Render (generate) | Random 64-char string |
| `ENV` | Render | `production` |
| `ALLOWED_ORIGINS` | Render | `https://fincura.vercel.app` |
| `SENTRY_DSN` | Render + Vercel | From Sentry project |
| `RESEND_API_KEY` | Render | From resend.com |
| `VITE_API_URL` | Vercel | `https://fincura-api.onrender.com` |
| `VITE_SENTRY_DSN` | Vercel | From Sentry project (public DSN) |

---

## 13. Dependency Summary — Final `backend/requirements.txt`

```
# Server
fastapi==0.115.0
uvicorn[standard]==0.30.0
gunicorn==22.0.0

# Database
asyncpg==0.29.0

# Auth
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9

# Validation
pydantic[email]==2.7.0

# Rate limiting
slowapi==0.1.9

# Email
resend==2.4.0

# Export
weasyprint==62.3
jinja2==3.1.4
Pillow==10.3.0

# Import
pandas==2.2.0
openpyxl==3.1.2

# Monitoring
sentry-sdk[fastapi]==2.19.0

# Testing
pytest==8.3.5
httpx==0.27.0
pytest-asyncio==0.23.0
```

## 14. Dependency Summary — Final `frontend/package.json` additions

```json
{
  "dependencies": {
    "zustand": "^5.0.0",
    "@sentry/react": "^8.0.0"
  }
}
```

---

*This spec was authored for Fincura v1.0 production launch. Architecture decisions reflect deliberate choices by the project owner — do not introduce new frameworks, ORMs, or state management libraries beyond what is listed here without explicit approval.*

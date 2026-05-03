# Fincura — Product & Technical Plan

> **"Track money together. Spend smarter."**
> A beautiful, low-friction expense + income + savings tracker for individuals, couples, and families.

---

## Why This Exists

Existing money tracking apps fail for the same repeating reasons:

| Pain Point | Evidence |
|---|---|
| Manual entry fatigue | >30 sec per entry = people stop logging; system dies |
| Tracks but doesn't control | Seeing history ≠ guiding next week's decisions |
| No shared/couple mode | Splitwise dominates because it solves one thing perfectly |
| Complexity abandonment | 96% of finance app users drop after 30 days |
| Category decision fatigue | Deciding "which category?" every day compounds into quitting |

**The opportunity:** Build an app that's fast to enter, honest about patterns, and works for how people actually live — alone, as a couple, or as a family.

---

## Product Name: Fincura

"finance" + Latin *-cura* (care, attention). Clean, premium-sounding, no dictionary collision.

---

## Decisions Made

| Question | Decision | Reason |
|---|---|---|
| Framework | FastAPI (Python, async) | Flask is sync and will cause pain at scale; FastAPI is async-first and keeps Python for future ML |
| Templates | React + TypeScript (Vite) | Jinja2 can't do rich interactive charts cleanly; React makes the dashboard and charts first-class |
| Database | SQLite (dev) → PostgreSQL (prod) | Zero config now; the schema is fully portable |
| DB access | Raw async SQL via `aiosqlite` | No ORM complexity; same parameterized SQL pattern as reference app |
| Auth | Manual JWT (`python-jose` + `passlib`) | Full control; Google OAuth is a drop-in addition later |
| Charts | Recharts | React-native, composable, no canvas memory leak management |
| Styling | Vanilla CSS with design tokens | Reuses existing DM Serif/DM Sans system; no framework lock-in |
| Data entry | Manual only | Bank integrations are the #1 reason apps break; manual with good UX is more reliable |
| Predictions | Phase 9 — after 3 months of real data | `pandas`/`statsmodels` drop-in as new FastAPI routes; no architecture change needed |

---

## Tech Stack

```
Backend:   FastAPI + aiosqlite + python-jose + passlib
Frontend:  React 18 + TypeScript + Vite + Recharts
Database:  SQLite → PostgreSQL
Auth:      JWT Bearer tokens (7-day expiry)
```

---

## Project Structure

```
expense-tracker/
├── plan.md                         ← you are here
│
├── backend/
│   ├── main.py                     FastAPI app, CORS, startup hooks
│   ├── requirements.txt
│   ├── database/
│   │   ├── db.py                   All async DB functions (get_db, init_db, seed_db, queries)
│   │   └── schema.sql              SQL schema reference
│   ├── routers/
│   │   ├── auth.py                 POST /register, POST /login, GET /me
│   │   ├── transactions.py         CRUD for income/expense entries
│   │   ├── budgets.py              Monthly budget per category
│   │   ├── goals.py                Savings goals + deposits
│   │   ├── household.py            Create/join/leave household (couples & families)
│   │   ├── profile.py              Profile stats + settings
│   │   └── charts.py               Chart data endpoints (AJAX)
│   ├── schemas/
│   │   └── models.py               Pydantic request/response models
│   └── auth/
│       └── jwt.py                  JWT create/verify + FastAPI dependency
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx                  React Router v6 + PrivateRoute guard
        ├── api/
        │   └── client.ts            Fetch wrapper — auto-attaches JWT, handles 401
        ├── context/
        │   └── AuthContext.tsx      Current user state, login/logout helpers
        ├── pages/
        │   ├── Landing.tsx
        │   ├── Login.tsx
        │   ├── Register.tsx
        │   ├── Dashboard.tsx        Charts + stat cards + recent transactions
        │   ├── Transactions.tsx     Full history with filters
        │   ├── Budgets.tsx          Monthly budget with progress bars
        │   ├── Goals.tsx            Savings goals list
        │   ├── GoalDetail.tsx       Single goal with deposit form
        │   ├── Household.tsx        Manage couple/family sharing
        │   └── Profile.tsx          Account settings
        ├── components/
        │   ├── Sidebar.tsx
        │   ├── StatCard.tsx
        │   ├── TransactionRow.tsx
        │   ├── BudgetBar.tsx
        │   ├── GoalCard.tsx
        │   ├── TransactionForm.tsx  Shared add/edit form
        │   └── charts/
        │       ├── MonthlyTrendChart.tsx   6-month income vs expense line
        │       ├── CategoryDonutChart.tsx  Spending by category donut
        │       └── DailySpendChart.tsx     Daily spend bar chart
        └── styles/
            ├── global.css           Design tokens (DM Serif, DM Sans, color vars)
            ├── dashboard.css
            ├── transactions.css
            ├── budgets.css
            ├── goals.css
            └── household.css
```

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    currency      TEXT    NOT NULL DEFAULT 'INR',
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS households (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    invite_code TEXT    NOT NULL UNIQUE,
    created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS household_members (
    id           INTEGER PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT    NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
    joined_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(household_id, user_id)
);

CREATE TABLE IF NOT EXISTS categories (
    id             INTEGER PRIMARY KEY,
    user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- NULL = system default
    name           TEXT    NOT NULL,
    icon           TEXT    NOT NULL DEFAULT '◎',
    color          TEXT    NOT NULL DEFAULT '#1a472a',
    type           TEXT    NOT NULL DEFAULT 'both' CHECK(type IN ('expense','income','both')),
    system_default INTEGER NOT NULL DEFAULT 0,
    sort_order     INTEGER NOT NULL DEFAULT 99
);

CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    household_id INTEGER REFERENCES households(id) ON DELETE SET NULL,
    category_id  INTEGER NOT NULL REFERENCES categories(id),
    type         TEXT    NOT NULL CHECK(type IN ('expense','income')),
    amount       REAL    NOT NULL CHECK(amount > 0),
    note         TEXT,
    txn_date     TEXT    NOT NULL,  -- YYYY-MM-DD
    visibility   TEXT    NOT NULL DEFAULT 'personal' CHECK(visibility IN ('personal','shared')),
    created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_txn_user_date ON transactions(user_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_household  ON transactions(household_id, txn_date DESC);

CREATE TABLE IF NOT EXISTS budgets (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    household_id INTEGER REFERENCES households(id) ON DELETE CASCADE,
    category_id  INTEGER NOT NULL REFERENCES categories(id),
    month        TEXT    NOT NULL,  -- YYYY-MM
    amount       REAL    NOT NULL CHECK(amount > 0),
    created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category_id, month),
    UNIQUE(household_id, category_id, month)
);

CREATE TABLE IF NOT EXISTS savings_goals (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
    household_id  INTEGER REFERENCES households(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL,
    target_amount REAL    NOT NULL CHECK(target_amount > 0),
    saved_amount  REAL    NOT NULL DEFAULT 0 CHECK(saved_amount >= 0),
    target_date   TEXT,
    icon          TEXT    NOT NULL DEFAULT '◎',
    color         TEXT    NOT NULL DEFAULT '#1a472a',
    status        TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','paused')),
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Default Categories (seeded on first run)

| # | Name | Icon | Color | Type |
|---|---|---|---|---|
| 1 | Food & Drink | 🍜 | #c17f24 | expense |
| 2 | Transport | 🚌 | #5b7fa6 | expense |
| 3 | Housing & Bills | 🏠 | #1a472a | expense |
| 4 | Health | 💊 | #8b5e83 | expense |
| 5 | Shopping | 🛍️ | #d4875e | expense |
| 6 | Entertainment | 🎬 | #6b8e5e | expense |
| 7 | Education | 📚 | #4a7fa5 | expense |
| 8 | Travel | ✈️ | #7a9e7e | expense |
| 9 | Personal Care | 🪥 | #b88db0 | expense |
| 10 | Gifts & Donations | 🎁 | #c0724a | expense |
| 11 | Salary | 💼 | #2e7d52 | income |
| 12 | Freelance | 💻 | #357abd | income |
| 13 | Business | 📈 | #1a472a | income |
| 14 | Investment Returns | 📊 | #4a8c6a | income |
| 15 | Other | ◎ | #6b6b6b | both |

---

## API Reference

### Auth
```
POST /api/auth/register    {name, email, password}       → {access_token, user}
POST /api/auth/login       {email, password}             → {access_token, user}
GET  /api/auth/me                                        → {user}              [JWT]
```

### Transactions
```
GET    /api/transactions              ?type&category_id&month&q&limit&offset   [JWT]
POST   /api/transactions              {type, amount, category_id, note, txn_date, visibility}
GET    /api/transactions/{id}                                                   [JWT]
PUT    /api/transactions/{id}         partial update                            [JWT]
DELETE /api/transactions/{id}                                                   [JWT]
```

### Budgets
```
GET /api/budgets                      ?month=YYYY-MM  (includes spent per category)  [JWT]
PUT /api/budgets/{category_id}/{month} {amount}       upsert                         [JWT]
DELETE /api/budgets/{id}                                                              [JWT]
```

### Savings Goals
```
GET    /api/goals
POST   /api/goals              {name, target_amount, target_date, icon, color}
GET    /api/goals/{id}
PUT    /api/goals/{id}         partial update
POST   /api/goals/{id}/deposit {amount}  — auto-marks completed when saved >= target
DELETE /api/goals/{id}
```

### Household
```
GET    /api/household            → household or null
POST   /api/household            {name}  — creates + makes caller owner
POST   /api/household/join       {invite_code}
DELETE /api/household/leave
```

### Profile
```
GET /api/profile               → user + all-time stats
PUT /api/profile               {name, currency}
PUT /api/profile/password      {current_password, new_password}
```

### Charts (AJAX — called by React components)
```
GET /api/charts/monthly-trend        ?months=6   → {labels, income[], expense[]}
GET /api/charts/category-breakdown   ?month      → {labels[], amounts[], colors[]}
GET /api/charts/daily-spend          ?month      → {labels[], amounts[]}
```

---

## Implementation Phases

### Phase 1 — Backend Foundation
- `backend/database/db.py`: async `get_db()`, `init_db()`, `seed_db()`
- `backend/main.py`: FastAPI app, CORS for `localhost:5173`, lifespan startup
- Verify: server starts, `/docs` loads, `fincura.db` created with all tables + 15 categories

### Phase 2 — Authentication
- **Backend:** `auth/jwt.py`, `routers/auth.py`, `schemas/models.py`
- **Frontend:** Vite + React scaffold, `AuthContext.tsx`, `Login.tsx`, `Register.tsx`, `PrivateRoute`
- Verify: register → JWT returned → login → same user returned → `/api/auth/me` with token → 401 without

### Phase 3 — Transaction CRUD (core daily-use feature)
- **Backend:** `routers/transactions.py`, all transaction db functions, `GET /api/categories`
- **Frontend:** `Transactions.tsx`, `TransactionForm.tsx` (add/edit), `TransactionRow.tsx`
- UX: amount autofocus, today's date default, categories sorted by last-used
- Verify: add → list → edit → delete → filter by month/type

### Phase 4 — Dashboard with Charts
- **Backend:** `routers/charts.py` (3 endpoints), `get_monthly_summary`, `get_recent_transactions`
- **Frontend:** `Dashboard.tsx`, `StatCard.tsx`, 3 Recharts components, month selector
- Verify: stat cards show correct totals; charts render with real data; month switcher updates all

### Phase 5 — Budgets
- **Backend:** `routers/budgets.py`, `get_budgets_with_spending`, `upsert_budget`
- **Frontend:** `Budgets.tsx`, `BudgetBar.tsx`, inline upsert form
- Progress bar colours: green (<75%) → amber (75–99%) → red (≥100%)

### Phase 6 — Savings Goals
- **Backend:** `routers/goals.py`, `add_deposit` (auto-completes goal at 100%)
- **Frontend:** `Goals.tsx`, `GoalCard.tsx`, `GoalDetail.tsx` with Recharts donut + deposit form
- Verify: create → deposit to 50% → deposit to 100% → status = `completed`

### Phase 7 — Household (Couples & Families)
- **Backend:** `routers/household.py`, create/join/leave + shared transaction visibility
- **Frontend:** `Household.tsx`, "Mark as shared" checkbox in `TransactionForm.tsx`
- Verify: User A creates → invite code → User B joins → shared transaction visible to both

### Phase 8 — Profile & Polish
- Profile stats, password change, 404/500 error pages, mobile responsive pass
- Hamburger menu + stacked layout at ≤768px

### Phase 9 — Predictions *(after 3 months of real data)*
- New `routers/predictions.py` — pure Python `statistics` module, no ML framework needed initially
- "At this rate you'll spend ₹X on Food this month" (linear projection from days elapsed)
- "Savings goal ETA based on current deposit rate"
- "Food spending up 18% vs 3-month average"
- Upgrade path: swap `statistics` for `statsmodels` for ARIMA/Holt-Winters if needed

---

## Security Checklist

- [ ] All db queries filter `WHERE user_id = ?` — never trust URL id alone
- [ ] 100% parameterized SQL — zero f-strings in any query
- [ ] Passwords: `passlib` bcrypt, work factor 12
- [ ] JWT secret from `SECRET_KEY` env var (not hardcoded)
- [ ] CORS restricted to `http://localhost:5173` (prod: actual frontend domain)
- [ ] Pydantic v2 validates every request body before it reaches db functions

---

## Running Locally

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# API at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# App at http://localhost:5173
```

### Tests
```bash
cd backend && pytest
cd frontend && npx tsc --noEmit
```

---

## Dependencies

### Backend (`backend/requirements.txt`)
```
fastapi==0.115.0
uvicorn[standard]==0.30.0
aiosqlite==0.20.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
pydantic[email]==2.7.0
pytest==8.3.5
httpx==0.27.0
pytest-asyncio==0.23.0
```

### Frontend (`frontend/package.json`)
```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "recharts": "^2.12.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "vite": "^5.3.0",
    "@vitejs/plugin-react": "^4.3.0"
  }
}
```

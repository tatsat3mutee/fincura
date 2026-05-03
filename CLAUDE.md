# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Fincura

A personal finance tracker (expense + income + savings) for individuals, couples, and families. See `plan.md` for full product context, architecture decisions, and implementation phases.

The existing `app.py` / `templates/` / `static/` Flask skeleton is superseded by the new `backend/` + `frontend/` structure. Do not add features to the Flask skeleton.

---

## Running the project

```bash
# Backend — from repo root
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# API: http://localhost:8000   Docs: http://localhost:8000/docs

# Frontend — from repo root
cd frontend
npm install
npm run dev
# App: http://localhost:5173

# Tests
cd backend && pytest
cd frontend && npx tsc --noEmit
```

---

## Architecture

### Backend (`backend/`)

**Entry point:** `main.py` — FastAPI app, CORS (origin `http://localhost:5173`), lifespan startup that calls `init_db()` + `seed_db()`.

**All SQL lives in `database/db.py`.** Routers call db functions; they never build SQL strings themselves. Every function is `async` and uses `aiosqlite`. All queries use `?` placeholders — no f-strings in SQL ever.

**Routers** (`routers/`) are thin: validate via Pydantic (FastAPI does this automatically from `schemas/models.py`), call `database/db.py`, return the result. No business logic in routers beyond HTTP concerns.

**Auth** (`auth/jwt.py`) exposes a single FastAPI dependency `get_current_user`. Every protected route declares `current_user: dict = Depends(get_current_user)`. The `user_id` from this dict must be passed to every db function that touches user-owned data — never trust an id from the URL alone.

**Pydantic models** (`schemas/models.py`) cover all request bodies and response shapes. Use `model_config = ConfigDict(from_attributes=True)` so they work with `aiosqlite.Row` objects.

### Frontend (`frontend/src/`)

**API calls** go through `api/client.ts` exclusively — it attaches the JWT from `localStorage` and handles 401 redirects. Never call `fetch` directly from components.

**Auth state** lives in `context/AuthContext.tsx`. Components use `useAuth()` to get the current user or call `login()`/`logout()`. Route protection is handled by `PrivateRoute` in `App.tsx`.

**Pages** (`pages/`) are responsible for data fetching and layout. **Components** (`components/`) are pure UI — they receive props, emit callbacks.

**Charts** use Recharts. The three chart components in `components/charts/` each fetch their own data from `/api/charts/*` endpoints.

---

## Key constraints

- **Ownership checks:** Every `SELECT/UPDATE/DELETE` on `transactions`, `budgets`, `savings_goals` must include `AND user_id = ?`. The household equivalent uses `AND household_id = ?` after verifying membership.
- **No ORM.** SQLAlchemy, Tortoise, etc. are not used. Raw `aiosqlite` only.
- **No Redux/Zustand.** React Context + local `useState` is sufficient.
- **CSS modules are not used.** Page-specific CSS files in `frontend/src/styles/` are imported directly. Shared design tokens live in `global.css`.
- **JWT token expiry is 7 days.** Do not shorten without updating the frontend refresh strategy.

---

## Design system

Fonts: **DM Serif Display** (headings, amounts) · **DM Sans** (body, labels)

Key CSS variables:
```css
--income: #2e7d52       --income-light: #e8f5ee
--expense: #c0392b      --expense-light: #fdecea
--accent: #1a472a       (primary brand green, CTAs, focus rings)
```

Budget progress bar colours: green below 75% · amber 75–99% · red at 100%+.

---

## Database

SQLite file: `backend/fincura.db` (created on first run, gitignored).

7 tables in dependency order: `users → households → household_members → categories → transactions → budgets → savings_goals`.

`categories` rows with `system_default = 1` and `user_id = NULL` are the 15 seeded defaults shared by all users. Custom user categories have `user_id` set.

`transactions.visibility` is either `'personal'` (default) or `'shared'`. Shared transactions also have `household_id` set and are visible to all household members.

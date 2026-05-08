import os
import random
import string
from contextlib import asynccontextmanager
from datetime import date as _date
from dateutil.relativedelta import relativedelta
from pathlib import Path

DATABASE_URL: str = os.getenv("DATABASE_URL", "")
IS_POSTGRES: bool = DATABASE_URL.startswith("postgres")
DB_PATH = Path(__file__).parent.parent / "fincura.db"

# ── PostgreSQL support (asyncpg wrapped to look like aiosqlite) ──────────────────
if IS_POSTGRES:
    import asyncpg as _asyncpg

    _pool: "_asyncpg.Pool | None" = None

    class _PgCursor:
        """Mimics the aiosqlite cursor interface over asyncpg results."""
        def __init__(self) -> None:
            self._rows: list = []
            self.rowcount: int = 0
            self.lastrowid: int = 0

        async def fetchone(self):
            return dict(self._rows[0]) if self._rows else None

        async def fetchall(self):
            return [dict(r) for r in self._rows]

    class _PgConn:
        """Adapts an asyncpg connection to the aiosqlite cursor-based API."""
        def __init__(self, conn) -> None:
            self._conn = conn

        @staticmethod
        def _adapt(sql: str, params=()):
            """Convert ? → $N and CURRENT_TIMESTAMP → now()::text."""
            i, result = 0, []
            for c in sql:
                if c == "?":
                    i += 1
                    result.append(f"${i}")
                else:
                    result.append(c)
            pg_sql = "".join(result).replace("CURRENT_TIMESTAMP", "now()::text")
            return pg_sql, list(params)

        async def execute(self, sql: str, params=()) -> "_PgCursor":
            pg_sql, pg_params = self._adapt(sql, params)
            cursor = _PgCursor()
            s = sql.strip().upper()
            if s.startswith("SELECT"):
                cursor._rows = await self._conn.fetch(pg_sql, *pg_params)
            elif s.startswith("INSERT"):
                if "RETURNING" not in pg_sql.upper():
                    pg_sql += " RETURNING id"
                cursor.lastrowid = await self._conn.fetchval(pg_sql, *pg_params) or 0
            elif s.startswith("UPDATE") or s.startswith("DELETE"):
                status = await self._conn.execute(pg_sql, *pg_params)
                try:
                    cursor.rowcount = int(status.split()[-1])
                except Exception:
                    cursor.rowcount = 0
            else:
                await self._conn.execute(pg_sql, *pg_params)
            return cursor

        async def executemany(self, sql: str, params_list) -> None:
            pg_sql, _ = self._adapt(sql, [])
            await self._conn.executemany(pg_sql, [list(p) for p in params_list])

        async def commit(self) -> None:
            pass  # handled by the transaction() context manager

    @asynccontextmanager
    async def get_db():
        assert _pool is not None, "DB pool not initialised – call startup_db() first"
        async with _pool.acquire() as conn:
            async with conn.transaction():
                yield _PgConn(conn)

    async def startup_db() -> None:
        global _pool
        url = DATABASE_URL.replace("postgres://", "postgresql://", 1)
        _pool = await _asyncpg.create_pool(url, min_size=1, max_size=5)

    async def shutdown_db() -> None:
        if _pool:
            await _pool.close()

# ── SQLite support (local / CI) ────────────────────────────────────────────────────
else:
    import aiosqlite

    @asynccontextmanager
    async def get_db():
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys = ON")
            yield db

    async def startup_db() -> None:
        pass

    async def shutdown_db() -> None:
        pass


# ── Schema ─────────────────────────────────────────────────────────────────────────────

_SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT,
    google_id     TEXT    UNIQUE,
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
    user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
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
    txn_date     TEXT    NOT NULL,
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
    month        TEXT    NOT NULL,
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

CREATE TABLE IF NOT EXISTS splits (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL,
    total_amount REAL    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS split_members (
    id           INTEGER PRIMARY KEY,
    split_id     INTEGER NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    share_amount REAL    NOT NULL,
    paid         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referral_codes (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    code       TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

# PostgreSQL: SERIAL PKs + now()::text defaults
_SCHEMA_POSTGRES = (
    _SCHEMA_SQLITE
    .replace("INTEGER PRIMARY KEY", "SERIAL PRIMARY KEY")
    .replace("DEFAULT CURRENT_TIMESTAMP", "DEFAULT now()::text")
)

_SCHEMA_MIGRATIONS = [
    "ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE",
    "ALTER TABLE budgets ADD COLUMN period_months INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE savings_goals ADD COLUMN scheme_type TEXT",
    "ALTER TABLE savings_goals ADD COLUMN institution TEXT",
    "ALTER TABLE savings_goals ADD COLUMN scheme_notes TEXT",
    # Insert Savings category if it doesn't already exist (idempotent)
    "INSERT INTO categories (user_id, name, icon, color, type, system_default, sort_order)"
    " SELECT NULL, 'Savings', '\U0001f4b0', '#2e7d52', 'expense', 1, 11"
    " WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Savings' AND system_default = 1)",
    # Recurring transactions support
    "ALTER TABLE transactions ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE transactions ADD COLUMN recurrence_rule TEXT",
    "ALTER TABLE transactions ADD COLUMN recurrence_end_date TEXT",
    (
        "CREATE TABLE IF NOT EXISTS recurring_transaction_log ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  source_transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,"
        "  generated_txn_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,"
        "  generated_date TEXT NOT NULL"
        ")"
    ),
    # Email verification — backfill existing accounts as verified before enforcing
    "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN verification_token TEXT",
    "ALTER TABLE users ADD COLUMN verification_token_expires TEXT",
    "UPDATE users SET email_verified = 1 WHERE email IS NOT NULL",
    # Referral system
    "ALTER TABLE users ADD COLUMN referred_by TEXT",
    (
        "CREATE TABLE IF NOT EXISTS referral_codes ("
        "  id INTEGER PRIMARY KEY,"
        "  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,"
        "  code TEXT NOT NULL UNIQUE,"
        "  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
        ")"
    ),
    # Tax tagging for transactions
    "ALTER TABLE transactions ADD COLUMN tax_tag TEXT",
]

_SEED_CATEGORIES = [
    ("Food & Drink",       "\U0001f35c", "#c17f24", "expense", 1),
    ("Transport",          "\U0001f68c", "#5b7fa6", "expense", 2),
    ("Housing & Bills",    "\U0001f3e0", "#1a472a", "expense", 3),
    ("Health",             "\U0001f48a", "#8b5e83", "expense", 4),
    ("Shopping",           "\U0001f6cd️",  "#d4875e", "expense", 5),
    ("Entertainment",      "\U0001f3ac", "#6b8e5e", "expense", 6),
    ("Education",          "\U0001f4da", "#4a7fa5", "expense", 7),
    ("Travel",             "✈️",  "#7a9e7e", "expense", 8),
    ("Personal Care",      "\U0001fab5", "#b88db0", "expense", 9),
    ("Gifts & Donations",  "\U0001f381", "#c0724a", "expense", 10),
    ("Savings",            "\U0001f4b0", "#2e7d52", "expense", 11),
    ("Salary",             "\U0001f4bc", "#2e7d52", "income",  12),
    ("Freelance",          "\U0001f4bb", "#357abd", "income",  13),
    ("Business",           "\U0001f4c8", "#1a472a", "income",  14),
    ("Investment Returns", "\U0001f4ca", "#4a8c6a", "income",  15),
    ("Other",              "◎",  "#6b6b6b", "both",    16),
]


async def init_db() -> None:
    if IS_POSTGRES:
        assert _pool is not None
        async with _pool.acquire() as conn:
            stmts = [s.strip() for s in _SCHEMA_POSTGRES.split(";") if s.strip()]
            for stmt in stmts:
                try:
                    await conn.execute(stmt)
                except Exception:
                    pass  # table / index already exists
            for migration in _SCHEMA_MIGRATIONS:
                pg_mig = migration.replace("CURRENT_TIMESTAMP", "now()::text")
                try:
                    await conn.execute(pg_mig)
                except Exception:
                    pass  # column already exists
    else:
        import aiosqlite as _aio
        async with _aio.connect(DB_PATH) as db:
            await db.execute("PRAGMA foreign_keys = ON")
            await db.executescript(_SCHEMA_SQLITE)
            await db.commit()
            for migration in _SCHEMA_MIGRATIONS:
                try:
                    await db.execute(migration)
                    await db.commit()
                except Exception:
                    pass


async def seed_db() -> None:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT COUNT(*) as cnt FROM categories WHERE system_default = 1"
        )
        row = await cur.fetchone()
        count = row["cnt"] if row else 0
        if count:
            return
        await db.executemany(
            "INSERT INTO categories (user_id, name, icon, color, type, system_default, sort_order)"
            " VALUES (NULL, ?, ?, ?, ?, 1, ?)",
            _SEED_CATEGORIES,
        )
        await db.commit()


# ── User queries ───────────────────────────────────────────────────────────────────

async def create_user(name: str, email: str, password_hash: str) -> int:
    async with get_db() as db:
        cur = await db.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email, password_hash),
        )
        await db.commit()
        return cur.lastrowid


async def get_user_by_email(email: str):
    async with get_db() as db:
        cur = await db.execute("SELECT * FROM users WHERE email = ?", (email,))
        return await cur.fetchone()


async def get_user_by_id(user_id: int):
    async with get_db() as db:
        cur = await db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return await cur.fetchone()


async def delete_user(user_id: int) -> None:
    async with get_db() as db:
        await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await db.commit()


async def set_verification_token(user_id: int, token: str, expires: str) -> None:
    async with get_db() as db:
        await db.execute(
            "UPDATE users SET verification_token = ?, verification_token_expires = ? WHERE id = ?",
            (token, expires, user_id),
        )
        await db.commit()


async def verify_email_token(token: str):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT * FROM users WHERE verification_token = ?"
            " AND verification_token_expires > datetime('now')",
            (token,),
        )
        user = await cur.fetchone()
        if user:
            await db.execute(
                "UPDATE users SET email_verified = 1, verification_token = NULL,"
                " verification_token_expires = NULL WHERE id = ?",
                (user["id"],),
            )
            await db.commit()
        return user


async def get_user_by_google_id(google_id: str):
    async with get_db() as db:
        cur = await db.execute("SELECT * FROM users WHERE google_id = ?", (google_id,))
        return await cur.fetchone()


async def create_google_user(name: str, email: str, google_id: str) -> int:
    async with get_db() as db:
        cur = await db.execute(
            "INSERT INTO users (name, email, password_hash, google_id) VALUES (?, ?, NULL, ?)",
            (name, email, google_id),
        )
        await db.commit()
        return cur.lastrowid


async def link_google_account(user_id: int, google_id: str) -> None:
    async with get_db() as db:
        await db.execute("UPDATE users SET google_id = ? WHERE id = ?", (google_id, user_id))
        await db.commit()


# ── Category queries ────────────────────────────────────────────────────────────────

async def get_categories(user_id: int):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT * FROM categories WHERE system_default = 1 OR user_id = ? ORDER BY sort_order",
            (user_id,),
        )
        return await cur.fetchall()


# ── Transaction queries ───────────────────────────────────────────────────────────────

async def create_transaction(
    user_id: int, txn_type: str, amount: float, category_id: int,
    note: str | None, txn_date: str, visibility: str = "personal",
    is_recurring: bool = False, recurrence_rule: str | None = None,
    recurrence_end_date: str | None = None,
    tax_tag: str | None = None,
) -> int:
    async with get_db() as db:
        cur = await db.execute(
            "INSERT INTO transactions"
            " (user_id, type, amount, category_id, note, txn_date, visibility,"
            "  is_recurring, recurrence_rule, recurrence_end_date, tax_tag)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, txn_type, amount, category_id, note, txn_date, visibility,
             int(is_recurring), recurrence_rule, recurrence_end_date, tax_tag),
        )
        await db.commit()
        return cur.lastrowid


async def get_transaction(user_id: int, txn_id: int):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color"
            " FROM transactions t JOIN categories c ON t.category_id = c.id"
            " WHERE t.id = ? AND t.user_id = ?",
            (txn_id, user_id),
        )
        return await cur.fetchone()


async def get_transactions(
    user_id: int, *,
    txn_type: str | None = None,
    category_id: int | None = None,
    month: str | None = None,
    q: str | None = None,
    tax_tag: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    sql = (
        "SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color"
        " FROM transactions t JOIN categories c ON t.category_id = c.id"
        " WHERE t.user_id = ?"
    )
    params: list = [user_id]
    if txn_type:
        sql += " AND t.type = ?"
        params.append(txn_type)
    if category_id:
        sql += " AND t.category_id = ?"
        params.append(category_id)
    if month:
        sql += " AND substr(t.txn_date, 1, 7) = ?"
        params.append(month)
    if q:
        sql += " AND t.note LIKE ?"
        params.append("%" + q + "%")
    if tax_tag:
        sql += " AND t.tax_tag = ?"
        params.append(tax_tag)
    sql += " ORDER BY t.txn_date DESC, t.id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    async with get_db() as db:
        cur = await db.execute(sql, params)
        return await cur.fetchall()


async def update_transaction(user_id: int, txn_id: int, data: dict) -> bool:
    current = await get_transaction(user_id, txn_id)
    if not current:
        return False
    current_dict = dict(current)
    async with get_db() as db:
        await db.execute(
            "UPDATE transactions SET type=?, amount=?, category_id=?, note=?, txn_date=?,"
            " visibility=?, tax_tag=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?",
            (
                data.get("type", current_dict.get("type")),
                data.get("amount", current_dict.get("amount")),
                data.get("category_id", current_dict.get("category_id")),
                data.get("note", current_dict.get("note")),
                data.get("txn_date", current_dict.get("txn_date")),
                data.get("visibility", current_dict.get("visibility")),
                data.get("tax_tag", current_dict.get("tax_tag")),
                txn_id, user_id,
            ),
        )
        await db.commit()
    return True


async def delete_transaction(user_id: int, txn_id: int) -> bool:
    async with get_db() as db:
        cur = await db.execute(
            "DELETE FROM transactions WHERE id = ? AND user_id = ?", (txn_id, user_id)
        )
        await db.commit()
        return cur.rowcount > 0


async def get_recent_transactions(user_id: int, limit: int = 5):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color"
            " FROM transactions t JOIN categories c ON t.category_id = c.id"
            " WHERE t.user_id = ?"
            " ORDER BY t.txn_date DESC, t.id DESC LIMIT ?",
            (user_id, limit),
        )
        return await cur.fetchall()


# ── Chart / summary queries ───────────────────────────────────────────────────────────────

async def get_monthly_summary(user_id: int, month: str) -> dict:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT type, SUM(amount) as total FROM transactions"
            " WHERE user_id = ? AND substr(txn_date, 1, 7) = ? GROUP BY type",
            (user_id, month),
        )
        rows = await cur.fetchall()
    result: dict = {"income": 0.0, "expense": 0.0}
    for row in rows:
        result[row["type"]] = row["total"]
    result["net"] = result["income"] - result["expense"]
    return result


async def get_monthly_trend(user_id: int, months: int = 6):
    cutoff = (_date.today() - relativedelta(months=months)).isoformat()
    async with get_db() as db:
        cur = await db.execute(
            "SELECT substr(txn_date, 1, 7) as month, type, SUM(amount) as total"
            " FROM transactions"
            " WHERE user_id = ? AND txn_date >= ?"
            " GROUP BY substr(txn_date, 1, 7), type ORDER BY month",
            (user_id, cutoff),
        )
        return await cur.fetchall()


async def get_category_breakdown(user_id: int, month: str):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT c.name, c.color, c.icon, SUM(t.amount) as total"
            " FROM transactions t JOIN categories c ON t.category_id = c.id"
            " WHERE t.user_id = ? AND t.type = 'expense' AND substr(t.txn_date, 1, 7) = ?"
            " GROUP BY c.id ORDER BY total DESC",
            (user_id, month),
        )
        return await cur.fetchall()


async def get_daily_spend(user_id: int, month: str):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT substr(txn_date, 9, 2) as day, SUM(amount) as total"
            " FROM transactions"
            " WHERE user_id = ? AND type = 'expense' AND substr(txn_date, 1, 7) = ?"
            " GROUP BY substr(txn_date, 9, 2) ORDER BY day",
            (user_id, month),
        )
        return await cur.fetchall()


# ── Budget queries ────────────────────────────────────────────────────────────────────

async def get_budgets(user_id: int, month: str):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT b.id, b.category_id, b.month, b.amount as limit_amount,"
            " COALESCE(b.period_months, 1) as period_months,"
            " c.name as category_name, c.icon as category_icon, c.color as category_color"
            " FROM budgets b JOIN categories c ON b.category_id = c.id"
            " WHERE b.user_id = ? AND b.month = ?"
            " ORDER BY c.sort_order",
            (user_id, month),
        )
        budget_rows = await cur.fetchall()

    results = []
    for b in budget_rows:
        period = int(b["period_months"] or 1)
        start = f"{b['month']}-01"
        end = (_date.fromisoformat(start) + relativedelta(months=period)).isoformat()
        async with get_db() as db:
            cur = await db.execute(
                "SELECT COALESCE(SUM(amount), 0) as spent FROM transactions"
                " WHERE user_id = ? AND category_id = ? AND type = 'expense'"
                " AND txn_date >= ? AND txn_date < ?",
                (user_id, b["category_id"], start, end),
            )
            spent_row = await cur.fetchone()
        results.append({
            "id": b["id"],
            "category_id": b["category_id"],
            "month": b["month"],
            "limit_amount": float(b["limit_amount"]),
            "period_months": period,
            "category_name": b["category_name"],
            "category_icon": b["category_icon"],
            "category_color": b["category_color"],
            "spent": float(spent_row["spent"]) if spent_row else 0.0,
        })
    return results


async def create_budget(user_id: int, category_id: int, month: str, amount: float, period_months: int = 1) -> int:
    async with get_db() as db:
        cur = await db.execute(
            "INSERT INTO budgets (user_id, category_id, month, amount, period_months) VALUES (?, ?, ?, ?, ?)",
            (user_id, category_id, month, amount, period_months),
        )
        await db.commit()
        return cur.lastrowid


async def update_budget(user_id: int, budget_id: int, amount: float) -> bool:
    async with get_db() as db:
        cur = await db.execute(
            "UPDATE budgets SET amount = ? WHERE id = ? AND user_id = ?",
            (amount, budget_id, user_id),
        )
        await db.commit()
        return cur.rowcount > 0


async def delete_budget(user_id: int, budget_id: int) -> bool:
    async with get_db() as db:
        cur = await db.execute(
            "DELETE FROM budgets WHERE id = ? AND user_id = ?", (budget_id, user_id)
        )
        await db.commit()
        return cur.rowcount > 0


# ── Savings goal queries ──────────────────────────────────────────────────────────────

async def get_goals(user_id: int):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        return await cur.fetchall()


async def get_goal(user_id: int, goal_id: int):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT * FROM savings_goals WHERE id = ? AND user_id = ?",
            (goal_id, user_id),
        )
        return await cur.fetchone()


async def create_goal(
    user_id: int, name: str, target_amount: float, saved_amount: float,
    target_date: str | None, icon: str, color: str,
    scheme_type: str | None = None, institution: str | None = None,
    scheme_notes: str | None = None,
) -> int:
    async with get_db() as db:
        cur = await db.execute(
            "INSERT INTO savings_goals"
            " (user_id, name, target_amount, saved_amount, target_date, icon, color,"
            "  scheme_type, institution, scheme_notes)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, name, target_amount, saved_amount, target_date, icon, color,
             scheme_type, institution, scheme_notes),
        )
        await db.commit()
        return cur.lastrowid


async def update_goal(user_id: int, goal_id: int, data: dict) -> bool:
    goal = await get_goal(user_id, goal_id)
    if not goal:
        return False
    async with get_db() as db:
        await db.execute(
            "UPDATE savings_goals SET name=?, target_amount=?, target_date=?,"
            " icon=?, color=?, status=?, scheme_type=?, institution=?, scheme_notes=?,"
            " updated_at=CURRENT_TIMESTAMP"
            " WHERE id=? AND user_id=?",
            (
                data.get("name", goal["name"]),
                data.get("target_amount", goal["target_amount"]),
                data.get("target_date", goal["target_date"]),
                data.get("icon", goal["icon"]),
                data.get("color", goal["color"]),
                data.get("status", goal["status"]),
                data.get("scheme_type", goal["scheme_type"]),
                data.get("institution", goal["institution"]),
                data.get("scheme_notes", goal["scheme_notes"]),
                goal_id, user_id,
            ),
        )
        await db.commit()
    return True


async def delete_goal(user_id: int, goal_id: int) -> bool:
    async with get_db() as db:
        cur = await db.execute(
            "DELETE FROM savings_goals WHERE id = ? AND user_id = ?", (goal_id, user_id)
        )
        await db.commit()
        return cur.rowcount > 0


async def deposit_to_goal(user_id: int, goal_id: int, amount: float) -> bool:
    goal = await get_goal(user_id, goal_id)
    if not goal:
        return False
    new_saved = min(goal["saved_amount"] + amount, goal["target_amount"])
    new_status = "completed" if new_saved >= goal["target_amount"] else goal["status"]
    async with get_db() as db:
        await db.execute(
            "UPDATE savings_goals SET saved_amount=?, status=?, updated_at=CURRENT_TIMESTAMP"
            " WHERE id=? AND user_id=?",
            (new_saved, new_status, goal_id, user_id),
        )
        cur = await db.execute(
            "SELECT id FROM categories WHERE name = 'Savings' AND system_default = 1 LIMIT 1"
        )
        cat_row = await cur.fetchone()
        if cat_row:
            from datetime import date as _today
            note = f"Savings: {goal['name']}"
            await db.execute(
                "INSERT INTO transactions (user_id, type, amount, category_id, note, txn_date)"
                " VALUES (?, 'expense', ?, ?, ?, ?)",
                (user_id, amount, cat_row["id"], note, _today.today().isoformat()),
            )
        await db.commit()
    return True


# ── Household queries ───────────────────────────────────────────────────────────────────

def _gen_invite_code() -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


async def get_user_household(user_id: int):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT h.*, hm.role FROM households h"
            " JOIN household_members hm ON h.id = hm.household_id"
            " WHERE hm.user_id = ?",
            (user_id,),
        )
        return await cur.fetchone()


async def get_household_members(household_id: int):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT u.id, u.name, u.email, hm.role, hm.joined_at"
            " FROM household_members hm JOIN users u ON hm.user_id = u.id"
            " WHERE hm.household_id = ? ORDER BY hm.joined_at",
            (household_id,),
        )
        return await cur.fetchall()


async def create_household(user_id: int, name: str) -> int:
    invite_code = _gen_invite_code()
    async with get_db() as db:
        cur = await db.execute(
            "INSERT INTO households (name, invite_code, created_by) VALUES (?, ?, ?)",
            (name, invite_code, user_id),
        )
        household_id = cur.lastrowid
        await db.execute(
            "INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, 'owner')",
            (household_id, user_id),
        )
        await db.commit()
        return household_id


async def join_household(user_id: int, invite_code: str):
    async with get_db() as db:
        cur = await db.execute(
            "SELECT id FROM households WHERE invite_code = ?", (invite_code,)
        )
        row = await cur.fetchone()
        if not row:
            return None
        household_id = row["id"]
        try:
            await db.execute(
                "INSERT INTO household_members (household_id, user_id) VALUES (?, ?)",
                (household_id, user_id),
            )
            await db.commit()
        except Exception:
            return None
        return household_id


async def leave_household(user_id: int, household_id: int) -> bool:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT role FROM household_members WHERE household_id=? AND user_id=?",
            (household_id, user_id),
        )
        mem = await cur.fetchone()
        if not mem:
            return False
        if mem["role"] == "owner":
            cnt = await db.execute(
                "SELECT COUNT(*) FROM household_members WHERE household_id=?", (household_id,)
            )
            count = (await cnt.fetchone())[0]
            if count > 1:
                return False
            await db.execute("DELETE FROM households WHERE id=?", (household_id,))
        else:
            await db.execute(
                "DELETE FROM household_members WHERE household_id=? AND user_id=?",
                (household_id, user_id),
            )
        await db.commit()
        return True


# ── Profile queries ─────────────────────────────────────────────────────────────────────

async def update_user_profile(user_id: int, name: str, currency: str) -> bool:
    async with get_db() as db:
        cur = await db.execute(
            "UPDATE users SET name=?, currency=? WHERE id=?", (name, currency, user_id)
        )
        await db.commit()
        return cur.rowcount > 0


async def update_user_password(user_id: int, new_hash: str) -> bool:
    async with get_db() as db:
        cur = await db.execute(
            "UPDATE users SET password_hash=? WHERE id=?", (new_hash, user_id)
        )
        await db.commit()
        return cur.rowcount > 0


async def get_user_stats(user_id: int) -> dict:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT COUNT(*) as total_txns,"
            " COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) as total_spent,"
            " COALESCE(SUM(CASE WHEN type='income' THEN amount END), 0) as total_earned"
            " FROM transactions WHERE user_id=?",
            (user_id,),
        )
        row = await cur.fetchone()
        return dict(row) if row else {"total_txns": 0, "total_spent": 0.0, "total_earned": 0.0}


# ── Splits (bill splitting) ──────────────────────────────────────────────────────────────

async def get_splits(user_id: int) -> list:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT * FROM splits WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        rows = await cur.fetchall()
        result = []
        for row in rows:
            split = dict(row)
            mcur = await db.execute(
                "SELECT * FROM split_members WHERE split_id = ? ORDER BY id",
                (row["id"],),
            )
            members = [dict(m) for m in await mcur.fetchall()]
            split["members"] = members
            result.append(split)
        return result


async def create_split(user_id: int, title: str, total_amount: float, members: list) -> int:
    async with get_db() as db:
        cur = await db.execute(
            "INSERT INTO splits (user_id, title, total_amount) VALUES (?, ?, ?)",
            (user_id, title, total_amount),
        )
        await db.commit()
        split_id = cur.lastrowid
        for m in members:
            await db.execute(
                "INSERT INTO split_members (split_id, name, share_amount) VALUES (?, ?, ?)",
                (split_id, m["name"], m["share_amount"]),
            )
        await db.commit()
        return split_id


async def delete_split(user_id: int, split_id: int) -> bool:
    async with get_db() as db:
        cur = await db.execute(
            "DELETE FROM splits WHERE id = ? AND user_id = ?", (split_id, user_id)
        )
        await db.commit()
        return cur.rowcount > 0


async def toggle_split_member_paid(user_id: int, split_id: int, member_id: int) -> bool:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT id FROM splits WHERE id = ? AND user_id = ?", (split_id, user_id)
        )
        if not await cur.fetchone():
            return False
        await db.execute(
            "UPDATE split_members SET paid = CASE WHEN paid = 1 THEN 0 ELSE 1 END"
            " WHERE id = ? AND split_id = ?",
            (member_id, split_id),
        )
        await db.commit()
        return True

"""
Export endpoints — CSV, JSON full data dump, PDF monthly statement.
"""
import csv
import io
import json
import os
import re
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse

from auth.jwt import get_current_user
from database.db import get_db

router = APIRouter(prefix="/export", tags=["export"])


# ── helpers ──────────────────────────────────────────────────────────────────

async def _fetch_transactions(user_id: int, year: int | None = None) -> list[dict]:
    """Return all transactions for the user, optionally filtered by year."""
    sql = (
        "SELECT t.id, t.type, t.amount, t.txn_date, t.note, t.visibility,"
        " c.name as category, c.icon as category_icon"
        " FROM transactions t JOIN categories c ON t.category_id = c.id"
        " WHERE t.user_id = ?"
    )
    params: list = [user_id]
    if year:
        sql += " AND substr(t.txn_date, 1, 4) = ?"
        params.append(str(year))
    sql += " ORDER BY t.txn_date DESC, t.id DESC"
    async with get_db() as db:
        cur = await db.execute(sql, params)
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def _fetch_budgets(user_id: int) -> list[dict]:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT b.id, b.month, b.amount, b.period_months, c.name as category"
            " FROM budgets b JOIN categories c ON b.category_id = c.id"
            " WHERE b.user_id = ? ORDER BY b.month DESC",
            [user_id],
        )
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def _fetch_goals(user_id: int) -> list[dict]:
    async with get_db() as db:
        cur = await db.execute(
            "SELECT id, name, target_amount, current_amount, target_date, icon, color"
            " FROM savings_goals WHERE user_id = ? ORDER BY id",
            [user_id],
        )
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


# ── CSV ───────────────────────────────────────────────────────────────────────

@router.get("/csv")
async def export_csv(
    year: int | None = Query(default=None, ge=2000, le=2100),
    current_user: dict = Depends(get_current_user),
):
    """Download all transactions as CSV, optionally filtered by year."""
    rows = await _fetch_transactions(current_user["id"], year=year)

    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=["id", "type", "amount", "txn_date", "category", "category_icon", "note", "visibility"],
        extrasaction="ignore",
    )
    writer.writeheader()
    writer.writerows(rows)
    buf.seek(0)

    filename = f"fincura-transactions-{year or 'all'}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── JSON full export ──────────────────────────────────────────────────────────

@router.get("/json")
async def export_json(
    current_user: dict = Depends(get_current_user),
):
    """Download full data dump (transactions, budgets, goals) as JSON."""
    user_id = current_user["id"]
    transactions, budgets, goals = (
        await _fetch_transactions(user_id),
        await _fetch_budgets(user_id),
        await _fetch_goals(user_id),
    )
    payload = {
        "exported_at": date.today().isoformat(),
        "transactions": transactions,
        "budgets": budgets,
        "goals": goals,
    }
    body = json.dumps(payload, indent=2, default=str)
    return StreamingResponse(
        iter([body]),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="fincura-export.json"'},
    )


# ── PDF monthly statement ─────────────────────────────────────────────────────

_MONTH_PATTERN = re.compile(r"^\d{4}-\d{2}$")

_CURRENCY_SYMBOLS: dict[str, str] = {
    "INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥",
    "AUD": "A$", "CAD": "C$", "SGD": "S$", "AED": "د.إ",
}


@router.get("/pdf/{month}")
async def export_pdf(
    month: str,
    current_user: dict = Depends(get_current_user),
):
    """Generate a PDF monthly statement via WeasyPrint + Jinja2."""
    if not _MONTH_PATTERN.match(month):
        raise HTTPException(status_code=422, detail="month must be YYYY-MM")

    try:
        from weasyprint import HTML  # type: ignore
        from jinja2 import Environment, FileSystemLoader  # type: ignore
    except ImportError:
        raise HTTPException(status_code=503, detail="PDF generation dependencies not installed")

    user_id = current_user["id"]

    # Fetch data
    async with get_db() as db:
        cur = await db.execute(
            "SELECT name, currency FROM users WHERE id = ?", [user_id]
        )
        user_row = await cur.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        cur2 = await db.execute(
            "SELECT t.type, t.amount, t.txn_date, t.note,"
            " c.name as category, c.icon as category_icon"
            " FROM transactions t JOIN categories c ON t.category_id = c.id"
            " WHERE t.user_id = ? AND substr(t.txn_date, 1, 7) = ?"
            " ORDER BY t.txn_date DESC, t.id DESC",
            [user_id, month],
        )
        txn_rows = await cur2.fetchall()

    transactions = [dict(r) for r in txn_rows]
    total_income = sum(r["amount"] for r in transactions if r["type"] == "income")
    total_expense = sum(r["amount"] for r in transactions if r["type"] == "expense")
    net = total_income - total_expense

    currency = user_row["currency"] or "INR"
    symbol = _CURRENCY_SYMBOLS.get(currency, currency)

    y, m = month.split("-")
    month_label = datetime(int(y), int(m), 1).strftime("%B %Y")

    templates_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
    env = Environment(loader=FileSystemLoader(templates_dir), autoescape=True)
    template = env.get_template("statement.html")
    html_str = template.render(
        month_label=month_label,
        user_name=user_row["name"],
        generated_on=date.today().isoformat(),
        currency_symbol=symbol,
        total_income=total_income,
        total_expense=total_expense,
        net=net,
        transactions=transactions,
    )

    pdf_bytes = HTML(string=html_str, base_url=".").write_pdf()
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="fincura-{month}.pdf"'},
    )

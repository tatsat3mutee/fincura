from fastapi import APIRouter, Depends, HTTPException, status
from auth.jwt import get_current_user
from database import db
from schemas.models import BudgetCreate, BudgetOut, BudgetUpdate

router = APIRouter()


@router.get("", response_model=list[BudgetOut])
async def list_budgets(month: str, current_user: dict = Depends(get_current_user)):
    rows = await db.get_budgets(current_user["id"], month)
    return rows  # already plain dicts from get_budgets


@router.post("", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
async def create_budget(body: BudgetCreate, current_user: dict = Depends(get_current_user)):
    try:
        budget_id = await db.create_budget(
            current_user["id"], body.category_id, body.month, body.amount, body.period_months
        )
    except Exception:
        raise HTTPException(status_code=409, detail="Budget already exists for this category/month")
    rows = await db.get_budgets(current_user["id"], body.month)
    for r in rows:
        if r["id"] == budget_id:
            return r
    raise HTTPException(status_code=500, detail="Failed to retrieve created budget")


@router.put("/{budget_id}", response_model=BudgetOut)
async def update_budget(
    budget_id: int, body: BudgetUpdate, current_user: dict = Depends(get_current_user)
):
    ok = await db.update_budget(current_user["id"], budget_id, body.amount)
    if not ok:
        raise HTTPException(status_code=404, detail="Budget not found")
    rows = await db.get_budgets(current_user["id"], None)  # fetch all months
    # Fallback: re-query by id
    async with db.get_db() as conn:
        cur = await conn.execute(
            "SELECT b.id, b.category_id, b.month, b.amount as limit_amount,"
            " COALESCE(b.period_months, 1) as period_months,"
            " c.name as category_name, c.icon as category_icon, c.color as category_color"
            " FROM budgets b JOIN categories c ON b.category_id = c.id"
            " WHERE b.id = ? AND b.user_id = ?",
            (budget_id, current_user["id"]),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Budget not found")
    from dateutil.relativedelta import relativedelta
    from datetime import date as _date
    b = row
    period = int(b["period_months"] or 1)
    start = f"{b['month']}-01"
    end = (_date.fromisoformat(start) + relativedelta(months=period)).isoformat()
    async with db.get_db() as conn:
        cur = await conn.execute(
            "SELECT COALESCE(SUM(amount), 0) as spent FROM transactions"
            " WHERE user_id = ? AND category_id = ? AND type = 'expense'"
            " AND txn_date >= ? AND txn_date < ?",
            (current_user["id"], b["category_id"], start, end),
        )
        spent_row = await cur.fetchone()
    return {
        "id": b["id"],
        "category_id": b["category_id"],
        "month": b["month"],
        "limit_amount": float(b["limit_amount"]),
        "period_months": period,
        "category_name": b["category_name"],
        "category_icon": b["category_icon"],
        "category_color": b["category_color"],
        "spent": float(spent_row["spent"]) if spent_row else 0.0,
    }


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(budget_id: int, current_user: dict = Depends(get_current_user)):
    ok = await db.delete_budget(current_user["id"], budget_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Budget not found")

import sqlite3
from fastapi import APIRouter, Depends, HTTPException, status
from auth.jwt import get_current_user
from database import db
from schemas.models import BudgetCreate, BudgetOut, BudgetUpdate

router = APIRouter()


@router.get("", response_model=list[BudgetOut])
async def list_budgets(month: str, current_user: dict = Depends(get_current_user)):
    rows = await db.get_budgets(current_user["id"], month)
    return [dict(r) for r in rows]


@router.post("", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
async def create_budget(body: BudgetCreate, current_user: dict = Depends(get_current_user)):
    try:
        budget_id = await db.create_budget(
            current_user["id"], body.category_id, body.month, body.amount, body.period_months
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Budget already exists for this category/month")
    rows = await db.get_budgets(current_user["id"], body.month)
    for r in rows:
        if r["id"] == budget_id:
            return dict(r)
    raise HTTPException(status_code=500, detail="Failed to retrieve created budget")


@router.put("/{budget_id}", response_model=BudgetOut)
async def update_budget(
    budget_id: int, body: BudgetUpdate, current_user: dict = Depends(get_current_user)
):
    ok = await db.update_budget(current_user["id"], budget_id, body.amount)
    if not ok:
        raise HTTPException(status_code=404, detail="Budget not found")
    async with db.get_db() as conn:
        cur = await conn.execute(
            "SELECT b.id, b.category_id, b.month, b.amount as limit_amount,"
            " c.name as category_name, c.icon as category_icon, c.color as category_color,"
            " COALESCE(("
            "  SELECT SUM(t.amount) FROM transactions t"
            "  WHERE t.user_id = ? AND t.category_id = b.category_id"
            "  AND t.type = 'expense' AND strftime('%Y-%m', t.txn_date) = b.month"
            " ), 0) as spent"
            " FROM budgets b JOIN categories c ON b.category_id = c.id"
            " WHERE b.id = ? AND b.user_id = ?",
            (current_user["id"], budget_id, current_user["id"]),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Budget not found")
    return dict(row)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(budget_id: int, current_user: dict = Depends(get_current_user)):
    ok = await db.delete_budget(current_user["id"], budget_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Budget not found")

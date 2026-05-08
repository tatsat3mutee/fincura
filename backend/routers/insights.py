"""Insights router — spending anomalies, goal projections, month-end projection."""
from datetime import date
from fastapi import APIRouter, Depends
from auth.jwt import get_current_user
from database import db

router = APIRouter()


def _prev_months(n: int) -> list[str]:
    today = date.today()
    year, month = today.year, today.month
    result = []
    for _ in range(n):
        month -= 1
        if month == 0:
            month = 12
            year -= 1
        result.append(f"{year:04d}-{month:02d}")
    return result


@router.get("/anomalies")
async def anomalies(current_user=Depends(get_current_user)):
    """Flag categories where this month's spend is >150% of the 3-month rolling average."""
    user_id = current_user["id"]
    this_month = date.today().strftime("%Y-%m")
    prev_months = _prev_months(3)
    placeholders = ",".join("?" * len(prev_months))

    async with db.get_db() as conn:
        cur = await conn.execute(
            "SELECT c.name as category, c.icon, SUM(t.amount) as total"
            " FROM transactions t JOIN categories c ON t.category_id = c.id"
            " WHERE t.user_id = ? AND t.type = 'expense'"
            "   AND strftime('%Y-%m', t.txn_date) = ?"
            " GROUP BY t.category_id",
            (user_id, this_month),
        )
        current_rows = await cur.fetchall()
        current = {
            row["category"]: {"icon": row["icon"], "total": row["total"]}
            for row in current_rows
        }

        cur2 = await conn.execute(
            f"SELECT c.name as category, AVG(monthly) as avg_3m FROM ("
            f"  SELECT t.category_id, strftime('%Y-%m', t.txn_date) as mo, SUM(t.amount) as monthly"
            f"  FROM transactions t"
            f"  WHERE t.user_id = ? AND t.type = 'expense'"
            f"    AND strftime('%Y-%m', t.txn_date) IN ({placeholders})"
            f"  GROUP BY t.category_id, mo"
            f") sub JOIN categories c ON sub.category_id = c.id"
            f" GROUP BY sub.category_id",
            (user_id, *prev_months),
        )
        avg_rows = await cur2.fetchall()
        averages = {row["category"]: row["avg_3m"] for row in avg_rows}

    flags = []
    for category, data in current.items():
        avg = averages.get(category, 0)
        if avg and data["total"] > avg * 1.5:
            flags.append({
                "category": category,
                "icon": data["icon"],
                "avg_3m": round(avg, 2),
                "current_month": round(data["total"], 2),
                "ratio": round(data["total"] / avg, 2),
            })

    flags.sort(key=lambda x: x["ratio"], reverse=True)
    return flags


@router.get("/goal-projections")
async def goal_projections(current_user=Depends(get_current_user)):
    """For each active goal, estimate completion date based on monthly savings rate."""
    user_id = current_user["id"]
    today = date.today()
    prev_months = _prev_months(3)
    placeholders = ",".join("?" * len(prev_months))

    async with db.get_db() as conn:
        cur = await conn.execute(
            "SELECT * FROM savings_goals WHERE user_id = ? AND status != 'completed'",
            (user_id,),
        )
        goals = [dict(row) for row in await cur.fetchall()]

        cur2 = await conn.execute(
            f"SELECT AVG(monthly) as avg_savings FROM ("
            f"  SELECT strftime('%Y-%m', t.txn_date) as mo, SUM(t.amount) as monthly"
            f"  FROM transactions t JOIN categories c ON t.category_id = c.id"
            f"  WHERE t.user_id = ? AND t.type = 'expense' AND c.name = 'Savings'"
            f"    AND strftime('%Y-%m', t.txn_date) IN ({placeholders})"
            f"  GROUP BY mo"
            f") sub",
            (user_id, *prev_months),
        )
        rate_row = await cur2.fetchone()
        monthly_savings_rate = (rate_row["avg_savings"] or 0) if rate_row else 0

    projections = []
    for g in goals:
        remaining = g["target_amount"] - g["saved_amount"]
        if remaining <= 0:
            projections.append({"id": g["id"], "name": g["name"], "status": "completed"})
            continue

        if not monthly_savings_rate or monthly_savings_rate <= 0:
            projections.append({
                "id": g["id"], "name": g["name"],
                "remaining": round(remaining, 2),
                "monthly_rate": 0,
                "months_to_completion": None,
                "estimated_completion": None,
            })
        else:
            months_needed = remaining / monthly_savings_rate
            total_months = int(months_needed)
            est_year = today.year + (today.month - 1 + total_months) // 12
            est_month = (today.month - 1 + total_months) % 12 + 1
            projections.append({
                "id": g["id"], "name": g["name"],
                "remaining": round(remaining, 2),
                "monthly_rate": round(monthly_savings_rate, 2),
                "months_to_completion": round(months_needed, 1),
                "estimated_completion": f"{est_year:04d}-{est_month:02d}",
            })

    return projections


@router.get("/month-projection")
async def month_projection(current_user=Depends(get_current_user)):
    """Project month-end total expense based on daily spending rate so far this month."""
    user_id = current_user["id"]
    today = date.today()
    this_month = today.strftime("%Y-%m")

    async with db.get_db() as conn:
        cur = await conn.execute(
            "SELECT SUM(amount) as total FROM transactions"
            " WHERE user_id = ? AND type = 'expense'"
            "   AND strftime('%Y-%m', txn_date) = ?",
            (user_id, this_month),
        )
        row = await cur.fetchone()
        spent_so_far = (row["total"] or 0) if row else 0

    day_of_month = today.day
    if today.month == 12:
        days_in_month = 31
    else:
        days_in_month = (date(today.year, today.month + 1, 1) - date(today.year, today.month, 1)).days

    daily_rate = spent_so_far / day_of_month if day_of_month > 0 else 0
    projected = daily_rate * days_in_month

    return {
        "spent_so_far": round(spent_so_far, 2),
        "day_of_month": day_of_month,
        "days_in_month": days_in_month,
        "daily_rate": round(daily_rate, 2),
        "projected_month_total": round(projected, 2),
    }

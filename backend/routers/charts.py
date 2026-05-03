import calendar
from datetime import date

from fastapi import APIRouter, Depends, Query

from auth.jwt import get_current_user
from database import db

router = APIRouter()


def _current_month() -> str:
    return date.today().strftime("%Y-%m")


@router.get("/summary")
async def summary(month: str | None = Query(None), current_user=Depends(get_current_user)):
    return await db.get_monthly_summary(current_user["id"], month or _current_month())


@router.get("/monthly-trend")
async def monthly_trend(months: int = Query(6, ge=1, le=24), current_user=Depends(get_current_user)):
    today = date.today()
    month_list: list[str] = []
    for i in range(months - 1, -1, -1):
        year = today.year
        mo = today.month - i
        while mo <= 0:
            mo += 12
            year -= 1
        month_list.append(f"{year:04d}-{mo:02d}")

    rows = await db.get_monthly_trend(current_user["id"], months)
    data: dict[str, dict] = {m: {"income": 0.0, "expense": 0.0} for m in month_list}
    for row in rows:
        if row["month"] in data:
            data[row["month"]][row["type"]] = row["total"]

    labels = [calendar.month_abbr[int(m.split("-")[1])] for m in month_list]
    return {
        "labels": labels,
        "income": [data[m]["income"] for m in month_list],
        "expense": [data[m]["expense"] for m in month_list],
    }


@router.get("/category-breakdown")
async def category_breakdown(month: str | None = Query(None), current_user=Depends(get_current_user)):
    rows = await db.get_category_breakdown(current_user["id"], month or _current_month())
    return {
        "labels": [r["name"] for r in rows],
        "amounts": [r["total"] for r in rows],
        "colors": [r["color"] for r in rows],
        "icons": [r["icon"] for r in rows],
    }


@router.get("/daily-spend")
async def daily_spend(month: str | None = Query(None), current_user=Depends(get_current_user)):
    m = month or _current_month()
    year, mo = int(m.split("-")[0]), int(m.split("-")[1])
    num_days = calendar.monthrange(year, mo)[1]

    rows = await db.get_daily_spend(current_user["id"], m)
    day_data: dict[str, float] = {str(i).zfill(2): 0.0 for i in range(1, num_days + 1)}
    for row in rows:
        day_data[row["day"]] = row["total"]

    return {
        "labels": [str(i) for i in range(1, num_days + 1)],
        "amounts": [day_data[str(i).zfill(2)] for i in range(1, num_days + 1)],
    }

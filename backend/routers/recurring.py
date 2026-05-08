from collections import defaultdict
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from auth.jwt import get_current_user
from database.db import get_db

router = APIRouter()


@router.get("/recurring/detect")
async def detect_recurring(current_user=Depends(get_current_user)):
    """Detect recurring transaction patterns from the last 90 days."""
    user_id = current_user["id"]
    cutoff = (date.today() - timedelta(days=90)).isoformat()

    async with get_db() as conn:
        cur = await conn.execute(
            "SELECT t.id, t.category_id, t.amount, t.note, t.txn_date, t.type,"
            " c.name as category_name"
            " FROM transactions t JOIN categories c ON t.category_id = c.id"
            " WHERE t.user_id = ? AND t.txn_date >= ? AND t.is_recurring = 0"
            " ORDER BY t.txn_date",
            (user_id, cutoff),
        )
        rows = await cur.fetchall()

    groups: dict = defaultdict(list)
    for row in rows:
        key = (
            row["category_id"],
            round(float(row["amount"]), 2),
            (row["note"] or "").strip().lower()[:60],
        )
        groups[key].append(dict(row))

    candidates = []
    for (cat_id, amount, note), txns in groups.items():
        if len(txns) < 2:
            continue
        dates = sorted(datetime.fromisoformat(t["txn_date"]) for t in txns)
        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        avg_gap = sum(gaps) / len(gaps)

        if 5 <= avg_gap <= 9:
            pattern = "weekly"
        elif 12 <= avg_gap <= 16:
            pattern = "biweekly"
        elif 25 <= avg_gap <= 35:
            pattern = "monthly"
        else:
            continue

        candidates.append({
            "category_id": cat_id,
            "category_name": txns[0]["category_name"],
            "type": txns[0]["type"],
            "amount": amount,
            "note": note,
            "pattern": pattern,
            "avg_gap_days": round(avg_gap, 1),
            "occurrences": len(txns),
            "last_date": max(t["txn_date"] for t in txns),
            "transaction_ids": [t["id"] for t in txns],
        })

    return sorted(candidates, key=lambda x: x["occurrences"], reverse=True)

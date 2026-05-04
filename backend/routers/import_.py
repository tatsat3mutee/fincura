"""
Bank statement import endpoints.

Flow:
  POST /import/preview  — upload CSV/XLSX, returns parsed rows (dry-run, nothing saved)
  POST /import/confirm  — save the approved rows as transactions

Both steps require authentication. The confirm step accepts the same preview list
plus a category_id to assign to all imported transactions.
"""
import io
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from auth.jwt import get_current_user
from database.db import get_db
from services.bank_parser import parse_bank_csv

router = APIRouter(prefix="/import", tags=["import"])

_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


class PreviewRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    txn_date: str
    type: str
    amount: float
    note: str


class ConfirmRequest(BaseModel):
    rows: list[PreviewRow]
    category_id: int = Field(gt=0)


# ── Preview ───────────────────────────────────────────────────────────────────

@router.post("/preview", response_model=list[PreviewRow])
async def import_preview(
    file: Annotated[UploadFile, File(description="CSV or XLSX bank statement")],
    current_user: dict = Depends(get_current_user),
):
    """
    Parse the uploaded bank statement and return rows for the user to review.
    Nothing is written to the database.
    """
    raw = await file.read(_MAX_FILE_SIZE + 1)
    if len(raw) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    filename = file.filename or ""
    try:
        rows = parse_bank_csv(raw, filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Cap at 1000 rows to prevent memory issues
    return rows[:1000]


# ── Confirm ───────────────────────────────────────────────────────────────────

@router.post("/confirm")
async def import_confirm(
    body: ConfirmRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Persist the confirmed rows as transactions with the given category.
    """
    user_id = current_user["id"]

    if not body.rows:
        raise HTTPException(status_code=422, detail="No rows to import")

    # Verify the category belongs to this user or is a system default
    async with get_db() as db:
        cur = await db.execute(
            "SELECT id FROM categories WHERE id = ? AND (user_id = ? OR system_default = 1)",
            [body.category_id, user_id],
        )
        cat = await cur.fetchone()
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")

        inserted = 0
        for row in body.rows:
            if row.type not in ("income", "expense"):
                continue
            await db.execute(
                "INSERT INTO transactions (user_id, type, amount, category_id, txn_date, note, visibility)"
                " VALUES (?, ?, ?, ?, ?, ?, 'personal')",
                [user_id, row.type, row.amount, body.category_id, row.txn_date, row.note or None],
            )
            inserted += 1
        await db.commit()

    return {"imported": inserted}

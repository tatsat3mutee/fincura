from fastapi import APIRouter, Depends, HTTPException, Query

from auth.jwt import get_current_user
from database import db
from schemas.models import TransactionCreate, TransactionOut, TransactionUpdate

router = APIRouter()


def _row(r) -> dict:
    return dict(r)


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    type: str | None = Query(None),
    category_id: int | None = Query(None),
    month: str | None = Query(None),
    q: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
):
    rows = await db.get_transactions(
        current_user["id"],
        txn_type=type, category_id=category_id, month=month, q=q,
        limit=limit, offset=offset,
    )
    return [_row(r) for r in rows]


@router.post("", response_model=TransactionOut, status_code=201)
async def create_transaction(body: TransactionCreate, current_user=Depends(get_current_user)):
    txn_id = await db.create_transaction(
        current_user["id"], body.type, body.amount, body.category_id,
        body.note, body.txn_date, body.visibility,
    )
    row = await db.get_transaction(current_user["id"], txn_id)
    return _row(row)


@router.get("/{txn_id}", response_model=TransactionOut)
async def get_transaction(txn_id: int, current_user=Depends(get_current_user)):
    row = await db.get_transaction(current_user["id"], txn_id)
    if not row:
        raise HTTPException(404, "Transaction not found")
    return _row(row)


@router.put("/{txn_id}", response_model=TransactionOut)
async def update_transaction(txn_id: int, body: TransactionUpdate, current_user=Depends(get_current_user)):
    ok = await db.update_transaction(
        current_user["id"], txn_id,
        body.model_dump(exclude_none=True),
    )
    if not ok:
        raise HTTPException(404, "Transaction not found")
    row = await db.get_transaction(current_user["id"], txn_id)
    return _row(row)


@router.delete("/{txn_id}", status_code=204)
async def delete_transaction(txn_id: int, current_user=Depends(get_current_user)):
    ok = await db.delete_transaction(current_user["id"], txn_id)
    if not ok:
        raise HTTPException(404, "Transaction not found")

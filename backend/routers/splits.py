from fastapi import APIRouter, Depends, HTTPException
from auth.jwt import get_current_user
from database import db
from schemas.models import SplitCreate, SplitOut

router = APIRouter(prefix="/api/splits", tags=["splits"])


@router.get("", response_model=list[SplitOut])
async def list_splits(current_user: dict = Depends(get_current_user)):
    rows = await db.get_splits(current_user["user_id"])
    return [
        SplitOut(
            id=r["id"],
            title=r["title"],
            total_amount=r["total_amount"],
            created_at=r["created_at"],
            members=[
                {"id": m["id"], "name": m["name"], "share_amount": m["share_amount"], "paid": bool(m["paid"])}
                for m in r["members"]
            ],
        )
        for r in rows
    ]


@router.post("", response_model=SplitOut, status_code=201)
async def create_split(body: SplitCreate, current_user: dict = Depends(get_current_user)):
    if not body.members:
        raise HTTPException(status_code=422, detail="Add at least one person to split with")
    members = [{"name": m.name, "share_amount": m.share_amount} for m in body.members]
    split_id = await db.create_split(current_user["user_id"], body.title, body.total_amount, members)
    splits = await db.get_splits(current_user["user_id"])
    split = next(s for s in splits if s["id"] == split_id)
    return SplitOut(
        id=split["id"],
        title=split["title"],
        total_amount=split["total_amount"],
        created_at=split["created_at"],
        members=[
            {"id": m["id"], "name": m["name"], "share_amount": m["share_amount"], "paid": bool(m["paid"])}
            for m in split["members"]
        ],
    )


@router.patch("/{split_id}/members/{member_id}/paid", response_model=dict)
async def toggle_paid(split_id: int, member_id: int, current_user: dict = Depends(get_current_user)):
    ok = await db.toggle_split_member_paid(current_user["user_id"], split_id, member_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Split not found")
    return {"ok": True}


@router.delete("/{split_id}", status_code=204)
async def delete_split(split_id: int, current_user: dict = Depends(get_current_user)):
    ok = await db.delete_split(current_user["user_id"], split_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Split not found")

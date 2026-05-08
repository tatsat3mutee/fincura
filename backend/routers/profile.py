import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from auth.jwt import get_current_user
from database import db
from schemas.models import ChangePassword, ProfileUpdate, UserOut, UserStatsOut

router = APIRouter()


@router.get("", response_model=UserOut)
async def get_profile(current_user: dict = Depends(get_current_user)):
    row = await db.get_user_by_id(current_user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


@router.put("", response_model=UserOut)
async def update_profile(body: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    await db.update_user_profile(current_user["id"], body.name, body.currency)
    row = await db.get_user_by_id(current_user["id"])
    return dict(row)


@router.put("/password", status_code=204)
async def change_password(body: ChangePassword, current_user: dict = Depends(get_current_user)):
    row = await db.get_user_by_id(current_user["id"])
    if not row or not row["password_hash"]:
        raise HTTPException(status_code=400, detail="Cannot change password for OAuth accounts")
    old_hash = row["password_hash"].encode() if isinstance(row["password_hash"], str) else row["password_hash"]
    if not bcrypt.checkpw(body.old_password.encode(), old_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    await db.update_user_password(current_user["id"], new_hash)


@router.get("/stats", response_model=UserStatsOut)
async def get_stats(current_user: dict = Depends(get_current_user)):
    return await db.get_user_stats(current_user["id"])


@router.delete("", status_code=204)
async def delete_account(current_user: dict = Depends(get_current_user)):
    await db.delete_user(current_user["id"])

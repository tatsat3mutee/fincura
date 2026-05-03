from fastapi import APIRouter, Depends, HTTPException, status
from auth.jwt import get_current_user
from database import db
from schemas.models import HouseholdCreate, HouseholdJoin, HouseholdMemberOut, HouseholdOut

router = APIRouter()


@router.get("/me", response_model=HouseholdOut)
async def get_my_household(current_user: dict = Depends(get_current_user)):
    row = await db.get_user_household(current_user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Not in a household")
    household = dict(row)
    members = await db.get_household_members(household["id"])
    household["members"] = [dict(m) for m in members]
    return household


@router.post("", response_model=HouseholdOut, status_code=status.HTTP_201_CREATED)
async def create_household(body: HouseholdCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.get_user_household(current_user["id"])
    if existing:
        raise HTTPException(status_code=409, detail="Already in a household")
    household_id = await db.create_household(current_user["id"], body.name)
    row = await db.get_user_household(current_user["id"])
    household = dict(row)
    members = await db.get_household_members(household_id)
    household["members"] = [dict(m) for m in members]
    return household


@router.post("/join", response_model=HouseholdOut)
async def join_household(body: HouseholdJoin, current_user: dict = Depends(get_current_user)):
    existing = await db.get_user_household(current_user["id"])
    if existing:
        raise HTTPException(status_code=409, detail="Already in a household")
    household_id = await db.join_household(current_user["id"], body.invite_code)
    if not household_id:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    row = await db.get_user_household(current_user["id"])
    household = dict(row)
    members = await db.get_household_members(household_id)
    household["members"] = [dict(m) for m in members]
    return household


@router.delete("/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_household(current_user: dict = Depends(get_current_user)):
    row = await db.get_user_household(current_user["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Not in a household")
    ok = await db.leave_household(current_user["id"], row["id"])
    if not ok:
        raise HTTPException(
            status_code=409,
            detail="Cannot leave: you are the owner with other members. Transfer ownership first.",
        )

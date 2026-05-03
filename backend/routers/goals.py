from fastapi import APIRouter, Depends, HTTPException, status
from auth.jwt import get_current_user
from database import db
from schemas.models import GoalCreate, GoalDeposit, GoalOut, GoalUpdate

router = APIRouter()


@router.get("", response_model=list[GoalOut])
async def list_goals(current_user: dict = Depends(get_current_user)):
    rows = await db.get_goals(current_user["id"])
    return [dict(r) for r in rows]


@router.post("", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
async def create_goal(body: GoalCreate, current_user: dict = Depends(get_current_user)):
    goal_id = await db.create_goal(
        current_user["id"],
        body.name, body.target_amount, body.saved_amount,
        body.target_date, body.icon, body.color,
        body.scheme_type, body.institution, body.scheme_notes,
    )
    row = await db.get_goal(current_user["id"], goal_id)
    return dict(row)


@router.put("/{goal_id}", response_model=GoalOut)
async def update_goal(
    goal_id: int, body: GoalUpdate, current_user: dict = Depends(get_current_user)
):
    ok = await db.update_goal(current_user["id"], goal_id, body.model_dump(exclude_none=True))
    if not ok:
        raise HTTPException(status_code=404, detail="Goal not found")
    row = await db.get_goal(current_user["id"], goal_id)
    return dict(row)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(goal_id: int, current_user: dict = Depends(get_current_user)):
    ok = await db.delete_goal(current_user["id"], goal_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Goal not found")


@router.post("/{goal_id}/deposit", response_model=GoalOut)
async def deposit(
    goal_id: int, body: GoalDeposit, current_user: dict = Depends(get_current_user)
):
    ok = await db.deposit_to_goal(current_user["id"], goal_id, body.amount)
    if not ok:
        raise HTTPException(status_code=404, detail="Goal not found")
    row = await db.get_goal(current_user["id"], goal_id)
    return dict(row)

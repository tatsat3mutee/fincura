from fastapi import APIRouter, Depends

from auth.jwt import get_current_user
from database import db
from schemas.models import CategoryOut

router = APIRouter()


@router.get("", response_model=list[CategoryOut])
async def list_categories(current_user=Depends(get_current_user)):
    rows = await db.get_categories(current_user["id"])
    return [dict(r) for r in rows]

import secrets
import string
from fastapi import APIRouter, Depends
from auth.jwt import get_current_user
from database import db

router = APIRouter(prefix="/api/referral", tags=["referral"])


def _gen_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


@router.get("/code")
async def get_referral_code(current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    async with db.get_db() as conn:
        cur = await conn.execute(
            "SELECT code FROM referral_codes WHERE user_id = ?", (user_id,)
        )
        row = await cur.fetchone()
        if row:
            return {"code": row["code"]}
        code = _gen_code()
        for _ in range(5):
            dup = await conn.execute(
                "SELECT id FROM referral_codes WHERE code = ?", (code,)
            )
            if not await dup.fetchone():
                break
            code = _gen_code()
        await conn.execute(
            "INSERT INTO referral_codes (user_id, code) VALUES (?, ?)", (user_id, code)
        )
        await conn.commit()
        return {"code": code}


@router.get("/stats")
async def get_referral_stats(current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    async with db.get_db() as conn:
        cur = await conn.execute(
            "SELECT code FROM referral_codes WHERE user_id = ?", (user_id,)
        )
        row = await cur.fetchone()
        if not row:
            return {"code": None, "total_referred": 0}
        code = row["code"]
        cur2 = await conn.execute(
            "SELECT COUNT(*) as cnt FROM users WHERE referred_by = ?", (code,)
        )
        cnt_row = await cur2.fetchone()
        total = cnt_row["cnt"] if cnt_row else 0
        return {"code": code, "total_referred": total}

import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import bcrypt
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address

from auth.jwt import ALGORITHM, SECRET_KEY, create_access_token, get_current_user
from database.db import (
    create_google_user,
    create_user,
    get_user_by_email,
    get_user_by_google_id,
    get_user_by_id,
    link_google_account,
)
from schemas.models import TokenOut, UserLogin, UserOut, UserRegister

router = APIRouter()
_limiter = Limiter(key_func=get_remote_address)

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get(
    "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"
)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _user_out(row) -> UserOut:
    return UserOut(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        currency=row["currency"],
        created_at=row["created_at"],
    )


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
@_limiter.limit("10/minute")
async def register(request: Request, body: UserRegister):
    if await get_user_by_email(body.email):
        raise HTTPException(status_code=409, detail="Email already registered")
    user_id = await create_user(body.name, body.email, _hash_password(body.password))
    user = await get_user_by_id(user_id)
    return TokenOut(access_token=create_access_token(user_id), user=_user_out(user))


@router.post("/login", response_model=TokenOut)
@_limiter.limit("20/minute")
async def login(request: Request, body: UserLogin):
    user = await get_user_by_email(body.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user["password_hash"]:
        raise HTTPException(
            status_code=400, detail="This account uses Google Sign-In. Please use 'Continue with Google'."
        )
    if not _verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return TokenOut(access_token=create_access_token(user["id"]), user=_user_out(user))


@router.get("/me", response_model=UserOut)
async def me(current_user=Depends(get_current_user)):
    return _user_out(current_user)


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.get("/google")
async def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars")
    state = jwt.encode(
        {"nonce": secrets.token_urlsafe(16), "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
        SECRET_KEY, algorithm=ALGORITHM,
    )
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
    }
    return RedirectResponse(_GOOGLE_AUTH_URL + "?" + urlencode(params))


@router.get("/google/callback")
async def google_callback(code: str, state: str | None = None, error: str | None = None):
    if error:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=google_cancelled")
    if not GOOGLE_CLIENT_ID:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=not_configured")

    if state:
        try:
            jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
        except JWTError:
            return RedirectResponse(f"{FRONTEND_URL}/login?error=invalid_state")

    try:
        async with httpx.AsyncClient() as client:
            token_res = await client.post(_GOOGLE_TOKEN_URL, data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            })
            token_data = token_res.json()
            if "error" in token_data:
                return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed")

            info_res = await client.get(
                _GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {token_data['access_token']}"},
            )
            userinfo = info_res.json()
    except Exception:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=network_error")

    google_id: str = userinfo["id"]
    email: str = userinfo["email"]
    name: str = userinfo.get("name", email.split("@")[0])

    user = await get_user_by_google_id(google_id)
    if not user:
        user = await get_user_by_email(email)
        if user:
            await link_google_account(user["id"], google_id)
        else:
            uid = await create_google_user(name, email, google_id)
            user = await get_user_by_id(uid)

    token = create_access_token(user["id"])
    return RedirectResponse(f"{FRONTEND_URL}/oauth-callback?token={token}")

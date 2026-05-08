import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import bcrypt
import httpx
import resend as _resend
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

logger = logging.getLogger(__name__)
from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address

from auth.jwt import (
    ALGORITHM, SECRET_KEY,
    create_access_token, create_refresh_token,
    set_refresh_cookie, clear_auth_cookies,
    get_current_user,
)
from database.db import (
    create_google_user,
    create_user,
    get_user_by_email,
    get_user_by_google_id,
    get_user_by_id,
    link_google_account,
    set_verification_token,
    verify_email_token,
)
from schemas.models import TokenOut, UserLogin, UserOut, UserRegister, ResendVerificationBody

router = APIRouter()
_limiter = Limiter(key_func=get_remote_address)

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get(
    "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"
)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "noreply@fincura.app")
if RESEND_API_KEY:
    _resend.api_key = RESEND_API_KEY

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


async def _send_verification_email(user_id: int, email: str, name: str) -> None:
    """Send email verification link via Resend. Silently skips if RESEND_API_KEY not configured."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping verification email for user %s", user_id)
        return
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    await set_verification_token(user_id, token, expires)
    verify_url = f"{FRONTEND_URL}/verify-email?token={token}"
    try:
        result = _resend.Emails.send({
            "from": FROM_EMAIL,
            "to": email,
            "subject": "Verify your Fincura account",
            "html": (
                f"<p>Hi {name},</p>"
                f"<p>Click the link below to verify your email address. "
                f"This link expires in 24 hours.</p>"
                f"<p><a href='{verify_url}'>Verify email</a></p>"
                f"<p>If you didn't create a Fincura account, you can safely ignore this email.</p>"
            ),
        })
        logger.info("Verification email sent to %s — id: %s", email, getattr(result, "id", result))
    except Exception as exc:
        logger.error("Failed to send verification email to %s: %s", email, exc)


def _user_out(row) -> UserOut:
    return UserOut(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        currency=row["currency"],
        created_at=row["created_at"],
        email_verified=bool(row["email_verified"]),
    )


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
@_limiter.limit("10/minute")
async def register(request: Request, response: Response, body: UserRegister):
    if await get_user_by_email(body.email):
        raise HTTPException(status_code=409, detail="Email already registered")
    user_id = await create_user(body.name, body.email, _hash_password(body.password))
    user = await get_user_by_id(user_id)
    await _send_verification_email(user_id, body.email, body.name)
    set_refresh_cookie(response, user_id)
    return TokenOut(access_token=create_access_token(user_id), user=_user_out(user))


@router.post("/login", response_model=TokenOut)
@_limiter.limit("20/minute")
async def login(request: Request, response: Response, body: UserLogin):
    user = await get_user_by_email(body.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user["password_hash"]:
        raise HTTPException(
            status_code=400, detail="This account uses Google Sign-In. Please use 'Continue with Google'."
        )
    if not _verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    set_refresh_cookie(response, user["id"])
    return TokenOut(access_token=create_access_token(user["id"]), user=_user_out(user))


@router.get("/me", response_model=UserOut)
async def me(current_user=Depends(get_current_user)):
    return _user_out(current_user)


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    """
    Browser sends the httpOnly refresh cookie automatically to this path.
    Returns a new short-lived access token in the response body.
    Also rotates the refresh cookie.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Rotate: issue new refresh cookie + new access token
    set_refresh_cookie(response, user_id)
    return TokenOut(access_token=create_access_token(user_id), user=_user_out(user))


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"message": "Logged out"}


@router.post("/verify-email")
async def verify_email(token: str):
    """Consume a verification token and mark the account as verified."""
    user = await verify_email_token(token)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    return {"message": "Email verified"}


@router.post("/resend-verification")
@_limiter.limit("3/minute")
async def resend_verification(request: Request, current_user=Depends(get_current_user)):
    """Re-send verification email to the logged-in user if not yet verified."""
    if current_user["email_verified"]:
        return {"message": "Already verified"}
    await _send_verification_email(current_user["id"], current_user["email"], current_user["name"])
    return {"message": "Verification email sent"}


@router.post("/resend-verification-public")
@_limiter.limit("3/minute")
async def resend_verification_public(request: Request, body: ResendVerificationBody):
    """Re-send verification email by email address — no login required.

    Always returns the same message regardless of whether the email exists,
    to avoid leaking account information.
    """
    _GENERIC = {"message": "If that email has an unverified account, a new link has been sent."}
    user = await get_user_by_email(body.email)
    if not user or user["email_verified"]:
        return _GENERIC
    await _send_verification_email(user["id"], user["email"], user["name"])
    return _GENERIC


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
async def google_callback(code: str, state: str, error: str | None = None):
    if error:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=google_cancelled")
    if not GOOGLE_CLIENT_ID:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=not_configured")

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

    # Access token in URL param (15 min — short enough to be safe in transit)
    # Refresh cookie is set so the frontend can silently renew access tokens
    access_token = create_access_token(user["id"])
    redirect = RedirectResponse(f"{FRONTEND_URL}/oauth-callback?token={access_token}")
    set_refresh_cookie(redirect, user["id"])
    return redirect

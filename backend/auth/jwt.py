import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from database.db import get_user_by_id

SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"

# Access token: short-lived, returned in response body → stored in React state (never localStorage)
ACCESS_TOKEN_EXPIRE_MINUTES = 15
# Refresh token: long-lived, set as httpOnly cookie scoped to /api/auth/refresh only
REFRESH_TOKEN_EXPIRE_DAYS = 30

_IS_PROD = os.getenv("ENV", "development") == "production"

_bearer = HTTPBearer()


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "access"},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def create_refresh_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "refresh"},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def set_refresh_cookie(response: Response, user_id: int) -> None:
    """Set refresh token as httpOnly cookie, scoped to /api/auth/refresh."""
    refresh_token = create_refresh_token(user_id)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=_IS_PROD,                        # HTTPS only in production
        samesite="none" if _IS_PROD else "lax",  # cross-site in prod (Vercel ↔ Render)
        path="/api/auth/refresh",               # Browser never auto-sends this elsewhere
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        key="refresh_token",
        path="/api/auth/refresh",
        httponly=True,
        secure=_IS_PROD,
        samesite="none" if _IS_PROD else "lax",
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
):
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        # Accept new tokens (type="access") AND legacy 7-day tokens (no type claim)
        # — grace period: old localStorage tokens expire naturally within 7 days
        token_type = payload.get("type", "access")
        if token_type != "access":
            raise exc
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise exc

    user = await get_user_by_id(user_id)
    if user is None:
        raise exc
    return user


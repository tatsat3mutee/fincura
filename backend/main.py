import os
import logging
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

from database.db import init_db, seed_db, startup_db, shutdown_db
from routers import auth, budgets, categories, charts, goals, household, profile, transactions
from routers import splits
from routers import export as export_router
from routers import import_ as import_router
from routers import insights as insights_router
from routers import referral as referral_router
from routers import recurring as recurring_router

_ENV = os.getenv("ENV", "development")
_IS_PROD = _ENV == "production"

# ── Structured JSON logging ────────────────────────────────────────────
class _JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log: dict = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            log["exc"] = self.formatException(record.exc_info)
        return json.dumps(log)

_handler = logging.StreamHandler()
_handler.setFormatter(_JSONFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler])
logger = logging.getLogger("fincura")

# ── Sentry ────────────────────────────────────────────────────────────────────────────
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[
            FastApiIntegration(),
            LoggingIntegration(level=logging.WARNING, event_level=logging.ERROR),
        ],
        environment=_ENV,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )
    logger.info("Sentry initialised")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if _IS_PROD:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; "
                "img-src 'self' data:; "
                "connect-src 'self'"
            )
        return response

_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    secret = os.environ.get("SECRET_KEY", "")
    if not secret or secret == "change-me-in-production":
        import warnings
        warnings.warn(
            "SECRET_KEY is not set or uses the insecure default. "
            "Set the SECRET_KEY environment variable before deploying to production.",
            stacklevel=2,
        )
    await startup_db()
    await init_db()
    await seed_db()
    yield
    await shutdown_db()


app = FastAPI(
    title="Fincura API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if not _IS_PROD else None,
    redoc_url=None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,             prefix="/api/auth",         tags=["auth"])
app.include_router(categories.router,       prefix="/api/categories",   tags=["categories"])
app.include_router(transactions.router,     prefix="/api/transactions",  tags=["transactions"])
app.include_router(charts.router,           prefix="/api/charts",        tags=["charts"])
app.include_router(budgets.router,          prefix="/api/budgets",       tags=["budgets"])
app.include_router(goals.router,            prefix="/api/goals",         tags=["goals"])
app.include_router(household.router,        prefix="/api/household",     tags=["household"])
app.include_router(profile.router,          prefix="/api/profile",       tags=["profile"])
app.include_router(splits.router)
app.include_router(export_router.router,    prefix="/api",               tags=["export"])
app.include_router(import_router.router,    prefix="/api",               tags=["import"])
app.include_router(insights_router.router,  prefix="/api/insights",      tags=["insights"])
app.include_router(referral_router.router)
app.include_router(recurring_router.router, prefix="/api",               tags=["recurring"])


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok", "version": "1.0.0"}

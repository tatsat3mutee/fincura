import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from database.db import init_db, seed_db, startup_db, shutdown_db
from routers import auth, budgets, categories, charts, goals, household, profile, transactions

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


app = FastAPI(title="Fincura API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,         prefix="/api/auth",         tags=["auth"])
app.include_router(categories.router,   prefix="/api/categories",   tags=["categories"])
app.include_router(transactions.router, prefix="/api/transactions",  tags=["transactions"])
app.include_router(charts.router,       prefix="/api/charts",        tags=["charts"])
app.include_router(budgets.router,      prefix="/api/budgets",       tags=["budgets"])
app.include_router(goals.router,        prefix="/api/goals",         tags=["goals"])
app.include_router(household.router,    prefix="/api/household",     tags=["household"])
app.include_router(profile.router,      prefix="/api/profile",       tags=["profile"])


@app.get("/health")
async def health():
    return {"status": "ok"}

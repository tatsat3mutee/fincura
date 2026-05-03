from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    currency: str
    created_at: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Categories ────────────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: int
    name: str
    icon: str
    color: str
    type: str

    model_config = ConfigDict(from_attributes=True)


# ── Transactions ──────────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    type: Literal["expense", "income"]
    amount: float
    category_id: int
    note: str | None = None
    txn_date: str
    visibility: Literal["personal", "shared"] = "personal"

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v

    @field_validator("txn_date")
    @classmethod
    def valid_date(cls, v: str) -> str:
        from datetime import date
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError("txn_date must be YYYY-MM-DD")
        return v


class TransactionUpdate(BaseModel):
    type: Literal["expense", "income"] | None = None
    amount: float | None = None
    category_id: int | None = None
    note: str | None = None
    txn_date: str | None = None
    visibility: Literal["personal", "shared"] | None = None


class TransactionOut(BaseModel):
    id: int
    user_id: int
    category_id: int
    type: str
    amount: float
    note: str | None
    txn_date: str
    visibility: str
    created_at: str
    updated_at: str
    category_name: str
    category_icon: str
    category_color: str

    model_config = ConfigDict(from_attributes=True)


# ── Budgets ───────────────────────────────────────────────────────────────────

class BudgetCreate(BaseModel):
    category_id: int
    month: str
    amount: float
    period_months: int = 1

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v

    @field_validator("period_months")
    @classmethod
    def period_valid(cls, v: int) -> int:
        if v not in (1, 2, 3, 6, 12):
            raise ValueError("period_months must be 1, 2, 3, 6, or 12")
        return v


class BudgetUpdate(BaseModel):
    amount: float

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v


class BudgetOut(BaseModel):
    id: int
    category_id: int
    month: str
    limit_amount: float
    period_months: int
    spent: float
    category_name: str
    category_icon: str
    category_color: str

    model_config = ConfigDict(from_attributes=True)


# ── Goals ─────────────────────────────────────────────────────────────────────

class GoalCreate(BaseModel):
    name: str
    target_amount: float
    saved_amount: float = 0.0
    target_date: str | None = None
    icon: str = "◎"
    color: str = "#1a472a"
    scheme_type: str | None = None
    institution: str | None = None
    scheme_notes: str | None = None

    @field_validator("target_amount")
    @classmethod
    def target_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Target amount must be positive")
        return v


class GoalUpdate(BaseModel):
    name: str | None = None
    target_amount: float | None = None
    target_date: str | None = None
    icon: str | None = None
    color: str | None = None
    status: Literal["active", "completed", "paused"] | None = None
    scheme_type: str | None = None
    institution: str | None = None
    scheme_notes: str | None = None


class GoalDeposit(BaseModel):
    amount: float

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v


class GoalOut(BaseModel):
    id: int
    name: str
    target_amount: float
    saved_amount: float
    target_date: str | None
    icon: str
    color: str
    status: str
    scheme_type: str | None = None
    institution: str | None = None
    scheme_notes: str | None = None
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


# ── Household ─────────────────────────────────────────────────────────────────

class HouseholdCreate(BaseModel):
    name: str


class HouseholdJoin(BaseModel):
    invite_code: str


class HouseholdMemberOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    joined_at: str

    model_config = ConfigDict(from_attributes=True)


class HouseholdOut(BaseModel):
    id: int
    name: str
    invite_code: str
    created_by: int
    created_at: str
    role: str
    members: list[HouseholdMemberOut] = []

    model_config = ConfigDict(from_attributes=True)


# ── Profile ───────────────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    name: str
    currency: str


class ChangePassword(BaseModel):
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserStatsOut(BaseModel):
    total_txns: int
    total_spent: float
    total_earned: float


# ── Splits ────────────────────────────────────────────────────────────────────

class SplitMemberCreate(BaseModel):
    name: str
    share_amount: float


class SplitCreate(BaseModel):
    title: str
    total_amount: float
    members: list[SplitMemberCreate]


class SplitMemberOut(BaseModel):
    id: int
    name: str
    share_amount: float
    paid: bool
    model_config = ConfigDict(from_attributes=True)


class SplitOut(BaseModel):
    id: int
    title: str
    total_amount: float
    created_at: str
    members: list[SplitMemberOut]
    model_config = ConfigDict(from_attributes=True)


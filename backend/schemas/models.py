from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ── Auth ────────────────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ResendVerificationBody(BaseModel):
    email: EmailStr


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    currency: str
    created_at: str
    email_verified: bool = False


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Categories ────────────────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: int
    name: str
    icon: str
    color: str
    type: str

    model_config = ConfigDict(from_attributes=True)


# ── Transactions ──────────────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    type: Literal["expense", "income"]
    amount: float = Field(gt=0, le=10_000_000)
    category_id: int
    note: str | None = Field(default=None, max_length=500)
    txn_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    visibility: Literal["personal", "shared"] = "personal"
    is_recurring: bool = False
    recurrence_rule: str | None = Field(default=None, max_length=50)
    recurrence_end_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    tax_tag: str | None = Field(default=None, max_length=20)


class TransactionUpdate(BaseModel):
    type: Literal["expense", "income"] | None = None
    amount: float | None = Field(default=None, gt=0, le=10_000_000)
    category_id: int | None = None
    note: str | None = Field(default=None, max_length=500)
    txn_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    visibility: Literal["personal", "shared"] | None = None
    is_recurring: bool | None = None
    recurrence_rule: str | None = Field(default=None, max_length=50)
    recurrence_end_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    tax_tag: str | None = Field(default=None, max_length=20)


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
    is_recurring: bool = False
    recurrence_rule: str | None = None
    recurrence_end_date: str | None = None
    tax_tag: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ── Budgets ────────────────────────────────────────────────────────────────────────

class BudgetCreate(BaseModel):
    category_id: int
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    amount: float = Field(gt=0, le=10_000_000)
    period_months: int = Field(default=1)

    @field_validator("period_months")
    @classmethod
    def period_valid(cls, v: int) -> int:
        if v not in (1, 2, 3, 6, 12):
            raise ValueError("period_months must be 1, 2, 3, 6, or 12")
        return v


class BudgetUpdate(BaseModel):
    amount: float = Field(gt=0, le=10_000_000)


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


# ── Goals ─────────────────────────────────────────────────────────────────────────────

class GoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    target_amount: float = Field(gt=0, le=100_000_000)
    saved_amount: float = Field(default=0.0, ge=0)
    target_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    icon: str = Field(default="◎", max_length=10)
    color: str = Field(default="#1a472a", pattern=r"^#[0-9a-fA-F]{6}$")
    scheme_type: str | None = Field(default=None, max_length=100)
    institution: str | None = Field(default=None, max_length=200)
    scheme_notes: str | None = Field(default=None, max_length=1000)


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
    amount: float = Field(gt=0, le=100_000_000)


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


# ── Household ───────────────────────────────────────────────────────────────────────

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


# ── Profile ──────────────────────────────────────────────────────────────────────────────

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


# ── Splits ───────────────────────────────────────────────────────────────────────────────

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

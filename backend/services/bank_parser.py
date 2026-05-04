"""
Bank statement CSV parser.
Supports HDFC, ICICI, SBI, Axis, and a Generic fallback.
All parsers return a list of dicts with keys:
    txn_date (YYYY-MM-DD), type (income|expense), amount (float), note (str)
"""
import io
import re
from datetime import datetime
from typing import Any

import pandas as pd


def _parse_date(s: str) -> str | None:
    """Try multiple date formats and return YYYY-MM-DD or None."""
    for fmt in (
        "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y",
        "%Y-%m-%d", "%m/%d/%Y", "%d %b %Y", "%d %B %Y",
    ):
        try:
            return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def _to_float(s: Any) -> float | None:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return None
    try:
        return float(str(s).replace(",", "").replace(" ", ""))
    except ValueError:
        return None


# ── HDFC ─────────────────────────────────────────────────────────────────────

def _parse_hdfc(df: pd.DataFrame) -> list[dict]:
    # HDFC columns: Date, Narration, Value Dat, Debit Amount, Credit Amount, Chq/Ref Number, Closing Balance
    rows = []
    for _, row in df.iterrows():
        d = _parse_date(str(row.get("Date", "")))
        if not d:
            continue
        debit = _to_float(row.get("Debit Amount"))
        credit = _to_float(row.get("Credit Amount"))
        note = str(row.get("Narration", "")).strip()[:500]
        if credit and credit > 0:
            rows.append({"txn_date": d, "type": "income", "amount": credit, "note": note})
        if debit and debit > 0:
            rows.append({"txn_date": d, "type": "expense", "amount": debit, "note": note})
    return rows


# ── ICICI ────────────────────────────────────────────────────────────────────

def _parse_icici(df: pd.DataFrame) -> list[dict]:
    # ICICI columns: S No., Value Date, Transaction Date, Cheque Number, Transaction Remarks, Withdrawal Amount (INR ), Deposit Amount (INR ), Balance (INR )
    rows = []
    date_col = next((c for c in df.columns if "date" in c.lower() and "transaction" in c.lower()), None) \
               or next((c for c in df.columns if "date" in c.lower()), None)
    debit_col = next((c for c in df.columns if "withdrawal" in c.lower()), None)
    credit_col = next((c for c in df.columns if "deposit" in c.lower()), None)
    remark_col = next((c for c in df.columns if "remark" in c.lower() or "narration" in c.lower()), None)

    for _, row in df.iterrows():
        d = _parse_date(str(row.get(date_col, ""))) if date_col else None
        if not d:
            continue
        debit = _to_float(row.get(debit_col)) if debit_col else None
        credit = _to_float(row.get(credit_col)) if credit_col else None
        note = str(row.get(remark_col, "")).strip()[:500] if remark_col else ""
        if credit and credit > 0:
            rows.append({"txn_date": d, "type": "income", "amount": credit, "note": note})
        if debit and debit > 0:
            rows.append({"txn_date": d, "type": "expense", "amount": debit, "note": note})
    return rows


# ── Axis ─────────────────────────────────────────────────────────────────────

def _parse_axis(df: pd.DataFrame) -> list[dict]:
    # Axis: Tran Date, CHEQUENO, PARTICULARS, DEBIT, CREDIT, BALANCE
    rows = []
    for _, row in df.iterrows():
        d = _parse_date(str(row.get("Tran Date", "")))
        if not d:
            continue
        debit = _to_float(row.get("DEBIT"))
        credit = _to_float(row.get("CREDIT"))
        note = str(row.get("PARTICULARS", "")).strip()[:500]
        if credit and credit > 0:
            rows.append({"txn_date": d, "type": "income", "amount": credit, "note": note})
        if debit and debit > 0:
            rows.append({"txn_date": d, "type": "expense", "amount": debit, "note": note})
    return rows


# ── Generic fallback ──────────────────────────────────────────────────────────

def _parse_generic(df: pd.DataFrame) -> list[dict]:
    """
    Best-effort parser: looks for date, amount, and debit/credit columns
    by heuristic name matching.
    """
    cols = [c.lower().strip() for c in df.columns]
    orig = list(df.columns)

    def find(candidates: list[str]) -> str | None:
        for c in candidates:
            for i, col in enumerate(cols):
                if c in col:
                    return orig[i]
        return None

    date_col = find(["date", "txn_date", "value date", "trans date"])
    amt_col = find(["amount"])
    debit_col = find(["debit", "withdrawal", "dr"])
    credit_col = find(["credit", "deposit", "cr"])
    note_col = find(["narration", "description", "particulars", "remarks", "note"])

    rows = []
    for _, row in df.iterrows():
        d = _parse_date(str(row.get(date_col, ""))) if date_col else None
        if not d:
            continue
        note = str(row.get(note_col, "")).strip()[:500] if note_col else ""

        if amt_col:
            amount = _to_float(row.get(amt_col))
            if amount and amount != 0:
                txn_type = "expense" if amount < 0 else "income"
                rows.append({"txn_date": d, "type": txn_type, "amount": abs(amount), "note": note})
        else:
            debit = _to_float(row.get(debit_col)) if debit_col else None
            credit = _to_float(row.get(credit_col)) if credit_col else None
            if credit and credit > 0:
                rows.append({"txn_date": d, "type": "income", "amount": credit, "note": note})
            if debit and debit > 0:
                rows.append({"txn_date": d, "type": "expense", "amount": debit, "note": note})
    return rows


# ── Dispatcher ────────────────────────────────────────────────────────────────

def _detect_bank(cols: list[str]) -> str:
    c = set(c.lower().strip() for c in cols)
    if "narration" in c and "chq/ref number" in c:
        return "hdfc"
    if any("withdrawal" in x for x in c) and any("deposit" in x for x in c):
        return "icici"
    if "tran date" in c and "particulars" in c:
        return "axis"
    return "generic"


def parse_bank_csv(content: bytes, filename: str = "") -> list[dict]:
    """
    Parse a bank statement CSV/XLSX and return normalised transaction rows.
    Raises ValueError on unreadable files.
    """
    try:
        if filename.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
        else:
            # Try utf-8, fall back to latin-1
            try:
                df = pd.read_csv(io.BytesIO(content), encoding="utf-8", skip_blank_lines=True, on_bad_lines="skip")
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(content), encoding="latin-1", skip_blank_lines=True, on_bad_lines="skip")
    except Exception as e:
        raise ValueError(f"Could not read file: {e}") from e

    # Drop fully empty rows
    df = df.dropna(how="all").reset_index(drop=True)
    if df.empty:
        return []

    bank = _detect_bank(list(df.columns))
    if bank == "hdfc":
        return _parse_hdfc(df)
    if bank == "icici":
        return _parse_icici(df)
    if bank == "axis":
        return _parse_axis(df)
    return _parse_generic(df)

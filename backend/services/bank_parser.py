"""
Bank statement parser.
Supports CSV, XLSX, XLS, and PDF formats.
Banks: HDFC, ICICI, SBI, Axis, Kotak, BOB, PNB, and a Generic fallback.
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


def _read_excel_or_csv(content: bytes, filename: str, password: str | None = None) -> pd.DataFrame:
    """Read CSV/XLSX/XLS into a DataFrame, handling passwords and encoding."""
    fname = filename.lower()
    if fname.endswith(".xlsx"):
        buf = io.BytesIO(content)
        if password:
            import msoffcrypto
            decrypted = io.BytesIO()
            f = msoffcrypto.OfficeFile(buf)
            if f.is_encrypted():
                f.load_key(password=password)
                f.decrypt(decrypted)
                decrypted.seek(0)
                buf = decrypted
            else:
                buf.seek(0)
        return pd.read_excel(buf, engine="openpyxl")
    elif fname.endswith(".xls"):
        return pd.read_excel(io.BytesIO(content), engine="xlrd")
    else:
        # CSV — try utf-8, fall back to latin-1
        try:
            return pd.read_csv(io.BytesIO(content), encoding="utf-8", skip_blank_lines=True, on_bad_lines="skip")
        except UnicodeDecodeError:
            return pd.read_csv(io.BytesIO(content), encoding="latin-1", skip_blank_lines=True, on_bad_lines="skip")


def parse_bank_csv(content: bytes, filename: str = "", password: str | None = None) -> list[dict]:
    """
    Parse a bank statement CSV/XLSX/XLS and return normalised transaction rows.
    Raises ValueError on unreadable files.
    Raises PermissionError if file is password-protected and no/wrong password given.
    """
    try:
        df = _read_excel_or_csv(content, filename, password)
    except Exception as e:
        err_str = str(e).lower()
        if "password" in err_str or "encrypted" in err_str or "decrypt" in err_str:
            raise PermissionError("password_required") from e
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


# ── PDF Parsing ───────────────────────────────────────────────────────────────

def _detect_bank_pdf(text: str) -> str:
    """Detect which bank issued the PDF statement from its text content."""
    t = text.lower()
    if "state bank of india" in t or "sbi" in t:
        return "sbi"
    if "hdfc bank" in t:
        return "hdfc"
    if "icici bank" in t:
        return "icici"
    if "axis bank" in t:
        return "axis"
    if "kotak mahindra" in t:
        return "kotak"
    if "bank of baroda" in t or "bob" in t:
        return "bob"
    if "punjab national bank" in t or "pnb" in t:
        return "pnb"
    return "generic"


def _clean_amount(s: str) -> float | None:
    """Parse Indian-formatted amounts: 1,30,307.42 → 130307.42"""
    if not s or s.strip() in ("-", "", "—", "nil"):
        return None
    cleaned = re.sub(r"[^\d.]", "", s.strip())
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_sbi_pdf_tables(tables: list, text: str) -> list[dict]:
    """Parse SBI statement tables extracted by pdfplumber."""
    rows: list[dict] = []
    for table in tables:
        if not table or len(table) < 2:
            continue
        # Find header row to determine column indices
        header_idx = -1
        for i, row in enumerate(table):
            row_text = " ".join(str(c or "").lower() for c in row)
            if "debit" in row_text and "credit" in row_text:
                header_idx = i
                break
        if header_idx < 0:
            continue

        header = [str(c or "").lower().strip() for c in table[header_idx]]
        # SBI columns: Value Date | Post Date | Details | Ref No/Cheque No | ₹ Debit | ₹ Credit | Balance
        date_idx = next((i for i, h in enumerate(header) if "value" in h or "date" in h), 0)
        detail_idx = next((i for i, h in enumerate(header) if "detail" in h or "particular" in h), 2)
        debit_idx = next((i for i, h in enumerate(header) if "debit" in h), None)
        credit_idx = next((i for i, h in enumerate(header) if "credit" in h), None)

        if debit_idx is None or credit_idx is None:
            continue

        for row in table[header_idx + 1:]:
            if not row or len(row) <= max(debit_idx, credit_idx):
                continue
            date_str = str(row[date_idx] or "").strip()
            d = _parse_date(date_str)
            if not d:
                continue
            detail = str(row[detail_idx] or "").strip()[:500]
            debit = _clean_amount(str(row[debit_idx] or ""))
            credit = _clean_amount(str(row[credit_idx] or ""))
            if credit and credit > 0:
                rows.append({"txn_date": d, "type": "income", "amount": credit, "note": detail})
            if debit and debit > 0:
                rows.append({"txn_date": d, "type": "expense", "amount": debit, "note": detail})
    return rows


def _parse_generic_pdf_tables(tables: list, text: str) -> list[dict]:
    """
    Fallback PDF parser: look for tables with date, debit/credit or amount columns.
    Works for HDFC, ICICI, Axis, Kotak, BOB, PNB and other banks.
    """
    rows: list[dict] = []
    for table in tables:
        if not table or len(table) < 2:
            continue
        # Find header row
        header_idx = -1
        for i, row in enumerate(table):
            row_text = " ".join(str(c or "").lower() for c in row)
            if ("date" in row_text) and ("debit" in row_text or "amount" in row_text or "withdrawal" in row_text):
                header_idx = i
                break
        if header_idx < 0:
            continue

        header = [str(c or "").lower().strip() for c in table[header_idx]]
        date_idx = next((i for i, h in enumerate(header) if "date" in h), 0)
        note_idx = next((i for i, h in enumerate(header)
                         if any(k in h for k in ("narration", "particular", "detail", "description", "remark"))), None)
        debit_idx = next((i for i, h in enumerate(header) if any(k in h for k in ("debit", "withdrawal", "dr"))), None)
        credit_idx = next((i for i, h in enumerate(header) if any(k in h for k in ("credit", "deposit", "cr"))), None)
        amt_idx = next((i for i, h in enumerate(header) if "amount" in h and "debit" not in h and "credit" not in h), None)

        for row in table[header_idx + 1:]:
            if not row or len(row) <= date_idx:
                continue
            date_str = str(row[date_idx] or "").strip()
            d = _parse_date(date_str)
            if not d:
                continue
            note = str(row[note_idx] or "").strip()[:500] if note_idx is not None and len(row) > note_idx else ""

            if amt_idx is not None and len(row) > amt_idx:
                amount = _clean_amount(str(row[amt_idx] or ""))
                if amount and amount != 0:
                    txn_type = "expense" if amount < 0 else "income"
                    rows.append({"txn_date": d, "type": txn_type, "amount": abs(amount), "note": note})
            else:
                debit = _clean_amount(str(row[debit_idx] or "")) if debit_idx is not None and len(row) > debit_idx else None
                credit = _clean_amount(str(row[credit_idx] or "")) if credit_idx is not None and len(row) > credit_idx else None
                if credit and credit > 0:
                    rows.append({"txn_date": d, "type": "income", "amount": credit, "note": note})
                if debit and debit > 0:
                    rows.append({"txn_date": d, "type": "expense", "amount": debit, "note": note})
    return rows


def parse_bank_pdf(content: bytes, filename: str = "", password: str | None = None) -> list[dict]:
    """
    Parse a bank statement PDF and return normalised transaction rows.
    Raises ValueError on unreadable files.
    Raises PermissionError if file is password-protected and no/wrong password given.
    """
    import pdfplumber

    try:
        pdf = pdfplumber.open(io.BytesIO(content), password=password)
    except Exception as e:
        err_str = str(e).lower()
        if "password" in err_str or "encrypted" in err_str:
            if password:
                raise PermissionError("wrong_password") from e
            raise PermissionError("password_required") from e
        raise ValueError(f"Could not read PDF: {e}") from e

    # Extract text from first page for bank detection
    first_page_text = ""
    all_tables: list = []
    try:
        for page in pdf.pages:
            if not first_page_text:
                first_page_text = page.extract_text() or ""
            tables = page.extract_tables()
            if tables:
                all_tables.extend(tables)
    finally:
        pdf.close()

    if not all_tables:
        raise ValueError("No transaction tables found in this PDF. The file may be an image-based scan.")

    bank = _detect_bank_pdf(first_page_text)

    if bank == "sbi":
        rows = _parse_sbi_pdf_tables(all_tables, first_page_text)
    else:
        rows = _parse_generic_pdf_tables(all_tables, first_page_text)

    if not rows:
        # Retry with generic parser in case bank-specific one failed
        rows = _parse_generic_pdf_tables(all_tables, first_page_text)

    return rows


# ── Unified entry point ──────────────────────────────────────────────────────

def parse_bank_statement(content: bytes, filename: str = "", password: str | None = None) -> list[dict]:
    """
    Parse any supported bank statement format (CSV, XLSX, XLS, PDF).
    Returns normalised transaction rows.
    Raises ValueError for unreadable files, PermissionError for encrypted files.
    """
    fname = filename.lower()
    if fname.endswith(".pdf"):
        return parse_bank_pdf(content, filename, password)
    return parse_bank_csv(content, filename, password)

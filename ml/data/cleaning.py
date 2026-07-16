import pandas as pd
import numpy as np
import logging

log = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Price parser  (handles "1.5 Cr", "80 L", plain numeric, etc.)
# ──────────────────────────────────────────────────────────────────────────────
def parse_price(val) -> float:
    try:
        raw = str(val).strip().lower().replace(',', '')
        # Remove currency symbols
        for sym in ['₹', 'rs', 'inr']:
            raw = raw.replace(sym, '').strip()

        # PG / per-bed / per-room listings — skip, not sale prices
        if '/bed' in raw or '/bedroom' in raw or '/room' in raw or '/month' in raw:
            return np.nan

        # 'Price on Request' and similar non-numeric sentinels
        if any(kw in raw for kw in ['request', 'contact', 'call', 'n/a', 'tbd', '?']):
            return np.nan

        # Range format: '2.5 - 3 Cr', '80-90 L', '2.25  - 2.25 Cr'
        # Strategy: take the average of the two endpoints
        import re
        range_match = re.search(r'([\d.]+)\s*[-–]\s*([\d.]+)\s*(cr|l|lac|lakh)?', raw)
        if range_match:
            lo, hi = float(range_match.group(1)), float(range_match.group(2))
            mid = (lo + hi) / 2
            unit = (range_match.group(3) or '').strip()
            if unit in ('cr',):
                return mid * 10_000_000
            if unit in ('l', 'lac', 'lakh'):
                return mid * 100_000
            # No unit — treat as raw ₹ if large, else ambiguous
            return mid if mid > 1000 else np.nan

        # Crore
        if 'cr' in raw:
            return float(raw.replace('cr', '').strip()) * 10_000_000
        # Lakh variants
        if 'lakh' in raw or 'lac' in raw:
            return float(raw.replace('lakh', '').replace('lac', '').strip()) * 100_000
        # Short 'l' — only if not inside a word
        if re.search(r'\d\s*l\b', raw):
            return float(re.sub(r'l.*', '', raw).strip()) * 100_000

        val_f = pd.to_numeric(raw, errors='coerce')
        return float(val_f) if pd.notna(val_f) else np.nan
    except Exception:
        return np.nan


# ──────────────────────────────────────────────────────────────────────────────
# Area parser  (sq.ft., sq.m., sqft, etc.)
# ──────────────────────────────────────────────────────────────────────────────
def parse_area(val) -> float:
    try:
        raw = str(val).strip().lower()
        raw = (raw.replace('sq.ft.', '').replace('sq.m.', '').replace('sq ft', '')
                  .replace('sqft', '').replace('sq.ft', '').replace('sft', '')
                  .replace(',', '').strip())
        return float(pd.to_numeric(raw, errors='coerce'))
    except Exception:
        return np.nan


# ──────────────────────────────────────────────────────────────────────────────
# Main cleaning function (Mumbai listings)
# ──────────────────────────────────────────────────────────────────────────────
def clean_mumbai_data(df: pd.DataFrame) -> pd.DataFrame:
    """Cleans the raw Mumbai 99acres property listings DataFrame.

    Strategy: preserve as many rows as possible.
    - Only PRICE and AREA are strictly required (BEDROOM_NUM filled with median).
    - Optional numeric columns are coerced and filled with sensible defaults.
    - Outlier thresholds are generous to avoid over-filtering.

    Args:
        df: Raw Mumbai DataFrame from ingest.load_mumbai_raw().

    Returns:
        Cleaned DataFrame with standardised column types.
    """
    df = df.copy()

    # ── 1. Parse critical columns ──────────────────────────────────────────
    df["PRICE"] = df["PRICE"].apply(parse_price)
    df["AREA"]  = df["AREA"].apply(parse_area)

    # ── 2. Coerce optional numerics (fill NaN with median/default, don't drop) ──
    optional_numeric = {
        "BEDROOM_NUM":  2.0,
        "TOTAL_FLOOR":  5.0,
        "FLOOR_NUM":    1.0,
        "BALCONY_NUM":  1.0,
        "AGE":          5.0,
    }
    for col, default in optional_numeric.items():
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            median  = df[col].median()
            fill    = median if pd.notna(median) else default
            df[col] = df[col].fillna(fill)
        else:
            df[col] = default

    # ── 3. Drop only where PRICE or AREA is truly missing ──────────────────
    before = len(df)
    df = df.dropna(subset=["PRICE", "AREA"])
    log.info("Dropped %d rows with missing PRICE/AREA (%d → %d)", before - len(df), before, len(df))

    # ── 4. Sanity-range filters (generous to preserve rows) ────────────────
    # Price: ₹1 L – ₹25 Cr  (avoids data-entry outliers)
    df = df[(df["PRICE"] >= 100_000) & (df["PRICE"] <= 250_000_000)]
    # Area: 100 – 25,000 sq.ft.
    df = df[(df["AREA"] >= 100)       & (df["AREA"] <= 25_000)]
    # Bedrooms: 0 (studio) – 10
    df = df[(df["BEDROOM_NUM"] >= 0)   & (df["BEDROOM_NUM"] <= 10)]
    # Age: 0 – 80 years
    df = df[(df["AGE"] >= 0)           & (df["AGE"] <= 80)]

    # ── 5. Derived price-per-sqft filter (remove extreme outliers) ─────────
    df["price_per_sqft"] = df["PRICE"] / df["AREA"].clip(1)
    # Valid range for Mumbai: ₹1,500 – ₹1,50,000 per sq.ft.
    df = df[(df["price_per_sqft"] >= 1_500) & (df["price_per_sqft"] <= 150_000)]
    df = df.drop(columns=["price_per_sqft"])

    # ── 6. Strip leading/trailing whitespace in string columns ─────────────
    for col in ["PROPERTY_TYPE", "CITY", "FURNISH"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()
            df[col] = df[col].replace({"nan": "Unknown", "": "Unknown"})

    # ── 7. FURNISH: convert free-text to ordinal (0=Unfurnished, 1=Semi, 2=Furnished)
    if "FURNISH" in df.columns:
        furnish_map = {
            "furnished":      2,
            "semi-furnished": 1,
            "semi furnished": 1,
            "unfurnished":    0,
        }
        df["FURNISH"] = (
            df["FURNISH"].str.lower()
            .map(furnish_map)
            .fillna(1)             # default = semi-furnished
            .astype(int)
        )

    # ── 8. Reset index ─────────────────────────────────────────────────────
    df = df.reset_index(drop=True)
    log.info("Mumbai dataset cleaned: %d rows × %d cols", *df.shape)
    return df


# ──────────────────────────────────────────────────────────────────────────────
# NHB Residex cleaner
# ──────────────────────────────────────────────────────────────────────────────
def clean_nhb_residex(df: pd.DataFrame) -> pd.DataFrame:
    """Cleans the raw NHB Residex quarterly HPI DataFrame.

    Args:
        df: Raw DataFrame with 'Quarter' and 'Prices' columns.

    Returns:
        Cleaned DataFrame with 'date' (datetime) and 'hpi' (float) columns,
        sorted chronologically.
    """
    df = df.copy()

    def _parse_quarter(q: str) -> pd.Timestamp:
        """Accepts 'Jun-13', 'Sep-2013', 'Q2 2013', etc."""
        q = str(q).strip()
        for fmt in ("%b-%y", "%b-%Y", "%B-%Y", "%B %Y"):
            try:
                return pd.to_datetime(q, format=fmt)
            except ValueError:
                continue
        # Fallback: let pandas guess
        try:
            return pd.to_datetime(q)
        except Exception:
            return pd.NaT

    df["date"] = df["Quarter"].apply(_parse_quarter)
    df["hpi"]  = pd.to_numeric(df["Prices"], errors="coerce")

    df = df.dropna(subset=["date", "hpi"])
    df = df[df["hpi"] > 0]
    df = df.sort_values("date").reset_index(drop=True)

    log.info("NHB Residex cleaned: %d quarterly rows (%s → %s)",
             len(df), df["date"].min().strftime("%Y-Q%q" if hasattr(df["date"].min(), 'quarter') else "%Y-%m"),
             df["date"].max().strftime("%Y-%m"))
    return df[["date", "hpi"]]

import pandas as pd
import numpy as np
import logging

log = logging.getLogger(__name__)

def parse_price(val):
    try:
        val = str(val).strip().lower()
        if 'cr' in val:
            return float(val.replace('cr', '').replace(',', '').strip()) * 10_000_000
        if 'l' in val:
            return float(val.replace('l', '').replace(',', '').strip()) * 100_000
        if '/' in val:
            return np.nan  # skip rent / PG
        return pd.to_numeric(val.replace(',', ''), errors='coerce')
    except:
        return np.nan

def parse_area(val):
    try:
        val = str(val).strip().lower()
        val = val.replace('sq.ft.', '').replace('sq.m.', '').replace('sqft', '').replace(',', '').strip()
        return pd.to_numeric(val, errors='coerce')
    except:
        return np.nan

def clean_mumbai_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    
    # Parse critical columns
    df["PRICE"] = df["PRICE"].apply(parse_price)
    df["AREA"] = df["AREA"].apply(parse_area)
    
    # Drop NAs
    cols = ["PRICE", "AREA", "BEDROOM_NUM"]
    df = df.dropna(subset=cols)
    
    # Numeric conversions for remaining
    for c in ["AGE", "TOTAL_FLOOR", "FLOOR_NUM", "BALCONY_NUM"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    
    df = df.dropna(subset=cols)
    
    # Basic filters
    df = df[df["PRICE"] > 100_000]
    df = df[df["AREA"] > 100]
    
    return df

def clean_nhb_residex(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    
    # Quarter is e.g. "Jun-13" or "Sep-13"
    def parse_quarter(q):
        try:
            return pd.to_datetime(str(q).strip(), format="%b-%y")
        except:
            return pd.NaT

    df["date"] = df["Quarter"].apply(parse_quarter)
    df["hpi"] = pd.to_numeric(df["Prices"], errors="coerce")
    
    df = df.dropna(subset=["date", "hpi"])
    df = df.sort_values("date").reset_index(drop=True)
    
    return df[["date", "hpi"]]

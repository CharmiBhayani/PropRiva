"""
train_pipeline.py  —  End-to-end training pipeline for PropRiva (Indian / Mumbai dataset)
===========================================================================================
Trains M1 (Market Value), M2 (Rental Value), M3 (HPI Appreciation).
Outputs:
  - models/m1_market_value/market_price_model.pkl
  - models/m2_rental_value/rent_model.pkl
  - models/m3_appreciation/appreciation_model.pkl
  - models/zip_encoder.pkl                    (LocalityEncoder aliased as ZipEncoder)
  - data/processed/hpi_city.csv               (NHB Residex HPI in wide format, one row per locality)
  - data/processed/synthetic_rental.csv       (Synthetic monthly rent dataset used to train M2)
"""

import argparse
import logging
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

# Ensure project root is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from data.ingest   import load_mumbai_raw, load_nhb_residex_raw
from data.cleaning import clean_mumbai_data, clean_nhb_residex
from models.m1_market_value.model  import M1MarketValueModel
from models.m2_rental_value.model  import M2RentalValueModel
from models.m3_appreciation.model  import M3AppreciationModel
from config import DATA_PROCESSED, MODELS_DIR
from data.features import LocalityEncoder, ZipEncoder   # ZipEncoder is alias

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("train_pipeline")


# ─────────────────────────────────────────────────────────────────────────────
# Synthetic rental target generator
# ─────────────────────────────────────────────────────────────────────────────
def generate_synthetic_rent(df: pd.DataFrame) -> pd.DataFrame:
    """Generates synthetic monthly rental targets from the cleaned sale dataset.

    Residential rental yields in Mumbai generally hover between 2% and 4%,
    with smaller properties (low bedroom count) showing higher yields.

    Formula:
        yield  = base_yield(3%) + bedroom_adj + noise
        rent   = (price × yield) / 12  (rounded to nearest ₹500)

    Args:
        df: Cleaned sale properties DataFrame.

    Returns:
        DataFrame with an added 'rent_target' column (monthly rent ₹).
    """
    df = df.copy()
    rng = np.random.default_rng(42)

    base_yield = 0.030
    bedrooms   = df["BEDROOM_NUM"].fillna(2).clip(1, 5)

    # Fewer bedrooms → slightly higher yield (studio/1BHK easier to rent)
    yield_adj  = (3.0 - bedrooms) * 0.0025
    noise      = rng.normal(0, 0.002, len(df))
    rental_yield = (base_yield + yield_adj + noise).clip(0.018, 0.040)

    # Monthly Rent (rounded to nearest ₹500)
    df["rent_target"] = ((df["PRICE"] * rental_yield) / 12 / 500).round() * 500

    median_rent  = df["rent_target"].median()
    median_yield = (df["rent_target"] * 12 / df["PRICE"]).median() * 100
    log.info(
        "Synthetic rents generated — median: ₹%s/mo  median yield: %.2f%%",
        f"{median_rent:,.0f}", median_yield,
    )
    return df


def save_synthetic_rental(df: pd.DataFrame) -> None:
    """Saves the synthetic rental dataset to data/processed/synthetic_rental.csv.

    Args:
        df: DataFrame that contains PRICE, AREA, BEDROOM_NUM, CITY, PROPERTY_TYPE,
            and rent_target columns.
    """
    keep_cols = [
        c for c in [
            "PROPERTY_TYPE", "CITY", "BEDROOM_NUM", "FURNISH", "AGE",
            "TOTAL_FLOOR", "FLOOR_NUM", "BALCONY_NUM", "AREA", "PRICE",
            "rent_target",
        ]
        if c in df.columns
    ]
    out_path = DATA_PROCESSED / "synthetic_rental.csv"
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    df[keep_cols].to_csv(out_path, index=False)
    log.info("Synthetic rental dataset saved → %s  (%d rows)", out_path, len(df))


# ─────────────────────────────────────────────────────────────────────────────
# NHB Residex → wide format  (hpi_city.csv)
# ─────────────────────────────────────────────────────────────────────────────
def save_residex_to_wide(cleaned_hpi: pd.DataFrame, localities: list) -> None:
    """Pivots NHB Residex HPI to wide format and replicates for all Mumbai localities.

    Saved as:
      - data/processed/hpi_city.csv   (primary file used by inference pipeline)

    The wide format has one row per locality and one column per quarter date,
    matching the format expected by the inference pipeline's HPI loader.

    Args:
        cleaned_hpi:  Cleaned HPI DataFrame with 'date' and 'hpi' columns.
        localities:   List of unique locality / city names from the Mumbai dataset.
    """
    df = cleaned_hpi.copy()
    df["date_str"] = df["date"].dt.strftime("%Y-%m-%d")

    # Wide pivot: columns = dates, single row with HPI values
    pivot = df.set_index("date_str")[["hpi"]].T

    rows = []
    for loc in localities:
        row = pivot.copy()
        row.insert(0, "RegionName", loc)
        rows.append(row)

    wide_df = pd.concat(rows, ignore_index=True)

    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    wide_df.to_csv(DATA_PROCESSED / "hpi_city.csv", index=False)
    log.info(
        "NHB Residex HPI saved → %s  (%d localities × %d quarters)",
        DATA_PROCESSED / "hpi_city.csv",
        len(localities),
        len(df),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Main training run
# ─────────────────────────────────────────────────────────────────────────────
def run():
    t0 = time.time()
    log.info("PropRiva ML Pipeline — Mumbai / Indian Dataset Training")
    log.info("=" * 60)

    # ── 1. Ingestion ────────────────────────────────────────────────────────
    log.info("[1/7] Loading raw data...")
    raw_listings = load_mumbai_raw()
    log.info("  Raw Mumbai rows: %d", len(raw_listings))
    raw_residex = load_nhb_residex_raw()
    log.info("  Raw NHB Residex rows: %d", len(raw_residex))

    # ── 2. Cleaning ─────────────────────────────────────────────────────────
    log.info("[2/7] Cleaning data...")
    cleaned_listings = clean_mumbai_data(raw_listings)
    log.info("  Cleaned Mumbai listings: %d rows × %d cols", *cleaned_listings.shape)
    cleaned_hpi = clean_nhb_residex(raw_residex)
    log.info("  Cleaned NHB Residex: %d quarterly rows", len(cleaned_hpi))

    # ── 3. Model M1 (Market Value) ──────────────────────────────────────────
    log.info("[3/7] Training M1 — Market Value Model...")
    m1 = M1MarketValueModel()
    m1_metrics = m1.fit(cleaned_listings, target_col="PRICE")
    m1.save()
    log.info(
        "  M1 — MAE: ₹%s  RMSE: ₹%s  R²: %.3f  MAPE: %.1f%%",
        f"{m1_metrics['mae']:,.0f}", f"{m1_metrics['rmse']:,.0f}",
        m1_metrics["r2"], m1_metrics["mape"],
    )

    # ── 4. Synthetic rental + M2 (Rental Value) ─────────────────────────────
    log.info("[4/7] Generating synthetic rental targets...")
    cleaned_listings = generate_synthetic_rent(cleaned_listings)
    save_synthetic_rental(cleaned_listings)

    log.info("[5/7] Training M2 — Rental Value Model...")
    m2 = M2RentalValueModel()
    m2_metrics = m2.fit(cleaned_listings, target_col="rent_target")
    m2.save()
    log.info(
        "  M2 — MAE: ₹%s  RMSE: ₹%s  R²: %.3f  MAPE: %.1f%%",
        f"{m2_metrics['mae']:,.0f}", f"{m2_metrics['rmse']:,.0f}",
        m2_metrics["r2"], m2_metrics["mape"],
    )

    # ── 5. Locality encoder ─────────────────────────────────────────────────
    log.info("[6/7] Saving locality encoder...")
    loc_encoder = LocalityEncoder()
    loc_encoder.fit(cleaned_listings["CITY"])
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(loc_encoder, MODELS_DIR / "zip_encoder.pkl")  # keep legacy filename
    log.info("  Locality encoder saved: %d localities", len(loc_encoder.mapping_))

    # ── 6. Save NHB Residex to wide format ──────────────────────────────────
    localities = cleaned_listings["CITY"].dropna().unique().tolist()
    save_residex_to_wide(cleaned_hpi, localities)

    # ── 7. Model M3 (Appreciation) ──────────────────────────────────────────
    log.info("[7/7] Training M3 — NHB Residex Quarterly Appreciation Model...")
    m3 = M3AppreciationModel()
    m3_metrics = m3.fit(cleaned_hpi)
    m3.save()
    log.info(
        "  M3 (4q) — MAE: %.2f  RMSE: %.2f  R²: %.3f  MAPE: %.1f%%",
        m3_metrics["mae_12m"], m3_metrics["rmse_12m"],
        m3_metrics["r2_12m"],  m3_metrics["mape_12m"],
    )

    elapsed = time.time() - t0
    log.info("=" * 60)
    log.info("Training complete in %.1fs", elapsed)

    return {"m1": m1_metrics, "m2": m2_metrics, "m3": m3_metrics}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="PropRiva ML training pipeline (Mumbai / Indian dataset)"
    )
    args = parser.parse_args()
    run()

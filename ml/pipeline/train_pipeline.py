import argparse
import logging
import sys
import time
from pathlib import Path
import numpy as np
import pandas as pd
import joblib

# Ensure project root is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from data.ingest import load_mumbai_raw, load_nhb_residex_raw
from data.cleaning import clean_mumbai_data, clean_nhb_residex
from models.m1_market_value.model import M1MarketValueModel
from models.m2_rental_value.model import M2RentalValueModel
from models.m3_appreciation.model import M3AppreciationModel
from config import DATA_PROCESSED, MODELS_DIR
from data.features import ZipEncoder

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("train_pipeline")


def generate_synthetic_rent(df: pd.DataFrame) -> pd.DataFrame:
    """Generates synthetic rental targets from the cleaned sale dataset.

    Residential rental yields in Mumbai generally hover between 2% and 4%,
    with smaller properties (low bedroom count) showing higher yields.

    Args:
        df: Cleaned sale properties DataFrame.

    Returns:
        DataFrame with an added 'rent_target' column.
    """
    df = df.copy()
    
    # Set seed for reproducibility
    rng = np.random.default_rng(42)
    
    # Base yield is 3.0%
    base_yield = 0.030
    
    # Adjust yield based on number of bedrooms (fewer bedrooms -> higher yield)
    bedrooms = df["BEDROOM_NUM"].fillna(2).clip(1, 5)
    yield_adjustment = (3.0 - bedrooms) * 0.0025
    
    # Add random noise (sd = 0.2%)
    noise = rng.normal(0, 0.002, len(df))
    
    rental_yield = (base_yield + yield_adjustment + noise).clip(0.018, 0.040)
    
    # Monthly Rent = (Price * Yield) / 12, rounded to nearest 500 Rupees
    df["rent_target"] = ((df["PRICE"] * rental_yield) / 12 / 500).round() * 500
    
    log.info(
        "Generated synthetic rents. Median rent: ₹%s/mo (yield: %.2f%%)",
        f"{df['rent_target'].median():,.0f}", (df['rent_target'] * 12 / df['PRICE']).median() * 100
    )
    return df


def save_residex_to_wide(cleaned_hpi: pd.DataFrame, cities: list):
    """Pivots HPI to wide format and replicates for all unique Mumbai cities.

    Saves to DATA_PROCESSED / "zhvi_zip.csv" and "zori_zip.csv" to preserve
    compatibility with Zillow wide-format loader in inference.

    Args:
        cleaned_hpi: Cleaned HPI index DataFrame.
        cities: List of unique city names in Mumbai.
    """
    df = cleaned_hpi.copy()
    df["date_str"] = df["date"].dt.strftime('%Y-%m-%d')
    
    # Pivot
    pivot_df = df.set_index("date_str")[["hpi"]].T
    
    # Replicate for all cities
    rows = []
    for city in cities:
        row = pivot_df.copy()
        row.insert(0, "RegionName", city)
        rows.append(row)
        
    wide_df = pd.concat(rows, ignore_index=True)
    
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    wide_df.to_csv(DATA_PROCESSED / "zhvi_zip.csv", index=False)
    wide_df.to_csv(DATA_PROCESSED / "zori_zip.csv", index=False)
    log.info("Saved pivoted HPI data to Zillow wide format in: %s", DATA_PROCESSED)


def run():
    t0 = time.time()
    log.info("  Real Estate ML — Stage 5: End-to-End Ingestion and Model Training")
    
    # 1. Ingestion
    log.info("Data Ingestion...")
    raw_listings = load_mumbai_raw()
    log.info("  Raw Mumbai rows: %d", len(raw_listings))
    raw_residex = load_nhb_residex_raw()
    log.info("  Raw NHB Residex rows: %d", len(raw_residex))

    # 2. Cleaning
    log.info("Data Cleaning...")
    cleaned_listings = clean_mumbai_data(raw_listings)
    log.info("  Cleaned Mumbai Listings shape: %s", cleaned_listings.shape)
    cleaned_hpi = clean_nhb_residex(raw_residex)
    log.info("  Cleaned NHB Residex shape: %s", cleaned_hpi.shape)

    # 3. Model M1 Training
    log.info("Training Model M1 (Market Price Prediction)...")
    m1 = M1MarketValueModel()
    m1_metrics = m1.fit(cleaned_listings, target_col="PRICE")
    m1.save()
    
    log.info(
        "M1 metrics — MAE: ₹%s  RMSE: ₹%s  R²: %.3f  MAPE: %.1f%%",
        f"{m1_metrics['mae']:,.0f}", f"{m1_metrics['rmse']:,.0f}", m1_metrics["r2"], m1_metrics["mape"]
    )

    # 4. Model M2 Training
    log.info("Generating synthetic rental target...")
    cleaned_listings = generate_synthetic_rent(cleaned_listings)

    log.info("Training Model M2 (Rental Value Prediction)...")
    m2 = M2RentalValueModel()
    m2_metrics = m2.fit(cleaned_listings, target_col="rent_target")
    m2.save()
    
    log.info(
        "M2 metrics — MAE: ₹%s  RMSE: ₹%s  R²: %.3f  MAPE: %.1f%%",
        f"{m2_metrics['mae']:,.0f}", f"{m2_metrics['rmse']:,.0f}", m2_metrics["r2"], m2_metrics["mape"]
    )

    # 5. Save compatibility zip_encoder
    log.info("Saving compatibility ZIP/City encoder...")
    zip_encoder = ZipEncoder()
    zip_encoder.fit(cleaned_listings["CITY"])
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(zip_encoder, MODELS_DIR / "zip_encoder.pkl")
    log.info("  Saved compatibility encoder to: %s", MODELS_DIR / "zip_encoder.pkl")

    # 6. Save index data to Zillow wide format for inference
    cities = cleaned_listings["CITY"].unique().tolist()
    save_residex_to_wide(cleaned_hpi, cities)

    # 7. Model M3 Training
    log.info("Training Model M3 (Appreciation Forecast)...")
    m3 = M3AppreciationModel()
    m3_metrics = m3.fit(cleaned_hpi)
    m3.save()
    
    log.info(
        "M3 metrics (12m) — MAE: %.2f  RMSE: %.2f  R²: %.3f  MAPE: %.1f%%",
        m3_metrics["mae_12m"], m3_metrics["rmse_12m"], m3_metrics["r2_12m"], m3_metrics["mape_12m"]
    )

    elapsed = time.time() - t0
    log.info("  Stage 5 training complete in %.1fs", elapsed)
    
    return {
        "m1": m1_metrics,
        "m2": m2_metrics,
        "m3": m3_metrics
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train PropRiva ML models (Stage 5)")
    args = parser.parse_args()

    run()

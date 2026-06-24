import argparse
import logging
import sys
import time
from pathlib import Path

import joblib
import pandas as pd

# Ensure project root is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import DATA_PROCESSED, DATA_ZILLOW, MODELS_DIR
from data.ingest import load_king_county, download_zillow_csvs
from data.cleaning import clean_king_county, clean_zillow_wide, clean_zillow_metro
from data.features import run_feature_pipeline
from models.m1_market_value.model import M1MarketValueModel
from models.m2_rental_value.model import M2RentalValueModel
from models.m3_appreciation.model import M3AppreciationModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("train_pipeline")


def run(force_synthetic: bool = False, skip_zillow: bool = False):
    t0 = time.time()
    log.info("  Real Estate ML — Training Pipeline")
    
    log.info("Data ingestion")
    raw_kc = load_king_county(force_synthetic=force_synthetic)
    log.info("  King County rows: %d", len(raw_kc))

    zhvi_long = zori_long = inventory_long = market_heat_long = None

    if not skip_zillow:
        zillow_paths = download_zillow_csvs()

        for name, path in zillow_paths.items():
            if not path.exists():
                log.warning("  %s not found — will use synthetic proxy", name)

        if (DATA_ZILLOW / "zhvi_zip.csv").exists():
            log.info("  Loading ZHVI")
            zhvi_long = clean_zillow_wide(
                pd.read_csv(DATA_ZILLOW / "zhvi_zip.csv"), value_col_name="zhvi"
            )
            log.info("  ZHVI long rows: %d, ZIPs: %d",
                     len(zhvi_long), zhvi_long["zip_code"].nunique())

        if (DATA_ZILLOW / "zori_zip.csv").exists():
            log.info("  Loading ZORI")
            zori_long = clean_zillow_wide(
                pd.read_csv(DATA_ZILLOW / "zori_zip.csv"), value_col_name="zori"
            )

        if (DATA_ZILLOW / "inventory.csv").exists():
            log.info("  Loading inventory")
            inventory_long = clean_zillow_metro(
                pd.read_csv(DATA_ZILLOW / "inventory.csv"), value_col_name="inventory"
            )

        if (DATA_ZILLOW / "market_heat.csv").exists():
            log.info("  Loading market heat")
            market_heat_long = clean_zillow_metro(
                pd.read_csv(DATA_ZILLOW / "market_heat.csv"), value_col_name="market_heat"
            )
    else:
        log.info("Skipping Zillow downloads ")

    # Cleaning
    log.info("Cleaning")
    kc_clean = clean_king_county(raw_kc)
    log.info("  Cleaned KC shape: %s", kc_clean.shape)

    # Feature engineering 
    log.info("Feature engineering")
    df, zip_encoder = run_feature_pipeline(
        kc_clean,
        zhvi_long=zhvi_long,
        zori_long=zori_long,
        inventory_long=inventory_long,
        market_heat_long=market_heat_long,
    )

    out_path = DATA_PROCESSED / "features.csv"
    df.to_csv(out_path, index=False)
    log.info("  Features saved: %s  (%d cols)", out_path, df.shape[1])

    # Save encoder for inference
    joblib.dump(zip_encoder, MODELS_DIR / "zip_encoder.pkl")
    log.info("  ZIP encoder saved")

    # Train M1, M2, M3
    log.info(" Training M1 (Market Value) …")
    m1 = M1MarketValueModel()
    m1_metrics = m1.fit(df, target_col="sale_price")
    m1.save()
    log.info(f"M1 metrics — MAE: ${m1_metrics['mae']:,.0f}  RMSE: ${m1_metrics['rmse']:,.0f}  R²: {m1_metrics['r2']:.3f}  MAPE: {m1_metrics['mape']:.1f}%")

    # Train M2 
    log.info(" Training M2 (Rental Value) …")
    m2 = M2RentalValueModel()
    m2_metrics = m2.fit(df, target_col="rent_target")
    m2.save()
    log.info(f"M2 metrics — MAE: ${m2_metrics['mae']:,.0f}  R²: {m2_metrics['r2']:.3f}")

    # Train M3
    log.info(" Training M3 (Appreciation) …")
    if zhvi_long is not None and len(zhvi_long) > 0:
        m3 = M3AppreciationModel()
        m3_metrics = m3.fit(zhvi_long)
        m3.save()
        log.info(f"M3 metrics — MAE_12m: ${m3_metrics['mae_12m']:,.0f}  R²_12m: {m3_metrics['r2_12m']:.3f}")
    else:
        log.warning("  M3 skipped — no ZHVI time-series data available.")
        log.warning("  Download Zillow ZHVI CSV to enable M3 training.")
        _save_synthetic_m3_fallback()

    elapsed = time.time() - t0
    log.info("  Training complete in %.1fs", elapsed)
    

    return {
        "m1": m1_metrics,
        "m2": m2_metrics,
    }


def _save_synthetic_m3_fallback():
    """
    Saves a note so inference code knows M3 is unavailable.
    """
    note = MODELS_DIR / "m3_appreciation" / "TRAINING_REQUIRED.txt"
    note.parent.mkdir(parents=True, exist_ok=True)
    note.write_text(
        "M3 was not trained because no ZHVI ZIP time-series data was available.\n"
        "To enable M3:\n"
        "  1. Download Zillow ZHVI ZIP CSV from:\n"
        "     https://www.zillow.com/research/data/\n"
        "  2. Place it at data/zillow/zhvi_zip.csv\n"
        "  3. Re-run:  python pipeline/train_pipeline.py\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train all RE ML models")
    parser.add_argument("--synthetic",    action="store_true",
                        help="Force synthetic KC data (no Kaggle needed)")
    parser.add_argument("--skip-zillow",  action="store_true",
                        help="Skip Zillow CSV downloads")
    args = parser.parse_args()

    run(force_synthetic=args.synthetic, skip_zillow=args.skip_zillow)

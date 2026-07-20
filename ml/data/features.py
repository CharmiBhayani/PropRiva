"""
features.py  –  Mumbai / Indian dataset feature engineering
============================================================
Contains:
  - MumbaiFeaturePreprocessor  : stateful label-encoder + median imputer
  - preprocess_mumbai_data     : convenience wrapper
  - LocalityEncoder            : frequency-ranked encoder for locality/city

All Zillow / US-market-specific helpers (ZipEncoder, build_zip_aggregates,
attach_zhvi_features, attach_zori_features, build_zhvi_sequences, etc.)
have been removed.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

from config import (
    M1_FEATURES, M2_FEATURES,
    BEDROOM_MULTIPLIER,
    ROOF_USEFUL_LIFE, HVAC_USEFUL_LIFE,
    ROOF_REPLACEMENT_COST, HVAC_REPLACEMENT_COST,
    MAINTENANCE_RATE,
)

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# LocalityEncoder  (replaces the old ZipEncoder)
# ─────────────────────────────────────────────────────────────────────────────
class LocalityEncoder:
    """Frequency-ranked ordinal encoder for Mumbai locality / city names.

    Most-frequent locality → 0, next → 1, …  Unknown → -1.
    Drop-in replacement for the old ZipEncoder; kept as 'ZipEncoder' alias
    so that any pickled models that reference the old name still load.
    """

    def __init__(self) -> None:
        self.mapping_: Dict[str, int] = {}
        self.default_: int = -1

    def fit(self, series: pd.Series) -> "LocalityEncoder":
        freq = series.astype(str).str.strip().value_counts()
        self.mapping_ = {loc: i for i, loc in enumerate(freq.index)}
        return self

    def transform(self, series: pd.Series) -> np.ndarray:
        return (
            series.astype(str).str.strip()
            .map(self.mapping_)
            .fillna(self.default_)
            .astype(int)
            .values
        )

    def fit_transform(self, series: pd.Series) -> np.ndarray:
        return self.fit(series).transform(series)


# Keep old name as alias so existing pickle files resolve correctly
ZipEncoder = LocalityEncoder


# ─────────────────────────────────────────────────────────────────────────────
# MumbaiFeaturePreprocessor
# ─────────────────────────────────────────────────────────────────────────────
class MumbaiFeaturePreprocessor:
    """Stateful preprocessor for Mumbai property listings (M1 / M2).

    Fits:
      - LabelEncoder for PROPERTY_TYPE
      - LabelEncoder for CITY (locality)
      - Median imputation values for all numeric feature columns

    At inference, unseen categories are mapped to the first known class.
    """

    def __init__(self) -> None:
        self.property_type_encoder = LabelEncoder()
        self.city_encoder          = LabelEncoder()
        self.medians: Dict[str, float] = {}
        self.property_types_: List[str] = []
        self.cities_: List[str] = []
        self.is_fitted = False

    # ── fit ──────────────────────────────────────────────────────────────────
    def fit(self, df: pd.DataFrame) -> "MumbaiFeaturePreprocessor":
        """Fits encoders and computes medians on the training set."""
        df = df.copy()

        # Categorical encoders
        pt_series = df["PROPERTY_TYPE"].fillna("Unknown").astype(str).str.strip()
        self.property_type_encoder.fit(pt_series)
        self.property_types_ = list(self.property_type_encoder.classes_)

        city_series = df["CITY"].fillna("Unknown").astype(str).str.strip()
        self.city_encoder.fit(city_series)
        self.cities_ = list(self.city_encoder.classes_)

        # Numeric medians
        numeric_cols = ["BEDROOM_NUM", "FURNISH", "AGE", "TOTAL_FLOOR",
                        "AREA", "BALCONY_NUM", "FLOOR_NUM"]
        for col in numeric_cols:
            if col in df.columns:
                med_val = pd.to_numeric(df[col], errors="coerce").median()
                self.medians[col] = 0.0 if pd.isna(med_val) else float(med_val)
            else:
                self.medians[col] = 0.0

        self.is_fitted = True
        log.info(
            "MumbaiFeaturePreprocessor fitted: %d property types, %d localities",
            len(self.property_types_), len(self.cities_),
        )
        return self

    # ── transform ────────────────────────────────────────────────────────────
    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Transforms a DataFrame using the fitted encoders and medians."""
        assert self.is_fitted, "Call fit() before transform()."
        df = df.copy()

        # PROPERTY_TYPE
        pt_series = (
            df["PROPERTY_TYPE"].fillna("Unknown").astype(str).str.strip()
            .apply(lambda x: x if x in self.property_types_ else self.property_types_[0])
        )
        df["PROPERTY_TYPE_enc"] = self.property_type_encoder.transform(pt_series)  # type: ignore[assignment]

        # CITY / locality
        city_series = (
            df["CITY"].fillna("Unknown").astype(str).str.strip()
            .apply(lambda x: x if x in self.cities_ else self.cities_[0])
        )
        df["CITY_enc"] = self.city_encoder.transform(city_series)  # type: ignore[assignment]

        # Numeric imputation
        numeric_cols = ["BEDROOM_NUM", "FURNISH", "AGE", "TOTAL_FLOOR",
                        "AREA", "BALCONY_NUM", "FLOOR_NUM"]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(
                    self.medians.get(col, 0.0)
                )
            else:
                df[col] = self.medians.get(col, 0.0)

        return df

    # ── persistence ──────────────────────────────────────────────────────────
    def save(self, filepath: Path) -> None:
        assert self.is_fitted
        filepath.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, filepath)
        log.info("MumbaiFeaturePreprocessor saved to %s", filepath)

    @classmethod
    def load(cls, filepath: Path) -> "MumbaiFeaturePreprocessor":
        return joblib.load(filepath)


# ─────────────────────────────────────────────────────────────────────────────
# Convenience wrapper
# ─────────────────────────────────────────────────────────────────────────────
def preprocess_mumbai_data(
    df: pd.DataFrame,
    preprocessor: Optional[MumbaiFeaturePreprocessor] = None,
) -> tuple[pd.DataFrame, MumbaiFeaturePreprocessor]:
    """Applies the Mumbai preprocessor to a cleaned properties DataFrame.

    If no fitted preprocessor is supplied a new one is fitted on *df*.

    Returns:
        (transformed_df, preprocessor)
    """
    if preprocessor is None:
        preprocessor = MumbaiFeaturePreprocessor()
        preprocessor.fit(df)

    df_transformed = preprocessor.transform(df)
    return df_transformed, preprocessor


# ─────────────────────────────────────────────────────────────────────────────
# Maintenance heuristic  (used by inference pipeline)
# ─────────────────────────────────────────────────────────────────────────────
def estimate_annual_maintenance(property_value: float, age_years: int) -> float:
    """Heuristic annual maintenance cost (₹) for Indian residential properties.

    Components:
      - Base: 1% of property value p.a.
      - Roof replacement reserve (20-year life, ₹2 L replacement)
      - HVAC / civil replacement reserve (15-year life, ₹1 L replacement)

    Args:
        property_value: Estimated or listed price in ₹.
        age_years:      Property age in years.

    Returns:
        Estimated annual maintenance cost in ₹.
    """
    roof_reserve = (min(age_years, ROOF_USEFUL_LIFE) / ROOF_USEFUL_LIFE) * (
        ROOF_REPLACEMENT_COST / ROOF_USEFUL_LIFE
    )
    hvac_reserve = (min(age_years, HVAC_USEFUL_LIFE) / HVAC_USEFUL_LIFE) * (
        HVAC_REPLACEMENT_COST / HVAC_USEFUL_LIFE
    )
    return property_value * MAINTENANCE_RATE + roof_reserve + hvac_reserve

import logging
import joblib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import xgboost as xgb

from config import MODELS_DIR

log = logging.getLogger(__name__)

MODEL_DIR = MODELS_DIR / "m3_appreciation"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

@dataclass
class AppreciationForecast:
    zip_code:             str
    current_zhvi:         float
    zhvi_3m:              float
    zhvi_6m:              float
    zhvi_9m:              float
    zhvi_12m:             float
    appreciation_pct_3m:  float
    appreciation_pct_6m:  float
    appreciation_pct_9m:  float
    appreciation_pct_12m: float
    ci_low_12m:           float
    ci_high_12m:          float
    confidence_band:      str        


class M3AppreciationModel:
    """XGBoost time-series model for forecasting property appreciation (Model M3) using NHB Residex."""

    def __init__(self):
        self.model_3m = None
        self.model_6m = None
        self.model_9m = None
        self.model_12m = None
        self.residual_std_12m = 0.0
        self.features = ["lag_1", "lag_2", "lag_3", "lag_4", "year", "quarter", "trend"]
        self.is_fitted = False

    def fit(self, df: pd.DataFrame) -> dict:
        """Trains the M3 Appreciation Model.

        Args:
            df: Cleaned NHB Residex DataFrame with 'date' and 'hpi' columns.

        Returns:
            dict containing evaluation metrics.
        """
        log.info("M3: Building time-series lag features...")
        df = df.sort_values("date").reset_index(drop=True)
        
        # Create lag features
        df["lag_1"] = df["hpi"].shift(1)
        df["lag_2"] = df["hpi"].shift(2)
        df["lag_3"] = df["hpi"].shift(3)
        df["lag_4"] = df["hpi"].shift(4)
        
        # Create time features
        df["year"] = df["date"].dt.year
        df["quarter"] = df["date"].dt.quarter
        df["trend"] = df.index
        
        # Targets: 3m (1 quarter ahead), 6m (2 quarters ahead), 9m (3 quarters ahead), 12m (4 quarters ahead)
        df["target_3m"] = df["hpi"].shift(-1)
        df["target_6m"] = df["hpi"].shift(-2)
        df["target_9m"] = df["hpi"].shift(-3)
        df["target_12m"] = df["hpi"].shift(-4)
        
        # Drop rows with NaN values
        df_clean = df.dropna().reset_index(drop=True)
        if len(df_clean) < 10:
            raise ValueError(f"Insufficient time-series data for training. Cleaned rows: {len(df_clean)}")
            
        # Chronological train/test split (first 85% train, last 15% test)
        split_idx = int(len(df_clean) * 0.85)
        train_df = df_clean.iloc[:split_idx]
        test_df = df_clean.iloc[split_idx:]
        
        log.info(
            "M3 split: %d train rows, %d test rows (%s to %s)",
            len(train_df), len(test_df),
            test_df["date"].min().strftime("%Y-%m"),
            test_df["date"].max().strftime("%Y-%m")
        )

        # Train XGBoost Models for all horizons
        self.model_3m = xgb.XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, random_state=42, n_jobs=-1, verbosity=0)
        self.model_3m.fit(train_df[self.features], train_df["target_3m"])

        self.model_6m = xgb.XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, random_state=42, n_jobs=-1, verbosity=0)
        self.model_6m.fit(train_df[self.features], train_df["target_6m"])

        self.model_9m = xgb.XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, random_state=42, n_jobs=-1, verbosity=0)
        self.model_9m.fit(train_df[self.features], train_df["target_9m"])

        self.model_12m = xgb.XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, random_state=42, n_jobs=-1, verbosity=0)
        self.model_12m.fit(train_df[self.features], train_df["target_12m"])

        self.is_fitted = True

        # Evaluation
        preds_12m = self.model_12m.predict(test_df[self.features])
        y_test_12m = test_df["target_12m"].values
        residuals_12m = y_test_12m - preds_12m
        self.residual_std_12m = float(np.std(residuals_12m))

        metrics = {
            "mae_12m": mean_absolute_error(y_test_12m, preds_12m),
            "rmse_12m": np.sqrt(mean_squared_error(y_test_12m, preds_12m)),
            "mape_12m": np.mean(np.abs((y_test_12m - preds_12m) / (y_test_12m + 1e-9))) * 100,
            "r2_12m": r2_score(y_test_12m, preds_12m),
            "residual_std_12m": self.residual_std_12m
        }

        log.info(
            "M3 metrics (12m) — MAE: %.2f  RMSE: %.2f  R²: %.3f  MAPE: %.1f%%",
            metrics["mae_12m"], metrics["rmse_12m"], metrics["r2_12m"], metrics["mape_12m"]
        )
        return metrics

    def predict_zip(
        self,
        zip_code: str,
        zhvi_long: pd.DataFrame,
        as_of_date: Optional[pd.Timestamp] = None,
    ) -> AppreciationForecast:
        """Forecasts HPI appreciation for a specific city / region."""
        assert self.is_fitted
        
        df_zip = zhvi_long.copy()
        if "value" in df_zip.columns:
            df_zip = df_zip.rename(columns={"value": "zhvi"})
        elif "hpi" in df_zip.columns:
            df_zip = df_zip.rename(columns={"hpi": "zhvi"})
            
        df_zip["date"] = pd.to_datetime(df_zip["date"])
        
        sub = df_zip[df_zip["zip_code"].astype(str) == str(zip_code)].sort_values("date").reset_index(drop=True)
        if sub.empty:
            fallback_city = df_zip["zip_code"].iloc[0]
            sub = df_zip[df_zip["zip_code"] == fallback_city].sort_values("date").reset_index(drop=True)
            log.warning("ZIP/City '%s' not found. Falling back to HPI of '%s'.", zip_code, fallback_city)

        if as_of_date:
            sub = sub[sub["date"] <= as_of_date]

        if len(sub) < 4:
            raise ValueError(f"Insufficient historical index data for {zip_code} (need at least 4 quarters). Found: {len(sub)}")

        lag_window = sub["zhvi"].values[-4:]
        current_hpi = lag_window[-1]
        
        latest_row = sub.iloc[-1]
        latest_date = pd.to_datetime(latest_row["date"])
        
        feature_dict = {
            "lag_1": lag_window[-1],
            "lag_2": lag_window[-2],
            "lag_3": lag_window[-3],
            "lag_4": lag_window[-4],
            "year": latest_date.year,
            "quarter": latest_date.quarter,
            "trend": len(sub) - 1
        }
        
        X = pd.DataFrame([feature_dict])[self.features]

        # Predict HPI values
        pred_3m = float(self.model_3m.predict(X)[0])
        pred_6m = float(self.model_6m.predict(X)[0])
        pred_9m = float(self.model_9m.predict(X)[0])
        pred_12m = float(self.model_12m.predict(X)[0])

        # Compute appreciation percentages
        app_3m = ((pred_3m - current_hpi) / current_hpi) * 100
        app_6m = ((pred_6m - current_hpi) / current_hpi) * 100
        app_9m = ((pred_9m - current_hpi) / current_hpi) * 100
        app_12m = ((pred_12m - current_hpi) / current_hpi) * 100

        # Confidence intervals
        ci_low = pred_12m - 1.96 * self.residual_std_12m
        ci_high = pred_12m + 1.96 * self.residual_std_12m
        
        band_pct = ((ci_high - ci_low) / (pred_12m + 1e-9)) * 100
        confidence_band = "narrow" if band_pct < 8 else ("moderate" if band_pct < 20 else "wide")

        return AppreciationForecast(
            zip_code=zip_code,
            current_zhvi=round(float(current_hpi), 2),
            zhvi_3m=round(pred_3m, 2),
            zhvi_6m=round(pred_6m, 2),
            zhvi_9m=round(pred_9m, 2),
            zhvi_12m=round(pred_12m, 2),
            appreciation_pct_3m=round(app_3m, 2),
            appreciation_pct_6m=round(app_6m, 2),
            appreciation_pct_9m=round(app_9m, 2),
            appreciation_pct_12m=round(app_12m, 2),
            ci_low_12m=round(ci_low, 2),
            ci_high_12m=round(ci_high, 2),
            confidence_band=confidence_band,
        )

    def save(self, path: Path = MODEL_DIR) -> None:
        """Saves the entire model instance as a single pickle file."""
        assert self.is_fitted
        dest = path / "appreciation_model.pkl"
        joblib.dump(self, dest)
        log.info("M3 model saved to %s", dest)

    def load(self, path: Path = MODEL_DIR) -> "M3AppreciationModel":
        """Loads the model instance from the saved pickle file."""
        dest = path / "appreciation_model.pkl"
        loaded = joblib.load(dest)
        self.model_3m = loaded.model_3m
        self.model_6m = loaded.model_6m
        self.model_9m = loaded.model_9m
        self.model_12m = loaded.model_12m
        self.residual_std_12m = loaded.residual_std_12m
        self.features = loaded.features
        self.is_fitted = True
        log.info("M3 model loaded from %s", dest)
        return self

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
    locality:             str       # City / sub-market name (e.g. "Thane")
    current_hpi:          float
    hpi_1q:               float     # 1 quarter ahead
    hpi_2q:               float     # 2 quarters ahead
    hpi_3q:               float     # 3 quarters ahead
    hpi_4q:               float     # 4 quarters ahead
    appreciation_pct_1q:  float
    appreciation_pct_2q:  float
    appreciation_pct_3q:  float
    appreciation_pct_4q:  float
    ci_low_4q:            float
    ci_high_4q:           float
    confidence_band:      str


class M3AppreciationModel:
    """XGBoost time-series model for forecasting property appreciation (Model M3) using NHB Residex."""

    def __init__(self):
        self.model_3m:  Optional[xgb.XGBRegressor] = None
        self.model_6m:  Optional[xgb.XGBRegressor] = None
        self.model_9m:  Optional[xgb.XGBRegressor] = None
        self.model_12m: Optional[xgb.XGBRegressor] = None
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
        
        # Create time features — explicit datetime cast so type checker resolves .dt accessor
        df["date"] = pd.to_datetime(df["date"])
        df["year"]    = df["date"].dt.year.astype(int)
        df["quarter"] = df["date"].dt.quarter.astype(int)
        df["trend"]   = df.index.astype(int)
        
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

        # Extract numpy arrays — XGBoost type stubs require ndarray, not DataFrame
        X_train = train_df[self.features].to_numpy(dtype=float)
        X_test  = test_df[self.features].to_numpy(dtype=float)

        # Train XGBoost Models for all horizons
        self.model_3m = xgb.XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, random_state=42, n_jobs=-1, verbosity=0)
        self.model_3m.fit(X_train, train_df["target_3m"].to_numpy(dtype=float))

        self.model_6m = xgb.XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, random_state=42, n_jobs=-1, verbosity=0)
        self.model_6m.fit(X_train, train_df["target_6m"].to_numpy(dtype=float))

        self.model_9m = xgb.XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, random_state=42, n_jobs=-1, verbosity=0)
        self.model_9m.fit(X_train, train_df["target_9m"].to_numpy(dtype=float))

        self.model_12m = xgb.XGBRegressor(n_estimators=100, max_depth=3, learning_rate=0.05, random_state=42, n_jobs=-1, verbosity=0)
        self.model_12m.fit(X_train, train_df["target_12m"].to_numpy(dtype=float))

        self.is_fitted = True

        # Evaluation
        preds_12m = self.model_12m.predict(X_test)
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

    def predict_locality(
        self,
        locality: str,
        hpi_df: pd.DataFrame,
        as_of_date: Optional[pd.Timestamp] = None,
    ) -> AppreciationForecast:
        """Forecasts HPI appreciation for a specific Mumbai locality / city.

        Args:
            locality:    City / sub-market name (e.g. "Thane", "Central Mumbai suburbs").
            hpi_df:      Long-format HPI DataFrame with columns: locality, date, hpi.
            as_of_date:  Optional cutoff date (use data up to this date only).

        Returns:
            AppreciationForecast dataclass.
        """
        assert self.is_fitted
        assert self.model_3m  is not None
        assert self.model_6m  is not None
        assert self.model_9m  is not None
        assert self.model_12m is not None

        df_loc = hpi_df.copy()

        # Normalise column names
        if "hpi" not in df_loc.columns:
            for alias in ["value", "zhvi"]:
                if alias in df_loc.columns:
                    df_loc = df_loc.rename(columns={alias: "hpi"})
                    break

        locality_col = "locality" if "locality" in df_loc.columns else "zip_code"
        df_loc["date"] = pd.to_datetime(df_loc["date"])

        # Filter to requested locality
        sub = (
            df_loc[df_loc[locality_col].astype(str).str.strip() == str(locality).strip()]
            .sort_values("date")
            .reset_index(drop=True)
        )
        if sub.empty:
            # Fallback: use the first available locality
            fallback = df_loc[locality_col].iloc[0]
            sub = (
                df_loc[df_loc[locality_col] == fallback]
                .sort_values("date")
                .reset_index(drop=True)
            )
            log.warning(
                "Locality '%s' not found in HPI data. Falling back to '%s'.",
                locality, fallback,
            )

        if as_of_date:
            sub = sub[sub["date"] <= as_of_date]

        if len(sub) < 4:
            raise ValueError(
                f"Insufficient historical HPI data for locality '{locality}' "
                f"(need ≥ 4 quarters, found {len(sub)})."
            )

        lag_window = sub["hpi"].values[-4:]
        current_hpi = float(lag_window[-1])

        latest_date = pd.to_datetime(sub.iloc[-1]["date"])
        feature_dict = {
            "lag_1":   lag_window[-1],
            "lag_2":   lag_window[-2],
            "lag_3":   lag_window[-3],
            "lag_4":   lag_window[-4],
            "year":    latest_date.year,
            "quarter": latest_date.quarter,
            "trend":   len(sub) - 1,
        }

        X = pd.DataFrame([feature_dict])[self.features]

        pred_3m  = float(self.model_3m.predict(X)[0])
        pred_6m  = float(self.model_6m.predict(X)[0])
        pred_9m  = float(self.model_9m.predict(X)[0])
        pred_12m = float(self.model_12m.predict(X)[0])

        app_1q = (pred_3m  - current_hpi) / current_hpi * 100
        app_2q = (pred_6m  - current_hpi) / current_hpi * 100
        app_3q = (pred_9m  - current_hpi) / current_hpi * 100
        app_4q = (pred_12m - current_hpi) / current_hpi * 100

        ci_low  = pred_12m - 1.96 * self.residual_std_12m
        ci_high = pred_12m + 1.96 * self.residual_std_12m

        band_pct       = (ci_high - ci_low) / (pred_12m + 1e-9) * 100
        confidence_band = "narrow" if band_pct < 8 else ("moderate" if band_pct < 20 else "wide")

        return AppreciationForecast(
            locality=locality,
            current_hpi=round(current_hpi, 2),
            hpi_1q=round(pred_3m,  2),
            hpi_2q=round(pred_6m,  2),
            hpi_3q=round(pred_9m,  2),
            hpi_4q=round(pred_12m, 2),
            appreciation_pct_1q=round(app_1q, 2),
            appreciation_pct_2q=round(app_2q, 2),
            appreciation_pct_3q=round(app_3q, 2),
            appreciation_pct_4q=round(app_4q, 2),
            ci_low_4q=round(ci_low,  2),
            ci_high_4q=round(ci_high, 2),
            confidence_band=confidence_band,
        )

    # Keep old name as alias for backwards compatibility with pickled models
    def predict_zip(
        self,
        zip_code: str,
        zhvi_long: pd.DataFrame,
        as_of_date: Optional[pd.Timestamp] = None,
    ) -> AppreciationForecast:
        """Deprecated alias for predict_locality()."""
        return self.predict_locality(zip_code, zhvi_long, as_of_date)

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

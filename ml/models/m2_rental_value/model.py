import logging
import joblib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import xgboost as xgb

from config import M2_FEATURES, MODELS_DIR

log = logging.getLogger(__name__)

MODEL_DIR = MODELS_DIR / "m2_rental_value"
MODEL_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class RentalPrediction:
    estimated_monthly_rent: float
    gross_yield_pct:        float
    net_yield_pct:          Optional[float] = None   # filled by M5 after subtracting maintenance

# Ensemble of XGBoost and Ridge regression for rental value estimation (M2)
class M2RentalValueModel:
    
    def __init__(self):
        self.xgb_model    = None
        self.ridge_model  = None
        self.scaler       = StandardScaler()
        self.feature_cols: list[str] = []
        self.is_fitted    = False

    def fit(self, df: pd.DataFrame, target_col: str = "rent_target") -> dict:
        log.info("M2: preparing training data …")

        avail = [f for f in M2_FEATURES if f in df.columns]
        for f in set(M2_FEATURES) - set(avail):
            df[f] = 0.0

        self.feature_cols = M2_FEATURES
        X = df[self.feature_cols].fillna(0).values
        y = np.log1p(df[target_col].values)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.15, random_state=42
        )

        # XGBoost 
        log.info("M2: training XGBoost …")
        self.xgb_model = xgb.XGBRegressor(
            n_estimators=300,
            max_depth=5,
            learning_rate=0.06,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        )
        self.xgb_model.fit(X_train, y_train, verbose=False)

        # Ridge
        log.info("M2: training Ridge …")
        X_scaled      = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        self.ridge_model = Ridge(alpha=10.0)
        self.ridge_model.fit(X_scaled, y_train)

        self.is_fitted = True

        xgb_pred   = np.expm1(self.xgb_model.predict(X_test))
        ridge_pred = np.expm1(self.ridge_model.predict(X_test_scaled))
        ensemble   = (xgb_pred + ridge_pred) / 2
        y_test_usd = np.expm1(y_test)

        metrics = {
            "mae":    mean_absolute_error(y_test_usd, ensemble),
            "rmse":   np.sqrt(mean_squared_error(y_test_usd, ensemble)),
            "r2":     r2_score(y_test_usd, ensemble),
            "mape":   np.mean(np.abs((y_test_usd - ensemble) / (y_test_usd + 1))) * 100,
        }
        log.info("M2 metrics — MAE: $%.0f  RMSE: $%.0f  R²: %.3f  MAPE: %.1f%%",
                 metrics["mae"], metrics["rmse"], metrics["r2"], metrics["mape"])
        return metrics

    def predict(
        self,
        property_features: dict,
        property_value: Optional[float] = None,
        annual_maintenance: float = 0.0,
    ) -> RentalPrediction:
        assert self.is_fitted
        X      = np.array([[property_features.get(f, 0.0) for f in self.feature_cols]], dtype=np.float32)
        X_sc   = self.scaler.transform(X)

        p_xgb   = float(np.expm1(self.xgb_model.predict(X)[0]))
        p_ridge = float(np.expm1(self.ridge_model.predict(X_sc)[0]))
        rent    = (p_xgb + p_ridge) / 2

        gross_yield = 0.0
        net_yield   = None
        if property_value and property_value > 0:
            gross_yield = (rent * 12) / property_value * 100
            if annual_maintenance > 0:
                net_yield = ((rent * 12 - annual_maintenance) / property_value) * 100

        return RentalPrediction(
            estimated_monthly_rent=round(rent, 0),
            gross_yield_pct=round(gross_yield, 2),
            net_yield_pct=round(net_yield, 2) if net_yield is not None else None,
        )

    def predict_batch(self, df: pd.DataFrame) -> pd.DataFrame:
        assert self.is_fitted
        X    = df[self.feature_cols].fillna(0).values.astype(np.float32)
        X_sc = self.scaler.transform(X)
        p_xgb   = np.expm1(self.xgb_model.predict(X))
        p_ridge = np.expm1(self.ridge_model.predict(X_sc))
        rent    = (p_xgb + p_ridge) / 2

        out = df.copy()
        out["m2_monthly_rent"] = rent.round(0)

        val_col = "m1_estimated_value" if "m1_estimated_value" in df.columns else "sale_price"
        if val_col in df.columns:
            out["m2_gross_yield"] = (rent * 12) / df[val_col].clip(1) * 100

        return out

    def save(self, path: Path = MODEL_DIR):
        assert self.is_fitted
        joblib.dump(self.xgb_model,    path / "xgb_model.pkl")
        joblib.dump(self.ridge_model,  path / "ridge_model.pkl")
        joblib.dump(self.scaler,       path / "scaler.pkl")
        joblib.dump(self.feature_cols, path / "feature_cols.pkl")
        log.info("M2 saved to %s", path)

    def load(self, path: Path = MODEL_DIR) -> "M2RentalValueModel":
        self.xgb_model    = joblib.load(path / "xgb_model.pkl")
        self.ridge_model  = joblib.load(path / "ridge_model.pkl")
        self.scaler       = joblib.load(path / "scaler.pkl")
        self.feature_cols = joblib.load(path / "feature_cols.pkl")
        self.is_fitted    = True
        log.info("M2 loaded from %s", path)
        return self

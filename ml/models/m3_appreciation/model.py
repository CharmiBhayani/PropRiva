import logging
import joblib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
import xgboost as xgb

from config import M3_LAG_MONTHS, M3_HORIZONS, MODELS_DIR
from data.features import build_zhvi_sequences

log = logging.getLogger(__name__)

MODEL_DIR = MODELS_DIR / "m3_appreciation"
MODEL_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class AppreciationForecast:
    zip_code:             str
    current_zhvi:         float
    zhvi_6m:              float
    zhvi_12m:             float
    appreciation_pct_6m:  float
    appreciation_pct_12m: float
    ci_low_12m:           float
    ci_high_12m:          float
    confidence_band:      str        


class M3AppreciationModel:

    def __init__(self):
        self.xgb_6m:   Optional[xgb.XGBRegressor]  = None
        self.xgb_12m:  Optional[xgb.XGBRegressor]  = None
        self.mlp_6m:   Optional[MLPRegressor]       = None
        self.mlp_12m:  Optional[MLPRegressor]       = None
        self.scaler    = StandardScaler()
        self.residual_std_12m: float = 0.0
        self.n_features: int = 0
        self.is_fitted   = False

    
    def fit(self, zhvi_long: pd.DataFrame) -> dict:
        
        log.info("M3: building ZHVI sequences")
        X, y, meta = build_zhvi_sequences(
            zhvi_long,
            n_lags=M3_LAG_MONTHS,
            horizons=M3_HORIZONS,
        )

        y_6m  = y[:, 0]   
        y_12m = y[:, 1]   

        last_vals = X[:, M3_LAG_MONTHS - 1]  
        y_6m_ratio  = y_6m  / (last_vals + 1e-9)
        y_12m_ratio = y_12m / (last_vals + 1e-9)

        self.n_features = X.shape[1]

        X_train, X_test, y6_train, y6_test, y12_train, y12_test, lv_train, lv_test = (
            train_test_split(X, y_6m_ratio, y_12m_ratio, last_vals,
                             test_size=0.15, random_state=42)
        )

        X_sc_train = self.scaler.fit_transform(X_train)
        X_sc_test  = self.scaler.transform(X_test)

        xgb_params = dict(
            n_estimators=300,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        )

        log.info("M3: training XGBoost 6m …")
        self.xgb_6m = xgb.XGBRegressor(**xgb_params)
        self.xgb_6m.fit(X_train, y6_train, verbose=False)

        log.info("M3: training XGBoost 12m …")
        self.xgb_12m = xgb.XGBRegressor(**xgb_params)
        self.xgb_12m.fit(X_train, y12_train, verbose=False)

        log.info("M3: training MLP 6m …")
        self.mlp_6m = MLPRegressor(
            hidden_layer_sizes=(128, 64, 32),
            activation="relu", max_iter=200,
            random_state=42, early_stopping=True,
        )
        self.mlp_6m.fit(X_sc_train, y6_train)

        log.info("M3: training MLP 12m …")
        self.mlp_12m = MLPRegressor(
            hidden_layer_sizes=(128, 64, 32),
            activation="relu", max_iter=200,
            random_state=42, early_stopping=True,
        )
        self.mlp_12m.fit(X_sc_train, y12_train)

        self.is_fitted = True

        pred_12m_ratio  = (self.xgb_12m.predict(X_test) + self.mlp_12m.predict(X_sc_test)) / 2
        pred_12m_abs    = pred_12m_ratio * lv_test
        true_12m_abs    = y12_test * lv_test

        self.residual_std_12m = float(np.std(pred_12m_abs - true_12m_abs))

        pred_6m_ratio = (self.xgb_6m.predict(X_test) + self.mlp_6m.predict(X_sc_test)) / 2
        pred_6m_abs   = pred_6m_ratio * lv_test
        true_6m_abs   = y6_test * lv_test

        metrics = {
            "mae_6m":    mean_absolute_error(true_6m_abs, pred_6m_abs),
            "mae_12m":   mean_absolute_error(true_12m_abs, pred_12m_abs),
            "r2_6m":     r2_score(true_6m_abs, pred_6m_abs),
            "r2_12m":    r2_score(true_12m_abs, pred_12m_abs),
            "residual_std_12m": self.residual_std_12m,
        }
        log.info("M3 metrics — MAE 6m: $%.0f  MAE 12m: $%.0f  R² 12m: %.3f",
                 metrics["mae_6m"], metrics["mae_12m"], metrics["r2_12m"])
        return metrics

    
    def predict_zip(
        self,
        zip_code: str,
        zhvi_long: pd.DataFrame,
        as_of_date: Optional[pd.Timestamp] = None,
    ) -> AppreciationForecast:
        assert self.is_fitted

        zhvi = zhvi_long.copy()
        if "value" in zhvi.columns:
            zhvi = zhvi.rename(columns={"value": "zhvi"})
        zhvi["date"] = pd.to_datetime(zhvi["date"])

        sub = zhvi[zhvi["zip_code"].astype(str).str.zfill(5) == str(zip_code).zfill(5)]
        sub = sub.sort_values("date")

        if as_of_date:
            sub = sub[sub["date"] <= as_of_date]

        if len(sub) < M3_LAG_MONTHS:
            raise ValueError(f"Not enough ZHVI data for ZIP {zip_code}: {len(sub)} rows (need {M3_LAG_MONTHS})")

        lag_window = sub["zhvi"].values[-M3_LAG_MONTHS:]
        last_val   = lag_window[-1]
        g12  = (lag_window[-1] - lag_window[max(0, len(lag_window) - 13)]) / (lag_window[max(0, len(lag_window) - 13)] + 1e-9)
        cagr = (lag_window[-1] / (lag_window[0] + 1e-9)) ** (1 / 3) - 1

        X = np.array([list(lag_window) + [g12, cagr]], dtype=np.float32)
        X_sc = self.scaler.transform(X)

        r6  = (float(self.xgb_6m.predict(X)[0])  + float(self.mlp_6m.predict(X_sc)[0]))  / 2
        r12 = (float(self.xgb_12m.predict(X)[0]) + float(self.mlp_12m.predict(X_sc)[0])) / 2

        zhvi_6m  = last_val * r6
        zhvi_12m = last_val * r12
        app_6m   = (r6  - 1) * 100
        app_12m  = (r12 - 1) * 100

        ci_low  = zhvi_12m - 1.96 * self.residual_std_12m
        ci_high = zhvi_12m + 1.96 * self.residual_std_12m
        band_pct = (ci_high - ci_low) / zhvi_12m * 100
        confidence_band = "narrow" if band_pct < 8 else ("moderate" if band_pct < 20 else "wide")

        return AppreciationForecast(
            zip_code=zip_code,
            current_zhvi=round(float(last_val), 0),
            zhvi_6m=round(zhvi_6m, 0),
            zhvi_12m=round(zhvi_12m, 0),
            appreciation_pct_6m=round(app_6m, 2),
            appreciation_pct_12m=round(app_12m, 2),
            ci_low_12m=round(ci_low, 0),
            ci_high_12m=round(ci_high, 0),
            confidence_band=confidence_band,
        )

    def predict_batch_zips(
        self,
        zip_codes: list[str],
        zhvi_long: pd.DataFrame,
    ) -> pd.DataFrame:
        results = []
        for z in zip_codes:
            try:
                fc = self.predict_zip(z, zhvi_long)
                results.append(vars(fc))
            except Exception as exc:
                log.warning("M3: skipping ZIP %s — %s", z, exc)
        return pd.DataFrame(results)

    
    def save(self, path: Path = MODEL_DIR):
        assert self.is_fitted
        joblib.dump(self.xgb_6m,    path / "xgb_6m.pkl")
        joblib.dump(self.xgb_12m,   path / "xgb_12m.pkl")
        joblib.dump(self.mlp_6m,    path / "mlp_6m.pkl")
        joblib.dump(self.mlp_12m,   path / "mlp_12m.pkl")
        joblib.dump(self.scaler,    path / "scaler.pkl")
        joblib.dump({
            "residual_std_12m": self.residual_std_12m,
            "n_features": self.n_features,
        }, path / "meta.pkl")
        log.info("M3 saved to %s", path)

    def load(self, path: Path = MODEL_DIR) -> "M3AppreciationModel":
        self.xgb_6m   = joblib.load(path / "xgb_6m.pkl")
        self.xgb_12m  = joblib.load(path / "xgb_12m.pkl")
        self.mlp_6m   = joblib.load(path / "mlp_6m.pkl")
        self.mlp_12m  = joblib.load(path / "mlp_12m.pkl")
        self.scaler   = joblib.load(path / "scaler.pkl")
        meta = joblib.load(path / "meta.pkl")
        self.residual_std_12m = meta["residual_std_12m"]
        self.n_features       = meta["n_features"]
        self.is_fitted = True
        log.info("M3 loaded from %s", path)
        return self

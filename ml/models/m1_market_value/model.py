import logging
import joblib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import xgboost as xgb

from config import M1_FEATURES, MODELS_DIR

log = logging.getLogger(__name__)

MODEL_DIR = MODELS_DIR / "m1_market_value"
MODEL_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class ValuePrediction:
    estimated_value:     float
    ci_low:              float
    ci_high:             float
    overvalued_flag:     str          
    gap_pct:             float        
    listed_price:        Optional[float] = None

# Random Forest and XGBoost ensemble for market value estimation (M1)
class M1MarketValueModel:

    def __init__(self):
        self.xgb_model  = None
        self.rf_model   = None
        self.scaler     = StandardScaler()
        self.feature_cols: list[str] = []
        self.is_fitted   = False

    
    def fit(self, df: pd.DataFrame, target_col: str = "sale_price") -> dict:
       
        log.info("M1: preparing training data …")
        avail = [f for f in M1_FEATURES if f in df.columns]
        missing = set(M1_FEATURES) - set(avail)
        if missing:
            log.warning("M1: missing features will be zero-filled: %s", missing)
        for f in missing:
            df[f] = 0.0

        self.feature_cols = M1_FEATURES
        X = df[self.feature_cols].fillna(0).values
        y = np.log1p(df[target_col].values)   

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.15, random_state=42
        )

        
        log.info("M1: training XGBoost …")
        self.xgb_model = xgb.XGBRegressor(
            n_estimators=400,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=1.0,
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        )
        self.xgb_model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=False,
        )

        # random forest
        log.info("M1: training Random Forest …")
        self.rf_model = RandomForestRegressor(
            n_estimators=200,
            max_depth=12,
            min_samples_leaf=5,
            n_jobs=-1,
            random_state=42,
        )
        self.rf_model.fit(X_train, y_train)

        self.is_fitted = True

        # xgboost
        xgb_pred  = np.expm1(self.xgb_model.predict(X_test))
        rf_pred   = np.expm1(self.rf_model.predict(X_test))
        ensemble  = (xgb_pred + rf_pred) / 2
        y_test_usd = np.expm1(y_test)

        metrics = {
            "mae":    mean_absolute_error(y_test_usd, ensemble),
            "rmse":   np.sqrt(mean_squared_error(y_test_usd, ensemble)),
            "r2":     r2_score(y_test_usd, ensemble),
            "mape":   np.mean(np.abs((y_test_usd - ensemble) / (y_test_usd + 1))) * 100,
            "n_train": len(X_train),
            "n_test":  len(X_test),
        }
        log.info(f"M1 metrics — MAE: ${metrics['mae']:,.0f}  RMSE: ${metrics['rmse']:,.0f}  R²: {metrics['r2']:.3f}  MAPE: {metrics['mape']:.1f}%")
        return metrics

    
    def predict(
        self,
        property_features: dict,
        listed_price: Optional[float] = None,
    ) -> ValuePrediction:
        """
        Predict market value for a single property.
        property_features: dict with keys matching M1_FEATURES.
        """
        assert self.is_fitted, "Model not fitted — call fit() or load() first."
        X = np.array([[property_features.get(f, 0.0) for f in self.feature_cols]],
                     dtype=np.float32)

        pred_xgb = float(np.expm1(self.xgb_model.predict(X)[0]))
        pred_rf  = float(np.expm1(self.rf_model.predict(X)[0]))
        est      = (pred_xgb + pred_rf) / 2

        ci_width = est * 0.10
        ci_low   = est - ci_width
        ci_high  = est + ci_width

        gap_pct  = 0.0
        flag     = "fair"
        if listed_price and listed_price > 0:
            gap_pct = (listed_price - est) / est * 100  # +ve means listed > predicted (overvalued)
            if gap_pct > 5:
                flag = "overvalued"
            elif gap_pct < -5:
                flag = "undervalued"

        return ValuePrediction(
            estimated_value=round(est, 0),
            ci_low=round(ci_low, 0),
            ci_high=round(ci_high, 0),
            overvalued_flag=flag,
            gap_pct=round(gap_pct, 2),
            listed_price=listed_price,
        )

    def predict_batch(self, df: pd.DataFrame) -> pd.DataFrame:
        """Batch predict; returns df with added columns."""
        assert self.is_fitted
        X = df[[f for f in self.feature_cols]].fillna(0).values.astype(np.float32)
        p_xgb = np.expm1(self.xgb_model.predict(X))
        p_rf  = np.expm1(self.rf_model.predict(X))
        est   = (p_xgb + p_rf) / 2

        out = df.copy()
        out["m1_estimated_value"] = est.round(0)
        out["m1_ci_low"]          = (est * 0.90).round(0)
        out["m1_ci_high"]         = (est * 1.10).round(0)

        if "sale_price" in df.columns:
            out["m1_gap_pct"] = (df["sale_price"] - est) / est * 100
            out["m1_flag"]    = pd.cut(
                out["m1_gap_pct"],
                bins=[-np.inf, -5, 5, np.inf],
                labels=["undervalued", "fair", "overvalued"],
            )
        return out

    
    def save(self, path: Path = MODEL_DIR):
        assert self.is_fitted
        joblib.dump(self.xgb_model,     path / "xgb_model.pkl")
        joblib.dump(self.rf_model,      path / "rf_model.pkl")
        joblib.dump(self.feature_cols,  path / "feature_cols.pkl")
        log.info("M1 saved to %s", path)

    def load(self, path: Path = MODEL_DIR) -> "M1MarketValueModel":
        self.xgb_model    = joblib.load(path / "xgb_model.pkl")
        self.rf_model     = joblib.load(path / "rf_model.pkl")
        self.feature_cols = joblib.load(path / "feature_cols.pkl")
        self.is_fitted    = True
        log.info("M1 loaded from %s", path)
        return self

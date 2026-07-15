import logging
import joblib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Dict, Any

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

import xgboost as xgb
from config import MODELS_DIR
from data.features import MumbaiFeaturePreprocessor

log = logging.getLogger(__name__)

MODEL_DIR = MODELS_DIR / "m1_market_value"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# API parameter keys to Mumbai dataset column names mapping
API_TO_MUMBAI_MAP = {
    "property_type": "PROPERTY_TYPE",
    "zip_code":      "CITY",         # Map zip_code to CITY micro-market
    "bedrooms":      "BEDROOM_NUM",
    "furnishing":    "FURNISH",
    "age":           "AGE",
    "total_floors":  "TOTAL_FLOOR",
    "sqft":          "AREA",
    "balconies":     "BALCONY_NUM",
    "floors":        "FLOOR_NUM"
}

@dataclass
class ValuePrediction:
    estimated_value:     float
    ci_low:              float
    ci_high:             float
    overvalued_flag:     str          
    gap_pct:             float        
    listed_price:        Optional[float] = None

class M1MarketValueModel:
    """Random Forest and XGBoost ensemble for Mumbai market value estimation (Model M1)."""
    
    def __init__(self):
        self.xgb_model = None
        self.rf_model = None
        self.preprocessor = None
        self.feature_cols: list[str] = [
            "PROPERTY_TYPE_enc", "CITY_enc", "BEDROOM_NUM", "FURNISH", 
            "AGE", "TOTAL_FLOOR", "AREA", "BALCONY_NUM", "FLOOR_NUM"
        ]
        self.is_fitted = False

    def fit(self, df: pd.DataFrame, target_col: str = "PRICE") -> dict:
        """Trains the M1 Market Value Model.

        Args:
            df: Cleaned Mumbai sale properties DataFrame.
            target_col: Name of the target column.

        Returns:
            dict containing evaluation metrics.
        """
        log.info("M1: Preparing training data...")
        
        # Fit the preprocessor on the cleaned raw data
        self.preprocessor = MumbaiFeaturePreprocessor()
        self.preprocessor.fit(df)
        
        # Transform the dataset
        df_proc = self.preprocessor.transform(df)
        
        X = df_proc[self.feature_cols].values
        y = np.log1p(df_proc[target_col].values)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.15, random_state=42
        )

        log.info("M1: Training XGBoost...")
        self.xgb_model = xgb.XGBRegressor(
            n_estimators=550,
            max_depth=7,
            learning_rate=0.04,
            subsample=0.85,
            colsample_bytree=0.85,
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        )
        self.xgb_model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=False,
        )

        log.info("M1: Training Random Forest...")
        self.rf_model = RandomForestRegressor(
            n_estimators=300,
            max_depth=16,
            min_samples_leaf=2,
            n_jobs=-1,
            random_state=42,
        )
        self.rf_model.fit(X_train, y_train)

        self.is_fitted = True

        # Evaluation on test set
        pred_xgb = np.expm1(self.xgb_model.predict(X_test))
        pred_rf = np.expm1(self.rf_model.predict(X_test))
        ensemble = (pred_xgb + pred_rf) / 2
        y_test_inr = np.expm1(y_test)

        metrics = {
            "mae": mean_absolute_error(y_test_inr, ensemble),
            "rmse": np.sqrt(mean_squared_error(y_test_inr, ensemble)),
            "r2": r2_score(y_test_inr, ensemble),
            "mape": np.mean(np.abs((y_test_inr - ensemble) / (y_test_inr + 1e-9))) * 100,
            "n_train": len(X_train),
            "n_test": len(X_test),
        }
        
        log.info(
            "M1 metrics — MAE: ₹%s  RMSE: ₹%s  R²: %.3f  MAPE: %.1f%%",
            f"{metrics['mae']:,.0f}", f"{metrics['rmse']:,.0f}", metrics["r2"], metrics["mape"]
        )
        return metrics

    def predict(
        self,
        property_features: dict,
        listed_price: Optional[float] = None,
    ) -> ValuePrediction:
        """Predicts the market value for a single property.

        Args:
            property_features: dict containing property attributes.
            listed_price: Optional asking price.

        Returns:
            ValuePrediction object.
        """
        assert self.is_fitted, "Model not fitted — call fit() or load() first."
        
        # Map input keys (lowercase / API names) to Mumbai uppercase names
        mapped = {}
        for k, v in property_features.items():
            mapped_key = API_TO_MUMBAI_MAP.get(k, k)
            mapped[mapped_key] = v
            
        # Support year_built to AGE conversion if AGE is missing
        if "AGE" not in mapped and "year_built" in property_features:
            mapped["AGE"] = max(0, 2026 - int(property_features["year_built"]))
            
        # Transform using preprocessor
        df_input = pd.DataFrame([mapped])
        df_proc = self.preprocessor.transform(df_input)
        X = df_proc[self.feature_cols].values.astype(np.float32)

        pred_xgb = float(np.expm1(self.xgb_model.predict(X)[0]))
        pred_rf = float(np.expm1(self.rf_model.predict(X)[0]))
        est = (pred_xgb + pred_rf) / 2

        # Heuristic 10% confidence interval
        ci_width = est * 0.10
        ci_low = est - ci_width
        ci_high = est + ci_width

        gap_pct = 0.0
        flag = "fair"
        if listed_price and listed_price > 0:
            gap_pct = (listed_price - est) / est * 100
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
        """Batch predicts; returns df with added prediction columns."""
        assert self.is_fitted
        
        # If input has API names, rename them
        df_mapped = df.rename(columns=API_TO_MUMBAI_MAP)
        if "AGE" not in df_mapped.columns and "year_built" in df.columns:
            df_mapped["AGE"] = 2026 - df["year_built"]
            
        df_proc = self.preprocessor.transform(df_mapped)
        X = df_proc[self.feature_cols].values.astype(np.float32)
        
        p_xgb = np.expm1(self.xgb_model.predict(X))
        p_rf = np.expm1(self.rf_model.predict(X))
        est = (p_xgb + p_rf) / 2

        out = df.copy()
        out["m1_estimated_value"] = est.round(0)
        out["m1_ci_low"]          = (est * 0.90).round(0)
        out["m1_ci_high"]         = (est * 1.10).round(0)

        # Use PRICE or sale_price if present to calculate gap
        target_col = "PRICE" if "PRICE" in df.columns else ("sale_price" if "sale_price" in df.columns else None)
        if target_col:
            out["m1_gap_pct"] = (df[target_col] - est) / est * 100
            out["m1_flag"]    = pd.cut(
                out["m1_gap_pct"],
                bins=[-np.inf, -5, 5, np.inf],
                labels=["undervalued", "fair", "overvalued"],
            )
        return out

    def save(self, path: Path = MODEL_DIR) -> None:
        """Saves the entire model instance as a single pickle file."""
        assert self.is_fitted
        dest = path / "market_price_model.pkl"
        joblib.dump(self, dest)
        log.info("M1 model saved to %s", dest)

    def load(self, path: Path = MODEL_DIR) -> "M1MarketValueModel":
        """Loads the model instance from the saved pickle file."""
        dest = path / "market_price_model.pkl"
        loaded = joblib.load(dest)
        self.xgb_model = loaded.xgb_model
        self.rf_model = loaded.rf_model
        self.preprocessor = loaded.preprocessor
        self.feature_cols = loaded.feature_cols
        self.is_fitted = True
        log.info("M1 model loaded from %s", dest)
        return self

import logging
import joblib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

import xgboost as xgb
from config import MODELS_DIR
from data.features import MumbaiFeaturePreprocessor

log = logging.getLogger(__name__)

MODEL_DIR = MODELS_DIR / "m2_rental_value"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# API parameter keys to Mumbai dataset column names mapping
API_TO_MUMBAI_MAP = {
    "property_type": "PROPERTY_TYPE",
    "zip_code":      "CITY",
    "bedrooms":      "BEDROOM_NUM",
    "furnishing":    "FURNISH",
    "age":           "AGE",
    "total_floors":  "TOTAL_FLOOR",
    "sqft":          "AREA",
    "balconies":     "BALCONY_NUM",
    "floors":        "FLOOR_NUM"
}

@dataclass
class RentalPrediction:
    estimated_monthly_rent: float
    gross_yield_pct:        float
    net_yield_pct:          Optional[float] = None


class M2RentalValueModel:
    """Random Forest and XGBoost ensemble for Mumbai rental value estimation (Model M2)."""

    def __init__(self):
        self.xgb_model = None
        self.rf_model = None
        self.preprocessor = None
        self.feature_cols: list[str] = [
            "PROPERTY_TYPE_enc", "CITY_enc", "BEDROOM_NUM", "FURNISH", 
            "AGE", "TOTAL_FLOOR", "AREA", "BALCONY_NUM", "FLOOR_NUM"
        ]
        self.is_fitted = False

    def fit(self, df: pd.DataFrame, target_col: str = "rent_target") -> dict:
        """Trains the M2 Rental Value Model.

        Args:
            df: Cleaned Mumbai properties DataFrame containing the rent target.
            target_col: Name of the target column.

        Returns:
            dict containing evaluation metrics.
        """
        log.info("M2: Preparing training data...")

        # Fit the preprocessor
        self.preprocessor = MumbaiFeaturePreprocessor()
        self.preprocessor.fit(df)
        
        # Transform the dataset
        df_proc = self.preprocessor.transform(df)

        X = df_proc[self.feature_cols].values
        y = np.log1p(df_proc[target_col].values)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.15, random_state=42
        )

        log.info("M2: Training XGBoost...")
        self.xgb_model = xgb.XGBRegressor(
            n_estimators=450,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.85,
            colsample_bytree=0.85,
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        )
        self.xgb_model.fit(X_train, y_train, verbose=False)

        log.info("M2: Training Random Forest...")
        self.rf_model = RandomForestRegressor(
            n_estimators=300,
            max_depth=14,
            min_samples_leaf=3,
            n_jobs=-1,
            random_state=42,
        )
        self.rf_model.fit(X_train, y_train)

        self.is_fitted = True

        # Evaluation
        pred_xgb = np.expm1(self.xgb_model.predict(X_test))
        pred_rf = np.expm1(self.rf_model.predict(X_test))
        ensemble = (pred_xgb + pred_rf) / 2
        y_test_inr = np.expm1(y_test)

        metrics = {
            "mae": mean_absolute_error(y_test_inr, ensemble),
            "rmse": np.sqrt(mean_squared_error(y_test_inr, ensemble)),
            "r2": r2_score(y_test_inr, ensemble),
            "mape": np.mean(np.abs((y_test_inr - ensemble) / (y_test_inr + 1e-9))) * 100,
        }
        log.info(
            "M2 metrics — MAE: ₹%s  RMSE: ₹%s  R²: %.3f  MAPE: %.1f%%",
            f"{metrics['mae']:,.0f}", f"{metrics['rmse']:,.0f}", metrics["r2"], metrics["mape"]
        )
        return metrics

    def predict(
        self,
        property_features: dict,
        property_value: Optional[float] = None,
        annual_maintenance: float = 0.0,
    ) -> RentalPrediction:
        """Predicts monthly rent for a single property.

        Args:
            property_features: dict containing property attributes.
            property_value: Optional property value to calculate yields.
            annual_maintenance: Optional annual maintenance to calculate net yield.

        Returns:
            RentalPrediction object.
        """
        assert self.is_fitted

        # Map input keys to Mumbai uppercase names
        mapped = {}
        for k, v in property_features.items():
            mapped_key = API_TO_MUMBAI_MAP.get(k, k)
            mapped[mapped_key] = v
            
        # Support year_built to AGE conversion if AGE is missing
        if "AGE" not in mapped and "year_built" in property_features:
            mapped["AGE"] = max(0, 2026 - int(property_features["year_built"]))

        # Transform using preprocessor
        df_input = pd.DataFrame([mapped])
        df_proc = self.preprocessor.transform(df_input)  # type: ignore[union-attr]
        X = df_proc[self.feature_cols].values.astype(np.float32)

        p_xgb = float(np.expm1(self.xgb_model.predict(X)[0]))  # type: ignore[union-attr]
        p_rf  = float(np.expm1(self.rf_model.predict(X)[0]))   # type: ignore[union-attr]
        rent = (p_xgb + p_rf) / 2

        gross_yield = 0.0
        net_yield = None
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
        """Batch predicts rents; returns df with prediction columns."""
        assert self.is_fitted

        # Rename columns if needed
        df_mapped = df.rename(columns=API_TO_MUMBAI_MAP)
        if "AGE" not in df_mapped.columns and "year_built" in df.columns:
            df_mapped["AGE"] = 2026 - df["year_built"]
            
        df_proc = self.preprocessor.transform(df_mapped)  # type: ignore[union-attr]
        X = df_proc[self.feature_cols].values.astype(np.float32)
        
        p_xgb = np.expm1(self.xgb_model.predict(X))  # type: ignore[union-attr]
        p_rf  = np.expm1(self.rf_model.predict(X))   # type: ignore[union-attr]
        rent = (p_xgb + p_rf) / 2

        out = df.copy()
        out["m2_monthly_rent"] = rent.round(0)

        val_col = "m1_estimated_value" if "m1_estimated_value" in df.columns else ("PRICE" if "PRICE" in df.columns else "sale_price")
        if val_col in df.columns:
            out["m2_gross_yield"] = (rent * 12) / df[val_col].clip(1) * 100

        return out

    def save(self, path: Path = MODEL_DIR) -> None:
        """Saves the entire model instance as a single pickle file."""
        assert self.is_fitted
        dest = path / "rent_model.pkl"
        joblib.dump(self, dest)
        log.info("M2 model saved to %s", dest)

    def load(self, path: Path = MODEL_DIR) -> "M2RentalValueModel":
        """Loads the model instance from the saved pickle file."""
        dest = path / "rent_model.pkl"
        loaded = joblib.load(dest)
        self.xgb_model = loaded.xgb_model
        self.rf_model = loaded.rf_model
        self.preprocessor = loaded.preprocessor
        self.feature_cols = loaded.feature_cols
        self.is_fitted = True
        log.info("M2 model loaded from %s", dest)
        return self

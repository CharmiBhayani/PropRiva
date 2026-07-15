import logging
import sys
from pathlib import Path
from typing import Optional

import joblib
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import DATA_PROCESSED, MODELS_DIR, BEDROOM_MULTIPLIER
from models.m1_market_value.model      import M1MarketValueModel
from models.m2_rental_value.model      import M2RentalValueModel
from models.m3_appreciation.model      import M3AppreciationModel
from models.m4_portfolio.model         import M4PortfolioAnalyser
from models.m5_investment_score.model  import M5InvestmentScorer
from models.m6_risk.model              import M6RiskModel
from advisory.llm_advisor              import (
    generate_investment_narrative,
    generate_risk_narrative,
    active_provider_info,
)
from data.features import ZipEncoder

log = logging.getLogger(__name__)


class RealEstateAdvisor:
  

    def __init__(self, models_dir: Path = MODELS_DIR, enable_llm: bool = True):
        self.enable_llm = enable_llm
        self._load_models(models_dir)
        if enable_llm:
            info = active_provider_info()
            log.info(
                "LLM provider: %s  model: %s  key_set: %s",
                info.get("provider"), info.get("model"), info.get("key_set"),
            )
        try:
            raw = pd.read_csv(DATA_PROCESSED / "zhvi_zip.csv") 
            # Melt wide format to long format
            id_vars = [c for c in raw.columns if not c.startswith("20") and not c.startswith("19")]
            long_df = raw.melt(id_vars=id_vars, var_name="Date", value_name="zhvi")
            long_df["Date"] = pd.to_datetime(long_df["Date"], errors='coerce')
            long_df["zip_code"] = long_df["RegionName"]
            self.zhvi_long = long_df.dropna(subset=["Date", "zhvi"])
            log.info("HPI loaded")
        except Exception as e:
            log.warning("Could not load HPI: %s", e)
            self.zhvi_long = None
    

    def _load_models(self, models_dir: Path) -> None:
        log.info("Loading model")

        # M1
        try:
            self.m1 = M1MarketValueModel().load(models_dir / "m1_market_value")
            log.info(" M1 (market value) loaded")
        except Exception as e:
            log.error(" M1 failed: %s", e)
            self.m1 = None

        # M2
        try:
            self.m2 = M2RentalValueModel().load(models_dir / "m2_rental_value")
            log.info(" M2 (rental value) loaded")
        except Exception as e:
            log.error(" M2 failed: %s", e)
            self.m2 = None

        # M3
        m3_path = models_dir / "m3_appreciation"
        try:
            if (m3_path / "appreciation_model.pkl").exists():
                self.m3 = M3AppreciationModel().load(m3_path)
                log.info("M3 (appreciation) loaded")
            else:
                log.warning("M3 not trained — no ZHVI time-series data available")
                self.m3 = None
        except Exception as e:
            log.warning(" M3 not available: %s", e)
            self.m3 = None

        self.m4 = M4PortfolioAnalyser()
        self.m5 = M5InvestmentScorer()
        self.m6 = M6RiskModel()

        enc_path = models_dir / "zip_encoder.pkl"
        if enc_path.exists():
            self.zip_encoder: ZipEncoder = joblib.load(enc_path)
            log.info(" ZIP encoder loaded")
        else:
            log.warning("  ZIP encoder not found — using fresh encoder (reduced accuracy)")
            self.zip_encoder = ZipEncoder()

        log.info("Model loading complete.")

    
    def analyse_property(
        self,
        prop: dict,
        listed_price: Optional[float] = None,
        add_llm_narrative: bool = True,
    ) -> dict:
        result = {"input": prop, "listed_price": listed_price}

        features = dict(prop)
        zip_str  = str(features.get("zip_code", "Thane"))
        zip_str  = zip_str.zfill(5) if zip_str.isdigit() else zip_str
        features["zip_code_enc"] = int(
            self.zip_encoder.transform(pd.Series([zip_str]))[0]
        )

        defaults = {
            "sqft_vs_zip_median":    1.0,
            "price_per_sqft_vs_zip": 1.0,
            "bedroom_multiplier":    BEDROOM_MULTIPLIER.get(
                                         int(features.get("bedrooms", 3)), 1.0),
            "property_type_enc":     1,
            "zori_at_month":         35_000.0,
            "zori_12m_growth":       0.04,
            "rent_to_price_ratio":   0.0025,
            "zhvi_at_sale":          15_000_000.0,
            "zhvi_12m_growth":       0.07,
            "zhvi_3yr_cagr":         0.07,
            "inventory":             0.5,
            "market_heat":           50.0,
            "price_cut_pct":         5.0,
            "inventory_trend_pct":   0.05,
            "employment_hhi":        0.30,
            "vacancy_prob":          0.30,
            "property_type":         "Residential Apartment",
            "furnishing":            1.0,
            "total_floors":          7.0,
            "balconies":             1.0,
            "floors":                3.0,
        }
        for k, v in defaults.items():
            features.setdefault(k, v)

        if self.m1:
            vp = self.m1.predict(features, listed_price=listed_price)
            result["m1"] = {
                "estimated_value": vp.estimated_value,
                "ci_low":          vp.ci_low,
                "ci_high":         vp.ci_high,
                "overvalued_flag": vp.overvalued_flag,
                "gap_pct":         vp.gap_pct,
            }
            prop_value = vp.estimated_value
            gap_pct    = vp.gap_pct
        else:
            prop_value = listed_price or 10_000_000.0
            gap_pct    = 0.0
            result["m1"] = {"estimated_value": prop_value, "note": "M1 not loaded"}

        age = 2026 - int(features.get("year_built", 2020))
        annual_maint = (
            prop_value * 0.01
            + (min(age, 20) / 20) * (200_000 / 20)
            + (min(age, 15) / 15) * (100_000 / 15)
        )
        result["maintenance_heuristic"] = {
            "annual_maintenance":   round(annual_maint, 0),
            "five_year_projected":  round(annual_maint * 5, 0),
            "note": "Heuristic estimate — provide actual value for portfolio analysis",
        }

        if self.m2:
            rp = self.m2.predict(
                features,
                property_value=prop_value,
                annual_maintenance=annual_maint,
            )
            monthly_rent = rp.estimated_monthly_rent
            if listed_price and listed_price > 0:
                gross_yield = (monthly_rent * 12) / listed_price * 100
                net_yield = (monthly_rent * 12 - annual_maint) / listed_price * 100
            else:
                gross_yield = rp.gross_yield_pct or 0.0
                net_yield = rp.net_yield_pct or 0.0

            result["m2"] = {
                "monthly_rent": monthly_rent,
                "gross_yield":  gross_yield,
                "net_yield":    net_yield,
            }
        else:
            monthly_rent = 35_000.0
            if listed_price and listed_price > 0:
                gross_yield = (monthly_rent * 12) / listed_price * 100
                net_yield = (monthly_rent * 12 - annual_maint) / listed_price * 100
            else:
                gross_yield = 5.0
                net_yield = 4.0
            result["m2"] = {
                "note": "M2 not loaded",
                "monthly_rent": monthly_rent,
                "gross_yield":  gross_yield,
                "net_yield":    net_yield,
            }

        appr_12m = 5.0
        if self.m3 and self.zhvi_long is not None:
            try:
                fc = self.m3.predict_zip(zip_str, self.zhvi_long)
                result["m3"] = {
                    "current_zhvi":         fc.current_zhvi,
                    "zhvi_3m":              fc.zhvi_3m,
                    "zhvi_6m":              fc.zhvi_6m,
                    "zhvi_9m":              fc.zhvi_9m,
                    "zhvi_12m":             fc.zhvi_12m,
                    "appreciation_3m_pct":  fc.appreciation_pct_3m,
                    "appreciation_6m_pct":  fc.appreciation_pct_6m,
                    "appreciation_9m_pct":  fc.appreciation_pct_9m,
                    "appreciation_12m_pct": fc.appreciation_pct_12m,
                    "ci_low_12m":           fc.ci_low_12m,
                    "ci_high_12m":          fc.ci_high_12m,
                    "confidence_band":      fc.confidence_band,
                }
                appr_12m = fc.appreciation_pct_12m
            except Exception as exc:
                log.warning("M3 predict_zip failed: %s", exc)
                result["m3"] = {
                    "note": f"M3 forecast unavailable: {exc}",
                    "appreciation_12m_pct": appr_12m,
                }
        else:
            result["m3"] = {
                "note": "M3 not available (no ZHVI data or model not trained)",
                "appreciation_12m_pct": appr_12m,
            }

        # Dynamically compute rent to price ratio using listed price if available, otherwise prop_value
        denom = listed_price if (listed_price and listed_price > 0) else prop_value
        rent_to_price_ratio = monthly_rent / (denom + 1e-9)

        ra = self.m6.score(
            inventory_trend_pct  = float(features.get("inventory_trend_pct", 0.05)),
            price_cut_pct        = float(features.get("price_cut_pct", 5.0)),
            rent_to_price_ratio  = rent_to_price_ratio,
            employment_hhi       = float(features.get("employment_hhi", 0.30)),
        )
        result["m6"] = {
            "risk_score":           ra.risk_score,
            "risk_tier":            ra.risk_tier,
            "top_factors":          ra.top_factors,
            "factor_scores":        ra.factor_scores,
            "factor_contributions": ra.factor_contributions,
        }

        sc = self.m5.score(
            gross_yield_pct      = gross_yield,
            appreciation_pct_12m = appr_12m,
            value_gap_pct        = gap_pct,
            vacancy_prob         = float(features.get("vacancy_prob", 0.30)),
            annual_maintenance   = annual_maint,
            property_value       = prop_value,
        )
        result["m5"] = {
            "investment_score": sc.investment_score,
            "grade":            sc.grade,
            "signal":           sc.signal,
            "confidence":       sc.confidence,
            "factor_breakdown": sc.factor_breakdown,
            "sub_scores":       sc.sub_scores,
        }

        if self.enable_llm and add_llm_narrative:
            llm_meta = {
                "estimated_value": prop_value,
                "monthly_rent":    monthly_rent,
                "zip_code":        zip_str,
                "bedrooms":        features.get("bedrooms"),
                "sqft":            features.get("sqft"),
                "age":             features.get("age"),
                "total_floors":    features.get("total_floors"),
                "floors":          features.get("floors"),
                "balconies":       features.get("balconies"),
                "furnishing":      features.get("furnishing"),
                "property_type":   features.get("property_type"),
            }
            llm_ctx = self.m5.to_llm_context(sc, llm_meta)
            result["m5"]["narrative"] = generate_investment_narrative(llm_ctx)
            
            risk_ctx = ra.narrative_inputs.copy()
            risk_ctx.update(llm_meta)
            result["m6"]["narrative"] = generate_risk_narrative(risk_ctx)

        return result

    def analyse_portfolio(
        self,
        portfolio_df: pd.DataFrame,
        add_llm_narrative: bool = True,
    ) -> dict:
        enable_llm = self.enable_llm and add_llm_narrative
        summary    = self.m4.analyse(portfolio_df, enable_llm=enable_llm)
        return {"summary": vars(summary)}

    
    def forecast_appreciation(
        self,
        zip_code: str,
    ) -> dict:
        if self.m3 is None:
            return {"error": "M3 not trained — provide Zillow ZHVI CSV and re-run training."}
        try:
            fc = self.m3.predict_zip(zip_code, self.zhvi_long)
            return vars(fc)
        except Exception as e:
            return {"error": str(e)}


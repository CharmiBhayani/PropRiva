import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from config import M6_RISK_WEIGHTS, RISK_THRESHOLDS

log = logging.getLogger(__name__)


@dataclass
class RiskAssessment:
    risk_score:            float
    risk_tier:             str             
    factor_scores:         dict           
    factor_contributions:  dict           
    top_factors:           list           
    narrative_inputs:      dict            


class M6RiskModel:

    @staticmethod
    def _score_hpi_volatility(hpi_series: pd.Series) -> float:
        """Score based on NHB Residex HPI coefficient of variation."""
        if hpi_series is None or len(hpi_series) < 6:
            return 50.0
        cv = hpi_series.std() / (hpi_series.mean() + 1e-9)
        return float(np.clip(cv / 0.20 * 100, 0, 100))

    @staticmethod
    def _score_inventory_spike(inventory_trend_pct: float) -> float:
        if inventory_trend_pct is None or np.isnan(inventory_trend_pct):
            return 30.0
        return float(np.clip(inventory_trend_pct / 0.40 * 100, 0, 100))

    @staticmethod
    def _score_price_cut_trend(price_cut_pct: float) -> float:
        if price_cut_pct is None or np.isnan(price_cut_pct):
            return 30.0
        return float(np.clip((price_cut_pct - 2.0) / (15.0 - 2.0) * 100, 0, 100))

    @staticmethod
    def _score_rent_price_compression(rent_to_price_ratio: float) -> float:
        if rent_to_price_ratio is None or np.isnan(rent_to_price_ratio):
            return 30.0
        risk = (0.004 - rent_to_price_ratio) / (0.004 - 0.0018 + 1e-9) * 100
        return float(np.clip(risk, 0, 100))

    @staticmethod
    def _score_employment_concentration(employment_hhi: float) -> float:
        if employment_hhi is None or np.isnan(employment_hhi):
            return 40.0
        return float(np.clip(employment_hhi * 100, 0, 100))


    def score(
        self,
        *,
        zhvi_series:             Optional[pd.Series] = None,
        inventory_trend_pct:     float = 0.05,
        price_cut_pct:           float = 5.0,
        rent_to_price_ratio:     float = 0.006,
        employment_hhi:          float = 0.30,
    ) -> RiskAssessment:

        factor_raw = {
            "hpi_volatility": self._score_hpi_volatility(
                zhvi_series if zhvi_series is not None
                else pd.Series([15_000_000.0] * 24)
            ),
            "inventory_spike":          self._score_inventory_spike(inventory_trend_pct),
            "price_cut_trend":          self._score_price_cut_trend(price_cut_pct),
            "rent_price_compression":   self._score_rent_price_compression(rent_to_price_ratio),
            "employment_concentration": self._score_employment_concentration(employment_hhi),
        }

        weighted = {
            k: factor_raw[k] * M6_RISK_WEIGHTS[k]
            for k in M6_RISK_WEIGHTS
        }
        risk_score = sum(weighted.values())

        # Tier lookup (ascending threshold table)
        risk_tier = "Spec"
        for tier, threshold in RISK_THRESHOLDS.items():
            if risk_score < threshold:
                risk_tier = tier
                break

        top_factors = sorted(weighted, key=weighted.__getitem__, reverse=True)[:3]

        narrative_inputs = {
            "risk_score":               round(risk_score, 1),
            "risk_tier":                risk_tier,
            "top_factors":              top_factors,
            "hpi_volatility_score":     round(factor_raw["hpi_volatility"], 1),
            "inventory_spike_score":    round(factor_raw["inventory_spike"], 1),
            "price_cut_score":          round(factor_raw["price_cut_trend"], 1),
            "rent_compression_score":   round(factor_raw["rent_price_compression"], 1),
            "employment_score":         round(factor_raw["employment_concentration"], 1),
        }

        return RiskAssessment(
            risk_score=round(risk_score, 1),
            risk_tier=risk_tier,
            factor_scores={k: round(v, 1) for k, v in factor_raw.items()},
            factor_contributions={k: round(v, 1) for k, v in weighted.items()},
            top_factors=top_factors,
            narrative_inputs=narrative_inputs,
        )

    def score_batch(self, df: pd.DataFrame) -> pd.DataFrame:
        results = []
        for _, row in df.iterrows():
            ra = self.score(
                inventory_trend_pct  = float(row.get("inventory_trend_pct",
                                              row.get("inventory_trend", 0.05))),
                price_cut_pct        = float(row.get("price_cut_pct", 5.0)),
                rent_to_price_ratio  = float(row.get("rent_to_price_ratio", 0.0025)),
                employment_hhi       = float(row.get("employment_hhi", 0.30)),
            )
            results.append({
                "m6_risk_score":    ra.risk_score,
                "m6_risk_tier":     ra.risk_tier,
                "m6_top_factors":   ", ".join(ra.top_factors),
            })
        result_df = pd.DataFrame(results, index=df.index)
        return df.assign(
            m6_risk_score  = result_df["m6_risk_score"],
            m6_risk_tier   = result_df["m6_risk_tier"],
            m6_top_factors = result_df["m6_top_factors"],
        )



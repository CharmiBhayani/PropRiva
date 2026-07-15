import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

from config import M5_SCORE_WEIGHTS, GRADE_THRESHOLDS

log = logging.getLogger(__name__)


@dataclass
class InvestmentScore:
    investment_score:  float
    grade:             str          
    signal:            str         
    confidence:        str          
    sub_scores:        dict
    factor_breakdown:  dict           
    llm_narrative:     Optional[str] = None


class M5InvestmentScorer:
   
    @staticmethod
    def _yield_score(gross_yield_pct: float) -> float:
        return float(np.clip(gross_yield_pct / 4.0 * 100, 0, 100))

    @staticmethod
    def _appreciation_score(appreciation_pct_12m: float) -> float:
        return float(np.clip((appreciation_pct_12m + 5.0) / 15.0 * 100, 0, 100))

    @staticmethod
    def _value_gap_score(gap_pct: float) -> float:
        return float(np.clip((-gap_pct + 10.0) / 20.0 * 100, 0, 100))

    @staticmethod
    def _vacancy_score(vacancy_prob: float) -> float:
        return float(np.clip((1.0 - vacancy_prob) * 100, 0, 100))

    @staticmethod
    def _maintenance_score(annual_maintenance: float, property_value: float) -> float:
        if property_value <= 0:
            return 50.0
        pct   = annual_maintenance / property_value * 100
        score = (3.0 - pct) / (3.0 - 0.5) * 100
        return float(np.clip(score, 0, 100))

    def score(
        self,
        gross_yield_pct:       float,
        appreciation_pct_12m:  float,
        value_gap_pct:         float,   # from M1  (+ve = overvalued)
        vacancy_prob:          float,   # 0–1
        annual_maintenance:    float,   # $ from M6 heuristic
        property_value:        float,   # $ from M1
    ) -> InvestmentScore:

        sub_scores = {
            "yield_score":        self._yield_score(gross_yield_pct),
            "appreciation_score": self._appreciation_score(appreciation_pct_12m),
            "value_gap_score":    self._value_gap_score(value_gap_pct),
            "vacancy_score":      self._vacancy_score(vacancy_prob),
            "maintenance_score":  self._maintenance_score(annual_maintenance, property_value),
        }

        investment_score = sum(
            sub_scores[k] * M5_SCORE_WEIGHTS[k]
            for k in M5_SCORE_WEIGHTS
        )

        # Grade
        grade = "D"
        for g, threshold in GRADE_THRESHOLDS.items():
            if investment_score >= threshold:
                grade = g
                break

        # Signal + confidence
        if investment_score >= 70:
            signal, confidence = "Buy",  "High"
        elif investment_score >= 55:
            signal, confidence = "Buy",  "Med"
        elif investment_score >= 40:
            signal, confidence = "Hold", "Med"
        elif investment_score >= 25:
            signal, confidence = "Sell", "Med"
        else:
            signal, confidence = "Sell", "High"

        factor_breakdown = {
            k: round(sub_scores[k] * M5_SCORE_WEIGHTS[k], 1)
            for k in M5_SCORE_WEIGHTS
        }

        return InvestmentScore(
            investment_score=round(investment_score, 1),
            grade=grade,
            signal=signal,
            confidence=confidence,
            sub_scores={k: round(v, 1) for k, v in sub_scores.items()},
            factor_breakdown=factor_breakdown,
        )

    def score_batch(self, df: pd.DataFrame) -> pd.DataFrame:
        
        results = []
        for _, row in df.iterrows():
            val_col  = "m1_estimated_value" if "m1_estimated_value" in row.index else "sale_price"
            prop_val = float(row.get(val_col, 10_000_000))
            sc = self.score(
                gross_yield_pct      = float(row.get("m2_gross_yield", 3.0)),
                appreciation_pct_12m = float(row.get("m3_appreciation_pct_12m",
                                              row.get("appreciation_pct_12m", 5.0))),
                value_gap_pct        = float(row.get("m1_gap_pct", 0.0)),
                vacancy_prob         = float(row.get("vacancy_prob", 0.30)),
                annual_maintenance   = float(row.get("annual_maintenance", 100_000)),
                property_value       = prop_val,
            )
            results.append({
                "m5_investment_score": sc.investment_score,
                "m5_grade":            sc.grade,
                "m5_signal":           sc.signal,
                "m5_confidence":       sc.confidence,
            })
        return df.assign(**pd.DataFrame(results, index=df.index))

    @staticmethod
    def to_llm_context(sc: InvestmentScore, property_meta: Optional[dict] = None) -> dict:
        ctx = {
            "investment_score":   sc.investment_score,
            "grade":              sc.grade,
            "signal":             sc.signal,
            "confidence":         sc.confidence,
            "yield_score":        sc.sub_scores.get("yield_score"),
            "appreciation_score": sc.sub_scores.get("appreciation_score"),
            "value_gap_score":    sc.sub_scores.get("value_gap_score"),
            "vacancy_score":      sc.sub_scores.get("vacancy_score"),
            "maintenance_score":  sc.sub_scores.get("maintenance_score"),
            "factor_breakdown":   sc.factor_breakdown,
        }
        if property_meta:
            ctx.update(property_meta)
        return ctx



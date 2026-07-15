import logging
from dataclasses import dataclass
from typing import Optional
import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

@dataclass
class PortfolioSummary:
    property_count:                 int
    total_value:                    float
    total_annual_rent:              float
    total_annual_maintenance:       float   # user-supplied sum
    net_annual_income:              float   # rent - maintenance
    gross_yield_pct:                float
    net_yield_pct:                  float
    portfolio_appreciation_pct_12m: float  
    avg_risk_score:                 float
    diversification_score:          float   
    zip_concentration:              dict    
    best_performers:                list
    worst_performers:               list
    rebalancing_flags:              list
    next_investment_suggestion:     str
    llm_narrative:                  Optional[str] = None


class M4PortfolioAnalyser:
    def __init__(self):
        pass
    def analyse(
        self,
        portfolio_df: pd.DataFrame,
        enable_llm: bool = True,
    ) -> PortfolioSummary:
        df = portfolio_df.copy()
        n  = len(df)
        if n == 0:
            raise ValueError("Portfolio is empty.")

        val_col   = self._pick(df, ["m1_estimated_value", "sale_price"],       default=10_000_000.0)
        rent_col  = self._pick(df, ["m2_monthly_rent"],                         default=35_000.0)
        appr_col  = self._pick(df, ["m3_appreciation_pct_12m",
                                     "appreciation_pct_12m"],                   default=5.0)
        risk_col  = self._pick(df, ["m6_risk_score"],         default=40.0)
        tier_col  = "m6_risk_tier"  if "m6_risk_tier"  in df.columns else None
        maint_col = self._pick(df, ["annual_maintenance"],                      default=0.0)

        for col in [val_col, rent_col, appr_col, risk_col, maint_col]:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(
                0.0 if col == maint_col else
                40.0 if col == risk_col else 0.0
            )

        total_value  = float(df[val_col].sum())
        annual_rent  = float(df[rent_col].sum() * 12)
        annual_maint = float(df[maint_col].sum())
        net_income   = annual_rent - annual_maint
        gross_yield  = annual_rent  / (total_value + 1e-9) * 100
        net_yield    = net_income   / (total_value + 1e-9) * 100

        wtd_appr = float(
            (df[val_col] * df[appr_col]).sum() / (total_value + 1e-9)
        )

        div_score = self._diversification_score(df, val_col, risk_col, tier_col)

        if "zip_code" in df.columns:
            zip_conc = (
                df.groupby("zip_code")[val_col].sum() / total_value * 100
            ).round(1).to_dict()
        else:
            zip_conc = {}

        df["_net_yield_prop"] = (
            (df[rent_col] * 12 - df[maint_col]) / df[val_col].clip(1) * 100
        )
        df["_rank_score"] = (
            df["_net_yield_prop"] / 100 * 0.5
            + df[appr_col] / 100 * 0.3
            - df[risk_col] / 100 * 0.2
        )
        df_s      = df.sort_values("_rank_score", ascending=False)
        rank_cols = [c for c in [
            "property_id", "zip_code",
            val_col, rent_col, maint_col, appr_col, risk_col,
            "_net_yield_prop",
        ] if c in df_s.columns]
        best  = df_s.head(3)[rank_cols].round(2).to_dict("records")
        worst = df_s.tail(3)[rank_cols].round(2).to_dict("records")

        flags = self._rebalancing_flags(
            df, zip_conc, net_yield, gross_yield,
            df[risk_col].values, tier_col,
        )

        suggestion = self._next_investment_suggestion(df, zip_conc, net_yield)
        avg_risk   = float(df[risk_col].mean())

        summary = PortfolioSummary(
            property_count=n,
            total_value=round(total_value, 0),
            total_annual_rent=round(annual_rent, 0),
            total_annual_maintenance=round(annual_maint, 0),
            net_annual_income=round(net_income, 0),
            gross_yield_pct=round(gross_yield, 2),
            net_yield_pct=round(net_yield, 2),
            portfolio_appreciation_pct_12m=round(wtd_appr, 2),
            avg_risk_score=round(avg_risk, 1),
            diversification_score=round(div_score, 1),
            zip_concentration=zip_conc,
            best_performers=best,
            worst_performers=worst,
            rebalancing_flags=flags,
            next_investment_suggestion=suggestion,
            llm_narrative=None,
        )

        if enable_llm:
            from advisory.llm_advisor import generate_portfolio_narrative
            summary.llm_narrative = generate_portfolio_narrative(
                self.to_llm_context(summary)
            )

        return summary

    @staticmethod
    def _pick(df: pd.DataFrame, candidates: list, default: float) -> str:
        for c in candidates:
            if c in df.columns:
                return c
        col = candidates[0]
        df[col] = default
        return col

    @staticmethod
    def _diversification_score(
        df: pd.DataFrame,
        val_col: str,
        risk_col: str,
        tier_col: Optional[str],
    ) -> float:
        scores = []
        if "zip_code" in df.columns and len(df) > 1:
            total = df[val_col].sum()
            if total > 0:
                shares = df.groupby("zip_code")[val_col].sum() / total
                hhi = float((shares ** 2).sum())
                scores.append((1.0 - hhi) * 100)
        if "zip_code" in df.columns:
            n_zips = df["zip_code"].nunique()
            scores.append(min(n_zips / max(len(df) * 0.5, 1), 1.0) * 100)
        if tier_col and tier_col in df.columns:
            n_tiers = df[tier_col].nunique()
            scores.append(n_tiers / 4.0 * 100)
        return float(np.mean(scores)) if scores else 50.0

    @staticmethod
    def _rebalancing_flags(
        df: pd.DataFrame,
        zip_conc: dict,
        net_yield: float,
        gross_yield: float,
        risk_vals: np.ndarray,
        tier_col: Optional[str],
    ) -> list:
        flags = []

        for z, pct in zip_conc.items():
            if pct > 50:
                flags.append(
                    f"Geographic concentration: {pct:.0f}% of portfolio value in ZIP {z}. "
                    f"Diversify into a different sub-market."
                )

        if net_yield < 2.0:
            flags.append(
                f"Net yield ({net_yield:.1f}%) is below the 2% floor — "
                f"review high-maintenance or low-rent assets."
            )

        if gross_yield < 4.0:
            flags.append(
                f"Gross yield ({gross_yield:.1f}%) is below 4% — "
                f"portfolio skewed toward appreciation plays with thin income."
            )

        avg_risk = float(np.mean(risk_vals))
        if avg_risk > 65:
            flags.append(
                f"Portfolio average risk score {avg_risk:.0f}/100 exceeds the 65-point "
                f"threshold — reduce exposure to high-volatility ZIPs."
            )

        if tier_col and tier_col in df.columns:
            n_high = int(df[tier_col].isin(["High", "Spec"]).sum())
            if n_high > 0:
                flags.append(
                    f"{n_high} propert{'y' if n_high == 1 else 'ies'} rated High or Spec "
                    f"risk — review for divestment or capital improvements."
                )

        if not flags:
            flags.append(
                "Portfolio is well-balanced across geography, yield, and risk — "
                "no immediate rebalancing required."
            )
        return flags

    @staticmethod
    def _next_investment_suggestion(
        df: pd.DataFrame,
        zip_conc: dict,
        net_yield: float,
    ) -> str:
        n_zips = len(zip_conc)
        if n_zips < 2:
            return (
                "Portfolio is concentrated in a single ZIP. "
                "Next acquisition should target a geographically distinct sub-market "
                "with ZORI growth above 5% YoY."
            )
        if n_zips < 4:
            return (
                f"With {n_zips} ZIPs represented, diversification is partial. "
                "Target a ZIP with low current portfolio exposure, "
                "strong employment base, and declining inventory."
            )
        if net_yield < 3.5:
            return (
                "Net yield is below 3.5% — prioritise high-income assets "
                "(gross yield ≥ 6%, low maintenance) for the next acquisition."
            )
        return (
            "Portfolio is broadly diversified. Seek the next acquisition in a ZIP "
            "with ZHVI appreciation forecast > 7% and gross yield > 5%, "
            "ideally in a sub-market not yet represented."
        )

    @staticmethod
    def to_llm_context(summary: PortfolioSummary) -> dict:
        return {
            "portfolio_value":            f"₹{summary.total_value:,.0f}",
            "property_count":             summary.property_count,
            "gross_yield_pct":            f"{summary.gross_yield_pct:.1f}%",
            "net_yield_pct":              f"{summary.net_yield_pct:.1f}%",
            "total_annual_rent":          f"₹{summary.total_annual_rent:,.0f}",
            "total_annual_maintenance":   f"₹{summary.total_annual_maintenance:,.0f}",
            "net_annual_income":          f"₹{summary.net_annual_income:,.0f}",
            "appreciation_forecast_12m":  f"{summary.portfolio_appreciation_pct_12m:.1f}%",
            "avg_risk_score":             summary.avg_risk_score,
            "diversification_score":      summary.diversification_score,
            "zip_concentration":          summary.zip_concentration,
            "rebalancing_flags":          summary.rebalancing_flags,
            "best_performers":            summary.best_performers,
            "worst_performers":           summary.worst_performers,
            "next_investment_suggestion": summary.next_investment_suggestion,
        }


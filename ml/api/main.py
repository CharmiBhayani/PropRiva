import logging
import sys
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

app = FastAPI(
    title="Real Estate Advisory Platform API",
    description=(
        "ML-powered property valuation, rental estimation, "
        "appreciation forecasting, portfolio analysis, and investment advisory.\n\n"
        "Models: M1 (value) · M2 (rent) · M3 (appreciation) · "
        "M4 (portfolio) · M5 (investment score) · M6 (risk)"
    ),
    version="2.0.0",
)

_advisor = None

def get_advisor():
    global _advisor
    if _advisor is None:
        from pipeline.inference_pipeline import RealEstateAdvisor
        _advisor = RealEstateAdvisor(enable_llm=True)
    return _advisor


class PropertyInput(BaseModel):

    bedrooms:   int   = Field(3,      ge=0,   le=15)
    bathrooms:  float = Field(2.0,    ge=0,   le=12)
    sqft:       int   = Field(1_500,  ge=200, le=15_000)
    lot_size:   int   = Field(5_000,  ge=0)
    year_built: int   = Field(1990,   ge=1800, le=2024)
    condition:  int   = Field(3,      ge=1,   le=5)
    grade:      int   = Field(7,      ge=1,   le=13)
    zip_code:   str   = Field("98001")
    listed_price: Optional[float] = Field(None, description="Listed / asking price $")

    zhvi_at_sale:    Optional[float] = Field(None)
    zhvi_12m_growth: Optional[float] = Field(None)
    zhvi_3yr_cagr:   Optional[float] = Field(None)
    zori_at_month:   Optional[float] = Field(None)
    zori_12m_growth: Optional[float] = Field(None)
    inventory:       Optional[float] = Field(None)
    market_heat:     Optional[float] = Field(None)
    price_cut_pct:   Optional[float] = Field(None)

   
    sqft_vs_zip_median:    Optional[float] = Field(None)
    price_per_sqft_vs_zip: Optional[float] = Field(None)
    rent_to_price_ratio:   Optional[float] = Field(None)

    
    inventory_trend_pct: Optional[float] = Field(
        None, description="YoY % change in active inventory (e.g. 0.15 = +15%)"
    )
    employment_hhi: Optional[float] = Field(
        None, description="Employment sector HHI 0–1 (1 = most concentrated)"
    )

    vacancy_prob: Optional[float] = Field(
        None, description="Estimated vacancy probability 0–1"
    )


class PortfolioPropertyInput(BaseModel):
   
    property_id:             Optional[str]   = Field(None)
    zip_code:                Optional[str]   = Field(None)

    m1_estimated_value:      Optional[float] = Field(None, description="M1 estimated value $")
    m2_monthly_rent:         Optional[float] = Field(None, description="M2 estimated monthly rent $")
    m3_appreciation_pct_12m: Optional[float] = Field(None, description="M3 12m appreciation %")

    
    m6_risk_score:           Optional[float] = Field(None, description="M6 risk score 0–100")
    m6_risk_tier:            Optional[str]   = Field(None, description="M6 tier Low/Med/High/Spec")

   
    annual_maintenance:      float           = Field(
        0.0, description="Annual maintenance cost $ — user input, not estimated"
    )


    sale_price:              Optional[float] = Field(None, description="Purchase or last known price $")


class PortfolioInput(BaseModel):
    properties: list[PortfolioPropertyInput] = Field(..., min_length=1)
    enable_llm: bool = Field(
        True,
        description="Generate LLM narrative via OpenRouter. Requires OPENROUTER_API_KEY.",
    )


class ZipForecastInput(BaseModel):
    zip_code:     str = Field(..., description="5-digit ZIP code")

@app.get("/health", summary="Liveness check")
def health():
    from advisory.llm_advisor import active_provider_info
    return {
        "status":       "ok",
        "models_loaded": _advisor is not None,
        "llm":           active_provider_info(),
    }


@app.get("/llm/info", summary="Active LLM provider details")
def llm_info():
    from advisory.llm_advisor import active_provider_info
    return active_provider_info()


@app.post("/property/analyse", summary="Full single-property analysis (M1–M6)")
def analyse_property(body: PropertyInput):
    try:
        advisor   = get_advisor()
        prop_dict = body.model_dump(exclude={"listed_price"})
        prop_dict = {k: v for k, v in prop_dict.items() if v is not None}
        result    = advisor.analyse_property(
            prop=prop_dict,
            listed_price=body.listed_price,
            add_llm_narrative=True,
        )
        return result
    except Exception as exc:
        log.exception("analyse_property error")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/portfolio/analyse", summary="Portfolio aggregation and advisory (M4)")
def analyse_portfolio(body: PortfolioInput):
    try:
        import pandas as pd
        advisor = get_advisor()
        df      = pd.DataFrame([p.model_dump() for p in body.properties])
        result  = advisor.analyse_portfolio(df, add_llm_narrative=body.enable_llm)
        return result
    except Exception as exc:
        log.exception("analyse_portfolio error")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/zip/appreciation", summary="M3 appreciation forecast for a ZIP")
def zip_appreciation(body: ZipForecastInput):
    try:
        advisor = get_advisor()
        result  = advisor.forecast_appreciation(body.zip_code)
        return result
    except Exception as exc:
        log.exception("zip_appreciation error")
        raise HTTPException(status_code=500, detail=str(exc))



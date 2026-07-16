import json
import logging
from typing import Optional

from config import (
    LLM_PROVIDER,
    OPENROUTER_API_KEY, OPENROUTER_BASE_URL,
    OPENROUTER_MODEL, GEMINI_MODEL, GROQ_MODEL,
    OPENROUTER_APP_NAME, OPENROUTER_APP_URL,
)

log = logging.getLogger(__name__)

def _resolve_model_slug() -> str:
    provider = LLM_PROVIDER.lower().strip()
    if provider == "gemini":
        return GEMINI_MODEL
    if provider == "groq":
        return GROQ_MODEL
    return OPENROUTER_MODEL


def _call_openrouter(
    system_prompt: str,
    user_message:  str,
    max_tokens:    int = 400,
) -> str:
    
    import requests

    model_slug = _resolve_model_slug()

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  OPENROUTER_APP_URL,
        "X-Title":       OPENROUTER_APP_NAME,
    }
    payload = {
        "model":      model_slug,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_message},
        ],
    }

    resp = requests.post(
        OPENROUTER_BASE_URL,
        headers=headers,
        json=payload,
        timeout=60,
    )

    if not resp.ok:
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        log.warning(
            "OpenRouter HTTP %s (model=%s): %s",
            resp.status_code, model_slug, body,
        )
        resp.raise_for_status()

    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


def _call_llm(
    system_prompt: str,
    user_message:  str,
    max_tokens:    int = 400,
) -> str:

    if LLM_PROVIDER.lower() == "none":
        return "[LLM disabled — set LLM_PROVIDER and OPENROUTER_API_KEY to enable.]"

    if not OPENROUTER_API_KEY:
        return (
            "[Advisory narrative unavailable — "
            "set OPENROUTER_API_KEY to enable LLM narratives.]"
        )

    try:
        result = _call_openrouter(system_prompt, user_message, max_tokens)
        log.debug(
            "LLM call OK  provider=%s  model=%s  tokens≤%d",
            LLM_PROVIDER, _resolve_model_slug(), max_tokens,
        )
        return result
    except Exception as exc:
        log.warning("LLM call failed (provider=%s): %s", LLM_PROVIDER, exc)
        return f"[Advisory narrative unavailable — LLM error: {exc}]"


_SYSTEM_INVESTMENT = """\
You are a concise, data-driven real estate investment advisor.
Given structured model outputs, write a 3–5 sentence plain-language narrative.
Rules:
- Lead with the signal (Buy / Hold / Sell) and the score in the first sentence.
- Justify using the 2–3 highest-impact sub-scores; cite the actual numbers.
- End with one concrete actionable sentence for the investor.
- No filler phrases. No bullet points. Prose only."""

_SYSTEM_PORTFOLIO = """\
You are a portfolio strategist specialising in Indian residential real estate.
Given a full portfolio summary, write a 5–7 sentence executive narrative that:
  1. States portfolio health — total value, gross yield, net yield, appreciation outlook.
  2. Identifies the single biggest risk or concentration concern with specific numbers.
  3. Contrasts the best and worst performing assets briefly.
  4. Gives one specific, actionable rebalancing or acquisition recommendation.
Rules:
- Reference actual amounts in ₹ (INR) and percentages from the data.
- No bullet points. Continuous professional prose.
- Assume the reader is a sophisticated Indian real estate investor."""

_SYSTEM_RISK = """\
You are a real estate market risk analyst.
Given a risk factor breakdown, write 3–4 sentences:
- Sentence 1: state the overall risk tier and composite score.
- Sentences 2–3: explain the top 2 risk factors and what each means for the investor.
- Sentence 4: give one concrete mitigation suggestion.
Reference the actual scores. No bullet points."""


def generate_investment_narrative(ctx: dict) -> str:
    lines = [
        f"Investment Score: {ctx.get('investment_score')}/100  "
        f"Grade: {ctx.get('grade')}  "
        f"Signal: {ctx.get('signal')} ({ctx.get('confidence')} confidence)",
        "",
        "Sub-scores (0–100, higher = more attractive):",
        f"  Yield:         {ctx.get('yield_score')}",
        f"  Appreciation:  {ctx.get('appreciation_score')}",
        f"  Value Gap:     {ctx.get('value_gap_score')}",
        f"  Vacancy:       {ctx.get('vacancy_score')}",
        f"  Maintenance:   {ctx.get('maintenance_score')}",
        "",
        f"Weighted factor contributions:\n"
        f"{json.dumps(ctx.get('factor_breakdown', {}), indent=2)}",
    ]
    if ctx.get("estimated_value"):
        lines += [
            "",
            f"Property context: "
            f"{ctx.get('bedrooms', '?')} BHK / {ctx.get('sqft', '?')} sqft"
            f" | Value ₹{ctx.get('estimated_value'):,.0f}"
            f" | Rent ₹{ctx.get('monthly_rent', '?')}/mo"
            f" | Locality {ctx.get('zip_code', '?')}",
        ]
    if ctx.get("age"):
        lines.append(
            f"  Age: {ctx.get('age')} yrs | Floors: {ctx.get('floors')}/{ctx.get('total_floors')}"
            f" | Furnishing: {ctx.get('furnishing')} | Balconies: {ctx.get('balconies')}"
            f" | Type: {ctx.get('property_type')}"
        )
    return _call_llm(_SYSTEM_INVESTMENT, "\n".join(lines), max_tokens=320)


def generate_portfolio_narrative(ctx: dict) -> str:
  
    def _fmt_props(props: list) -> str:
        if not props:
            return "  (no data)"
        rows = []
        for p in props:
            pid  = p.get("property_id", "—")
            val  = p.get("m1_estimated_value", p.get("sale_price", "?"))
            rent = p.get("m2_monthly_rent", "?")
            appr = p.get("m3_appreciation_pct_quarterly", p.get("m3_appreciation_pct_12m", "?"))
            risk = p.get("m6_risk_score", "?")
            ny   = p.get("_net_yield_prop", "?")
            try:
                row = (
                    f"    {pid}: ₹{float(val):,.0f}, ₹{float(rent):,.0f}/mo, "
                    f"{float(appr):.1f}% appr, risk {float(risk):.0f}, "
                    f"net yield {float(ny):.1f}%"
                )
            except (TypeError, ValueError):
                row = f"    {pid}: (incomplete data)"
            rows.append(row)
        return "\n".join(rows)

    flags_str = "\n".join(f"  • {f}" for f in ctx.get("rebalancing_flags", []))
    zip_str   = json.dumps(ctx.get("zip_concentration", {}))

    user_msg = (
        f"Portfolio Overview\n"
        f"  Total value:                         {ctx.get('portfolio_value')}\n"
        f"  Properties:                          {ctx.get('property_count')}\n"
        f"  Gross yield:                         {ctx.get('gross_yield_pct')}\n"
        f"  Net yield:                           {ctx.get('net_yield_pct')}\n"
        f"  Annual rent income:                  {ctx.get('total_annual_rent')}\n"
        f"  Annual maintenance (user-supplied):  {ctx.get('total_annual_maintenance')}\n"
        f"  Net annual income:                   {ctx.get('net_annual_income')}\n"
        f"  Quarterly appreciation forecast (wtd avg): {ctx.get('appreciation_forecast_quarterly', ctx.get('appreciation_forecast_12m'))}\n"
        f"\n"
        f"Risk & Diversification\n"
        f"  Average risk score:    {ctx.get('avg_risk_score')}/100\n"
        f"  Diversification score: {ctx.get('diversification_score')}/100\n"
        f"  Locality concentration (%): {zip_str}\n"
        f"\n"
        f"Rebalancing Flags\n"
        f"{flags_str}\n"
        f"\n"
        f"Best Performers\n"
        f"{_fmt_props(ctx.get('best_performers', []))}\n"
        f"\n"
        f"Worst Performers\n"
        f"{_fmt_props(ctx.get('worst_performers', []))}\n"
        f"\n"
        f"Next Investment Suggestion\n"
        f"  {ctx.get('next_investment_suggestion')}\n"
    )
    return _call_llm(_SYSTEM_PORTFOLIO, user_msg, max_tokens=450)


def generate_risk_narrative(ctx: dict) -> str:
    user_msg = (
        f"Risk Score: {ctx.get('risk_score')}/100  "
        f"Tier: {ctx.get('risk_tier')}\n"
        f"Top risk factors: {', '.join(ctx.get('top_factors', []))}\n\n"
        f"Factor scores (0–100, higher = more risky):\n"
        f"  Price Cut Trend:          {ctx.get('price_cut_score')}\n"
        f"  Rent/Price Compression:   {ctx.get('rent_compression_score')}\n"
        f"  Employment Concentration: {ctx.get('employment_score')}\n"
    )
    return _call_llm(_SYSTEM_RISK, user_msg, max_tokens=280)


def generate_buy_hold_sell_reasoning(
    m1_value:            float,
    listed_price:        float,
    m3_appreciation_quarterly: float,
    m2_gross_yield:      float,
    vacancy_tier:        str,
    annual_maintenance:  float,
    m5_signal:           str,
    m5_score:            float,
    market_timing:       Optional[str] = None,
) -> str:
    gap_pct = (listed_price - m1_value) / m1_value * 100 if m1_value > 0 else 0.0
    flag = (
        "overvalued"    if gap_pct >  5 else
        "undervalued"   if gap_pct < -5 else
        "fairly valued"
    )
    user_msg = (
        f"Signal: {m5_signal}  (Investment Score {m5_score:.0f}/100)\n\n"
        f"Quarterly Appreciation Forecast (NHB Residex): {m3_appreciation_quarterly:.1f}%\n"
        f"Property is {flag} by {abs(gap_pct):.1f}% "
        f"(Listed ₹{listed_price:,.0f} vs Predicted ₹{m1_value:,.0f})\n"
        f"Gross Yield: {m2_gross_yield:.1f}%\n"
        f"Vacancy Risk Tier: {vacancy_tier}\n"
        f"Annual Maintenance: ₹{annual_maintenance:,.0f}\n"
    )
    if market_timing:
        user_msg += f"Market Timing Signal: {market_timing}\n"
    return _call_llm(_SYSTEM_INVESTMENT, user_msg, max_tokens=280)


def active_provider_info() -> dict:
    if LLM_PROVIDER.lower() == "none":
        return {"provider": "none", "model": None, "key_set": False}
    return {
        "provider":    LLM_PROVIDER,
        "model":       _resolve_model_slug(),
        "base_url":    OPENROUTER_BASE_URL,
        "key_set":     bool(OPENROUTER_API_KEY),
    }


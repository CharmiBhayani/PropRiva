import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT.parent / ".env")

# Paths
DATA_RAW        = ROOT / "data" / "raw"
DATA_PROCESSED  = ROOT / "data" / "processed"
DATA_ZILLOW     = ROOT / "data" / "zillow"
MODELS_DIR      = ROOT / "models"
OUTPUTS_DIR     = ROOT / "outputs"
for d in [DATA_RAW, DATA_PROCESSED, DATA_ZILLOW, OUTPUTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openrouter")
OPENROUTER_API_KEY   = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL  = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "realestate-advisory-platform")
OPENROUTER_APP_URL  = os.getenv("OPENROUTER_APP_URL",  "https://github.com/your-org/realestate-ml")
OPENROUTER_MODEL    = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "google/gemini-2.0-flash-001")
GROQ_MODEL   = os.getenv("GROQ_MODEL",   "meta-llama/llama-3.3-70b-instruct")


# Features sets for each model
M1_FEATURES = [
    "bedrooms", "bathrooms", "sqft", "lot_size", "year_built",
    "condition", "grade", "zip_code_enc",
    "zhvi_at_sale", "zhvi_12m_growth", "zhvi_3yr_cagr",
    "inventory", "market_heat", "price_cut_pct",
    "price_per_sqft_vs_zip", "sqft_vs_zip_median",
]

M2_FEATURES = [
    "bedrooms", "bathrooms", "sqft", "property_type_enc",
    "year_built", "condition", "zip_code_enc",
    "zori_at_month", "rent_to_price_ratio",
    "zori_12m_growth", "sqft_vs_zip_median", "bedroom_multiplier",
]

M3_LAG_MONTHS  = 36   # trailing months of ZHVI used as input
M3_HORIZONS    = [6, 12]

M5_SCORE_WEIGHTS = {
    "yield_score":        0.30,
    "appreciation_score": 0.25,
    "value_gap_score":    0.20,
    "vacancy_score":      0.15,
    "maintenance_score":  0.10,
}

M6_RISK_WEIGHTS = {
    "zhvi_volatility":          0.2667,
    "inventory_spike":          0.2000,
    "price_cut_trend":          0.2000,
    "rent_price_compression":   0.1333,
    "employment_concentration": 0.2000,
}

BEDROOM_MULTIPLIER = {0: 0.75, 1: 0.85, 2: 1.00, 3: 1.15, 4: 1.25, 5: 1.35}
MAINTENANCE_RATE       = 0.01   
ROOF_USEFUL_LIFE       = 20
HVAC_USEFUL_LIFE       = 15
ROOF_REPLACEMENT_COST  = 12_000
HVAC_REPLACEMENT_COST  = 8_000
GRADE_THRESHOLDS = {"A": 80, "B": 60, "C": 40, "D": 0}
RISK_THRESHOLDS  = {"Low": 30, "Med": 55, "High": 75, "Spec": 101}

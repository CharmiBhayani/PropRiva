import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT.parent / ".env")

# Paths
DATA_RAW        = ROOT / "data" / "raw"
DATA_PROCESSED  = ROOT / "data" / "processed"
MODELS_DIR      = ROOT / "models"
OUTPUTS_DIR     = ROOT / "outputs"
for d in [DATA_RAW, DATA_PROCESSED, OUTPUTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openrouter")
OPENROUTER_API_KEY   = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL  = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "realestate-advisory-platform")
OPENROUTER_APP_URL  = os.getenv("OPENROUTER_APP_URL",  "https://github.com/your-org/realestate-ml")
OPENROUTER_MODEL    = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "google/gemini-2.0-flash-001")
GROQ_MODEL   = os.getenv("GROQ_MODEL",   "meta-llama/llama-3.3-70b-instruct")


# Features sets for each model (Indian / Mumbai dataset)
M1_FEATURES = [
    "BEDROOM_NUM", "AREA", "AGE", "TOTAL_FLOOR",
    "FLOOR_NUM", "BALCONY_NUM", "FURNISH",
    "PROPERTY_TYPE_enc", "CITY_enc",
]

M2_FEATURES = [
    "BEDROOM_NUM", "AREA", "AGE", "TOTAL_FLOOR",
    "FLOOR_NUM", "BALCONY_NUM", "FURNISH",
    "PROPERTY_TYPE_enc", "CITY_enc",
]

M3_LAG_QUARTERS = 4    # trailing quarters of NHB Residex used as input
M3_HORIZONS     = [1, 2, 3, 4]   # forecast horizons in quarters

M5_SCORE_WEIGHTS = {
    "yield_score":        0.30,
    "appreciation_score": 0.25,
    "value_gap_score":    0.20,
    "vacancy_score":      0.15,
    "maintenance_score":  0.10,
}

M6_RISK_WEIGHTS = {
    "hpi_volatility":           0.2667,   # NHB Residex HPI variability
    "inventory_spike":          0.2000,
    "price_cut_trend":          0.2000,
    "rent_price_compression":   0.1333,
    "employment_concentration": 0.2000,
}

BEDROOM_MULTIPLIER = {0: 0.75, 1: 0.85, 2: 1.00, 3: 1.15, 4: 1.25, 5: 1.35}
MAINTENANCE_RATE       = 0.01   
ROOF_USEFUL_LIFE       = 20
HVAC_USEFUL_LIFE       = 15
ROOF_REPLACEMENT_COST  = 200_000   # INR
HVAC_REPLACEMENT_COST  = 100_000   # INR
GRADE_THRESHOLDS = {"A": 80, "B": 60, "C": 40, "D": 0}
RISK_THRESHOLDS  = {"Low": 30, "Med": 55, "High": 75, "Spec": 101}

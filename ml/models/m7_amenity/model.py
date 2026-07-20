"""
m7_amenity/model.py  —  Amenity & Connectivity Scorer (Model M7)
=================================================================
Rule-based (no ML training required).

Input:
    - property lat/lng (informational only — proximity already encoded in nearby_places)
    - nearby_places: list of dicts with keys:
        name        : str
        type        : one of hospital | supermarket | metro_station | school | mall
        distance_m  : float  (metres from the property)
        rating      : float  (optional, 1–5 Google-style)

Output: AmenityResult dataclass (maps exactly to the required JSON schema)

Scoring philosophy (Mumbai-specific):
    1. Distance decay  — exponential: score(d) = exp(-d_km / λ)
       λ (half-life km) per category:
         metro_station : 0.50  (every extra 500 m halves the score — walkability matters)
         hospital      : 2.00  (driving distance acceptable)
         supermarket   : 0.75
         mall          : 1.50
         school        : 1.00

    2. Rating boost — if rating present:
       factor = 0.70 + 0.30 × (rating / 5.0)   → range [0.70, 1.00]
       absent rating → factor = 0.85 (neutral)

    3. Per-category sub-score (0–10):
       raw = Σ decay(d_i) × rating_factor(r_i)   for all places in category
       score = min(10, raw × SCALE[category])

    4. Amenity score (0–100):  weighted average of category sub-scores
       metro: 40%, healthcare: 20%, retail: 20%, schools: 20%

    5. Connectivity score (0–100):
       70% metro sub-score + 30% average(healthcare, retail)

    6. price_impact_pct:
       metro_impact   = metro_sub_score / 10 × 10 − 3      → range [−3, +7]
       amenity_impact = amenity_score   / 100 × 8 − 2      → range [−2, +6]
       combined       = metro_impact × 0.65 + amenity_impact × 0.35
       clipped to [−8, +15]  (empirical Mumbai research range)
"""

from __future__ import annotations

import math
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

# Exponential decay half-life (km) per place type
DECAY_HALFLIFE_KM: Dict[str, float] = {
    "metro_station": 0.50,
    "hospital":      2.00,
    "supermarket":   0.75,
    "mall":          1.50,
    "school":        1.00,
}

# Per-category scaling factor so that "1 excellent nearby place" ≈ score 7–8
CATEGORY_SCALE: Dict[str, float] = {
    "healthcare": 5.0,
    "retail":     4.0,
    "metro":      7.0,
    "schools":    5.5,
}

# Amenity score weights (must sum to 1.0)
AMENITY_WEIGHTS: Dict[str, float] = {
    "metro":      0.40,   # Mumbai: metro proximity dominates pricing
    "healthcare": 0.20,
    "retail":     0.20,
    "schools":    0.20,
}

# Connectivity score weights
CONNECTIVITY_METRO_W   = 0.70
CONNECTIVITY_SUPPORT_W = 0.30

# Maximum radius beyond which a place has negligible impact (km)
MAX_RADIUS_KM: Dict[str, float] = {
    "metro_station": 2.0,
    "hospital":      5.0,
    "supermarket":   3.0,
    "mall":          5.0,
    "school":        3.0,
}

# Place type → amenity category mapping
TYPE_TO_CATEGORY: Dict[str, str] = {
    "hospital":      "healthcare",
    "supermarket":   "retail",
    "mall":          "retail",
    "metro_station": "metro",
    "school":        "schools",
}


# ─────────────────────────────────────────────────────────────────────────────
# Output schema
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CategoryDetail:
    count:       int
    nearest_km:  float
    score:       float          # 0–10


@dataclass
class AmenityResult:
    amenity_score:      float                        # 0–100
    connectivity_score: float                        # 0–100
    breakdown:          Dict[str, CategoryDetail]
    price_impact_pct:   float

    def to_dict(self) -> dict:
        """Serialise to the exact JSON shape specified."""
        return {
            "amenity_score":      round(self.amenity_score, 1),
            "connectivity_score": round(self.connectivity_score, 1),
            "breakdown": {
                cat: {
                    "count":      det.count,
                    "nearest_km": round(det.nearest_km, 3),
                    "score":      round(det.score, 2),
                }
                for cat, det in self.breakdown.items()
            },
            "price_impact_pct": round(self.price_impact_pct, 2),
        }


# ─────────────────────────────────────────────────────────────────────────────
# Core scorer
# ─────────────────────────────────────────────────────────────────────────────

class M7AmenityScorer:
    """Amenity & Connectivity Scorer for Mumbai residential properties (M7).

    No model file / training required — pure formula.
    """

    def score(
        self,
        lat: Optional[float],
        lng: Optional[float],
        nearby_places: List[dict],
    ) -> AmenityResult:
        """Score a property based on its surrounding amenities.

        Args:
            lat:            Property latitude  (informational, not used in formula).
            lng:            Property longitude (informational, not used in formula).
            nearby_places:  List of place dicts:
                            {name, type, distance_m, rating (optional)}

        Returns:
            AmenityResult dataclass.
        """
        # ── 1. Bucket places into categories ─────────────────────────────────
        buckets: Dict[str, List[dict]] = {
            "healthcare": [],
            "retail":     [],
            "metro":      [],
            "schools":    [],
        }

        for p in nearby_places:
            ptype    = str(p.get("type", "")).strip().lower()
            category = TYPE_TO_CATEGORY.get(ptype)
            if category is None:
                continue
            d_m = float(p.get("distance_m", 0))
            d_km = d_m / 1000.0

            # Filter out places beyond the maximum useful radius
            max_r = MAX_RADIUS_KM.get(ptype, 5.0)
            if d_km > max_r:
                continue

            buckets[category].append({
                "name":     p.get("name", ""),
                "type":     ptype,
                "d_km":     d_km,
                "rating":   float(p["rating"]) if p.get("rating") else None,
            })

        # ── 2. Score each category ────────────────────────────────────────────
        category_scores: Dict[str, float] = {}
        breakdown: Dict[str, CategoryDetail] = {}

        for cat, places in buckets.items():
            if not places:
                category_scores[cat] = 0.0
                breakdown[cat] = CategoryDetail(count=0, nearest_km=99.0, score=0.0)
                continue

            nearest_km = min(p["d_km"] for p in places)
            raw = 0.0

            for p in places:
                ptype   = p["type"]
                lam     = DECAY_HALFLIFE_KM.get(ptype, 1.0)
                decay   = math.exp(-p["d_km"] / lam)

                if p["rating"] is not None:
                    rating_factor = 0.70 + 0.30 * (p["rating"] / 5.0)
                else:
                    rating_factor = 0.85   # neutral default

                raw += decay * rating_factor

            scale    = CATEGORY_SCALE.get(cat, 5.0)
            sub_score = min(10.0, raw * scale)

            category_scores[cat] = sub_score
            breakdown[cat] = CategoryDetail(
                count=len(places),
                nearest_km=round(nearest_km, 3),
                score=round(sub_score, 2),
            )

        # ── 3. Amenity score (0–100) ──────────────────────────────────────────
        amenity_score = sum(
            category_scores[cat] * weight
            for cat, weight in AMENITY_WEIGHTS.items()
        ) * 10.0   # convert 0–10 weighted avg → 0–100

        # ── 4. Connectivity score (0–100) ─────────────────────────────────────
        support_avg = (category_scores["healthcare"] + category_scores["retail"]) / 2.0
        connectivity_score = (
            category_scores["metro"]  * CONNECTIVITY_METRO_W
            + support_avg             * CONNECTIVITY_SUPPORT_W
        ) * 10.0

        # ── 5. Price impact % ─────────────────────────────────────────────────
        metro_impact   = (category_scores["metro"] / 10.0) * 10.0 - 3.0
        amenity_impact = (amenity_score / 100.0) * 8.0 - 2.0
        combined       = metro_impact * 0.65 + amenity_impact * 0.35
        price_impact   = max(-8.0, min(15.0, combined))

        log.info(
            "M7 — amenity=%.1f  connectivity=%.1f  price_impact=%.2f%%  "
            "metro_sub=%.2f  healthcare_sub=%.2f  retail_sub=%.2f  schools_sub=%.2f",
            amenity_score, connectivity_score, price_impact,
            category_scores["metro"], category_scores["healthcare"],
            category_scores["retail"], category_scores["schools"],
        )

        return AmenityResult(
            amenity_score=round(amenity_score, 1),
            connectivity_score=round(connectivity_score, 1),
            breakdown=breakdown,
            price_impact_pct=round(price_impact, 2),
        )

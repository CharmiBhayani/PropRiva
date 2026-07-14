const advisoryService = require("./advisory.service");
const prisma = require("../../config/prisma");

const analyseProperty = async (req, res) => {
  try {
    const mappedData = {
      bedrooms:     parseInt(req.body.bedrooms || req.body.bhk_config) || 3,
      bathrooms:    parseFloat(req.body.bathrooms) || 2.0,
      sqft:         parseInt(req.body.sqft) || 1500,
      lot_size:     parseInt(req.body.lot_size || req.body.total_area) || 5000,
      year_built:   parseInt(req.body.year_built) || 1990,
      condition:    parseInt(req.body.condition) || 3,
      grade:        parseInt(req.body.grade) || 7,
      zip_code:     String(req.body.zip_code || req.body.pincode || "98001"),
      listed_price: req.body.listed_price ? parseFloat(req.body.listed_price) : null,
    };

    const analysis = await advisoryService.analyseProperty(mappedData);
    res.status(200).json({
      success: true,
      analysis,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const analysePortfolio = async (req, res) => {
  try {
    const userId = req.user.id;
    let { properties, enable_llm } = req.body;

    if (enable_llm === undefined) enable_llm = true;

    // If properties are not supplied, fetch the user's properties from DB
    if (!properties || !Array.isArray(properties) || properties.length === 0) {
      const dbProperties = await prisma.property.findMany({
        where: { ownerId: userId },
      });

      if (dbProperties.length === 0) {
        return res.status(200).json({
          success: true,
          portfolioAnalysis: {
            summary: {
              portfolio_value: 0,
              monthly_rent: 0,
              appreciation_12m_pct: 0,
              risk_tier: "Low",
              risk_score: 0,
              properties: [],
              narrative: "No properties found in your portfolio to analyze.",
            },
          },
        });
      }

      // Convert DB properties to US portfolio inputs
      properties = dbProperties.map((p) => {
        // Use US 5-digit ZIP code — fallback to 98001
        const zipCode = p.pincode
          ? p.pincode.replace(/\D/g, "").padStart(5, "0").slice(0, 5)
          : "98001";

        // Derive bedrooms from property title or default to 3
        const bedrooms = _extractBedrooms(p.title) || 3;

        // Estimated property value: annual rent × 15 (typical US gross yield ~6.7%)
        const estimatedValue = p.rentAmount ? p.rentAmount * 12 * 15 : 400_000;

        return {
          property_id:        String(p.id),
          zip_code:           zipCode,
          city:               p.city || "Seattle",
          bedrooms:           bedrooms,
          bathrooms:          2.0,
          sqft:               1500,
          lot_size:           5000,
          year_built:         2000,
          condition:          3,
          grade:              7,
          annual_maintenance: Math.round(estimatedValue * 0.01), // US 1% rule
          sale_price:         estimatedValue,
        };
      });
    }

    // For portfolio analysis, run M1–M6 for each property in parallel
    const propertyAnalyses = await Promise.all(
      properties.map(async (p) => {
        try {
          const analysis = await advisoryService.analyseProperty({
            bedrooms:        p.bedrooms      || 3,
            bathrooms:       p.bathrooms     || 2.0,
            sqft:            p.sqft          || 1500,
            lot_size:        p.lot_size      || 5000,
            year_built:      p.year_built    || 2000,
            condition:       p.condition     || 3,
            grade:           p.grade         || 7,
            zip_code:        p.zip_code      || "98001",
            listed_price:    p.sale_price    || null,
          });

          // Fallback values calibrated for US market
          const fallbackValue = p.sale_price || 400_000;
          const fallbackRent  = Math.round((p.sale_price || 400_000) * 0.005); // ~6% yield

          return {
            property_id:             p.property_id,
            zip_code:                p.zip_code || "98001",
            city:                    p.city || "Seattle",
            m1_estimated_value:      analysis.m1?.estimated_value || fallbackValue,
            m2_monthly_rent:         analysis.m2?.monthly_rent    || fallbackRent,
            m3_appreciation_pct_12m: analysis.m3?.appreciation_12m_pct || 5.0,
            m6_risk_score:           analysis.m6?.risk_score      || 30.0,
            m6_risk_tier:            analysis.m6?.risk_tier        || "Low",
            annual_maintenance:      p.annual_maintenance          || Math.round(fallbackValue * 0.01),
            sale_price:              p.sale_price                  || fallbackValue,
          };
        } catch (e) {
          // Fallback if individual property analysis fails
          const fallbackValue = p.sale_price || 400_000;
          return {
            property_id:             p.property_id,
            zip_code:                p.zip_code || "98001",
            city:                    p.city || "Seattle",
            m1_estimated_value:      fallbackValue,
            m2_monthly_rent:         Math.round(fallbackValue * 0.005),
            m3_appreciation_pct_12m: 5.0,
            m6_risk_score:           30.0,
            m6_risk_tier:            "Low",
            annual_maintenance:      p.annual_maintenance || Math.round(fallbackValue * 0.01),
            sale_price:              fallbackValue,
          };
        }
      })
    );

    const portfolioAnalysis = await advisoryService.analysePortfolio({
      properties: propertyAnalyses,
      enable_llm,
    });

    res.status(200).json({
      success: true,
      portfolioAnalysis,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Extract Bedrooms count from property title string.
 * Examples: "3 Bed House" → 3, "2 BHK Apartment" → 2
 */
function _extractBedrooms(title) {
  if (!title) return null;
  const match = title.match(/(\d)\s*(?:bed|bedroom|bhk)/i);
  return match ? parseInt(match[1]) : null;
}

module.exports = {
  analyseProperty,
  analysePortfolio,
};

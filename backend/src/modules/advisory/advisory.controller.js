const advisoryService = require("./advisory.service");
const prisma = require("../../config/prisma");

const analyseProperty = async (req, res) => {
  try {
    const ageVal = req.body.age !== undefined && req.body.age !== null ? parseInt(req.body.age) : 5;
    const mappedData = {
      property_type: req.body.property_type || "Residential Apartment",
      zip_code: String(req.body.zip_code || req.body.city || "Thane"), // zip_code maps to CITY in ML service
      bedrooms: parseInt(req.body.bedrooms || req.body.bhk_config) || 2,
      furnishing: req.body.furnishing !== undefined && req.body.furnishing !== null ? parseFloat(req.body.furnishing) : 1.0,
      age: ageVal,
      year_built: 2026 - ageVal,
      total_floors: req.body.total_floors !== undefined && req.body.total_floors !== null ? parseInt(req.body.total_floors) : 7,
      floors: req.body.floors !== undefined && req.body.floors !== null ? parseInt(req.body.floors) : 3,
      balconies: req.body.balconies !== undefined && req.body.balconies !== null ? parseInt(req.body.balconies) : 1,
      sqft: parseInt(req.body.sqft) || 1000,
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

      // Convert DB properties to Indian/Mumbai portfolio inputs
      properties = dbProperties.map((p) => {
        const zipCode = p.city || "Thane";
        const bedrooms = _extractBedrooms(p.title) || 2;
        const salePrice = p.listedPrice && p.listedPrice > 0 ? p.listedPrice : 10000000;

        return {
          property_id: String(p.id),
          zip_code: zipCode,
          city: p.city || "Thane",
          bedrooms: bedrooms,
          sqft: 1000,
          property_type: "Residential Apartment",
          furnishing: 1,
          age: 5,
          total_floors: 7,
          floors: 3,
          balconies: 1,
          annual_maintenance: Math.round(salePrice * 0.01), // standard annual maintenance: 1%
          sale_price: salePrice,
        };
      });
    }

    // For portfolio analysis, run M1–M6 for each property in parallel
    const propertyAnalyses = await Promise.all(
      properties.map(async (p) => {
        try {
          const analysis = await advisoryService.analyseProperty({
            property_type: p.property_type || "Residential Apartment",
            zip_code: p.zip_code || "Thane",
            bedrooms: p.bedrooms || 2,
            furnishing: p.furnishing || 1,
            age: p.age || 5,
            year_built: 2026 - (p.age || 5),
            total_floors: p.total_floors || 7,
            floors: p.floors || 3,
            balconies: p.balconies || 1,
            sqft: p.sqft || 1000,
            listed_price: p.sale_price || null,
          });

          // Fallback values calibrated for Indian market
          const fallbackValue = p.sale_price || 10000000;
          const fallbackRent = Math.round((p.sale_price || 10000000) * 0.0025); // ~3% yield

          return {
            property_id: p.property_id,
            zip_code: p.zip_code || "Thane",
            city: p.city || "Thane",
            m1_estimated_value: analysis.m1?.estimated_value || fallbackValue,
            m2_monthly_rent: analysis.m2?.monthly_rent || fallbackRent,
            m3_appreciation_pct_12m: analysis.m3?.appreciation_12m_pct || 5.0,
            m6_risk_score: analysis.m6?.risk_score || 30.0,
            m6_risk_tier: analysis.m6?.risk_tier || "Low",
            annual_maintenance: p.annual_maintenance || Math.round(fallbackValue * 0.01),
            sale_price: p.sale_price || fallbackValue,
          };
        } catch (e) {
          // Fallback if individual property analysis fails
          const fallbackValue = p.sale_price || 10000000;
          return {
            property_id: p.property_id,
            zip_code: p.zip_code || "Thane",
            city: p.city || "Thane",
            m1_estimated_value: fallbackValue,
            m2_monthly_rent: Math.round(fallbackValue * 0.0025),
            m3_appreciation_pct_12m: 5.0,
            m6_risk_score: 30.0,
            m6_risk_tier: "Low",
            annual_maintenance: p.annual_maintenance || Math.round(fallbackValue * 0.01),
            sale_price: fallbackValue,
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

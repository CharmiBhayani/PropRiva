const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

const analyseProperty = async (propertyData) => {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/property/analyse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(propertyData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `ML Service error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to contact ML Advisory Service: ${error.message}`);
  }
};

const analysePortfolio = async (portfolioData) => {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/portfolio/analyse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(portfolioData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `ML Service error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to contact ML Portfolio Service: ${error.message}`);
  }
};

module.exports = {
  analyseProperty,
  analysePortfolio,
};

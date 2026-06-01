const propertyService = require(
  "./properties.service"
);

const createProperty = async (
  req,
  res
) => {

  try {

    const property =
      await propertyService.createProperty(
        req.body,
        req.user.id
      );

    res.status(201).json({
      success: true,
      property,
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: error.message,
    });

  }

};

const getMyProperties = async (
  req,
  res
) => {

  try {

    const properties =
      await propertyService.getMyProperties(
        req.user.id
      );

    res.status(200).json({
      success: true,
      properties,
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: error.message,
    });

  }

};

const getPropertyById = async (
  req,
  res
) => {

  try {

    const property =
      await propertyService.getPropertyById(
        Number(req.params.id)
      );

    res.status(200).json({
      success: true,
      property,
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: error.message,
    });

  }

};

module.exports = {
  createProperty,
  getMyProperties,
  getPropertyById,
};
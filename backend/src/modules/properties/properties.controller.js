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

module.exports = {
  createProperty,
};
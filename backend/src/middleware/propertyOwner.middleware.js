const prisma = require("../config/prisma");

const propertyOwnerMiddleware = async (
  req,
  res,
  next
) => {

  try {

    const propertyId = Number(req.params.id);

    const property =
      await prisma.property.findUnique({
        where: {
          id: propertyId,
        },
      });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    if (property.ownerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    req.property = property;

    next();

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message,
    });

  }

};

module.exports = propertyOwnerMiddleware;
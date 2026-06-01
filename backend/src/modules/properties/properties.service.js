const prisma = require(
  "../../config/prisma"
);

const createProperty = async (
  data,
  ownerId
) => {

  const property =
    await prisma.property.create({
      data: {
        title: data.title,
        description: data.description,

        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,

        rentAmount: data.rentAmount,

        ownerId,
      },
    });

  return property;
};

const getMyProperties = async (
  ownerId
) => {

  return await prisma.property.findMany({
    where: {
      ownerId,
    },

    include: {
      leases: true,
    },
  });

};

const getPropertyById = async (
  propertyId
) => {

  const property =
    await prisma.property.findUnique({

      where: {
        id: propertyId,
      },

      include: {
        owner: true,

        leases: {
          include: {
            tenant: true,
          },
        },
      },
    });

  if (!property) {
    throw new Error("Property not found");
  }

  return property;
};

module.exports = {
  createProperty,
  getMyProperties,
  getPropertyById,
};
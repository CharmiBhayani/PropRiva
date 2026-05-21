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

module.exports = {
  createProperty,
};
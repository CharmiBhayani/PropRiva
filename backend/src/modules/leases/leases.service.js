const prisma = require(
  "../../config/prisma"
);
const sendEmail = require(
  "../../utils/sendEmail"
);

const inviteTenant = async (
  data,
  landlordId
) => {

  // find property
  const property =
  await prisma.property.findUnique({
    where: {
      id: data.propertyId,
    },

    include: {
      owner: true,
    },
  });

  if (!property) {
    throw new Error("Property not found");
  }

  // ownership verification
  if (property.ownerId !== landlordId) {
    throw new Error("Unauthorized");
  }

  // find tenant by email
  const tenant =
    await prisma.user.findUnique({
      where: {
        email: data.tenantEmail,
      },
    });

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  // prevent self-linking
  if (tenant.id === landlordId) {
    throw new Error(
      "Cannot assign yourself as tenant"
    );
  }

  // create lease invitation
  const lease =
    await prisma.lease.create({
      data: {
        propertyId: property.id,
        tenantId: tenant.id,
        status: "PENDING",
      },
    });

    await sendEmail(
  tenant.email,

  "Property Tenant Invitation",

  `
Hello ${tenant.name},

${property.owner.name} has invited you
to become tenant for:

${property.title}

Property Address:
${property.address}

Please login to PropRiva
to approve or reject this request.
`
);
    return lease;
    };

module.exports = {
  inviteTenant,
};
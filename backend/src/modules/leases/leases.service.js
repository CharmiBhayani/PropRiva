const prisma = require(
  "../../config/prisma"
);
const sendEmail = require(
  "../../utils/sendEmail"
);
const { createNotification } = require("../notifications/notifications.service");


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

    // In-app notification for tenant
    await createNotification(
      tenant.id,
      `You have been invited by ${property.owner.name} to rent property "${property.title}".`,
      "LEASE_INVITATION"
    );

    return lease;
    };


const approveLease = async (
  leaseId,
  tenantId
) => {

  const lease =
    await prisma.lease.findUnique({
      where: {
        id: Number(leaseId),
      },
    });

  if (!lease) {
    throw new Error("Lease not found");
  }

  // ensure correct tenant
  if (lease.tenantId !== tenantId) {
    throw new Error("Unauthorized");
  }

  // ensure pending
  if (lease.status !== "PENDING") {
    throw new Error(
      "Lease already processed"
    );
  }

  const updatedLease =
    await prisma.lease.update({
      where: {
        id: lease.id,
      },

      data: {
        status: "ACTIVE",
      },
      include: {
        property: true,
        tenant: true
      }
    });

  // Notify landlord
  await createNotification(
    updatedLease.property.ownerId,
    `Tenant ${updatedLease.tenant.name} has accepted your lease invitation for "${updatedLease.property.title}".`,
    "LEASE_ACCEPTED"
  );

  return updatedLease;
};

const rejectLease = async (
  leaseId,
  tenantId
) => {

  const lease =
    await prisma.lease.findUnique({
      where: {
        id: Number(leaseId),
      },
    });

  if (!lease) {
    throw new Error("Lease not found");
  }

  if (lease.tenantId !== tenantId) {
    throw new Error("Unauthorized");
  }

  if (lease.status !== "PENDING") {
    throw new Error(
      "Lease already processed"
    );
  }

  const updatedLease =
    await prisma.lease.update({
      where: {
        id: lease.id,
      },

      data: {
        status: "REJECTED",
      },
      include: {
        property: true,
        tenant: true
      }
    });

  // Notify landlord
  await createNotification(
    updatedLease.property.ownerId,
    `Tenant ${updatedLease.tenant.name} has declined your lease invitation for "${updatedLease.property.title}".`,
    "LEASE_DECLINED"
  );

  return updatedLease;
};

const getMyLeases = async (
  tenantId
) => {

  return await prisma.lease.findMany({

    where: {
      tenantId,
      status: "ACTIVE",
    },

    include: {
      property: true,
    },
  });

};

const getPendingInvites = async (
  tenantId
) => {

  return await prisma.lease.findMany({

    where: {
      tenantId,
      status: "PENDING",
    },

    include: {
      property: {
        include: {
          owner: true,
        },
      },
    },
  });

};

module.exports = {
  inviteTenant,
  approveLease,
  rejectLease,
  getMyLeases,
  getPendingInvites,
};
const prisma = require("../../config/prisma");
const { createNotification } = require("../notifications/notifications.service");
const sendEmail = require("../../utils/sendEmail");

const createRequest = async (data, tenantId) => {
  const { leaseId, title, description, vendorName, invoiceNo, cost } = data;

  if (!leaseId || !title || !vendorName || !cost) {
    throw new Error("Missing required fields");
  }

  const numericCost = Number(cost);
  if (isNaN(numericCost) || numericCost <= 0) {
    throw new Error("Cost must be a positive number");
  }

  const lease = await prisma.lease.findFirst({
    where: {
      id: Number(leaseId),
      tenantId: tenantId,
      status: "ACTIVE"
    },
    include: {
      property: {
        include: { owner: true }
      },
      tenant: true
    }
  });

  if (!lease) {
    throw new Error("Active lease not found");
  }

  // Generate deterministic billCode to prevent duplicate bill fraud
  let generatedBillCode = "";
  if (invoiceNo && invoiceNo.trim() !== "") {
    generatedBillCode = `INV_${invoiceNo.trim().toUpperCase()}`;
  } else {
    const cleanVendor = vendorName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    generatedBillCode = `BILL_${cleanVendor}_${Math.round(numericCost)}_${dateStr}`;
  }

  // Enforce unique bill check
  const existingRequest = await prisma.maintenanceRequest.findUnique({
    where: { billCode: generatedBillCode }
  });

  if (existingRequest) {
    throw new Error("Duplicate bill detected! This bill has already been submitted.");
  }

  // Create request
  const request = await prisma.maintenanceRequest.create({
    data: {
      leaseId: lease.id,
      title,
      description: description || "",
      vendorName,
      invoiceNo: invoiceNo || null,
      billCode: generatedBillCode,
      cost: numericCost,
      status: "PENDING"
    }
  });

  // Notify landlord
  const landlordMessage = `New maintenance request "${title}" of ₹${numericCost} submitted for property "${lease.property.title}" by tenant ${lease.tenant.name}.`;
  await createNotification(lease.property.ownerId, landlordMessage, "MAINTENANCE_SUBMITTED");

  // Send email to landlord
  await sendEmail(
    lease.property.owner.email,
    "New Maintenance Request - PropRiva",
    `Hello ${lease.property.owner.name},\n\nYour tenant ${lease.tenant.name} has submitted a new maintenance reimbursement request.\n\nProperty: ${lease.property.title}\nRepair: ${title}\nVendor: ${vendorName}\nAmount: ₹${numericCost}\n\nPlease log in to the landlord portal to approve or reject this request.\n\nRegards,\nPropRiva Team`
  );

  return request;
};

const decideRequest = async (requestId, decision, landlordId, reason) => {
  const validDecisions = ["PAY_DIRECTLY", "ADJUST_RENT", "REJECT"];
  if (!validDecisions.includes(decision)) {
    throw new Error("Invalid decision type");
  }

  const request = await prisma.maintenanceRequest.findUnique({
    where: { id: Number(requestId) },
    include: {
      lease: {
        include: {
          property: true,
          tenant: true
        }
      }
    }
  });

  if (!request) {
    throw new Error("Maintenance request not found");
  }

  // Enforce landlord ownership
  if (request.lease.property.ownerId !== landlordId) {
    throw new Error("Unauthorized");
  }

  // Enforce request is pending
  if (request.status !== "PENDING") {
    throw new Error("Request has already been processed");
  }

  let finalStatus = "PENDING";
  let tenantNotification = "";
  let emailSubject = "Maintenance Request Update - PropRiva";
  let emailBody = "";

  const propertyTitle = request.lease.property.title;
  const tenantName = request.lease.tenant.name;

  if (decision === "PAY_DIRECTLY") {
    finalStatus = "APPROVED_PAID_DIRECTLY";
    tenantNotification = `Your maintenance request "${request.title}" of ₹${request.cost} was approved! The landlord will pay you directly.`;
    emailBody = `Hello ${tenantName},\n\nYour maintenance reimbursement request of ₹${request.cost} for "${propertyTitle}" has been approved.\n\nThe landlord will pay you directly.\n\nRegards,\nPropRiva Team`;
  } else if (decision === "ADJUST_RENT") {
    finalStatus = "APPROVED_RENT_ADJUSTED";

    // Add to lease.rentCredits
    await prisma.lease.update({
      where: { id: request.leaseId },
      data: {
        rentCredits: {
          increment: request.cost
        }
      }
    });

    tenantNotification = `Your maintenance request "${request.title}" of ₹${request.cost} was approved! This amount will be adjusted in your next rent payment.`;
    emailBody = `Hello ${tenantName},\n\nYour maintenance reimbursement request of ₹${request.cost} for "${propertyTitle}" has been approved.\n\nThis amount of ₹${request.cost} will be deducted from your next rent payment.\n\nRegards,\nPropRiva Team`;
  } else if (decision === "REJECT") {
    finalStatus = "REJECTED";
    tenantNotification = `Your maintenance request "${request.title}" of ₹${request.cost} was rejected by the landlord.${reason ? ` Reason: ${reason}` : ""}`;
    emailBody = `Hello ${tenantName},\n\nYour maintenance reimbursement request of ₹${request.cost} for "${propertyTitle}" was rejected by the landlord.${reason ? ` Reason: ${reason}` : ""}\n\nRegards,\nPropRiva Team`;
  }

  const updatedRequest = await prisma.maintenanceRequest.update({
    where: { id: request.id },
    data: {
      status: finalStatus,
      rejectionReason: decision === "REJECT" && reason ? reason : null
    }
  });

  // Notify tenant
  await createNotification(request.lease.tenantId, tenantNotification, "MAINTENANCE_DECISION");

  // Send email to tenant
  await sendEmail(request.lease.tenant.email, emailSubject, emailBody);

  return updatedRequest;
};

const getRequestsForUser = async (userId, leaseId) => {
  // Find properties owned by landlord
  const ownedProperties = await prisma.property.findMany({
    where: { ownerId: userId },
    select: { id: true }
  });

  const propertyIds = ownedProperties.map(p => p.id);

  const whereCondition = {
    OR: [
      {
        lease: {
          tenantId: userId
        }
      },
      {
        lease: {
          propertyId: { in: propertyIds }
        }
      }
    ]
  };

  if (leaseId) {
    whereCondition.leaseId = Number(leaseId);
  }

  return await prisma.maintenanceRequest.findMany({
    where: whereCondition,
    include: {
      lease: {
        include: {
          property: true,
          tenant: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });
};

module.exports = {
  createRequest,
  decideRequest,
  getRequestsForUser,
};

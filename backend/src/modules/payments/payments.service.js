const prisma = require("../../config/prisma");
const crypto = require("crypto");
const { createNotification } = require("../notifications/notifications.service");
const sendEmail = require("../../utils/sendEmail");

const Razorpay = require("razorpay");
const keyId = process.env.RAZORPAY_KEY_ID || 'mock_key_id';
const keySecret = process.env.RAZORPAY_KEY_SECRET || 'mock_key_secret';

let razorpay;
let isMockMode = false;

if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  console.log(`[Payments] Razorpay initialised in ${keyId.startsWith("rzp_test_") ? "TEST" : "LIVE"} mode.`);
} else {
  console.warn("[Payments] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing. Running in MOCK mode.");
  isMockMode = true;
  razorpay = {
    orders: {
      create: async (options) => ({
        id: `order_mock_${Date.now()}`,
        amount: options.amount,
        currency: options.currency,
        receipt: options.receipt
      })
    }
  };
}

const createOrder = async (leaseId, tenantId) => {
  const lease = await prisma.lease.findUnique({
    where: { id: Number(leaseId) },
    include: {
      property: { include: { owner: true } },
      tenant: true,
    },
  });

  if (!lease) throw new Error("Lease not found");
  if (lease.tenantId !== tenantId) throw new Error("Unauthorized");
  if (lease.status !== "ACTIVE") throw new Error("Lease is not active");

  // Calculate effective rent: base - maintenance credits
  const baseRent = lease.property.rentAmount;
  const credits = lease.rentCredits;
  let netRent = Math.max(0, baseRent - credits);

  // Edge case: fully covered by maintenance credits → instant settle, no Razorpay
  if (netRent === 0) {
    const payment = await prisma.payment.create({
      data: { leaseId: lease.id, amount: 0, status: "PAID", paidAt: new Date() },
    });

    await prisma.lease.update({ where: { id: lease.id }, data: { rentCredits: 0 } });

    await createNotification(
      lease.property.ownerId,
      `Rent of ₹${baseRent} was fully adjusted via maintenance credits for "${lease.property.title}".`,
      "PAYMENT_RECEIVED"
    );
    await createNotification(
      lease.tenantId,
      `Rent of ₹${baseRent} was fully adjusted via maintenance credits for "${lease.property.title}". No payment needed!`,
      "PAYMENT_SUCCESS"
    );

    return { success: true, instantSettled: true, payment };
  }

  // Create real Razorpay order
  const order = await razorpay.orders.create({
    amount: Math.round(netRent * 100), // paise
    currency: "INR",
    receipt: `lr_${lease.id}_${Date.now()}`,
  });

  await prisma.payment.create({
    data: {
      leaseId: lease.id,
      amount: netRent,
      status: "PENDING",
      razorpayOrderId: order.id,
    },
  });

  return {
    success: true,
    keyId: keyId,
    orderId: order.id,
    amount: order.amount,   // in paise, ready for Razorpay checkout
    currency: order.currency,
    effectiveAmount: netRent,        // human-readable ₹ value for the UI
  };
};



const verifyPayment = async (data, tenantId) => {
  const razorpayOrderId = data.razorpayOrderId || data.razorpay_order_id;
  const razorpayPaymentId = data.razorpayPaymentId || data.razorpay_payment_id;
  const razorpaySignature = data.razorpaySignature || data.razorpay_signature;

  if (!razorpayOrderId) {
    throw new Error("razorpayOrderId is required");
  }

  const payment = await prisma.payment.findUnique({
    where: { razorpayOrderId },
    include: {
      lease: {
        include: {
          property: {
            include: { owner: true }
          },
          tenant: true
        }
      }
    }
  });

  if (!payment) {
    throw new Error("Payment record not found");
  }

  if (payment.lease.tenantId !== tenantId) {
    throw new Error("Unauthorized");
  }

  if (payment.status !== "PENDING") {
    throw new Error("Payment already processed");
  }

  // Always verify the Razorpay HMAC signature — no exceptions (unless in MOCK mode)
  if (!isMockMode) {
    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(razorpayOrderId + "|" + razorpayPaymentId)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
      throw new Error("Invalid payment signature — payment rejected");
    }
  } else {
    console.warn(`[Payments] Bypassing signature verification for order ${razorpayOrderId} in MOCK mode`);
  }

  // Mark payment as PAID
  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      razorpayPaymentId,
      razorpaySignature,
      paidAt: new Date(),
    },
  });

  // Reset rent credits to 0
  await prisma.lease.update({
    where: { id: payment.leaseId },
    data: { rentCredits: 0 }
  });

  // Notify landlord and tenant
  const landlordMessage = `Rent payment of ₹${payment.amount} received for property "${payment.lease.property.title}" from tenant ${payment.lease.tenant.name}.`;
  const tenantMessage = `Your rent payment of ₹${payment.amount} for property "${payment.lease.property.title}" was successful.`;

  await createNotification(payment.lease.property.ownerId, landlordMessage, "PAYMENT_RECEIVED");
  await createNotification(payment.lease.tenantId, tenantMessage, "PAYMENT_SUCCESS");

  // Send receipt email to landlord and tenant
  await sendEmail(
    payment.lease.tenant.email,
    "Rent Payment Successful - PropRiva",
    `Hello ${payment.lease.tenant.name},\n\nYour payment of ₹${payment.amount} for rent at "${payment.lease.property.title}" was successful.\nTransaction ID: ${updatedPayment.razorpayPaymentId || 'N/A'}\nDate: ${new Date(updatedPayment.paidAt).toLocaleDateString()}\n\nThank you,\nPropRiva Team`
  );

  await sendEmail(
    payment.lease.property.owner.email,
    "Rent Payment Received - PropRiva",
    `Hello ${payment.lease.property.owner.name},\n\nYou have received a rent payment of ₹${payment.amount} for property "${payment.lease.property.title}" from tenant ${payment.lease.tenant.name}.\nTransaction ID: ${updatedPayment.razorpayPaymentId || 'N/A'}\nDate: ${new Date(updatedPayment.paidAt).toLocaleDateString()}\n\nRegards,\nPropRiva Team`
  );

  return updatedPayment;
};

const getPaymentsForUser = async (userId, leaseId) => {
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

  return await prisma.payment.findMany({
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
  createOrder,
  verifyPayment,
  getPaymentsForUser,
};

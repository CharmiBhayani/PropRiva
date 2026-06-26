const paymentService = require("./payments.service");

const createOrder = async (req, res) => {
  try {
    const { leaseId } = req.body;
    if (!leaseId) {
      return res.status(400).json({
        success: false,
        message: "leaseId is required",
      });
    }

    const orderData = await paymentService.createOrder(leaseId, req.user.id);
    res.status(201).json({
      success: true,
      ...orderData,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const payment = await paymentService.verifyPayment(req.body, req.user.id);
    res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const getMyPayments = async (req, res) => {
  try {
    const payments = await paymentService.getPaymentsForUser(req.user.id, req.query.leaseId);
    res.status(200).json({
      success: true,
      payments,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getMyPayments,
};

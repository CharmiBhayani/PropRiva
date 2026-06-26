const express = require("express");
const paymentController = require("./payments.controller");
const authMiddleware = require("../../middleware/auth.middleware");

const router = express.Router();

router.post("/order", authMiddleware, paymentController.createOrder);
router.post("/verify", authMiddleware, paymentController.verifyPayment);
router.get("/my-payments", authMiddleware, paymentController.getMyPayments);

module.exports = router;

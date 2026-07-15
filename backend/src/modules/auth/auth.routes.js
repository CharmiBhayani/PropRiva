const express = require("express");

const authController = require("./auth.controller");

const router = express.Router();

router.post("/register", authController.register);
router.post("/verify-otp", authController.verifyOtp);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.post("/resend-otp", authController.resendOtp);


module.exports = router;
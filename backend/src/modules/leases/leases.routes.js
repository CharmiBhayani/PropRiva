const express = require("express");

const leaseController = require(
  "./leases.controller"
);

const authMiddleware = require(
  "../../middleware/auth.middleware"
);

const router = express.Router();

router.post(
  "/invite",
  authMiddleware,
  leaseController.inviteTenant
);

module.exports = router;
const express = require("express");
const maintenanceController = require("./maintenance.controller");
const authMiddleware = require("../../middleware/auth.middleware");

const router = express.Router();

router.post("/", authMiddleware, maintenanceController.createRequest);
router.put("/:id/decision", authMiddleware, maintenanceController.decideRequest);
router.get("/my-requests", authMiddleware, maintenanceController.getMyRequests);

module.exports = router;

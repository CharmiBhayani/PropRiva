const express = require("express");
const notificationController = require("./notifications.controller");
const authMiddleware = require("../../middleware/auth.middleware");

const router = express.Router();

router.get("/", authMiddleware, notificationController.getMyNotifications);
router.put("/read-all", authMiddleware, notificationController.markAllRead);
router.put("/:id/read", authMiddleware, notificationController.markRead);

module.exports = router;

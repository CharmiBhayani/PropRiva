const express = require("express");

const authRoutes = require("../modules/auth/auth.routes");
// const userRoutes = require("../modules/users/users.routes");
// const propertyRoutes = require("../modules/properties/properties.routes");
// const leaseRoutes = require("../modules/leases/leases.routes");
// const maintenanceRoutes = require("../modules/maintenance/maintenance.routes");
// const notificationRoutes = require("../modules/notifications/notifications.routes");
// const paymentRoutes = require("../modules/payments/payments.routes");



const router = express.Router();

router.use("/auth", authRoutes);
// router.use("/users", userRoutes);
// router.use("/properties", propertyRoutes);
// router.use("/lease", leaseRoutes);
// router.use("/maintenance", maintenanceRoutes);
// router.use("/notification", notificationRoutes);
// router.use("/payment", paymentRoutes);




module.exports = router;
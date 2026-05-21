const express = require("express");

const propertyController = require(
  "./properties.controller"
);

const authMiddleware = require(
  "../../middleware/auth.middleware"
);

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  propertyController.createProperty
);

module.exports = router;
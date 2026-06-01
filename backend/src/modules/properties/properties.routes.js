const express = require("express");

const propertyController = require(
  "./properties.controller"
);

const authMiddleware = require(
  "../../middleware/auth.middleware"
);

const propertyOwnerMiddleware = require("../../middleware/propertyOwner.middleware");

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  propertyController.createProperty
);

router.get(
  "/",
  authMiddleware,
  propertyController.getMyProperties
);

router.get(
  "/:id",
  authMiddleware,
  propertyController.getPropertyById
);

module.exports = router;
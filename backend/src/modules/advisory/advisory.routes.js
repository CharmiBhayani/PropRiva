const express = require("express");
const advisoryController = require("./advisory.controller");
const authMiddleware = require("../../middleware/auth.middleware");

const router = express.Router();

router.post("/property", authMiddleware, advisoryController.analyseProperty);
router.post("/portfolio", authMiddleware, advisoryController.analysePortfolio);

module.exports = router;

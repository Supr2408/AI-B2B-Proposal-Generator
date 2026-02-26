const express = require("express");
const router = express.Router();
const { generate, health } = require("../controllers/proposalController");

/**
 * POST /api/v1/proposals/generate
 * Generate a new B2B sustainability proposal.
 */
router.post("/generate", generate);

/**
 * GET /api/v1/proposals/health
 * Health check.
 */
router.get("/health", health);

module.exports = router;

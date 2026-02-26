const { ProposalRequestSchema } = require("../validators/proposalValidator");
const { generateProposal } = require("../services/proposalService");

/**
 * ProposalController
 *
 * Responsible ONLY for:
 *   - Request validation (Zod)
 *   - Delegating to service (use case)
 *   - Formatting the { ok, data } response envelope
 *
 * No AI logic. No DB access. No budget math.
 */

async function generate(req, res) {
  try {
    // ── Validate request ──────────────────────────────────────────
    const parseResult = ProposalRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return res.status(400).json({
        ok: false,
        data: null,
        error: `Validation failed: ${issues}`,
      });
    }

    // ── Delegate to service ───────────────────────────────────────
    const result = await generateProposal(parseResult.data);

    // ── Return envelope ───────────────────────────────────────────
    return res.status(200).json({
      ok: true,
      data: result,
    });
  } catch (err) {
    console.error("[Controller] Error:", err.message);
    return res.status(500).json({
      ok: false,
      data: null,
      error: err.message,
    });
  }
}

async function health(_req, res) {
  return res.status(200).json({
    ok: true,
    data: {
      status: "healthy",
      module: "B2BProposal v1.0.0",
    },
  });
}

module.exports = { generate, health };

const { ProposalRequestSchema } = require("../validators/proposalValidator");
const { generateProposal, ValidationError } = require("../services/proposalService");

/**
 * ProposalController
 *
 * Responsible ONLY for:
 *   - Request validation (Zod)
 *   - Delegating to service (use case)
 *   - Formatting the { ok, data } response envelope
 *   - Mapping error types to HTTP status codes
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

    // 4xx — validation or business logic failures (bad AI output,
    //        budget exceeded, schema violation, JSON parse error)
    if (err instanceof ValidationError) {
      return res.status(422).json({
        ok: false,
        data: null,
        error: err.message,
      });
    }

    // 5xx — provider/system errors (API failures, DB errors, etc.)
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

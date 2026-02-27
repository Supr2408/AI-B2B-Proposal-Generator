const { ProposalRequestSchema } = require("../validators/proposalValidator");
const { generateProposal, ValidationError } = require("../services/proposalService");
const { ProviderRateLimitError } = require("../providers/aiProvider");

/**
 * ProposalController
 *
 * Responsible ONLY for:
 * - Request validation (Zod)
 * - Delegating to service (use case)
 * - Formatting the { ok, data } response envelope
 * - Mapping error types to HTTP status codes
 */
async function generate(req, res) {
  try {
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

    const result = await generateProposal(parseResult.data);

    return res.status(200).json({
      ok: true,
      data: result,
      error: null,
    });
  } catch (err) {
    console.error("[Controller] Error:", err.message);

    // 429 - provider rate limit
    if (err instanceof ProviderRateLimitError) {
      const retryAfterSeconds = Math.ceil((err.retryAfterMs || 0) / 1000);
      if (retryAfterSeconds > 0) {
        res.set("Retry-After", String(retryAfterSeconds));
      }
      return res.status(429).json({
        ok: false,
        data: {
          provider: err.provider,
          retry_after_ms: err.retryAfterMs || null,
        },
        error: err.message,
      });
    }

    // 4xx - validation/business rule failures
    if (err instanceof ValidationError) {
      return res.status(422).json({
        ok: false,
        data: null,
        error: err.message,
      });
    }

    // 5xx - provider/system errors
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
    error: null,
  });
}

module.exports = { generate, health };

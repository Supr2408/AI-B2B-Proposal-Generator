const Product = require("../models/Product");
const Proposal = require("../models/Proposal");
const AILog = require("../models/AILog");
const config = require("../config");
const { callAI, buildSystemPrompt, buildUserPrompt } = require("../providers/aiProvider");
const { AIResponseSchema } = require("../validators/proposalValidator");
const { computeImpact } = require("./impactService");

/**
 * ValidationError — thrown for AI output validation and business rule violations.
 * The controller maps this to HTTP 422 (vs 500 for provider/system errors).
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * ProposalService — Use Case Orchestrator
 *
 * Pipeline:
 *   1. Fetch ALL products from DB
 *   2. Build system prompt (inject catalog)
 *   3. Build user prompt
 *   4. Call AI provider (with retry on 429/5xx/network)
 *   5. LOG raw AI interaction BEFORE any parsing (must succeed)
 *   6. JSON.parse — single call, no regex, no fallback
 *   7. Validate against strict Zod schema
 *   8. Business validation (products exist, prices match, math correct)
 *   9. Budget enforcement (allocated ≤ limit)
 *  10. Compute impact server-side
 *  11. Persist proposal
 *  12. Return structured response
 */

async function generateProposal({ client_name, budget_limit, preferences }) {
  const category_focus = preferences?.category_focus || [];
  const sustainability_priority = preferences?.sustainability_priority || "";
  // ── 1. Fetch all products from DB ──────────────────────────────
  const allProducts = await Product.find({}).lean();
  if (allProducts.length === 0) {
    throw new Error("No products in database. Run the seed script first.");
  }
  console.log(`[Service] Loaded ${allProducts.length} products from DB`);

  // Build product lookup map: _id string → product doc
  const productMap = new Map();
  for (const p of allProducts) {
    productMap.set(p._id.toString(), p);
  }

  // ── 2. Build system prompt (with budget-aware quantity limits) ─
  const systemPrompt = buildSystemPrompt(allProducts, budget_limit);

  // ── 3. Build user prompt ───────────────────────────────────────
  const userPrompt = buildUserPrompt(
    budget_limit,
    category_focus,
    sustainability_priority,
    client_name
  );

  // ── 4–9. AI call + validation loop ─────────────────────────────
  // If the AI produces invalid output (bad JSON, schema violation,
  // math error, budget overshoot), retry up to MAX_VALIDATION_RETRIES.
  // The AI output is NEVER mutated — only accepted or rejected.
  // On retry, the previous validation error is appended to the user
  // prompt so the AI can learn from its mistake.
  const MAX_VALIDATION_RETRIES = 5;
  let lastValidationError = null;
  let currentUserPrompt = userPrompt;

  for (let attempt = 1; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
    // ── 4. Call AI provider ──────────────────────────────────────
    console.log(`[Service] AI attempt ${attempt}/${MAX_VALIDATION_RETRIES}...`);
    const { rawContent, model } = await callAI(systemPrompt, currentUserPrompt);
    console.log(`[Service] AI response received (${rawContent.length} chars)`);

    // ── 5. LOG BEFORE parse, BEFORE validation ───────────────────
    try {
      await AILog.create({
        system_prompt: systemPrompt,
        user_prompt: currentUserPrompt,
        raw_response: rawContent,
        module: config.module.name,
        module_version: config.module.version,
      });
      console.log("[Service] AI interaction logged");
    } catch (logErr) {
      throw new Error(`Logging failure — proposal aborted: ${logErr.message}`);
    }

    // ── 6–9. Parse, validate, and verify ─────────────────────────
    try {
      const aiData = parseAndValidate(rawContent, productMap, budget_limit);

      // ── All checks passed — proceed to persist and return ──────
      const finalAllocated = Math.round(
        aiData.products.reduce((sum, p) => sum + p.total_cost, 0) * 100
      ) / 100;
      const remainingBudget = Math.round((budget_limit - finalAllocated) * 100) / 100;

      // ── 10. Compute impact server-side (NOT from AI) ───────────
      const computedImpact = await computeImpact(aiData.products);
      console.log("[Service] Impact computed server-side:", computedImpact);

      // ── 11. Persist proposal ───────────────────────────────────
      const proposal = await Proposal.create({
        client_name: client_name || "",
        proposal_summary: aiData.proposal_summary,
        total_budget_limit: budget_limit,
        allocated_budget: finalAllocated,
        remaining_budget: remainingBudget,
        products: aiData.products,
        impact_summary: aiData.impact_summary,
        confidence_score: aiData.confidence_score,
        computed_impact: computedImpact,
        ai_metadata: {
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          raw_response: rawContent,
          model,
        },
      });
      console.log("[Service] Proposal persisted:", proposal._id);

      // ── 12. Return structured response ─────────────────────────
      return {
        proposal_id: proposal._id.toString(),
        proposal_summary: aiData.proposal_summary,
        total_budget_limit: budget_limit,
        allocated_budget: finalAllocated,
        remaining_budget: remainingBudget,
        products: aiData.products,
        impact_summary: aiData.impact_summary,
        confidence_score: aiData.confidence_score,
        computed_impact: computedImpact,
      };
    } catch (err) {
      if (err instanceof ValidationError) {
        lastValidationError = err;
        console.warn(`[Service] Validation failed (attempt ${attempt}): ${err.message}`);
        // Inject error feedback into the next retry prompt so the AI
        // knows exactly what went wrong and can correct itself.
        if (attempt < MAX_VALIDATION_RETRIES) {
          currentUserPrompt = userPrompt +
            `\n\n⚠️ YOUR PREVIOUS RESPONSE WAS REJECTED. ERROR: "${err.message}"` +
            `\nFix this issue. The budget limit is ₹${budget_limit} — your allocated_budget MUST be ≤ ₹${budget_limit}. Use fewer products or smaller quantities.`;
          continue;
        }
      } else {
        throw err; // Non-validation errors (system/provider) bubble up immediately
      }
    }
  }

  // All retries exhausted — throw the last validation error as 422
  throw lastValidationError;
}

// ─── Parse & Validate (Steps 6–9) ───────────────────────────────────
// Extracted to keep the retry loop clean. This function NEVER mutates
// the AI response — it either returns the validated data or throws.

function parseAndValidate(rawContent, productMap, budget_limit) {
  // ── 6. Strict JSON.parse — single call, no fallback ────────────
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch (parseErr) {
    throw new ValidationError(`AI response is not valid JSON: ${parseErr.message}`);
  }

  // ── 7. Zod schema validation (strict — no extra keys) ─────────
  const zodResult = AIResponseSchema.safeParse(parsed);
  if (!zodResult.success) {
    const issues = zodResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ValidationError(`AI response schema violation: ${issues}`);
  }
  const aiData = zodResult.data;

  // ── 8. Business validation ─────────────────────────────────────
  for (const item of aiData.products) {
    // 8a. Product must exist in DB
    const dbProduct = productMap.get(item.product_id);
    if (!dbProduct) {
      throw new ValidationError(`Product not found in DB: ${item.product_id}`);
    }

    // 8b. Name must exactly match DB
    if (item.name !== dbProduct.name) {
      throw new ValidationError(
        `Name mismatch for ${item.product_id}: AI said "${item.name}", DB has "${dbProduct.name}"`
      );
    }

    // 8c. unit_price must exactly match DB
    if (item.unit_price !== dbProduct.unit_price) {
      throw new ValidationError(
        `Price mismatch for ${item.name}: AI said ${item.unit_price}, DB has ${dbProduct.unit_price}`
      );
    }

    // 8d. total_cost must exactly equal quantity × unit_price
    const expectedCost = Math.round(item.quantity * item.unit_price * 100) / 100;
    if (Math.abs(item.total_cost - expectedCost) > 0.01) {
      throw new ValidationError(
        `Cost mismatch for ${item.name}: AI said ${item.total_cost}, expected ${expectedCost}`
      );
    }
  }

  // 8e. allocated_budget must closely match sum(total_cost)
  // Tolerance: ₹1 per product — LLMs can multiply but often miscount sums.
  // Individual total_cost values are already verified exact (step 8d),
  // so the server always uses its own computed sum for the final response.
  const computedAllocated =
    Math.round(
      aiData.products.reduce((sum, p) => sum + p.total_cost, 0) * 100
    ) / 100;
  const allocatedTolerance = Math.max(1, aiData.products.length);

  if (Math.abs(aiData.allocated_budget - computedAllocated) > allocatedTolerance) {
    throw new ValidationError(
      `Allocated budget mismatch: AI said ₹${aiData.allocated_budget}, computed ₹${computedAllocated}`
    );
  }

  // 8f. total_budget_limit from AI must equal request budget_limit
  if (aiData.total_budget_limit !== budget_limit) {
    throw new ValidationError(
      `Budget limit mismatch: AI said ₹${aiData.total_budget_limit}, request had ₹${budget_limit}`
    );
  }

  // ── 9. Budget enforcement — reject if over budget ──────────────
  if (computedAllocated > budget_limit) {
    throw new ValidationError(
      `Budget exceeded: allocated ₹${computedAllocated} exceeds limit ₹${budget_limit}`
    );
  }

  return aiData;
}

module.exports = { generateProposal, ValidationError };

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

async function generateProposal({ client_name, budget_limit, category_focus, sustainability_priority }) {
  // ── 1. Fetch all products from DB ──────────────────────────────
  const allProducts = await Product.find({}).lean();
  if (allProducts.length === 0) {
    throw new Error("No products in database. Run the seed script first.");
  }
  console.log(`[Service] Loaded ${allProducts.length} products from DB`);

  // ── 2. Build system prompt ─────────────────────────────────────
  const systemPrompt = buildSystemPrompt(allProducts);

  // ── 3. Build user prompt ───────────────────────────────────────
  const userPrompt = buildUserPrompt(
    budget_limit,
    category_focus,
    sustainability_priority,
    client_name
  );

  // ── 4. Call AI provider ────────────────────────────────────────
  console.log("[Service] Calling AI provider...");
  const { rawContent, model } = await callAI(systemPrompt, userPrompt);
  console.log(`[Service] AI response received (${rawContent.length} chars)`);

  // ── 5. LOG BEFORE parse, BEFORE validation ─────────────────────
  // Logging MUST be awaited. If logging fails → proposal fails.
  try {
    await AILog.create({
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      raw_response: rawContent,
      module: config.module.name,
      module_version: config.module.version,
    });
    console.log("[Service] AI interaction logged");
  } catch (logErr) {
    throw new Error(`Logging failure — proposal aborted: ${logErr.message}`);
  }

  // ── 6. Strict JSON.parse — strip markdown fences if AI wraps them ──
  let jsonText = rawContent;
  // Strip ```json ... ``` wrapping that LLMs sometimes add despite instructions
  const fenceMatch = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    jsonText = fenceMatch[1];
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
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
  // Build lookup map: _id string → product doc
  const productMap = new Map();
  for (const p of allProducts) {
    productMap.set(p._id.toString(), p);
  }

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

    // 8c. unit_price must exactly match DB (never auto-correct)
    if (item.unit_price !== dbProduct.unit_price) {
      throw new ValidationError(
        `Price mismatch for ${item.name}: AI said ${item.unit_price}, DB has ${dbProduct.unit_price}`
      );
    }

    // 8d. Recompute total_cost server-side (spec: "Recompute total_cost server-side")
    item.total_cost = Math.round(item.quantity * item.unit_price * 100) / 100;
  }

  // 8e. Recompute allocated_budget server-side
  const computedAllocated =
    Math.round(
      aiData.products.reduce((sum, p) => sum + p.total_cost, 0) * 100
    ) / 100;

  // ── 9. Budget enforcement ──────────────────────────────────────
  if (computedAllocated > budget_limit) {
    throw new ValidationError(
      `Budget exceeded: allocated ₹${computedAllocated} exceeds limit ₹${budget_limit}`
    );
  }

  const finalAllocated = computedAllocated;
  const remainingBudget = Math.round((budget_limit - finalAllocated) * 100) / 100;

  // ── 10. Compute impact server-side (NOT from AI) ───────────────
  const computedImpact = await computeImpact(aiData.products);
  console.log("[Service] Impact computed server-side:", computedImpact);

  // ── 11. Persist proposal ───────────────────────────────────────
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

  // ── 12. Return structured response ─────────────────────────────
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
}

module.exports = { generateProposal, ValidationError };

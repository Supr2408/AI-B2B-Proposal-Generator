const Product = require("../models/Product");
const Proposal = require("../models/Proposal");
const AILog = require("../models/AILog");
const config = require("../config");
const { callAI, buildSystemPrompt, buildUserPrompt } = require("../providers/aiProvider");
const { AIResponseSchema } = require("../validators/proposalValidator");
const { computeImpact } = require("./impactService");

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

  // ── 6. Strict JSON.parse — no regex, no markdown strip, no fallback ──
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch (parseErr) {
    throw new Error(`AI response is not valid JSON: ${parseErr.message}`);
  }

  // ── 7. Zod schema validation (strict — no extra keys) ─────────
  const zodResult = AIResponseSchema.safeParse(parsed);
  if (!zodResult.success) {
    const issues = zodResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`AI response schema violation: ${issues}`);
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
      throw new Error(`Product not found in DB: ${item.product_id}`);
    }

    // 8b. unit_price must match DB
    if (item.unit_price !== dbProduct.unit_price) {
      throw new Error(
        `Price mismatch for ${item.name}: AI said ${item.unit_price}, DB has ${dbProduct.unit_price}`
      );
    }

    // 8c. total_cost = quantity × unit_price (server verification)
    const expectedCost = Math.round(item.quantity * item.unit_price * 100) / 100;
    if (Math.abs(item.total_cost - expectedCost) > 0.01) {
      throw new Error(
        `Cost mismatch for ${item.name}: AI said ${item.total_cost}, expected ${expectedCost}`
      );
    }
  }

  // 8d. Verify allocated_budget = sum of all total_cost
  const computedAllocated =
    Math.round(
      aiData.products.reduce((sum, p) => sum + p.total_cost, 0) * 100
    ) / 100;

  if (Math.abs(aiData.allocated_budget - computedAllocated) > 0.01) {
    throw new Error(
      `Allocated budget mismatch: AI said ${aiData.allocated_budget}, computed ${computedAllocated}`
    );
  }

  // ── 9. Budget enforcement ──────────────────────────────────────
  if (computedAllocated > budget_limit) {
    throw new Error(
      `Budget exceeded: allocated ${computedAllocated} exceeds limit ${budget_limit}`
    );
  }

  const remainingBudget = Math.round((budget_limit - computedAllocated) * 100) / 100;

  // ── 10. Compute impact server-side (NOT from AI) ───────────────
  const computedImpact = await computeImpact(aiData.products);
  console.log("[Service] Impact computed server-side:", computedImpact);

  // ── 11. Persist proposal ───────────────────────────────────────
  const proposal = await Proposal.create({
    client_name: client_name || "",
    proposal_summary: aiData.proposal_summary,
    total_budget_limit: budget_limit,
    allocated_budget: computedAllocated,
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
    allocated_budget: computedAllocated,
    remaining_budget: remainingBudget,
    products: aiData.products,
    impact_summary: aiData.impact_summary,
    confidence_score: aiData.confidence_score,
    computed_impact: computedImpact,
  };
}

module.exports = { generateProposal };

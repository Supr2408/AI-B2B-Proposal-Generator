const axios = require("axios");
const config = require("../config");

// ─── Retry Policy ────────────────────────────────────────────────────
// Retry ONLY on: network errors, 429 (rate limit), 5xx (server error)
// NO retry on: parse failure, schema failure, budget violation
function isRetryable(error) {
  if (error.response) {
    const s = error.response.status;
    return s === 429 || s >= 500;
  }
  // Network error (no response)
  if (error.code === "ECONNABORTED" || error.code === "ENOTFOUND" || !error.response) {
    return true;
  }
  return false;
}

// ─── Groq Provider ───────────────────────────────────────────────────
// Groq uses the OpenAI-compatible chat completions API format.
async function callGroq(systemPrompt, userPrompt) {
  const { maxRetries, retryDelayMs } = config.retry;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: config.ai.groq.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 2048,
          temperature: 0.3,
        },
        {
          headers: {
            Authorization: `Bearer ${config.ai.groq.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        }
      );

      const content = res.data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Groq returned empty content");
      }
      return {
        rawContent: content.trim(),
        model: res.data.model || config.ai.groq.model,
      };
    } catch (err) {
      if (isRetryable(err) && attempt < maxRetries) {
        console.warn(`[Groq] Retry ${attempt}/${maxRetries} in ${retryDelayMs * attempt}ms`);
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
        continue;
      }
      const msg = err.response?.data?.error?.message || err.message;
      throw new Error(`Groq API error: ${msg}`);
    }
  }
  throw new Error(`Groq failed after ${maxRetries} retries`);
}

// ─── Provider Abstraction ────────────────────────────────────────────
async function callAI(systemPrompt, userPrompt) {
  const provider = config.ai.provider;
  if (provider === "groq") {
    return callGroq(systemPrompt, userPrompt);
  }
  throw new Error(`Unknown AI provider: ${provider}`);
}

// ─── Prompt Builders ─────────────────────────────────────────────────

function buildSystemPrompt(products) {
  const catalog = products.map((p) => ({
    product_id: p._id.toString(),
    name: p.name,
    category: p.category,
    unit_price: p.unit_price,
    impact_metrics: p.impact_metrics,
  }));

  return `You are an AI B2B sustainability proposal strategist for a sustainable commerce platform.

Your task:
Generate a product proposal from the provided catalog that maximizes sustainability impact while staying within budget.

═══════════════════════════════════════════
PRODUCT CATALOG (select ONLY from these):
═══════════════════════════════════════════
${JSON.stringify(catalog, null, 2)}

NON-NEGOTIABLE RULES:
1) Use ONLY product_id values from the provided catalog.
2) Do NOT invent products, IDs, prices, or categories.
3) For every selected product:
   - name must exactly match catalog
   - unit_price must exactly match catalog
   - total_cost must equal quantity * unit_price
4) allocated_budget must equal sum(total_cost).
5) allocated_budget must be <= total_budget_limit.
6) confidence_score must be between 0 and 1.
7) Return EXACTLY one JSON object with no markdown and no extra keys.

REQUIRED JSON SHAPE:
{
  "proposal_summary": "string",
  "total_budget_limit": 0,
  "allocated_budget": 0,
  "products": [
    {
      "product_id": "string",
      "name": "string",
      "quantity": 1,
      "unit_price": 0,
      "total_cost": 0
    }
  ],
  "impact_summary": "string",
  "confidence_score": 0
}

STYLE GUIDANCE:
- Keep proposal_summary and impact_summary concise, executive, and measurable.
- Emphasize practical business value: brand credibility, reduced waste footprint, procurement suitability.
- Avoid inflated or unverified impact claims.

IMPORTANT: Output ONLY the JSON object. No text before or after.`;
}

function buildUserPrompt(budgetLimit, categoryFocus, sustainabilityPriority, clientName) {
  const client = clientName || "N/A";
  const categories =
    categoryFocus && categoryFocus.length > 0
      ? categoryFocus.join(", ")
      : "N/A";
  const priority = sustainabilityPriority || "N/A";

  return `Generate a B2B sustainability proposal.

Budget limit (INR): ₹${budgetLimit}
Client name: ${client}
Category focus: ${categories}
Sustainability priority: ${priority}

Return only strict JSON in the required schema.
No markdown, no explanation, no extra keys.`;
}

module.exports = {
  callAI,
  buildSystemPrompt,
  buildUserPrompt,
};

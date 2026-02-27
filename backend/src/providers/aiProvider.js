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
          temperature: 0,
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
        // For 429 (rate limit), parse the retry-after time from the response
        let delayMs = retryDelayMs * attempt;
        if (err.response?.status === 429) {
          const retryAfterHeader = err.response.headers?.["retry-after"];
          const errMsg = err.response?.data?.error?.message || "";
          // Try header first, then parse "try again in X.XXs" from error message
          if (retryAfterHeader) {
            delayMs = Math.ceil(parseFloat(retryAfterHeader) * 1000) + 500;
          } else {
            const match = errMsg.match(/try again in\s+([\d.]+)s/i);
            if (match) {
              delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 500;
            } else {
              delayMs = Math.max(delayMs, 8000); // fallback: 8s for rate limits
            }
          }
        }
        console.warn(`[Groq] Retry ${attempt}/${maxRetries} in ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
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

function buildSystemPrompt(products, budgetLimit) {
  const catalog = products.map((p) => ({
    product_id: p._id.toString(),
    name: p.name,
    category: p.category,
    unit_price: p.unit_price,
    impact_metrics: p.impact_metrics,
  }));

  // Pre-compute max affordable quantity per product so the AI has
  // concrete guardrails and doesn't need to do division itself.
  const budgetGuide = products
    .filter((p) => p.unit_price <= budgetLimit)
    .sort((a, b) => a.unit_price - b.unit_price)
    .map((p) => {
      const maxQty = Math.floor(budgetLimit / p.unit_price);
      return `  - ${p.name} (₹${p.unit_price}): max ${maxQty} units = ₹${maxQty * p.unit_price}`;
    })
    .join("\n");

  return `You are an AI B2B sustainability proposal strategist for a sustainable commerce platform.

Your task:
Generate a product proposal from the provided catalog that maximizes sustainability impact while staying STRICTLY within the budget limit of ₹${budgetLimit}.

═══════════════════════════════════════════
PRODUCT CATALOG (select ONLY from these):
═══════════════════════════════════════════
${JSON.stringify(catalog, null, 2)}

═══════════════════════════════════════════
BUDGET GUIDE — max affordable per product:
═══════════════════════════════════════════
Budget: ₹${budgetLimit}
${budgetGuide}

WARNING: The sum of ALL selected products' total_cost MUST be ≤ ₹${budgetLimit}.
If you pick multiple products, each product's total_cost eats into this shared budget.

BUDGET UTILIZATION GOAL:
- You MUST select at least 3 different products (from different categories if possible).
- Aim to use at least 70% of the budget (₹${Math.floor(budgetLimit * 0.7)} or more).
- Select a MIX of products with varying quantities to maximize sustainability impact.
- It is better to slightly underspend than to exceed the budget, but do NOT waste budget by picking only 1 item.

NON-NEGOTIABLE RULES:
1) Use ONLY product_id values from the provided catalog.
2) Do NOT invent products, IDs, prices, or categories.
3) For every selected product:
   - name must EXACTLY match catalog (character-for-character)
   - unit_price must EXACTLY match catalog (do NOT change it)
   - total_cost = quantity × unit_price (EXACT multiplication, NO rounding, NO additions, NO tax)
   Example: if unit_price=538 and quantity=5, then total_cost=2690 (NOT 2696, NOT 2700)
   Example: if unit_price=999 and quantity=10, then total_cost=9990 (NOT 9996, NOT 10000)
4) allocated_budget = sum of ALL total_cost values (add each total_cost exactly).
5) allocated_budget MUST be <= ${budgetLimit}. NEVER exceed this.
6) confidence_score must be between 0 and 1.
7) Return EXACTLY one JSON object with no markdown and no extra keys.

CRITICAL ARITHMETIC CHECK — before outputting, verify:
  - Every total_cost = quantity × unit_price (exact integer multiplication)
  - allocated_budget = total_cost_1 + total_cost_2 + ... (exact sum)
  - allocated_budget <= ${budgetLimit}
If any check fails, fix the numbers BEFORE outputting.

REQUIRED JSON SHAPE:
{
  "proposal_summary": "string",
  "total_budget_limit": ${budgetLimit},
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

CRITICAL: The total allocated_budget MUST be ≤ ₹${budgetLimit}. Do NOT exceed this limit under any circumstance. If necessary, reduce quantities or select fewer products to stay within budget.

Return only strict JSON in the required schema.
No markdown, no explanation, no extra keys.`;
}

module.exports = {
  callAI,
  buildSystemPrompt,
  buildUserPrompt,
  isRetryable, // exported for unit testing
};

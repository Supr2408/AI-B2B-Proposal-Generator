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

  return `You are an AI B2B sustainability proposal strategist.

You will be given a budget, optional category focus areas, and an optional sustainability priority.
Your task is to recommend a product mix from the EXACT product catalog below.

═══════════════════════════════════════════
PRODUCT CATALOG (select ONLY from these):
═══════════════════════════════════════════
${JSON.stringify(catalog, null, 2)}

═══════════════════════════════════════════
STRICT RULES:
═══════════════════════════════════════════
1. ONLY use product_id values from the catalog above.
2. Do NOT invent any product_id.
3. The "name" field must exactly match the catalog name for that product_id.
4. The "unit_price" must exactly match the catalog unit_price.
5. total_cost = quantity × unit_price (you must compute this correctly for each product).
6. allocated_budget = sum of all total_cost values.
7. allocated_budget MUST NOT exceed the budget_limit provided.
8. total_budget_limit must equal the budget_limit provided.
9. confidence_score is a number between 0 and 1.
10. Consider sustainability impact and category preferences when selecting products.

═══════════════════════════════════════════
REQUIRED OUTPUT FORMAT (strict JSON only):
═══════════════════════════════════════════
Return EXACTLY this JSON. No markdown. No explanation. No extra keys. Single JSON object only:

{
  "proposal_summary": "<executive summary>",
  "total_budget_limit": <number>,
  "allocated_budget": <number>,
  "products": [
    {
      "product_id": "<exact product_id from catalog>",
      "name": "<exact product name from catalog>",
      "quantity": <positive integer>,
      "unit_price": <exact unit_price from catalog>,
      "total_cost": <quantity * unit_price>
    }
  ],
  "impact_summary": "<sustainability impact positioning>",
  "confidence_score": <0.0 to 1.0>
}

IMPORTANT: Output ONLY the JSON object. No text before or after.`;
}

function buildUserPrompt(budgetLimit, categoryFocus, sustainabilityPriority, clientName) {
  let prompt = `Generate a B2B sustainability proposal for a budget of ₹${budgetLimit} (Indian Rupees).`;
  if (clientName) {
    prompt += `\nClient: ${clientName}`;
  }
  if (categoryFocus && categoryFocus.length > 0) {
    prompt += `\nCategory focus: ${categoryFocus.join(", ")}`;
  }
  if (sustainabilityPriority) {
    prompt += `\nSustainability priority: ${sustainabilityPriority}`;
  }
  prompt += `\n\nReturn ONLY valid JSON matching the required schema. No markdown, no explanation.`;
  return prompt;
}

module.exports = {
  callAI,
  buildSystemPrompt,
  buildUserPrompt,
};

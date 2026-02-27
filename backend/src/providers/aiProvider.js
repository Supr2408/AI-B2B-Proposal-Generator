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
          max_tokens: 1024,
          temperature: 0.4,
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
  // Compact catalog: one line per product to minimize tokens
  const catalogLines = products.map((p) =>
    `${p._id}|${p.name}|${p.category}|${p.unit_price}|max${Math.floor(budgetLimit / p.unit_price)}`
  ).join("\n");

  return `You are a B2B sustainability proposal AI. Select products from the catalog below. Budget: ₹${budgetLimit}.

CATALOG (id|name|category|unit_price|maxQty):
${catalogLines}

RULES:
1. Select 3+ products from different categories. Use 70-95% of budget (₹${Math.floor(budgetLimit * 0.7)}-₹${budgetLimit}).
2. product_id, name, unit_price must EXACTLY match catalog.
3. total_cost = quantity × unit_price (exact multiplication, no rounding).
4. allocated_budget = sum of all total_cost. Must be ≤ ${budgetLimit}.
5. confidence_score: 0-1.
6. Output ONLY valid JSON, no markdown.

EXAMPLE OUTPUT:
{"proposal_summary":"Sustainable gifting for Acme Corp.","total_budget_limit":9000,"allocated_budget":8450,"products":[{"product_id":"p1","name":"Plantable Seed Paper Card","quantity":10,"unit_price":199,"total_cost":1990},{"product_id":"p2","name":"Eco Bamboo Bottle","quantity":5,"unit_price":800,"total_cost":4000},{"product_id":"p3","name":"Recycled Cotton Tote","quantity":5,"unit_price":500,"total_cost":2500}],"impact_summary":"Reduces plastic and paper waste.","confidence_score":0.98}

JSON SHAPE:
{"proposal_summary":"string","total_budget_limit":${budgetLimit},"allocated_budget":0,"products":[{"product_id":"string","name":"string","quantity":1,"unit_price":0,"total_cost":0}],"impact_summary":"string","confidence_score":0}`;
}

function buildUserPrompt(budgetLimit, categoryFocus, sustainabilityPriority, clientName) {
  const client = clientName || "N/A";
  const categories =
    categoryFocus && categoryFocus.length > 0
      ? categoryFocus.join(", ")
      : "N/A";
  const priority = sustainabilityPriority || "N/A";

  return `Budget: ₹${budgetLimit}. Client: ${client}. Categories: ${categories}. Priority: ${priority}. Return JSON only.`;
}

module.exports = {
  callAI,
  buildSystemPrompt,
  buildUserPrompt,
  isRetryable, // exported for unit testing
};

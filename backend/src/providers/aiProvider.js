const axios = require("axios");
const config = require("../config");

class ProviderRateLimitError extends Error {
  constructor(message, retryAfterMs, provider = "groq") {
    super(message);
    this.name = "ProviderRateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.provider = provider;
  }
}

const NETWORK_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ENOTFOUND",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

let groqRateLimitedUntil = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry ONLY on: network errors, 429 (rate limit), 5xx (server error)
// NO retry on: parse failure, schema failure, budget violation
function isRetryable(error) {
  if (error.response) {
    const s = error.response.status;
    return s === 429 || s >= 500;
  }

  // Axios network error (no response received)
  if (NETWORK_ERROR_CODES.has(error.code)) {
    return true;
  }
  if (error.request && !error.response) {
    return true;
  }

  return false;
}

function parseRetryAfterMs(error) {
  const headerValue = error?.response?.headers?.["retry-after"];
  if (headerValue !== undefined) {
    const headerStr = String(headerValue).trim();
    const asSeconds = Number(headerStr);
    if (Number.isFinite(asSeconds) && asSeconds > 0) {
      return Math.ceil(asSeconds * 1000);
    }

    const asDate = Date.parse(headerStr);
    if (!Number.isNaN(asDate)) {
      const ms = asDate - Date.now();
      if (ms > 0) return ms;
    }
  }

  const errMsg = error?.response?.data?.error?.message || error?.message || "";
  const match = errMsg.match(/try again in\s+([\d.]+)\s*s/i);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }

  return null;
}

async function waitForGroqCooldown() {
  const waitMs = groqRateLimitedUntil - Date.now();
  if (waitMs > 0) {
    console.warn(`[Groq] Cooling down for ${waitMs}ms due to prior rate limit`);
    await sleep(waitMs);
  }
}

// Groq uses the OpenAI-compatible chat completions API format.
async function callGroq(systemPrompt, userPrompt) {
  const { maxRetries, retryDelayMs, rateLimitMinDelayMs } = config.retry;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await waitForGroqCooldown();

    try {
      const res = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: config.ai.groq.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: config.ai.groq.maxOutputTokens,
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
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message;

      if (status === 429) {
        const parsedDelay = parseRetryAfterMs(err);
        const baseDelay = retryDelayMs * attempt;
        const delayMs = Math.max(parsedDelay || baseDelay, rateLimitMinDelayMs) + 500;

        groqRateLimitedUntil = Math.max(groqRateLimitedUntil, Date.now() + delayMs);

        if (attempt < maxRetries) {
          console.warn(`[Groq] Rate limit hit. Retry ${attempt}/${maxRetries} in ${delayMs}ms`);
          await sleep(delayMs);
          continue;
        }

        throw new ProviderRateLimitError(`Groq API rate limit: ${msg}`, delayMs);
      }

      if (isRetryable(err) && attempt < maxRetries) {
        const delayMs = retryDelayMs * attempt;
        console.warn(`[Groq] Retry ${attempt}/${maxRetries} in ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      throw new Error(`Groq API error: ${msg}`);
    }
  }

  throw new Error(`Groq failed after ${maxRetries} retries`);
}

async function callAI(systemPrompt, userPrompt) {
  const provider = config.ai.provider;
  if (provider === "groq") {
    return callGroq(systemPrompt, userPrompt);
  }
  throw new Error(`Unknown AI provider: ${provider}`);
}

function selectCatalogProducts(products, budgetLimit, maxItems) {
  const affordable = products.filter((p) => p.unit_price <= budgetLimit);
  const pool = affordable.length > 0 ? affordable : products;
  const byPrice = [...pool].sort((a, b) => a.unit_price - b.unit_price);

  const selected = [];
  const selectedIds = new Set();
  const seenCategories = new Set();

  // First pass: keep category diversity while preferring cheaper products.
  for (const p of byPrice) {
    if (selected.length >= maxItems) break;
    if (seenCategories.has(p.category)) continue;
    selected.push(p);
    selectedIds.add(String(p._id));
    seenCategories.add(p.category);
  }

  // Second pass: fill remaining slots by cheapest items.
  for (const p of byPrice) {
    if (selected.length >= maxItems) break;
    const id = String(p._id);
    if (selectedIds.has(id)) continue;
    selected.push(p);
    selectedIds.add(id);
  }

  return selected;
}

function buildSystemPrompt(products, budgetLimit) {
  const catalogProducts = selectCatalogProducts(
    products,
    budgetLimit,
    config.ai.groq.maxCatalogItems
  );

  // Compact catalog: one line per product to minimize tokens
  const catalogLines = catalogProducts
    .map(
      (p) =>
        `${p._id}|${p.name}|${p.category}|${p.unit_price}|max${Math.floor(
          budgetLimit / p.unit_price
        )}`
    )
    .join("\n");

  return `Generate a B2B sustainability proposal.
Budget limit: ${budgetLimit}
Catalog format: id|name|category|unit_price|maxQty
${catalogLines}

Rules:
1) Select at least 3 products from different categories.
2) Use 70-95% of budget (${Math.floor(budgetLimit * 0.7)}-${budgetLimit}).
3) product_id, name, and unit_price must exactly match catalog.
4) total_cost = quantity * unit_price.
5) allocated_budget = sum(total_cost), and must be <= ${budgetLimit}.
6) confidence_score must be between 0 and 1.
7) Output valid JSON only, no markdown, no extra keys.
8) Choose products only from the catalog lines provided.

Required JSON schema:
{"proposal_summary":"string","total_budget_limit":${budgetLimit},"allocated_budget":0,"products":[{"product_id":"string","name":"string","quantity":1,"unit_price":0,"total_cost":0}],"impact_summary":"string","confidence_score":0}`;
}

function buildUserPrompt(budgetLimit, categoryFocus, sustainabilityPriority, clientName) {
  const client = clientName || "N/A";
  const categories =
    categoryFocus && categoryFocus.length > 0 ? categoryFocus.join(", ") : "N/A";
  const priority = sustainabilityPriority || "N/A";

  return `Budget: ${budgetLimit}. Client: ${client}. Categories: ${categories}. Priority: ${priority}. Return JSON only.`;
}

module.exports = {
  callAI,
  buildSystemPrompt,
  buildUserPrompt,
  isRetryable,
  parseRetryAfterMs,
  ProviderRateLimitError,
};

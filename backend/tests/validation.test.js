/**
 * Validation & Business Rule Tests — Module 2
 *
 * Uses Node.js built-in test runner (node:test).
 * Run:  npm test
 *       node --test tests/validation.test.js
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { ProposalRequestSchema, AIResponseSchema } = require("../src/validators/proposalValidator");
const { ValidationError } = require("../src/services/proposalService");

// ─── Helper: valid AI response factory ───────────────────────────────
function makeValidAIResponse(overrides = {}) {
  return {
    proposal_summary: "Test proposal summary",
    total_budget_limit: 50000,
    allocated_budget: 13980,
    products: [
      {
        product_id: "abc123",
        name: "Recycled Cotton Tote Bag",
        quantity: 20,
        unit_price: 699,
        total_cost: 13980,
      },
    ],
    impact_summary: "Estimated 6kg plastic saved",
    confidence_score: 0.85,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════
// 1. REQUEST VALIDATION (ProposalRequestSchema)
// ═════════════════════════════════════════════════════════════════════

describe("ProposalRequestSchema", () => {
  it("accepts valid request with all fields", () => {
    const result = ProposalRequestSchema.safeParse({
      client_name: "Acme",
      budget_limit: 50000,
      category_focus: ["Bags"],
      sustainability_priority: "high",
    });
    assert.equal(result.success, true);
  });

  it("accepts valid request with only budget_limit", () => {
    const result = ProposalRequestSchema.safeParse({ budget_limit: 10000 });
    assert.equal(result.success, true);
    assert.equal(result.data.client_name, "");
    assert.deepEqual(result.data.category_focus, []);
  });

  it("rejects missing budget_limit", () => {
    const result = ProposalRequestSchema.safeParse({ client_name: "Test" });
    assert.equal(result.success, false);
    const msg = result.error.issues.map((i) => i.message).join("; ");
    assert.match(msg, /budget_limit is required/);
  });

  it("rejects negative budget_limit", () => {
    const result = ProposalRequestSchema.safeParse({ budget_limit: -100 });
    assert.equal(result.success, false);
  });

  it("rejects zero budget_limit", () => {
    const result = ProposalRequestSchema.safeParse({ budget_limit: 0 });
    assert.equal(result.success, false);
  });

  it("rejects non-number budget_limit", () => {
    const result = ProposalRequestSchema.safeParse({ budget_limit: "fifty" });
    assert.equal(result.success, false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. AI RESPONSE SCHEMA VALIDATION (AIResponseSchema)
// ═════════════════════════════════════════════════════════════════════

describe("AIResponseSchema — strict JSON", () => {
  it("accepts valid AI response", () => {
    const result = AIResponseSchema.safeParse(makeValidAIResponse());
    assert.equal(result.success, true);
  });

  it("rejects extra keys (strict mode)", () => {
    const result = AIResponseSchema.safeParse(
      makeValidAIResponse({ extra_field: "not allowed" })
    );
    assert.equal(result.success, false);
  });

  it("rejects missing proposal_summary", () => {
    const data = makeValidAIResponse();
    delete data.proposal_summary;
    const result = AIResponseSchema.safeParse(data);
    assert.equal(result.success, false);
  });

  it("rejects empty products array", () => {
    const result = AIResponseSchema.safeParse(
      makeValidAIResponse({ products: [] })
    );
    assert.equal(result.success, false);
  });

  it("rejects confidence_score > 1", () => {
    const result = AIResponseSchema.safeParse(
      makeValidAIResponse({ confidence_score: 1.5 })
    );
    assert.equal(result.success, false);
  });

  it("rejects confidence_score < 0", () => {
    const result = AIResponseSchema.safeParse(
      makeValidAIResponse({ confidence_score: -0.1 })
    );
    assert.equal(result.success, false);
  });

  it("rejects negative quantity in product", () => {
    const result = AIResponseSchema.safeParse(
      makeValidAIResponse({
        products: [
          {
            product_id: "abc",
            name: "Test",
            quantity: -5,
            unit_price: 100,
            total_cost: -500,
          },
        ],
      })
    );
    assert.equal(result.success, false);
  });

  it("rejects non-integer quantity", () => {
    const result = AIResponseSchema.safeParse(
      makeValidAIResponse({
        products: [
          {
            product_id: "abc",
            name: "Test",
            quantity: 2.5,
            unit_price: 100,
            total_cost: 250,
          },
        ],
      })
    );
    assert.equal(result.success, false);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. STRICT JSON PARSE (no fallback)
// ═════════════════════════════════════════════════════════════════════

describe("Strict JSON parse behavior", () => {
  it("parses valid JSON string", () => {
    const raw = JSON.stringify(makeValidAIResponse());
    const parsed = JSON.parse(raw);
    assert.equal(typeof parsed, "object");
    assert.equal(parsed.proposal_summary, "Test proposal summary");
  });

  it("fails on markdown-fenced JSON (no stripping)", () => {
    const raw = "```json\n" + JSON.stringify(makeValidAIResponse()) + "\n```";
    assert.throws(() => JSON.parse(raw), SyntaxError);
  });

  it("fails on JSON with text prefix", () => {
    const raw = "Here is the proposal:\n" + JSON.stringify(makeValidAIResponse());
    assert.throws(() => JSON.parse(raw), SyntaxError);
  });

  it("fails on empty string", () => {
    assert.throws(() => JSON.parse(""), SyntaxError);
  });

  it("fails on plain text", () => {
    assert.throws(() => JSON.parse("not json at all"), SyntaxError);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 4. BUSINESS VALIDATION (product/price/cost/budget checks)
// ═════════════════════════════════════════════════════════════════════

describe("Business validation logic", () => {
  // Simulate the validation logic inline (same as proposalService steps 8a-9)
  // Steps 8d/8e: server COMPUTES total_cost and allocated_budget (LLMs can't do arithmetic)
  function validateAIOutput(aiData, productMap, budgetLimit) {
    for (const item of aiData.products) {
      const dbProduct = productMap.get(item.product_id);
      if (!dbProduct) {
        throw new ValidationError(`Product not found in DB: ${item.product_id}`);
      }
      if (item.name !== dbProduct.name) {
        throw new ValidationError(
          `Name mismatch for ${item.product_id}: AI said "${item.name}", DB has "${dbProduct.name}"`
        );
      }
      if (item.unit_price !== dbProduct.unit_price) {
        throw new ValidationError(
          `Price mismatch for ${item.name}: AI said ${item.unit_price}, DB has ${dbProduct.unit_price}`
        );
      }
      // 8d. Server-side computation of total_cost
      item.total_cost = Math.round(item.quantity * dbProduct.unit_price * 100) / 100;
    }
    // 8e. Server-side computation of allocated_budget
    const computedAllocated = Math.round(
      aiData.products.reduce((sum, p) => sum + p.total_cost, 0) * 100
    ) / 100;
    aiData.allocated_budget = computedAllocated;

    if (aiData.total_budget_limit !== budgetLimit) {
      throw new ValidationError(
        `Budget limit mismatch: AI said ₹${aiData.total_budget_limit}, request had ₹${budgetLimit}`
      );
    }
    if (computedAllocated > budgetLimit) {
      throw new ValidationError(
        `Budget exceeded: allocated ₹${computedAllocated} exceeds limit ₹${budgetLimit}`
      );
    }
    return { finalAllocated: computedAllocated };
  }

  const mockProductMap = new Map([
    ["prod1", { name: "Recycled Cotton Tote Bag", unit_price: 699 }],
    ["prod2", { name: "Stainless Steel Water Bottle", unit_price: 1249 }],
  ]);

  it("passes valid AI output", () => {
    const aiData = {
      total_budget_limit: 50000,
      allocated_budget: 13980,
      products: [
        { product_id: "prod1", name: "Recycled Cotton Tote Bag", quantity: 20, unit_price: 699, total_cost: 13980 },
      ],
    };
    const result = validateAIOutput(aiData, mockProductMap, 50000);
    assert.equal(result.finalAllocated, 13980);
  });

  it("server recomputes total_cost even when AI is wrong", () => {
    const aiData = {
      total_budget_limit: 50000,
      allocated_budget: 14000,
      products: [
        { product_id: "prod1", name: "Recycled Cotton Tote Bag", quantity: 20, unit_price: 699, total_cost: 14000 },
      ],
    };
    const result = validateAIOutput(aiData, mockProductMap, 50000);
    // Server recomputes: 20 × 699 = 13980
    assert.equal(aiData.products[0].total_cost, 13980);
    assert.equal(result.finalAllocated, 13980);
  });

  it("server recomputes allocated_budget even when AI is wrong", () => {
    const aiData = {
      total_budget_limit: 50000,
      allocated_budget: 99999,
      products: [
        { product_id: "prod1", name: "Recycled Cotton Tote Bag", quantity: 20, unit_price: 699, total_cost: 13980 },
      ],
    };
    const result = validateAIOutput(aiData, mockProductMap, 50000);
    assert.equal(result.finalAllocated, 13980);
    assert.equal(aiData.allocated_budget, 13980);
  });

  it("rejects unknown product_id", () => {
    const aiData = {
      total_budget_limit: 50000,
      allocated_budget: 100,
      products: [
        { product_id: "fake_id", name: "Fake", quantity: 1, unit_price: 100, total_cost: 100 },
      ],
    };
    assert.throws(
      () => validateAIOutput(aiData, mockProductMap, 50000),
      (e) => e instanceof ValidationError && /not found/.test(e.message)
    );
  });

  it("rejects name mismatch", () => {
    const aiData = {
      total_budget_limit: 50000,
      allocated_budget: 699,
      products: [
        { product_id: "prod1", name: "Wrong Name", quantity: 1, unit_price: 699, total_cost: 699 },
      ],
    };
    assert.throws(
      () => validateAIOutput(aiData, mockProductMap, 50000),
      (e) => e instanceof ValidationError && /Name mismatch/.test(e.message)
    );
  });

  it("rejects unit_price mismatch", () => {
    const aiData = {
      total_budget_limit: 50000,
      allocated_budget: 999,
      products: [
        { product_id: "prod1", name: "Recycled Cotton Tote Bag", quantity: 1, unit_price: 999, total_cost: 999 },
      ],
    };
    assert.throws(
      () => validateAIOutput(aiData, mockProductMap, 50000),
      (e) => e instanceof ValidationError && /Price mismatch/.test(e.message)
    );
  });

  it("rejects total_budget_limit mismatch", () => {
    const aiData = {
      total_budget_limit: 99999,
      allocated_budget: 13980,
      products: [
        { product_id: "prod1", name: "Recycled Cotton Tote Bag", quantity: 20, unit_price: 699, total_cost: 13980 },
      ],
    };
    assert.throws(
      () => validateAIOutput(aiData, mockProductMap, 50000),
      (e) => e instanceof ValidationError && /Budget limit mismatch/.test(e.message)
    );
  });

  it("rejects budget exceeded (server-computed total over limit)", () => {
    const aiData = {
      total_budget_limit: 1000,
      allocated_budget: 0,
      products: [
        { product_id: "prod1", name: "Recycled Cotton Tote Bag", quantity: 20, unit_price: 699, total_cost: 0 },
      ],
    };
    // Server computes: 20 × 699 = 13980 > 1000
    assert.throws(
      () => validateAIOutput(aiData, mockProductMap, 1000),
      (e) => e instanceof ValidationError && /Budget exceeded/.test(e.message)
    );
  });
});

// ═════════════════════════════════════════════════════════════════════
// 5. HTTP STATUS MAPPING
// ═════════════════════════════════════════════════════════════════════

describe("HTTP status code mapping", () => {
  it("ValidationError should have name 'ValidationError'", () => {
    const err = new ValidationError("test");
    assert.equal(err.name, "ValidationError");
    assert.equal(err instanceof Error, true);
    assert.equal(err.message, "test");
  });

  it("ValidationError is instanceof Error (for controller catch)", () => {
    const err = new ValidationError("schema fail");
    assert.equal(err instanceof ValidationError, true);
    assert.equal(err instanceof Error, true);
  });

  it("Regular Error is NOT instanceof ValidationError", () => {
    const err = new Error("system fail");
    assert.equal(err instanceof ValidationError, false);
  });
});

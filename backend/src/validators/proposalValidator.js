const { z } = require("zod");

// ─── Incoming API request schema ─────────────────────────────────────
// Input contract: preferences is a nested object containing
// category_focus and sustainability_priority.
const ProposalRequestSchema = z.object({
  client_name: z.string().optional().default(""),
  budget_limit: z
    .number({
      required_error: "budget_limit is required",
      invalid_type_error: "budget_limit must be a number",
    })
    .positive("budget_limit must be a positive number")
    .finite("budget_limit must be finite"),
  preferences: z
    .object({
      category_focus: z.array(z.string()).optional().default([]),
      sustainability_priority: z.string().optional().default(""),
    })
    .optional()
    .default({}),
});

// ─── Strict AI output schema (no extra keys allowed) ─────────────────
const AIProductSchema = z.object({
  product_id: z.string().min(1, "product_id must be non-empty"),
  name: z.string().min(1, "name must be non-empty"),
  quantity: z
    .number()
    .int("quantity must be an integer")
    .positive("quantity must be positive"),
  unit_price: z.number().nonnegative("unit_price must be non-negative"),
  total_cost: z.number().nonnegative("total_cost must be non-negative"),
});

const AIResponseSchema = z
  .object({
    proposal_summary: z.string().min(1, "proposal_summary is required"),
    total_budget_limit: z.number().nonnegative(),
    allocated_budget: z.number().nonnegative(),
    products: z
      .array(AIProductSchema)
      .min(1, "At least one product required"),
    impact_summary: z.string().min(1, "impact_summary is required"),
    confidence_score: z.number().min(0).max(1),
  })
  .strict();

module.exports = {
  ProposalRequestSchema,
  AIResponseSchema,
};

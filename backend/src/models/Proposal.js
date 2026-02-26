const mongoose = require("mongoose");

const ProposalProductSchema = new mongoose.Schema(
  {
    product_id: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit_price: { type: Number, required: true },
    total_cost: { type: Number, required: true },
  },
  { _id: false }
);

const ProposalSchema = new mongoose.Schema(
  {
    client_name: {
      type: String,
      default: "",
    },
    proposal_summary: {
      type: String,
      required: true,
    },
    total_budget_limit: {
      type: Number,
      required: true,
      min: 0,
    },
    allocated_budget: {
      type: Number,
      required: true,
      min: 0,
    },
    remaining_budget: {
      type: Number,
      required: true,
    },
    products: {
      type: [ProposalProductSchema],
      required: true,
    },
    impact_summary: {
      type: String,
      required: true,
    },
    confidence_score: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    computed_impact: {
      total_plastic_saved: { type: Number, default: 0 },
      total_carbon_avoided: { type: Number, default: 0 },
    },
    ai_metadata: {
      system_prompt: { type: String, required: true },
      user_prompt: { type: String, required: true },
      raw_response: { type: String, required: true },
      model: { type: String, required: true },
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

module.exports = mongoose.model("Proposal", ProposalSchema);

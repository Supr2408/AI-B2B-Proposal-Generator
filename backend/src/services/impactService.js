const Product = require("../models/Product");

/**
 * ImpactService
 *
 * Computes sustainability impact metrics server-side.
 * Impact is NEVER trusted from AI output — always computed from DB data.
 */

async function computeImpact(proposalProducts) {
  let totalPlasticSaved = 0;
  let totalCarbonAvoided = 0;

  for (const item of proposalProducts) {
    const dbProduct = await Product.findById(item.product_id).lean();
    if (!dbProduct) {
      throw new Error(`Impact computation failed: product ${item.product_id} not found`);
    }

    const plasticSaved =
      (dbProduct.impact_metrics.plastic_saved_per_unit || 0) * item.quantity;
    const carbonAvoided =
      (dbProduct.impact_metrics.carbon_avoided_per_unit || 0) * item.quantity;

    totalPlasticSaved += plasticSaved;
    totalCarbonAvoided += carbonAvoided;
  }

  return {
    total_plastic_saved: Math.round(totalPlasticSaved * 100) / 100,
    total_carbon_avoided: Math.round(totalCarbonAvoided * 100) / 100,
  };
}

module.exports = { computeImpact };

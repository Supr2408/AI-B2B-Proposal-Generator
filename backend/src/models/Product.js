const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    unit_price: {
      type: Number,
      required: true,
      min: 0,
    },
    impact_metrics: {
      plastic_saved_per_unit: {
        type: Number,
        required: true,
        default: 0,
      },
      carbon_avoided_per_unit: {
        type: Number,
        required: true,
        default: 0,
      },
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

module.exports = mongoose.model("Product", ProductSchema);

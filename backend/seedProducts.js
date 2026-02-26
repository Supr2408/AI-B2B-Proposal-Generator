/**
 * seedProducts.js — Populate the Product collection with sample sustainable products.
 *
 * Usage:
 *   node seedProducts.js
 *   — or —
 *   npm run seed
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const Product = require("./src/models/Product");

const seedProducts = [
  {
    name: "Recycled Cotton Tote Bag",
    category: "Bags",
    unit_price: 8.5,
    impact_metrics: {
      plastic_saved_per_unit: 0.3,
      carbon_avoided_per_unit: 1.2,
    },
  },
  {
    name: "Stainless Steel Water Bottle",
    category: "Drinkware",
    unit_price: 15.0,
    impact_metrics: {
      plastic_saved_per_unit: 0.5,
      carbon_avoided_per_unit: 2.1,
    },
  },
  {
    name: "Bamboo Ballpoint Pen",
    category: "Stationery",
    unit_price: 3.25,
    impact_metrics: {
      plastic_saved_per_unit: 0.05,
      carbon_avoided_per_unit: 0.15,
    },
  },
  {
    name: "Recycled Paper Notebook",
    category: "Stationery",
    unit_price: 6.0,
    impact_metrics: {
      plastic_saved_per_unit: 0.1,
      carbon_avoided_per_unit: 0.8,
    },
  },
  {
    name: "Ceramic Travel Mug",
    category: "Drinkware",
    unit_price: 12.0,
    impact_metrics: {
      plastic_saved_per_unit: 0.4,
      carbon_avoided_per_unit: 1.5,
    },
  },
  {
    name: "Organic Cotton T-Shirt",
    category: "Apparel",
    unit_price: 22.0,
    impact_metrics: {
      plastic_saved_per_unit: 0.2,
      carbon_avoided_per_unit: 3.5,
    },
  },
  {
    name: "Recycled Polyester Cap",
    category: "Apparel",
    unit_price: 14.0,
    impact_metrics: {
      plastic_saved_per_unit: 0.6,
      carbon_avoided_per_unit: 1.8,
    },
  },
  {
    name: "Biodegradable Wheat Straw USB Drive (16GB)",
    category: "Electronics",
    unit_price: 9.75,
    impact_metrics: {
      plastic_saved_per_unit: 0.15,
      carbon_avoided_per_unit: 0.6,
    },
  },
  {
    name: "Portable Solar Phone Charger",
    category: "Electronics",
    unit_price: 35.0,
    impact_metrics: {
      plastic_saved_per_unit: 0.25,
      carbon_avoided_per_unit: 5.0,
    },
  },
  {
    name: "Plantable Seed Paper Card",
    category: "Stationery",
    unit_price: 2.5,
    impact_metrics: {
      plastic_saved_per_unit: 0.02,
      carbon_avoided_per_unit: 0.1,
    },
  },
  {
    name: "Bamboo Fiber Lunch Box",
    category: "Kitchen",
    unit_price: 18.0,
    impact_metrics: {
      plastic_saved_per_unit: 0.8,
      carbon_avoided_per_unit: 2.0,
    },
  },
  {
    name: "Reusable Metal Straw Set (4-pack)",
    category: "Kitchen",
    unit_price: 7.5,
    impact_metrics: {
      plastic_saved_per_unit: 1.0,
      carbon_avoided_per_unit: 0.5,
    },
  },
];

async function seed() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/sustainable_commerce";
  await mongoose.connect(uri);
  console.log("[Seed] Connected to MongoDB");

  await Product.deleteMany({});
  console.log("[Seed] Cleared existing products");

  const docs = await Product.insertMany(seedProducts);
  console.log(`[Seed] Inserted ${docs.length} products:`);
  docs.forEach((d) =>
    console.log(`  • ${d._id}  ${d.name}  ($${d.unit_price})`)
  );

  await mongoose.disconnect();
  console.log("[Seed] Done");
  process.exit(0);
}

seed().catch((err) => {
  console.error("[Seed] Error:", err);
  process.exit(1);
});

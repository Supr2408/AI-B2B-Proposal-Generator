const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const config = require("./config");
const proposalRoutes = require("./routes/proposalRoutes");

// ── Create Express app (exported for Vercel serverless) ───────────
const app = express();

// ── Middleware ───────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ── Request logging ─────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── Routes ──────────────────────────────────────────────────────
app.use("/api/v1/proposals", proposalRoutes);

// ── Root ────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    data: {
      module: "AI B2B Proposal Generator",
      version: config.module.version,
      status: "running",
    },
    error: null,
  });
});

// ── 404 ─────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    data: null,
    error: "Endpoint not found",
  });
});

// ── Global error handler ────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[Server] Unhandled error:", err);
  res.status(500).json({
    ok: false,
    data: null,
    error: "Internal server error",
  });
});

// ── MongoDB connection (cached for serverless reuse) ─────────────
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  if (!config.mongo.uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  await mongoose.connect(config.mongo.uri);
  isConnected = true;
  console.log(`[DB] Connected to MongoDB`);
}

// Handle disconnection (serverless functions can be reused)
mongoose.connection.on("disconnected", () => {
  isConnected = false;
});

// ── Local dev: start server if run directly ──────────────────────
if (require.main === module) {
  connectDB()
    .then(() => {
      app.listen(config.server.port, () => {
        console.log(`[Server] Running on port ${config.server.port}`);
        console.log(`[Server] POST /api/v1/proposals/generate`);
        console.log(`[Server] GET  /api/v1/proposals/health`);
      });
    })
    .catch((err) => {
      console.error("[Server] Fatal startup error:", err);
      process.exit(1);
    });
}

module.exports = { app, connectDB };

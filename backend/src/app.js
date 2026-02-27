const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const config = require("./config");
const proposalRoutes = require("./routes/proposalRoutes");

async function bootstrap() {
  // ── Connect to MongoDB ──────────────────────────────────────────
  await mongoose.connect(config.mongo.uri);
  console.log(`[DB] Connected to MongoDB: ${config.mongo.uri}`);

  // ── Create Express app ──────────────────────────────────────────
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
    });
  });

  // ── 404 ─────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      ok: false,
      data: null,
      error: { message: "Endpoint not found", code: "NOT_FOUND" },
    });
  });

  // ── Global error handler ────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    console.error("[Server] Unhandled error:", err);
    res.status(500).json({
      ok: false,
      data: null,
      error: { message: "Internal server error", code: "INTERNAL_ERROR" },
    });
  });

  // ── Start ───────────────────────────────────────────────────────
  app.listen(config.server.port, () => {
    console.log(`[Server] Running on port ${config.server.port}`);
    console.log(`[Server] POST /api/v1/proposals/generate`);
    console.log(`[Server] GET  /api/v1/proposals/health`);
  });
}

bootstrap().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
  process.exit(1);
});

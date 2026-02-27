/**
 * Vercel Serverless Function entry point.
 *
 * Wraps the Express app so every HTTP request is handled by
 * the same Express middleware/routes used in local development.
 */
const { app, connectDB } = require("../src/app");

module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    console.error("[Vercel] DB connection failed:", err.message);
    return res.status(500).json({
      ok: false,
      data: null,
      error: `Database connection failed: ${err.message}`,
    });
  }
  return app(req, res);
};

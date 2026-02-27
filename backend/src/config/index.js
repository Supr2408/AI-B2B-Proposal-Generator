const dotenv = require("dotenv");
const path = require("path");

// Only load .env file in local dev (Vercel injects env vars directly)
if (!process.env.VERCEL) {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    // Log warning but don't crash at import time — Vercel may set
    // env vars after the module is first parsed.
    console.error(`[Config] WARNING: Missing env variable: ${key}`);
  }
  return value || "";
}

function optionalEnv(key, fallback) {
  return process.env[key] || fallback;
}

const config = Object.freeze({
  mongo: {
    uri: requireEnv("MONGODB_URI"),
  },
  ai: {
    provider: optionalEnv("AI_PROVIDER", "groq"),
    groq: {
      apiKey: optionalEnv("GROQ_API_KEY", ""),
      model: optionalEnv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    },
  },
  server: {
    port: Number(optionalEnv("PORT", "5000")),
    nodeEnv: optionalEnv("NODE_ENV", "development"),
  },
  retry: {
    maxRetries: Number(optionalEnv("AI_MAX_RETRIES", "3")),
    retryDelayMs: Number(optionalEnv("AI_RETRY_DELAY_MS", "1000")),
  },
  module: {
    name: optionalEnv("MODULE_NAME", "B2BProposal"),
    version: optionalEnv("MODULE_VERSION", "1.0.0"),
  },
});

module.exports = config;

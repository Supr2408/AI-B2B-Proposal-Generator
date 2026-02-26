const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[Config] Missing required env variable: ${key}`);
  }
  return value;
}

function optionalEnv(key, fallback) {
  return process.env[key] || fallback;
}

const config = Object.freeze({
  mongo: {
    uri: requireEnv("MONGODB_URI"),
  },
  ai: {
    provider: optionalEnv("AI_PROVIDER", "gemini"),
    openai: {
      apiKey: optionalEnv("OPENAI_API_KEY", ""),
      model: optionalEnv("OPENAI_MODEL", "gpt-4o"),
    },
    gemini: {
      apiKey: optionalEnv("GEMINI_API_KEY", ""),
      model: optionalEnv("GEMINI_MODEL", "gemini-2.0-flash"),
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

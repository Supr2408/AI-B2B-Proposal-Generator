import axios from "axios";

// In production (GitHub Pages), use the deployed Render backend URL.
// In development, Vite proxy forwards /api → localhost:5000.
const BACKEND_URL = import.meta.env.VITE_API_URL || "";
const API_BASE = `${BACKEND_URL}/api/v1/proposals`;

/**
 * API service for the B2B Proposal Generator frontend.
 * All calls return the standard { ok, data, error? } envelope.
 */

export async function generateProposal({
  client_name,
  budget_limit,
  category_focus,
  sustainability_priority,
}) {
  const res = await axios.post(`${API_BASE}/generate`, {
    client_name,
    budget_limit: Number(budget_limit),
    preferences: {
      category_focus,
      sustainability_priority,
    },
  });
  return res.data;
}

export async function healthCheck() {
  const res = await axios.get(`${API_BASE}/health`);
  return res.data;
}

import axios from "axios";

const API_BASE = "/api/v1/proposals";

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

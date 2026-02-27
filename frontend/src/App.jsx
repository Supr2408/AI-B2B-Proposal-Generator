import React, { useState } from "react";
import ProposalForm from "./components/ProposalForm";
import ProposalDashboard from "./components/ProposalDashboard";
import { generateProposal } from "./api";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [proposal, setProposal] = useState(null);

  async function handleSubmit(formData) {
    setLoading(true);
    setError(null);
    setProposal(null);
    try {
      const res = await generateProposal(formData);
      if (res.ok) {
        setProposal(res.data);
      } else {
        setError(res.error || "Unknown error from server");
      }
    } catch (err) {
      const serverErr = err.response?.data?.error;
      const retryAfterMs = err.response?.data?.data?.retry_after_ms;
      if (err.response?.status === 429 && retryAfterMs) {
        const retrySeconds = Math.ceil(retryAfterMs / 1000);
        setError(`${serverErr || "Rate limit reached"}. Please retry in ${retrySeconds}s.`);
      } else {
        setError(serverErr || err.message || "Network error");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>🌿 AI B2B Proposal Generator</h1>
        <p style={styles.subtitle}>
          Sustainable Commerce Platform — Module 2
        </p>
      </header>

      <main style={styles.main}>
        <ProposalForm onSubmit={handleSubmit} loading={loading} />

        {error && (
          <div style={styles.error}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {loading && (
          <div style={styles.loading}>
            <div style={styles.spinner} />
            <p>Generating your sustainable proposal...</p>
          </div>
        )}

        {proposal && <ProposalDashboard data={proposal} />}
      </main>

      <footer style={styles.footer}>
        Module 2 — AI B2B Proposal Generator • Strict Compliance Grade
      </footer>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--brand-light, #F5F9F7)",
    fontFamily: "'Inter', sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    background: "var(--brand-primary, #1F7A5C)",
    padding: "32px 24px",
    textAlign: "center",
  },
  title: {
    margin: 0,
    fontSize: 28,
    color: "#fff",
    fontWeight: 700,
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#d4f0e7",
    fontSize: 15,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 24,
    padding: "32px 24px",
  },
  error: {
    background: "#fdecea",
    color: "#c0392b",
    padding: "14px 20px",
    borderRadius: "var(--radius, 12px)",
    maxWidth: 520,
    width: "100%",
    fontSize: 14,
    border: "1px solid #e74c3c33",
  },
  loading: {
    textAlign: "center",
    color: "var(--text-secondary, #555)",
    fontSize: 15,
    padding: 24,
  },
  spinner: {
    width: 36,
    height: 36,
    border: "4px solid var(--border-light, #E0E8E4)",
    borderTop: "4px solid var(--brand-accent, #2BB673)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "0 auto 12px",
  },
  footer: {
    textAlign: "center",
    padding: 16,
    fontSize: 13,
    color: "#aaa",
    borderTop: "1px solid var(--border-light, #E0E8E4)",
  },
};

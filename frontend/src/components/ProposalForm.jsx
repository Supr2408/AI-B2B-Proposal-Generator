import React, { useState } from "react";

const CATEGORIES = [
  "Bags",
  "Drinkware",
  "Stationery",
  "Apparel",
  "Electronics",
  "Kitchen",
];

const PRIORITIES = [
  { value: "", label: "— Select priority —" },
  { value: "maximum_plastic_reduction", label: "Maximum Plastic Reduction" },
  { value: "carbon_neutral", label: "Carbon Neutral Focus" },
  { value: "cost_effective_green", label: "Cost-Effective Green" },
  { value: "premium_sustainability", label: "Premium Sustainability" },
  { value: "balanced", label: "Balanced Approach" },
];

export default function ProposalForm({ onSubmit, loading }) {
  const [clientName, setClientName] = useState("");
  const [budget, setBudget] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [priority, setPriority] = useState("");

  function toggleCategory(cat) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!budget || Number(budget) <= 0) return;
    onSubmit({
      client_name: clientName,
      budget_limit: Number(budget),
      category_focus: selectedCategories,
      sustainability_priority: priority,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h2 style={styles.heading}>Generate B2B Proposal</h2>

      {/* Client Name */}
      <div style={styles.field}>
        <label style={styles.label}>Client Name</label>
        <input
          style={styles.input}
          type="text"
          placeholder="e.g. Acme Corp"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
        />
      </div>

      {/* Budget */}
      <div style={styles.field}>
        <label style={styles.label}>
          Budget Limit (₹) <span style={{ color: "#e74c3c" }}>*</span>
        </label>
        <input
          style={styles.input}
          type="number"
          min="1"
          step="0.01"
          placeholder="e.g. 5000"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          required
        />
      </div>

      {/* Category Focus (multi-select checkboxes) */}
      <div style={styles.field}>
        <label style={styles.label}>Category Focus</label>
        <div style={styles.checkboxGroup}>
          {CATEGORIES.map((cat) => (
            <label key={cat} style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={selectedCategories.includes(cat)}
                onChange={() => toggleCategory(cat)}
              />
              <span style={{ marginLeft: 6 }}>{cat}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Sustainability Priority */}
      <div style={styles.field}>
        <label style={styles.label}>Sustainability Priority</label>
        <select
          style={styles.select}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Submit */}
      <button
        type="submit"
        style={{
          ...styles.button,
          opacity: loading ? 0.6 : 1,
          cursor: loading ? "not-allowed" : "pointer",
        }}
        disabled={loading}
      >
        {loading ? "Generating Proposal..." : "Generate Proposal"}
      </button>
    </form>
  );
}

const styles = {
  form: {
    background: "#fff",
    borderRadius: 12,
    padding: 32,
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    maxWidth: 520,
    width: "100%",
  },
  heading: {
    margin: "0 0 24px",
    fontSize: 22,
    fontWeight: 700,
    color: "#1a1a2e",
  },
  field: {
    marginBottom: 20,
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontWeight: 600,
    fontSize: 14,
    color: "#333",
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 15,
    boxSizing: "border-box",
    outline: "none",
    transition: "border 0.2s",
  },
  select: {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 15,
    boxSizing: "border-box",
    outline: "none",
    background: "#fff",
  },
  checkboxGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    fontSize: 14,
    cursor: "pointer",
  },
  button: {
    width: "100%",
    padding: "12px 0",
    background: "linear-gradient(135deg, #2ecc71, #27ae60)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    marginTop: 8,
    transition: "opacity 0.2s",
  },
};

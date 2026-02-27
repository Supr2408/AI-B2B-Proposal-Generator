import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const COLORS = [
  "#2ecc71", "#3498db", "#e74c3c", "#f39c12",
  "#9b59b6", "#1abc9c", "#e67e22", "#2c3e50",
  "#d35400", "#16a085", "#8e44ad", "#c0392b",
];

export default function ProposalDashboard({ data }) {
  if (!data) return null;

  const {
    proposal_summary,
    total_budget_limit,
    allocated_budget,
    remaining_budget,
    products,
    impact_summary,
    confidence_score,
    computed_impact,
  } = data;

  const budgetPercent = Math.round((allocated_budget / total_budget_limit) * 100);

  // Pie chart data
  const pieData = products.map((p) => ({
    name: p.name,
    value: p.total_cost,
  }));

  return (
    <div style={styles.container}>
      {/* Summary */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Proposal Summary</h3>
        <p style={styles.text}>{proposal_summary}</p>
        <p style={styles.confidence}>
          Confidence: <strong>{(confidence_score * 100).toFixed(0)}%</strong>
        </p>
      </div>

      {/* Budget Progress */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Budget Allocation</h3>
        <div style={styles.budgetRow}>
          <span>Allocated: <strong>₹{allocated_budget.toLocaleString('en-IN')}</strong></span>
          <span>Remaining: <strong>₹{remaining_budget.toLocaleString('en-IN')}</strong></span>
          <span>Total: <strong>₹{total_budget_limit.toLocaleString('en-IN')}</strong></span>
        </div>
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressBar,
              width: `${Math.min(budgetPercent, 100)}%`,
              background:
                budgetPercent > 90
                  ? "#e74c3c"
                  : budgetPercent > 70
                  ? "#f39c12"
                  : "#2ecc71",
            }}
          />
        </div>
        <p style={styles.progressLabel}>{budgetPercent}% used</p>
      </div>

      {/* Product Table */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Recommended Products</h3>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Product</th>
                <th style={styles.th}>Unit Price</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={i} style={i % 2 === 0 ? styles.trEven : {}}>
                  <td style={styles.td}>{p.name}</td>
                  <td style={styles.td}>₹{p.unit_price.toLocaleString('en-IN')}</td>
                  <td style={styles.td}>{p.quantity}</td>
                  <td style={styles.td}>₹{p.total_cost.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pie Chart */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Allocation Breakdown</h3>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={110}
              label={({ name, percent }) =>
                `${name} (${(percent * 100).toFixed(0)}%)`
              }
            >
              {pieData.map((_entry, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Impact Cards */}
      <div style={styles.impactRow}>
        <div style={{ ...styles.impactCard, borderTop: "4px solid #2ecc71" }}>
          <p style={styles.impactLabel}>Total Plastic Saved</p>
          <p style={styles.impactValue}>
            {computed_impact.total_plastic_saved.toFixed(2)} kg
          </p>
        </div>
        <div style={{ ...styles.impactCard, borderTop: "4px solid #3498db" }}>
          <p style={styles.impactLabel}>Total Carbon Avoided</p>
          <p style={styles.impactValue}>
            {computed_impact.total_carbon_avoided.toFixed(2)} kg CO₂
          </p>
        </div>
      </div>

      {/* Impact Summary */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Impact Positioning</h3>
        <p style={styles.text}>{impact_summary}</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 780,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 24,
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  cardTitle: {
    margin: "0 0 12px",
    fontSize: 18,
    fontWeight: 700,
    color: "#1a1a2e",
  },
  text: {
    fontSize: 15,
    lineHeight: 1.6,
    color: "#444",
    margin: 0,
  },
  confidence: {
    marginTop: 10,
    fontSize: 14,
    color: "#666",
  },
  budgetRow: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    fontSize: 14,
    color: "#555",
    marginBottom: 10,
  },
  progressTrack: {
    width: "100%",
    height: 14,
    background: "#ecf0f1",
    borderRadius: 7,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 7,
    transition: "width 0.5s ease",
  },
  progressLabel: {
    fontSize: 13,
    color: "#888",
    marginTop: 4,
    textAlign: "right",
  },
  tableWrapper: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "2px solid #ecf0f1",
    fontWeight: 600,
    color: "#333",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #f0f0f0",
    color: "#444",
  },
  trEven: {
    background: "#f9fafb",
  },
  impactRow: {
    display: "flex",
    gap: 20,
    flexWrap: "wrap",
  },
  impactCard: {
    flex: 1,
    minWidth: 200,
    background: "#fff",
    borderRadius: 12,
    padding: 24,
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    textAlign: "center",
  },
  impactLabel: {
    fontSize: 14,
    color: "#888",
    margin: "0 0 8px",
    fontWeight: 500,
  },
  impactValue: {
    fontSize: 28,
    fontWeight: 700,
    color: "#1a1a2e",
    margin: 0,
  },
};

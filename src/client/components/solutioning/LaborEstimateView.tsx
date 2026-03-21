import { useState } from "react";
import { api, type LaborEstimate } from "../../lib/api";

const WORKSTREAM_LABELS: Record<string, string> = {
  discovery_requirements: "Discovery & Requirements",
  solution_design: "Solution Design",
  project_management: "Project Management",
  implementation_configuration: "Implementation & Configuration",
  integration: "Integration",
  migration_data_porting: "Migration & Data Porting",
  testing_uat: "Testing & UAT",
  training_enablement: "Training & Enablement",
  documentation_handover: "Documentation & Handover",
  hypercare: "Hypercare",
};

const WORKSTREAMS = Object.keys(WORKSTREAM_LABELS);

const COMPLEXITY_COLOR: Record<string, string> = {
  low: "#107c10",
  medium: "#ff8c00",
  high: "#d13438",
};

const CONFIDENCE_COLOR: Record<string, string> = {
  low: "#d13438",
  medium: "#ff8c00",
  high: "#107c10",
};

type Props = {
  solutionId: string;
  estimate: LaborEstimate | null;
  hasAssessment: boolean;
  canEdit: boolean;
  onEstimateChange: (estimate: LaborEstimate | null) => void;
};

export default function LaborEstimateView({ solutionId, estimate, hasAssessment, canEdit, onEstimateChange }: Props) {
  const [overrides, setOverrides] = useState<Record<string, string>>(
    estimate ? Object.fromEntries(Object.entries(estimate.overrides).map(([k, v]) => [k, String(v)])) : {}
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDrivers, setShowDrivers] = useState(false);

  async function generate(keepOverrides = false) {
    setSaving(true);
    try {
      const parsed: Record<string, number> = {};
      if (keepOverrides) {
        for (const [ws, val] of Object.entries(overrides)) {
          const n = parseInt(val);
          if (!isNaN(n) && n >= 0) parsed[ws] = n;
        }
      }
      const result = await api.upsertLaborEstimate(solutionId, { overrides: parsed });
      onEstimateChange(result);
      setOverrides(Object.fromEntries(Object.entries(result.overrides).map(([k, v]) => [k, String(v)])));
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function saveOverrides() {
    setSaving(true);
    try {
      const parsed: Record<string, number> = {};
      for (const [ws, val] of Object.entries(overrides)) {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 0) parsed[ws] = n;
      }
      const result = await api.upsertLaborEstimate(solutionId, { overrides: parsed });
      onEstimateChange(result);
      setOverrides(Object.fromEntries(Object.entries(result.overrides).map(([k, v]) => [k, String(v)])));
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this labor estimate?")) return;
    setDeleting(true);
    try {
      await api.deleteLaborEstimate(solutionId);
      onEstimateChange(null);
      setOverrides({});
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  // No estimate yet
  if (!estimate) {
    return (
      <div className="ms-card" style={{ textAlign: "center", padding: 48 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>No Labor Estimate Yet</h3>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px", maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
          {hasAssessment
            ? "Generate a labor estimate based on the completed needs assessment."
            : "Complete the needs assessment first to get a more accurate estimate, or generate a baseline estimate from scratch."}
        </p>
        {canEdit && (
          <button className="ms-btn-primary" onClick={() => generate()} disabled={saving}>
            {saving ? "Generating…" : "Generate Estimate"}
          </button>
        )}
      </div>
    );
  }

  const complexityColor = COMPLEXITY_COLOR[estimate.complexity.band] ?? "#64748b";
  const confidenceColor = CONFIDENCE_COLOR[estimate.confidence_band] ?? "#64748b";

  // Compute driver adjustments per workstream (for display in table)
  const wsDriverTotal: Record<string, number> = {};
  for (const ws of WORKSTREAMS) wsDriverTotal[ws] = 0;
  for (const adj of estimate.driver_adjustments) {
    const perWs = adj.hoursAdded / adj.workstreams.length;
    for (const ws of adj.workstreams) {
      wsDriverTotal[ws] = (wsDriverTotal[ws] || 0) + perWs;
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>

      {/* ── Summary header ── */}
      <div className="ms-card" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f0f9ff 100%)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b", marginBottom: 8 }}>
              Estimated Professional Services Hours
            </div>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
              {(["low", "expected", "high"] as const).map((band) => {
                const val = band === "low" ? estimate.total_low : band === "expected" ? estimate.total_expected : estimate.total_high;
                return (
                  <div key={band}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{band}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: band === "expected" ? "#03395f" : "#475569", lineHeight: 1 }}>{val}h</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ padding: "8px 14px", borderRadius: 8, background: `${complexityColor}15`, border: `1px solid ${complexityColor}40` }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: complexityColor, marginBottom: 2 }}>Complexity</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: complexityColor, textTransform: "capitalize" }}>
                {estimate.complexity.band} <span style={{ fontSize: 11, fontWeight: 400 }}>({estimate.complexity.score}/100 · ×{estimate.complexity.multiplier})</span>
              </div>
            </div>
            <div style={{ padding: "8px 14px", borderRadius: 8, background: `${confidenceColor}15`, border: `1px solid ${confidenceColor}40` }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: confidenceColor, marginBottom: 2 }}>Confidence</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: confidenceColor, textTransform: "capitalize" }}>
                {estimate.confidence_band} <span style={{ fontSize: 11, fontWeight: 400 }}>({estimate.confidence_score}%)</span>
              </div>
            </div>
          </div>
        </div>

        {estimate.risk_flags.length > 0 && (
          <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 14, display: "grid", gap: 6 }}>
            {estimate.risk_flags.map((flag, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#92400e" }}>
                <span style={{ color: "#f59e0b", marginTop: 1, flexShrink: 0 }}>⚠</span>
                {flag}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Workstream table ── */}
      <div className="ms-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Workstream Breakdown</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: "10px 20px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>Workstream</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>Base</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>+Drivers</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>Computed</th>
                {canEdit && <th style={{ textAlign: "right", padding: "10px 20px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>Override</th>}
                <th style={{ textAlign: "right", padding: "10px 20px", fontWeight: 600, color: "#0b9aad", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>Final</th>
              </tr>
            </thead>
            <tbody>
              {WORKSTREAMS.map((ws, i) => {
                const base = estimate.base_hours[ws] ?? 0;
                const driverAdj = Math.round(wsDriverTotal[ws] ?? 0);
                const computed = estimate.pre_override_hours[ws] ?? 0;
                const final = estimate.final_hours[ws] ?? 0;
                const hasOverride = estimate.overrides[ws] !== undefined;

                return (
                  <tr key={ws} style={{ borderBottom: i < WORKSTREAMS.length - 1 ? "1px solid #f8fafc" : "none" }}>
                    <td style={{ padding: "12px 20px", color: "#334155", fontWeight: 500 }}>{WORKSTREAM_LABELS[ws]}</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", color: "#94a3b8" }}>{base}h</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", color: driverAdj > 0 ? "#0891b2" : "#94a3b8" }}>
                      {driverAdj > 0 ? `+${driverAdj}h` : "—"}
                    </td>
                    <td style={{ padding: "12px 12px", textAlign: "right", color: hasOverride ? "#94a3b8" : "#475569", textDecoration: hasOverride ? "line-through" : "none" }}>{computed}h</td>
                    {canEdit && (
                      <td style={{ padding: "8px 20px 8px 12px", textAlign: "right" }}>
                        <input
                          type="number"
                          min={0}
                          placeholder="—"
                          value={overrides[ws] ?? ""}
                          onChange={(e) => setOverrides((prev) => {
                            const next = { ...prev };
                            if (e.target.value === "") {
                              delete next[ws];
                            } else {
                              next[ws] = e.target.value;
                            }
                            return next;
                          })}
                          style={{ width: 64, textAlign: "right", padding: "4px 6px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, color: "#334155" }}
                        />
                      </td>
                    )}
                    <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, color: hasOverride ? "#0891b2" : "#1e293b" }}>{final}h</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                <td style={{ padding: "12px 20px", fontWeight: 700, color: "#1e293b" }}>Total</td>
                <td style={{ padding: "12px 12px", textAlign: "right", color: "#94a3b8", fontWeight: 600 }}>
                  {Object.values(estimate.base_hours).reduce((a, b) => a + b, 0)}h
                </td>
                <td style={{ padding: "12px 12px", textAlign: "right", color: "#0891b2", fontWeight: 600 }}>
                  {(() => { const t = Object.values(wsDriverTotal).reduce((a, b) => a + b, 0); return t > 0 ? `+${Math.round(t)}h` : "—"; })()}
                </td>
                <td style={{ padding: "12px 12px", textAlign: "right", color: "#475569", fontWeight: 600 }}>
                  {Object.values(estimate.pre_override_hours).reduce((a, b) => a + b, 0)}h
                </td>
                {canEdit && <td />}
                <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 800, color: "#03395f", fontSize: 15 }}>
                  {estimate.total_expected}h
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Driver adjustments (collapsible) ── */}
      {estimate.driver_adjustments.length > 0 && (
        <div className="ms-card">
          <button
            type="button"
            onClick={() => setShowDrivers((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: 0 }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Driver Adjustments ({estimate.driver_adjustments.length})
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{showDrivers ? "▲ Hide" : "▼ Show"}</span>
          </button>
          {showDrivers && (
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              {estimate.driver_adjustments.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9", fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: "#0891b2", minWidth: 40 }}>+{d.hoursAdded}h</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "#334155", marginBottom: 2 }}>{d.driverId.replace(/_/g, " ")}</div>
                    <div style={{ color: "#94a3b8" }}>{d.field} · {d.reason} · affects: {d.workstreams.join(", ")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      {canEdit && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ms-btn-primary" onClick={() => generate(true)} disabled={saving}>
              {saving ? "Working…" : "↺ Recalculate from Assessment"}
            </button>
            {Object.keys(overrides).some((k) => overrides[k] !== "") && (
              <button className="ms-btn-secondary" onClick={saveOverrides} disabled={saving}>
                Save Overrides
              </button>
            )}
            <button
              type="button"
              className="ms-btn-secondary"
              onClick={() => { setOverrides({}); }}
              style={{ color: "#94a3b8" }}
              title="Clear all overrides"
            >
              Clear Overrides
            </button>
          </div>
          <button
            type="button"
            className="ms-btn-ghost"
            onClick={handleDelete}
            disabled={deleting}
            style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.3)" }}
          >
            {deleting ? "Deleting…" : "Delete Estimate"}
          </button>
        </div>
      )}
    </div>
  );
}

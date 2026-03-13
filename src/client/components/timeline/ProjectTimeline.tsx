import { useState } from "react";
import type { Milestone, Phase } from "../../lib/api";

type PhaseUpdate = {
  status?: "not_started" | "in_progress" | "completed";
  planned_start?: string | null;
  planned_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
};

type Props = {
  phases: Phase[];
  milestones: Milestone[];
  onUpdatePhase: (phaseId: string, updates: PhaseUpdate) => Promise<void>;
};

// ── Gantt helpers ─────────────────────────────────────────────────────────────

function parseDate(s: string | null): number | null {
  if (!s) return null;
  const ms = new Date(s).getTime();
  return isNaN(ms) ? null : ms;
}

function getMonthsBetween(minMs: number, maxMs: number) {
  const months: { label: string; ms: number }[] = [];
  const d = new Date(minMs);
  d.setDate(1);
  while (d.getTime() <= maxMs) {
    months.push({
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      ms: d.getTime(),
    });
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

function pct(ms: number, minMs: number, totalMs: number) {
  return ((ms - minMs) / totalMs) * 100;
}

// ── Phase status colors ───────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  not_started: "#475569",
  in_progress: "#2563eb",
  completed:   "#22c55e",
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed:   "Completed",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectTimeline({ phases, milestones, onUpdatePhase }: Props) {
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [phaseForm, setPhaseForm] = useState<PhaseUpdate & { _id: string }>({ _id: "" });
  const [saving, setSaving] = useState(false);

  // ── Gantt date range ────────────────────────────────────────────────────────

  const datedPhases = phases.filter((p) => p.planned_start && p.planned_end);

  let ganttContent: React.ReactNode = null;

  if (datedPhases.length > 0) {
    const allMs = datedPhases.flatMap((p) => [
      parseDate(p.planned_start)!,
      parseDate(p.planned_end)!,
    ]);
    // Include milestone dates in range
    milestones.forEach((m) => {
      const ms = parseDate(m.target_date);
      if (ms) allMs.push(ms);
    });

    const rawMin = Math.min(...allMs);
    const rawMax = Math.max(...allMs);
    const pad = Math.max((rawMax - rawMin) * 0.03, 3 * 24 * 60 * 60 * 1000);
    const minMs = rawMin - pad;
    const maxMs = rawMax + pad;
    const totalMs = maxMs - minMs;

    const months = getMonthsBetween(minMs, maxMs);
    const LABEL_W = 180;

    ganttContent = (
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#c8d4ff", marginBottom: 10 }}>
          Schedule
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 600 }}>
            {/* Month headers */}
            <div style={{ display: "flex", marginBottom: 6, paddingLeft: LABEL_W }}>
              <div style={{ position: "relative", flex: 1, height: 20 }}>
                {months.map((m) => (
                  <span
                    key={m.ms}
                    style={{
                      position: "absolute",
                      left: `${pct(m.ms, minMs, totalMs)}%`,
                      fontSize: 11,
                      color: "#9fb0d9",
                      whiteSpace: "nowrap",
                      transform: "translateX(-50%)",
                    }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Phase rows */}
            {phases.map((phase) => {
              const pStart = parseDate(phase.planned_start);
              const pEnd = parseDate(phase.planned_end);
              const aStart = parseDate(phase.actual_start);
              const aEnd = parseDate(phase.actual_end);
              const hasPlan = pStart !== null && pEnd !== null;
              const hasActual = aStart !== null && aEnd !== null;

              return (
                <div
                  key={phase.id}
                  style={{ display: "flex", alignItems: "center", marginBottom: 8, minHeight: 28 }}
                >
                  {/* Label */}
                  <div
                    style={{
                      width: LABEL_W,
                      flexShrink: 0,
                      fontSize: 12,
                      color: "#eef3ff",
                      paddingRight: 10,
                      textAlign: "right",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {phase.name}
                  </div>

                  {/* Bar area */}
                  <div style={{ flex: 1, position: "relative", height: hasActual ? 22 : 14 }}>
                    {hasPlan && (
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: `${pct(pStart!, minMs, totalMs)}%`,
                          width: `${pct(pEnd!, minMs, totalMs) - pct(pStart!, minMs, totalMs)}%`,
                          height: 14,
                          borderRadius: 999,
                          background: STATUS_COLOR[phase.status ?? "not_started"] ?? STATUS_COLOR.not_started,
                          opacity: 0.85,
                          minWidth: 4,
                        }}
                        title={`Planned: ${phase.planned_start} → ${phase.planned_end}`}
                      />
                    )}
                    {hasActual && (
                      <div
                        style={{
                          position: "absolute",
                          top: 16,
                          left: `${pct(aStart!, minMs, totalMs)}%`,
                          width: `${pct(aEnd!, minMs, totalMs) - pct(aStart!, minMs, totalMs)}%`,
                          height: 6,
                          borderRadius: 999,
                          background: "#43d17a",
                          opacity: 0.7,
                          minWidth: 4,
                        }}
                        title={`Actual: ${phase.actual_start} → ${phase.actual_end}`}
                      />
                    )}
                    {!hasPlan && (
                      <div style={{ fontSize: 11, color: "#64748b", lineHeight: "14px" }}>No dates set</div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Milestone markers */}
            <div style={{ display: "flex", marginTop: 8 }}>
              <div style={{ width: LABEL_W, flexShrink: 0 }} />
              <div style={{ flex: 1, position: "relative", height: 24 }}>
                {milestones.map((ms) => {
                  const msMs = parseDate(ms.target_date);
                  if (!msMs) return null;
                  return (
                    <div
                      key={ms.id}
                      style={{
                        position: "absolute",
                        left: `${pct(msMs, minMs, totalMs)}%`,
                        transform: "translateX(-50%)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                      title={`${ms.name}: ${ms.target_date}`}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          background: ms.status === "completed" ? "#43d17a" : "#f59e0b",
                          transform: "rotate(45deg)",
                          borderRadius: 2,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, marginTop: 12, paddingLeft: LABEL_W, fontSize: 11, color: "#9fb0d9" }}>
              <span>▬ Planned</span>
              <span style={{ color: "#43d17a" }}>▬ Actual</span>
              <span style={{ color: "#f59e0b" }}>◆ Milestone</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase editing ─────────────────────────────────────────────────────────

  function startEdit(phase: Phase) {
    setEditingPhaseId(phase.id);
    setPhaseForm({
      _id: phase.id,
      status: (phase.status as PhaseUpdate["status"]) ?? "not_started",
      planned_start: phase.planned_start ?? "",
      planned_end: phase.planned_end ?? "",
      actual_start: phase.actual_start ?? "",
      actual_end: phase.actual_end ?? "",
    });
  }

  async function handleSave(phase: Phase) {
    setSaving(true);
    try {
      await onUpdatePhase(phase.id, {
        status: phaseForm.status,
        planned_start: phaseForm.planned_start || null,
        planned_end: phaseForm.planned_end || null,
        actual_start: phaseForm.actual_start || null,
        actual_end: phaseForm.actual_end || null,
      });
      setEditingPhaseId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {ganttContent}

      <div style={{ fontSize: 13, fontWeight: 700, color: "#c8d4ff", marginBottom: 10 }}>
        Phase Details
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {phases.map((phase) => {
          const phaseMilestones = milestones.filter((m) => m.phase_id === phase.id);
          const isEditing = editingPhaseId === phase.id;

          return (
            <div
              key={phase.id}
              style={{
                background: "#182247",
                borderRadius: 12,
                padding: 16,
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {isEditing ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ fontWeight: 700, color: "#eef3ff" }}>{phase.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={labelStyle}>Status</span>
                      <select
                        value={phaseForm.status ?? ""}
                        onChange={(e) => setPhaseForm({ ...phaseForm, status: e.target.value as PhaseUpdate["status"] })}
                        style={inputStyle}
                      >
                        <option value="not_started">Not Started</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={labelStyle}>Planned Start</span>
                      <input type="date" value={phaseForm.planned_start ?? ""} onChange={(e) => setPhaseForm({ ...phaseForm, planned_start: e.target.value })} style={inputStyle} />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={labelStyle}>Planned End</span>
                      <input type="date" value={phaseForm.planned_end ?? ""} onChange={(e) => setPhaseForm({ ...phaseForm, planned_end: e.target.value })} style={inputStyle} />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={labelStyle}>Actual Start</span>
                      <input type="date" value={phaseForm.actual_start ?? ""} onChange={(e) => setPhaseForm({ ...phaseForm, actual_start: e.target.value })} style={inputStyle} />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={labelStyle}>Actual End</span>
                      <input type="date" value={phaseForm.actual_end ?? ""} onChange={(e) => setPhaseForm({ ...phaseForm, actual_end: e.target.value })} style={inputStyle} />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleSave(phase)} disabled={saving} style={saveBtnStyle}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditingPhaseId(null)} style={cancelBtnStyle}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, color: "#eef3ff" }}>{phase.name}</div>
                      <StatusBadge status={phase.status} />
                    </div>
                    <div style={{ fontSize: 12, color: "#9fb0d9" }}>
                      Planned: {phase.planned_start ?? "—"} → {phase.planned_end ?? "—"}
                      {(phase.actual_start || phase.actual_end) && (
                        <span style={{ marginLeft: 12, color: "#43d17a" }}>
                          Actual: {phase.actual_start ?? "—"} → {phase.actual_end ?? "—"}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 8, maxWidth: 300 }}>
                      <div style={{ width: progressWidth(phase.status), height: "100%", background: STATUS_COLOR[phase.status ?? "not_started"] ?? STATUS_COLOR.not_started }} />
                    </div>

                    {phaseMilestones.length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {phaseMilestones.map((ms) => (
                          <span
                            key={ms.id}
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: "rgba(245,158,11,0.12)",
                              color: "#f59e0b",
                              border: "1px solid rgba(245,158,11,0.25)",
                            }}
                          >
                            ◆ {ms.name} {ms.target_date ? `(${ms.target_date})` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => startEdit(phase)} style={editBtnStyle}>Edit</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const color = STATUS_COLOR[status ?? "not_started"] ?? "#475569";
  const label = STATUS_LABEL[status ?? "not_started"] ?? status ?? "Unknown";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: `${color}28`, color, border: `1px solid ${color}44` }}>
      {label}
    </span>
  );
}

function progressWidth(status: string | null) {
  switch (status) {
    case "completed":   return "100%";
    case "in_progress": return "55%";
    default:            return "5%";
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0f1a35",
  color: "#eef3ff",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#9fb0d9",
  fontWeight: 600,
};

const saveBtnStyle: React.CSSProperties = {
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "7px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

const cancelBtnStyle: React.CSSProperties = {
  background: "#334155",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "7px 14px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
};

const editBtnStyle: React.CSSProperties = {
  background: "#1e3a5f",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "5px 12px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 12,
  flexShrink: 0,
};

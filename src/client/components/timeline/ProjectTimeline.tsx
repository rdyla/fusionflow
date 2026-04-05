import { useState } from "react";
import type { Milestone, Phase, ZoomRecording } from "../../lib/api";

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
  recordings?: ZoomRecording[];
  onUpdatePhase: (phaseId: string, updates: PhaseUpdate) => Promise<void>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function progressWidth(status: string | null) {
  switch (status) {
    case "completed":   return "100%";
    case "in_progress": return "55%";
    default:            return "5%";
  }
}

// ── Status colors ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  not_started: "#94a3b8",
  in_progress: "#0891b2",
  completed:   "#059669",
};


const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed:   "Completed",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectTimeline({ phases, milestones, recordings = [], onUpdatePhase }: Props) {
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [phaseForm, setPhaseForm] = useState<PhaseUpdate & { _id: string }>({ _id: "" });
  const [saving, setSaving] = useState(false);

  // ── Gantt ──────────────────────────────────────────────────────────────────

  const datedPhases = phases.filter((p) => p.planned_start && p.planned_end);
  let ganttContent: React.ReactNode = null;

  if (datedPhases.length > 0) {
    const allMs = datedPhases.flatMap((p) => [parseDate(p.planned_start)!, parseDate(p.planned_end)!]);
    milestones.forEach((m) => { const ms = parseDate(m.target_date); if (ms) allMs.push(ms); });
    recordings.forEach((r) => { const ms = parseDate(r.start_time.slice(0, 10)); if (ms) allMs.push(ms); });

    const rawMin = Math.min(...allMs);
    const rawMax = Math.max(...allMs);
    const pad = Math.max((rawMax - rawMin) * 0.03, 3 * 24 * 60 * 60 * 1000);
    const minMs = rawMin - pad;
    const maxMs = rawMax + pad;
    const totalMs = maxMs - minMs;

    const months = getMonthsBetween(minMs, maxMs);
    const LABEL_W = 180;

    ganttContent = (
      <div className="ms-section-card" style={{ marginBottom: 20 }}>
        <div className="ms-section-title">Schedule</div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 600 }}>
            {/* Month headers */}
            <div style={{ display: "flex", marginBottom: 8, paddingLeft: LABEL_W }}>
              <div style={{ position: "relative", flex: 1, height: 20 }}>
                {months.map((m) => (
                  <span
                    key={m.ms}
                    style={{
                      position: "absolute",
                      left: `${pct(m.ms, minMs, totalMs)}%`,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#64748b",
                      whiteSpace: "nowrap",
                      transform: "translateX(-50%)",
                    }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Grid line track */}
            <div style={{ display: "flex", marginBottom: 2, paddingLeft: LABEL_W }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
            </div>

            {/* Phase rows */}
            {phases.map((phase) => {
              const pStart = parseDate(phase.planned_start);
              const pEnd   = parseDate(phase.planned_end);
              const aStart = parseDate(phase.actual_start);
              const aEnd   = parseDate(phase.actual_end);
              const hasPlan   = pStart !== null && pEnd !== null;
              const hasActual = aStart !== null && aEnd !== null;
              const color = STATUS_COLOR[phase.status ?? "not_started"] ?? STATUS_COLOR.not_started;

              return (
                <div key={phase.id} style={{ display: "flex", alignItems: "center", marginBottom: 6, minHeight: 28 }}>
                  {/* Label */}
                  <div style={{ width: LABEL_W, flexShrink: 0, fontSize: 12, fontWeight: 500, color: "#475569", paddingRight: 12, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {phase.name}
                  </div>

                  {/* Bar area */}
                  <div style={{ flex: 1, position: "relative", height: hasActual ? 26 : 16 }}>
                    {hasPlan && (
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: `${pct(pStart!, minMs, totalMs)}%`,
                          width: `${pct(pEnd!, minMs, totalMs) - pct(pStart!, minMs, totalMs)}%`,
                          height: 16,
                          borderRadius: 3,
                          background: color,
                          opacity: 0.85,
                          minWidth: 4,
                          display: "flex",
                          alignItems: "center",
                          paddingLeft: 6,
                          overflow: "hidden",
                        }}
                        title={`Planned: ${phase.planned_start} → ${phase.planned_end}`}
                      >
                        <span style={{ fontSize: 10, color: "#fff", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {phase.name}
                        </span>
                      </div>
                    )}
                    {hasActual && (
                      <div
                        style={{
                          position: "absolute",
                          top: 20,
                          left: `${pct(aStart!, minMs, totalMs)}%`,
                          width: `${pct(aEnd!, minMs, totalMs) - pct(aStart!, minMs, totalMs)}%`,
                          height: 6,
                          borderRadius: 3,
                          background: "#107c10",
                          opacity: 0.75,
                          minWidth: 4,
                        }}
                        title={`Actual: ${phase.actual_start} → ${phase.actual_end}`}
                      />
                    )}
                    {!hasPlan && (
                      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: "16px" }}>No dates set</div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Recording markers */}
            {recordings.length > 0 && (
              <>
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "6px 0 6px", marginLeft: LABEL_W }} />
                {recordings.map((r) => {
                  const rMs = parseDate(r.start_time.slice(0, 10));
                  if (!rMs) return null;
                  const label = r.task_name ?? r.phase_name ?? "";
                  return (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", marginBottom: 4, minHeight: 18 }}>
                      <div style={{ width: LABEL_W, flexShrink: 0, fontSize: 11, color: "#7c3aed", paddingRight: 12, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={r.topic}>
                        {r.topic}
                      </div>
                      <div style={{ flex: 1, position: "relative", height: 18 }}>
                        <div
                          style={{ position: "absolute", left: `${pct(rMs, minMs, totalMs)}%`, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
                          title={`${r.topic}${label ? ` · ${label}` : ""} (${r.start_time.slice(0, 10)})`}
                        >
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed", border: "2px solid rgba(124,58,237,0.3)" }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Milestone markers */}
            <div style={{ display: "flex", marginTop: 6, paddingLeft: LABEL_W }}>
              <div style={{ flex: 1, position: "relative", height: 20 }}>
                {milestones.map((ms) => {
                  const msMs = parseDate(ms.target_date);
                  if (!msMs) return null;
                  return (
                    <div
                      key={ms.id}
                      style={{ position: "absolute", left: `${pct(msMs, minMs, totalMs)}%`, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}
                      title={`${ms.name}: ${ms.target_date}`}
                    >
                      <div style={{ width: 10, height: 10, background: ms.status === "completed" ? "#107c10" : "#ff8c00", transform: "rotate(45deg)", borderRadius: 2 }} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 20, marginTop: 10, paddingLeft: LABEL_W, fontSize: 11, color: "#64748b" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 16, height: 4, background: "#0078d4", borderRadius: 2, display: "inline-block" }} />
                Planned
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 16, height: 4, background: "#107c10", borderRadius: 2, display: "inline-block" }} />
                Actual
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, background: "#ff8c00", transform: "rotate(45deg)", display: "inline-block", borderRadius: 1 }} />
                Milestone
              </span>
              {recordings.length > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed", display: "inline-block" }} />
                  Recording
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase editing ──────────────────────────────────────────────────────────

  function startEdit(phase: Phase) {
    setEditingPhaseId(phase.id);
    setPhaseForm({
      _id: phase.id,
      status: (phase.status as PhaseUpdate["status"]) ?? "not_started",
      planned_start: phase.planned_start ?? "",
      planned_end:   phase.planned_end ?? "",
      actual_start:  phase.actual_start ?? "",
      actual_end:    phase.actual_end ?? "",
    });
  }

  async function handleSave(phase: Phase) {
    setSaving(true);
    try {
      await onUpdatePhase(phase.id, {
        status:        phaseForm.status,
        planned_start: phaseForm.planned_start || null,
        planned_end:   phaseForm.planned_end || null,
        actual_start:  phaseForm.actual_start || null,
        actual_end:    phaseForm.actual_end || null,
      });
      setEditingPhaseId(null);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {ganttContent}

      <div className="ms-section-card">
        <div className="ms-section-title">Phase Details</div>
        <div style={{ display: "grid", gap: 8 }}>
          {phases.map((phase) => {
            const phaseMilestones = milestones.filter((m) => m.phase_id === phase.id);
            const isEditing = editingPhaseId === phase.id;
            const color = STATUS_COLOR[phase.status ?? "not_started"] ?? STATUS_COLOR.not_started;

            return (
              <div key={phase.id} className="ms-row-item">
                {isEditing ? (
                  <div style={{ flex: 1, display: "grid", gap: 12 }}>
                    <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{phase.name}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                      <label className="ms-label">
                        <span>Status</span>
                        <select
                          className="ms-input"
                          value={phaseForm.status ?? ""}
                          onChange={(e) => setPhaseForm({ ...phaseForm, status: e.target.value as PhaseUpdate["status"] })}
                        >
                          <option value="not_started">Not Started</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      </label>
                      <label className="ms-label">
                        <span>Planned Start</span>
                        <input type="date" className="ms-input" value={phaseForm.planned_start ?? ""} onChange={(e) => setPhaseForm({ ...phaseForm, planned_start: e.target.value })} />
                      </label>
                      <label className="ms-label">
                        <span>Planned End</span>
                        <input type="date" className="ms-input" value={phaseForm.planned_end ?? ""} onChange={(e) => setPhaseForm({ ...phaseForm, planned_end: e.target.value })} />
                      </label>
                      <label className="ms-label">
                        <span>Actual Start</span>
                        <input type="date" className="ms-input" value={phaseForm.actual_start ?? ""} onChange={(e) => setPhaseForm({ ...phaseForm, actual_start: e.target.value })} />
                      </label>
                      <label className="ms-label">
                        <span>Actual End</span>
                        <input type="date" className="ms-input" value={phaseForm.actual_end ?? ""} onChange={(e) => setPhaseForm({ ...phaseForm, actual_end: e.target.value })} />
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="ms-btn-primary" onClick={() => handleSave(phase)} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button className="ms-btn-secondary" onClick={() => setEditingPhaseId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                        <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>{phase.name}</div>
                        <span
                          className="ms-badge"
                          style={{ background: color + "1a", color, border: `1px solid ${color}40` }}
                        >
                          {STATUS_LABEL[phase.status ?? "not_started"] ?? phase.status}
                        </span>
                      </div>

                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                        Planned: {phase.planned_start ?? "—"} → {phase.planned_end ?? "—"}
                        {(phase.actual_start || phase.actual_end) && (
                          <span style={{ marginLeft: 14, color: "#059669" }}>
                            Actual: {phase.actual_start ?? "—"} → {phase.actual_end ?? "—"}
                          </span>
                        )}
                      </div>

                      {/* Progress track */}
                      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden", maxWidth: 280 }}>
                        <div style={{ width: progressWidth(phase.status), height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
                      </div>

                      {phaseMilestones.length > 0 && (
                        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {phaseMilestones.map((ms) => (
                            <span
                              key={ms.id}
                              style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(255,140,0,0.12)", color: "#ff8c00", border: "1px solid rgba(255,140,0,0.3)" }}
                            >
                              ◆ {ms.name}{ms.target_date ? ` (${ms.target_date})` : ""}
                            </span>
                          ))}
                        </div>
                      )}

                      {recordings.filter((r) => r.phase_id === phase.id).length > 0 && (
                        <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                          {recordings.filter((r) => r.phase_id === phase.id).map((rec) => (
                            <div key={rec.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#7c3aed" }}>
                              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#7c3aed", flexShrink: 0, display: "inline-block" }} />
                              <span style={{ fontWeight: 500 }}>{rec.topic}</span>
                              <span style={{ color: "#94a3b8" }}>
                                {new Date(rec.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                {" · "}{rec.duration_mins}m
                                {rec.task_name && <> · <span style={{ color: "#7c3aed" }}>{rec.task_name}</span></>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button className="ms-btn-ghost" onClick={() => startEdit(phase)} style={{ flexShrink: 0 }}>
                      Edit
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {phases.length === 0 && (
            <div style={{ color: "#94a3b8", fontSize: 14, padding: "8px 0" }}>No phases defined.</div>
          )}
        </div>
      </div>
    </div>
  );
}

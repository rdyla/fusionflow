import React, { useEffect, useState } from "react";
import type { Phase, Task, ZoomRecording } from "../../lib/api";
import { type SolutionType, parseTaggedTitle } from "../../../shared/solutionTypes";
import { SolutionTypeFilterPills } from "../ui/SolutionTypeFilterPills";

const GANTT_COLLAPSED_KEY = "cloudconnect:timeline:gantt:collapsed";
const PHASE_EXPANDED_KEY_PREFIX = "cloudconnect:timeline:gantt:expandedPhases:";

type PhaseUpdate = {
  status?: "not_started" | "in_progress" | "completed";
  planned_start?: string | null;
  planned_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
};

type Props = {
  phases: Phase[];
  tasks?: Task[];
  recordings?: ZoomRecording[];
  /** Used to namespace localStorage for per-phase collapse state. Falls back to phases[0]?.project_id when omitted. */
  projectId?: string;
  /** Solution-type filter — owned by the parent so the Tasks tab and Gantt share state. */
  availableTypes?: readonly SolutionType[];
  selectedTypes?: ReadonlySet<SolutionType>;
  onToggleType?: (type: SolutionType) => void;
  onUpdatePhase: (phaseId: string, updates: PhaseUpdate) => Promise<void>;
  ganttOnly?: boolean;
  onClickPhase?: (phaseId: string) => void;
  onClickTask?: (taskId: string, phaseId: string | null) => void;
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

export default function ProjectTimeline({ phases, tasks = [], recordings = [], projectId, availableTypes = [], selectedTypes, onToggleType, onUpdatePhase, ganttOnly = false, onClickPhase, onClickTask }: Props) {
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [phaseForm, setPhaseForm] = useState<PhaseUpdate & { _id: string }>({ _id: "" });
  const [saving, setSaving] = useState(false);
  const [ganttCollapsed, setGanttCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(GANTT_COLLAPSED_KEY) === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(GANTT_COLLAPSED_KEY, ganttCollapsed ? "1" : "0");
  }, [ganttCollapsed]);

  // Stable namespace key for per-project localStorage entries
  const storageKey = projectId ?? phases[0]?.project_id ?? null;

  // Per-phase expanded set — empty = all collapsed (PM-requested default)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(() => {
    if (typeof window === "undefined" || !storageKey) return new Set();
    const raw = window.localStorage.getItem(PHASE_EXPANDED_KEY_PREFIX + storageKey);
    if (!raw) return new Set();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.filter((s): s is string => typeof s === "string"));
    } catch {
      /* fall through */
    }
    return new Set();
  });

  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) return;
    window.localStorage.setItem(PHASE_EXPANDED_KEY_PREFIX + storageKey, JSON.stringify([...expandedPhases]));
  }, [expandedPhases, storageKey]);

  function togglePhase(phaseId: string) {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }

  // Untagged tasks always pass; tagged tasks pass when any tag is selected.
  function taskMatchesTypeFilter(task: Task): boolean {
    if (!selectedTypes) return true;
    const { types } = parseTaggedTitle(task.title);
    if (types.length === 0) return true;
    return types.some((t) => selectedTypes.has(t));
  }

  function taskDisplayTitle(task: Task): string {
    return parseTaggedTitle(task.title).rawTitle || task.title;
  }

  // ── Gantt ──────────────────────────────────────────────────────────────────

  const datedPhases = phases.filter((p) => p.planned_start && p.planned_end);
  let ganttContent: React.ReactNode = null;

  // Type-filter first, then keep tasks that have at least one date (due/done/scheduled) for bounding
  const filteredTasks = tasks.filter(taskMatchesTypeFilter);
  const datedTasks = filteredTasks.filter((t) => t.scheduled_start || t.scheduled_end || t.due_date || t.completed_at);

  if (datedPhases.length > 0 || datedTasks.length > 0) {
    const allMs: number[] = [];
    datedPhases.forEach((p) => { allMs.push(parseDate(p.planned_start)!, parseDate(p.planned_end)!); });
    datedTasks.forEach((t) => {
      const s = parseDate(t.scheduled_start); if (s) allMs.push(s);
      const e = parseDate(t.scheduled_end);   if (e) allMs.push(e);
      const d = parseDate(t.due_date);        if (d) allMs.push(d);
      const c = parseDate(t.completed_at);    if (c) allMs.push(c);
    });
    recordings.forEach((r) => { const ms = parseDate(r.start_time.slice(0, 10)); if (ms) allMs.push(ms); });

    const rawMin = Math.min(...allMs);
    const rawMax = Math.max(...allMs);
    const pad = Math.max((rawMax - rawMin) * 0.03, 3 * 24 * 60 * 60 * 1000);
    const minMs = rawMin - pad;
    const maxMs = rawMax + pad;
    const totalMs = maxMs - minMs;

    const months = getMonthsBetween(minMs, maxMs);
    const LABEL_W = 180;

    const fmtMonth = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const summary = `${phases.length} phase${phases.length === 1 ? "" : "s"} · ${datedTasks.length} dated task${datedTasks.length === 1 ? "" : "s"} · ${fmtMonth(rawMin)} → ${fmtMonth(rawMax)}`;

    ganttContent = (
      <div className="ms-section-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div className="ms-section-title" style={{ marginBottom: 0 }}>Schedule</div>
          <button
            type="button"
            onClick={() => setGanttCollapsed((v) => !v)}
            aria-label={ganttCollapsed ? "Expand schedule" : "Minimize schedule"}
            title={ganttCollapsed ? "Expand schedule" : "Minimize schedule"}
            style={{
              background: "transparent",
              border: "1px solid rgba(148,163,184,0.35)",
              borderRadius: 6,
              padding: "2px 8px",
              fontSize: 12,
              color: "#64748b",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 11, lineHeight: 1 }}>{ganttCollapsed ? "▸" : "▾"}</span>
            <span>{ganttCollapsed ? "Expand" : "Minimize"}</span>
          </button>
        </div>

        {/* Solution-type filter pills — controlled by parent so Tasks tab shares state */}
        {!ganttCollapsed && selectedTypes && onToggleType && (
          <div style={{ marginTop: 10 }}>
            <SolutionTypeFilterPills available={availableTypes} selected={selectedTypes} onToggle={onToggleType} />
          </div>
        )}

        {ganttCollapsed ? (
          <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>{summary}</div>
        ) : (
        <div style={{ overflow: "hidden", marginTop: 12 }}>
          <div>
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

            {/* Phase rows — tasks/recordings only render when phase is expanded */}
            {phases.map((phase) => {
              const pStart = parseDate(phase.planned_start);
              const pEnd   = parseDate(phase.planned_end);
              const aStart = parseDate(phase.actual_start);
              const aEnd   = parseDate(phase.actual_end);
              const hasPlan   = pStart !== null && pEnd !== null;
              const hasActual = aStart !== null && aEnd !== null;
              const color = STATUS_COLOR[phase.status ?? "not_started"] ?? STATUS_COLOR.not_started;
              const phaseTasks = datedTasks.filter((t) => t.phase_id === phase.id);
              const phaseRecordings = recordings.filter((r) => r.phase_id === phase.id);
              const childCount = phaseTasks.length + phaseRecordings.length;
              const isExpanded = expandedPhases.has(phase.id);
              const isExpandable = childCount > 0;

              return (
                <React.Fragment key={phase.id}>
                  {/* Phase bar row */}
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 4, minHeight: 28 }}>
                    <div
                      style={{ width: LABEL_W, flexShrink: 0, fontSize: 12, fontWeight: 600, color: "#475569", paddingRight: 12, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: isExpandable || onClickPhase ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}
                      onClick={() => { if (isExpandable) togglePhase(phase.id); else onClickPhase?.(phase.id); }}
                      title={isExpandable ? (isExpanded ? "Collapse phase" : `Expand phase (${childCount})`) : phase.name}
                    >
                      {isExpandable && (
                        <span style={{ fontSize: 9, color: "#94a3b8", width: 10, textAlign: "center", flexShrink: 0 }}>
                          {isExpanded ? "▾" : "▸"}
                        </span>
                      )}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{phase.name}</span>
                      {isExpandable && !isExpanded && (
                        <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 400, flexShrink: 0 }}>({childCount})</span>
                      )}
                    </div>
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
                            cursor: onClickPhase ? "pointer" : "default",
                          }}
                          title={`Planned: ${phase.planned_start} → ${phase.planned_end}`}
                          onClick={() => onClickPhase?.(phase.id)}
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

                  {/* Task rows — only when phase expanded. Each task: hollow ring at due, filled dot at done, line between. */}
                  {isExpanded && phaseTasks.map((task) => {
                    const dueMs  = parseDate(task.due_date);
                    const doneMs = parseDate(task.completed_at);
                    const taskColor = STATUS_COLOR[task.status ?? "not_started"] ?? STATUS_COLOR.not_started;
                    const dueLeft  = dueMs  !== null ? pct(dueMs,  minMs, totalMs) : null;
                    const doneLeft = doneMs !== null ? pct(doneMs, minMs, totalMs) : null;
                    const connectorLeft = dueLeft !== null && doneLeft !== null ? Math.min(dueLeft, doneLeft) : null;
                    const connectorWidth = dueLeft !== null && doneLeft !== null ? Math.abs(doneLeft - dueLeft) : null;
                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "center", marginBottom: 3, minHeight: 18 }}>
                        <div
                          style={{ width: LABEL_W, flexShrink: 0, fontSize: 11, color: "#94a3b8", paddingRight: 8, paddingLeft: 16, textAlign: "left", cursor: onClickTask ? "pointer" : "default", whiteSpace: "normal", wordBreak: "break-word" }}
                          onClick={() => onClickTask?.(task.id, task.phase_id)}
                        >
                          {taskDisplayTitle(task)}
                        </div>
                        <div style={{ flex: 1, position: "relative", height: 12 }}>
                          {connectorLeft !== null && connectorWidth !== null && connectorWidth > 0 && (
                            <div
                              style={{
                                position: "absolute",
                                top: 5,
                                left: `${connectorLeft}%`,
                                width: `${connectorWidth}%`,
                                height: 2,
                                background: taskColor,
                                opacity: 0.55,
                              }}
                            />
                          )}
                          {dueLeft !== null && (
                            <div
                              style={{
                                position: "absolute",
                                top: 1,
                                left: `${dueLeft}%`,
                                transform: "translateX(-50%)",
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                border: `2px solid ${taskColor}`,
                                background: "transparent",
                                boxSizing: "border-box",
                                cursor: onClickTask ? "pointer" : "default",
                              }}
                              title={`Due: ${task.due_date}`}
                              onClick={() => onClickTask?.(task.id, task.phase_id)}
                            />
                          )}
                          {doneLeft !== null && (
                            <div
                              style={{
                                position: "absolute",
                                top: 1,
                                left: `${doneLeft}%`,
                                transform: "translateX(-50%)",
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: taskColor,
                                cursor: onClickTask ? "pointer" : "default",
                              }}
                              title={`Done: ${task.completed_at?.slice(0, 10) ?? ""}`}
                              onClick={() => onClickTask?.(task.id, task.phase_id)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Recording dots for this phase — only when expanded */}
                  {isExpanded && phaseRecordings.map((r) => {
                    const rMs = parseDate(r.start_time.slice(0, 10));
                    if (!rMs) return null;
                    return (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", marginBottom: 3, minHeight: 18 }}>
                        <div style={{ width: LABEL_W, flexShrink: 0, fontSize: 11, color: "#7c3aed", paddingRight: 8, paddingLeft: 16, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={r.topic}>
                          {r.topic}
                        </div>
                        <div style={{ flex: 1, position: "relative", height: 14 }}>
                          <div
                            style={{ position: "absolute", top: 3, left: `${pct(rMs, minMs, totalMs)}%`, transform: "translateX(-50%)" }}
                            title={`${r.topic} (${r.start_time.slice(0, 10)})`}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed", border: "2px solid rgba(124,58,237,0.3)" }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Small gap after each expanded phase group */}
                  {isExpanded && childCount > 0 && <div style={{ height: 4 }} />}
                </React.Fragment>
              );
            })}

            {/* Unassigned recording markers — recordings not linked to any phase */}
            {recordings.filter((r) => !r.phase_id).length > 0 && (
              <>
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "6px 0 6px", marginLeft: LABEL_W }} />
                {recordings.filter((r) => !r.phase_id).map((r) => {
                  const rMs = parseDate(r.start_time.slice(0, 10));
                  if (!rMs) return null;
                  return (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", marginBottom: 4, minHeight: 18 }}>
                      <div style={{ width: LABEL_W, flexShrink: 0, fontSize: 11, color: "#7c3aed", paddingRight: 12, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={r.topic}>
                        {r.topic}
                      </div>
                      <div style={{ flex: 1, position: "relative", height: 18 }}>
                        <div
                          style={{ position: "absolute", left: `${pct(rMs, minMs, totalMs)}%`, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
                          title={`${r.topic} (${r.start_time.slice(0, 10)}) — unassigned`}
                        >
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed", border: "2px solid rgba(124,58,237,0.3)" }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Legend */}
            <div style={{ display: "flex", gap: 18, marginTop: 10, paddingLeft: LABEL_W, fontSize: 11, color: "#64748b", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 16, height: 4, background: "#0078d4", borderRadius: 2, display: "inline-block" }} />
                Phase
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 16, height: 4, background: "#107c10", borderRadius: 2, display: "inline-block" }} />
                Actual
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid #94a3b8", display: "inline-block", boxSizing: "border-box" }} />
                Task due
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#059669", display: "inline-block" }} />
                Task done
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
        )}
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

  if (ganttOnly) return <div>{ganttContent}</div>;

  return (
    <div>
      {ganttContent}

      <div className="ms-section-card">
        <div className="ms-section-title">Phase Details</div>
        <div style={{ display: "grid", gap: 8 }}>
          {phases.map((phase) => {
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
                          style={{ background: color + "1a", color, border: `1px solid ${color}40`, textTransform: "none" }}
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

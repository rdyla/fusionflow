import { useEffect, useMemo, useState } from "react";
import { api, type Project, type Template } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";
import { chainForward, parseISODate, startFromGoLive, workday, workdaysBetween, type PhaseInput } from "../../../shared/workdayMath";

// ── Types ────────────────────────────────────────────────────────────────────

type Task = {
  id: string;
  title: string;
  role: string | null;
  start: string;
  end: string;
  pinned: boolean;
};

type Row = {
  template_phase_id: string;
  name: string;
  working_days: number;
  start: string;
  end: string;
  /** Phase pinned: a date on the phase row was manually edited. */
  pinned: boolean;
  tasks: Task[];
};

type Props = {
  project: Project;
  onApplied: () => void;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateForDisplay(iso: string): string {
  if (!iso) return "";
  const d = parseISODate(iso);
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

function rowsFromTemplate(template: Template, anchorStart: string): Row[] {
  const phases = template.phases ?? [];
  const inputs: PhaseInput[] = phases.map((p) => ({ id: p.id, working_days: p.working_days }));
  const computed = chainForward(anchorStart, inputs);
  return phases.map((p, i) => ({
    template_phase_id: p.id,
    name: p.name,
    working_days: p.working_days,
    start: computed[i].start,
    end:   computed[i].end,
    pinned: false,
    tasks: (p.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      role: t.default_assignee_role,
      start: computed[i].start,
      end: computed[i].end,
      pinned: false,
    })),
  }));
}

/**
 * Chain phases using their working_days + pinned dates, but ALSO extend a
 * phase's effective `end` if any of its (pinned) tasks finishes later than
 * the working-days-derived end. Tasks that share the phase's dates (unpinned)
 * are re-synced to the phase's new effective dates after chaining.
 */
function recomputeChain(rows: Row[], anchorStart: string): Row[] {
  const inputs: PhaseInput[] = rows.map((r) => {
    // Determine effective pinned_end: the later of (phase manual pin) and
    // (latest pinned task end). This lets a pinned task push the phase out.
    const latestTaskEnd = r.tasks.reduce((acc, t) => {
      if (!t.pinned) return acc;
      return acc === null || t.end > acc ? t.end : acc;
    }, null as string | null);
    const phasePinnedEnd = r.pinned ? r.end : null;
    let effectivePinnedEnd: string | null = null;
    if (phasePinnedEnd && latestTaskEnd) {
      effectivePinnedEnd = phasePinnedEnd > latestTaskEnd ? phasePinnedEnd : latestTaskEnd;
    } else {
      effectivePinnedEnd = phasePinnedEnd ?? latestTaskEnd;
    }
    return {
      id: r.template_phase_id,
      working_days: r.working_days,
      pinned_start: r.pinned ? r.start : null,
      pinned_end: effectivePinnedEnd,
    };
  });

  const computed = chainForward(anchorStart, inputs);

  return rows.map((r, i) => {
    const newPhase = { ...r, start: computed[i].start, end: computed[i].end };
    // Unpinned tasks follow the phase. Pinned tasks keep their explicit dates
    // but get clamped to the phase window (start can't precede phase start).
    newPhase.tasks = r.tasks.map((t) => {
      if (!t.pinned) {
        return { ...t, start: newPhase.start, end: newPhase.end };
      }
      // Pinned: keep dates as-is. (If the phase shifted underneath them due to
      // upstream pinning, the PM will see them where they pinned them; they
      // can re-pin or hit Reset if they want them to follow.)
      return t;
    });
    return newPhase;
  });
}

/**
 * When a task date is edited, shift downstream tasks in the same phase by the
 * same workday delta. Tasks before the edited one stay put. The edited task
 * keeps its new (explicit) dates and is marked pinned.
 *
 * Subsequent phases are NOT shifted here — that happens via recomputeChain
 * when one of the phase ends extends to accommodate the latest pinned task.
 * If the shifted tasks fit within the existing phase window, downstream
 * phases don't move (per user spec).
 */
function applyTaskShift(tasks: Task[], editedIdx: number, deltaWd: number): Task[] {
  if (deltaWd === 0) return tasks;
  return tasks.map((t, i) => {
    if (i <= editedIdx) return t; // edited row + earlier rows untouched
    // For unpinned subsequent tasks: shift both dates by delta. They were
    // inheriting phase dates, so shifting keeps them in lockstep.
    return {
      ...t,
      start: workday(t.start, deltaWd),
      end:   workday(t.end,   deltaWd),
    };
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TimelineBuilder({ project, onApplied }: Props) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [goLive, setGoLive] = useState<string>(project.target_go_live_date ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmingApply, setConfirmingApply] = useState(false);

  useEffect(() => {
    api.templatesList().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (!templateId) { setTemplate(null); setRows([]); return; }
    setLoading(true);
    api.template(templateId)
      .then((t) => {
        setTemplate(t);
        const totalDays = (t.phases ?? []).reduce((sum, p) => sum + (p.working_days || 0), 0);
        const anchor = goLive ? startFromGoLive(goLive, totalDays) : new Date().toISOString().slice(0, 10);
        setRows(rowsFromTemplate(t, anchor));
      })
      .catch(() => showToast("Failed to load template", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  useEffect(() => {
    if (!template) return;
    const totalDays = (template.phases ?? []).reduce((sum, p) => sum + (p.working_days || 0), 0);
    const anchor = goLive ? startFromGoLive(goLive, totalDays) : new Date().toISOString().slice(0, 10);
    // Clear all pins on go-live change so PMs get a clean re-seed
    setRows((prev) => {
      const cleared = prev.map((r) => ({
        ...r,
        pinned: false,
        tasks: r.tasks.map((t) => ({ ...t, pinned: false })),
      }));
      return recomputeChain(cleared, anchor);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goLive]);

  const computedGoLive = useMemo(() => rows.length ? rows[rows.length - 1].end : "", [rows]);

  function setPhaseField(idx: number, patch: Partial<Row>) {
    setRows((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch, pinned: true };
      // When the PM edits Start or Workdays (but not End in the same patch),
      // derive End = WORKDAY(Start, Workdays) so the row stays consistent.
      // Explicit End edits bypass this and override.
      if (("start" in patch || "working_days" in patch) && !("end" in patch)) {
        merged.end = workday(merged.start, Math.max(merged.working_days, 0));
      }
      next[idx] = merged;
      const anchor = next[0]?.start ?? new Date().toISOString().slice(0, 10);
      return recomputeChain(next, anchor);
    });
  }

  function setTaskDate(phaseIdx: number, taskIdx: number, field: "start" | "end", newDate: string) {
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, tasks: r.tasks.map((t) => ({ ...t })) }));
      const phase = next[phaseIdx];
      const task = phase.tasks[taskIdx];
      const oldVal = task[field];
      const deltaWd = workdaysBetween(oldVal, newDate) || -workdaysBetween(newDate, oldVal);
      task[field] = newDate;
      task.pinned = true;
      // Shift downstream tasks in same phase by the delta
      phase.tasks = applyTaskShift(phase.tasks, taskIdx, deltaWd);
      // Re-chain so phase end can absorb (or extend for) the latest pinned task end
      const anchor = next[0]?.start ?? new Date().toISOString().slice(0, 10);
      return recomputeChain(next, anchor);
    });
  }

  function clearOverrides() {
    if (!template) return;
    const totalDays = (template.phases ?? []).reduce((sum, p) => sum + (p.working_days || 0), 0);
    const anchor = goLive ? startFromGoLive(goLive, totalDays) : new Date().toISOString().slice(0, 10);
    setRows(rowsFromTemplate(template, anchor));
  }

  async function handleApply() {
    if (!template || !rows.length) return;
    setApplying(true);
    try {
      const result = await api.applyTimeline(project.id, {
        template_id: template.id,
        phases: rows.map((r) => ({
          template_phase_id: r.template_phase_id,
          start: r.start,
          end: r.end,
          // Send per-task dates only when at least one task in the phase is
          // pinned — otherwise the server falls back to phase dates (smaller
          // payload, identical result).
          tasks: r.tasks.some((t) => t.pinned)
            ? r.tasks.map((t) => ({ template_task_id: t.id, start: t.start, end: t.end }))
            : undefined,
        })),
      });
      showToast(`Timeline applied: ${result.phases_created} phases, ${result.tasks_created} tasks.`, "success");
      setConfirmingApply(false);
      onApplied();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to apply timeline", "error");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="ms-card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <label className="ms-label">
            <span>Template</span>
            <select className="ms-input" value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={loading || applying}>
              <option value="">— Select a template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="ms-label">
            <span>Target Go-Live</span>
            <input
              className="ms-input"
              type="date"
              value={goLive}
              onChange={(e) => setGoLive(e.target.value)}
              disabled={!template || applying}
            />
          </label>
          {template && (
            <button className="ms-btn-ghost" onClick={clearOverrides} disabled={applying} title="Reset all dates from the current go-live anchor">
              Reset dates
            </button>
          )}
        </div>
        {template && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
            Computed go-live (last phase end): <strong style={{ color: "#1e293b" }}>{computedGoLive ? formatDateForDisplay(computedGoLive) : "—"}</strong>
            {computedGoLive && goLive && computedGoLive !== goLive && (
              <span style={{ marginLeft: 8, color: "#d97706" }}>
                (differs from target — likely due to manual overrides)
              </span>
            )}
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="ms-card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11 }}>Phase / Task</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 100 }}>Role</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 110 }}>Workdays</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 150 }}>Start</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 150 }}>End</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <PhaseRows
                  key={row.template_phase_id}
                  row={row}
                  idx={idx}
                  onPhaseChange={(patch) => setPhaseField(idx, patch)}
                  onTaskDate={(taskIdx, field, val) => setTaskDate(idx, taskIdx, field, val)}
                  disabled={applying}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {!confirmingApply ? (
            <button className="ms-btn-primary" onClick={() => setConfirmingApply(true)} disabled={applying}>
              Apply Timeline
            </button>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#b91c1c", alignSelf: "center", marginRight: 12 }}>
                This wipes existing phases + tasks on the project and rebuilds them. Continue?
              </div>
              <button className="ms-btn-ghost" onClick={() => setConfirmingApply(false)} disabled={applying}>Cancel</button>
              <button className="ms-btn-primary" onClick={handleApply} disabled={applying}>
                {applying ? "Applying…" : "Yes, replace timeline"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Row sub-component (phase header row + indented task rows) ────────────────

function PhaseRows({
  row, idx, onPhaseChange, onTaskDate, disabled,
}: {
  row: Row;
  idx: number;
  onPhaseChange: (patch: Partial<Row>) => void;
  onTaskDate: (taskIdx: number, field: "start" | "end", val: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <tr style={{ background: row.pinned ? "#fef9c3" : "#ffffff", borderBottom: "1px solid #f1f5f9" }}>
        <td style={{ padding: "8px 14px", fontWeight: 600, color: "#1e293b" }}>
          {idx + 1}. {row.name}
        </td>
        <td style={{ padding: "8px 14px", color: "#94a3b8", fontSize: 12 }}>—</td>
        <td style={{ padding: "8px 14px" }}>
          <input
            type="number"
            min={0}
            value={row.working_days}
            onChange={(e) => onPhaseChange({ working_days: Math.max(0, parseInt(e.target.value || "0", 10)) })}
            disabled={disabled}
            style={{ width: 60, padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 4 }}
          />
        </td>
        <td style={{ padding: "8px 14px" }}>
          <input
            type="date"
            value={row.start}
            onChange={(e) => onPhaseChange({ start: e.target.value })}
            disabled={disabled}
            style={{ padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 4 }}
          />
        </td>
        <td style={{ padding: "8px 14px" }}>
          <input
            type="date"
            value={row.end}
            onChange={(e) => onPhaseChange({ end: e.target.value })}
            disabled={disabled}
            style={{ padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 4 }}
          />
        </td>
      </tr>
      {row.tasks.map((t, taskIdx) => (
        <tr key={t.id} style={{ background: t.pinned ? "#fef9c3" : "#fafbfc", borderBottom: "1px solid #f1f5f9" }}>
          <td style={{ padding: "5px 14px 5px 36px", color: "#475569", fontSize: 12 }}>{t.title}</td>
          <td style={{ padding: "5px 14px", color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t.role ?? ""}</td>
          <td style={{ padding: "5px 14px", color: "#94a3b8", fontSize: 12 }}>—</td>
          <td style={{ padding: "5px 14px" }}>
            <input
              type="date"
              value={t.start}
              onChange={(e) => onTaskDate(taskIdx, "start", e.target.value)}
              disabled={disabled}
              style={{ padding: "3px 6px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 12 }}
            />
          </td>
          <td style={{ padding: "5px 14px" }}>
            <input
              type="date"
              value={t.end}
              onChange={(e) => onTaskDate(taskIdx, "end", e.target.value)}
              disabled={disabled}
              style={{ padding: "3px 6px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 12 }}
            />
          </td>
        </tr>
      ))}
    </>
  );
}

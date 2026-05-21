import { useEffect, useMemo, useState } from "react";
import { api, type Project, type Template } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";
import { chainForward, parseISODate, startFromGoLive, workday, workdaysBetween, type PhaseInput } from "../../../shared/workdayMath";
import { buildTaggedTitle, canonicalizeSolutionType, type SolutionType } from "../../../shared/solutionTypes";
import { toTitleCase } from "../../../shared/titleCase";

// ── Types ────────────────────────────────────────────────────────────────────

type Task = {
  /** Unique per row in the table (so React keys are stable). For tasks merged
   *  from multiple templates, this is `${template_id}:${template_task_id}`. */
  uid: string;
  /** Display title, already tagged ("[UCaaS] Assign PM") and title-cased. */
  title: string;
  /** Untagged title, used for fuzzy duplicate detection. */
  rawTitle: string;
  role: string | null;
  priority: string | null;
  start: string;
  end: string;
  pinned: boolean;
  /** Canonical go-live event for its source template. Its phase becomes the
   *  anchor: the project's target go-live date = end of this task's phase,
   *  with earlier phases chained backward and later phases (Closing,
   *  Hypercare) chained forward. */
  isGoLiveEvent: boolean;
};

type Row = {
  /** Canonical phase name (e.g. "Initiation"). Used as merge key + table key. */
  name: string;
  working_days: number;
  start: string;
  end: string;
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

/**
 * Merge phases across one or more templates by canonical name. For each
 * canonical name:
 *  - working_days = MAX(working_days) across contributing templates (since
 *    UCaaS + CCaaS teams work the same phase window in parallel; longest
 *    governs)
 *  - tasks = union from every contributing template, each tagged with its
 *    source solution_type via buildTaggedTitle()
 *
 * Phase order preserves the order_index of the first template that introduces
 * each phase.
 */
function mergeTemplates(templates: Template[]): Omit<Row, "start" | "end" | "pinned">[] {
  const orderedNames: string[] = [];
  const byName = new Map<string, { working_days: number; tasks: Task[] }>();

  for (const t of templates) {
    const solutionType: SolutionType | null = canonicalizeSolutionType(t.solution_type ?? "");
    for (const p of t.phases ?? []) {
      if (!byName.has(p.name)) {
        orderedNames.push(p.name);
        byName.set(p.name, { working_days: 0, tasks: [] });
      }
      const slot = byName.get(p.name)!;
      slot.working_days = Math.max(slot.working_days, p.working_days || 0);
      for (const tt of p.tasks ?? []) {
        const rawTitle = toTitleCase(tt.title);
        const taggedTitle = solutionType ? buildTaggedTitle([solutionType], rawTitle) : rawTitle;
        slot.tasks.push({
          uid: `${t.id}:${tt.id}`,
          title: taggedTitle,
          rawTitle,
          role: tt.default_assignee_role,
          priority: tt.priority ?? null,
          start: "",     // filled in by rowsFromTemplates() after chaining
          end:   "",
          pinned: false,
          isGoLiveEvent: tt.is_go_live_event === 1,
        });
      }
    }
  }

  return orderedNames.map((name) => ({
    name,
    working_days: byName.get(name)!.working_days,
    tasks:        byName.get(name)!.tasks,
  }));
}

/**
 * Index of the merged phase that holds the go-live event anchor (any task with
 * isGoLiveEvent). Returns the LAST such phase so combo projects whose
 * templates disagree on go-live phase still treat the later phase as "the"
 * go-live (everything before chains back, everything after chains forward).
 * Returns -1 when no template in the selection has a flagged task — caller
 * falls back to anchoring on the very last phase's end (legacy behaviour).
 */
function findGoLivePhaseIdx(merged: { tasks: { isGoLiveEvent: boolean }[] }[]): number {
  for (let i = merged.length - 1; i >= 0; i--) {
    if (merged[i].tasks.some((t) => t.isGoLiveEvent)) return i;
  }
  return -1;
}

/**
 * Total workdays from project start through the end of the go-live phase.
 * Used to back-compute the anchor start date from the target go-live so the
 * go-live phase's END lands on the target date — phases after (Closing,
 * Hypercare) then chain forward past it.
 */
function workdaysThroughGoLive(merged: { working_days: number; tasks: { isGoLiveEvent: boolean }[] }[]): number {
  const goLiveIdx = findGoLivePhaseIdx(merged);
  const upto = goLiveIdx >= 0 ? goLiveIdx : merged.length - 1;
  let sum = 0;
  for (let i = 0; i <= upto; i++) sum += merged[i].working_days;
  return sum;
}

function rowsFromTemplates(templates: Template[], anchorStart: string): Row[] {
  const merged = mergeTemplates(templates);
  const inputs: PhaseInput[] = merged.map((m) => ({ id: m.name, working_days: m.working_days }));
  const computed = chainForward(anchorStart, inputs);
  return merged.map((m, i) => ({
    name: m.name,
    working_days: m.working_days,
    start: computed[i].start,
    end:   computed[i].end,
    pinned: false,
    tasks: m.tasks.map((t) => ({ ...t, start: computed[i].start, end: computed[i].end })),
  }));
}

function recomputeChain(rows: Row[], anchorStart: string): Row[] {
  const inputs: PhaseInput[] = rows.map((r) => {
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
      id: r.name,
      working_days: r.working_days,
      pinned_start: r.pinned ? r.start : null,
      pinned_end: effectivePinnedEnd,
    };
  });

  const computed = chainForward(anchorStart, inputs);

  return rows.map((r, i) => {
    const newPhase = { ...r, start: computed[i].start, end: computed[i].end };
    newPhase.tasks = r.tasks.map((t) => {
      if (!t.pinned) return { ...t, start: newPhase.start, end: newPhase.end };
      return t;
    });
    return newPhase;
  });
}

function applyTaskShift(tasks: Task[], editedIdx: number, deltaWd: number): Task[] {
  if (deltaWd === 0) return tasks;
  return tasks.map((t, i) => {
    if (i <= editedIdx) return t;
    return { ...t, start: workday(t.start, deltaWd), end: workday(t.end, deltaWd) };
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TimelineBuilder({ project, onApplied }: Props) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  /** Selected template ids — multi-select. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Fully-loaded templates with phases + tasks, keyed by id. */
  const [loadedTemplates, setLoadedTemplates] = useState<Record<string, Template>>({});
  const [goLive, setGoLive] = useState<string>(project.target_go_live_date ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmingApply, setConfirmingApply] = useState(false);

  useEffect(() => {
    api.templatesList().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  // Selected templates resolve to fully-loaded data; we lazy-fetch any not
  // yet in the cache.
  useEffect(() => {
    if (selectedIds.length === 0) { setRows([]); return; }
    const missing = selectedIds.filter((id) => !loadedTemplates[id]);
    if (missing.length === 0) {
      // Already cached — rebuild rows from the latest selection + go-live
      const selected = selectedIds.map((id) => loadedTemplates[id]).filter(Boolean);
      const total = workdaysThroughGoLive(mergeTemplates(selected));
      const anchor = goLive ? startFromGoLive(goLive, total) : new Date().toISOString().slice(0, 10);
      setRows(rowsFromTemplates(selected, anchor));
      return;
    }
    setLoading(true);
    Promise.all(missing.map((id) => api.template(id)))
      .then((fetched) => {
        setLoadedTemplates((prev) => {
          const next = { ...prev };
          for (const t of fetched) next[t.id] = t;
          return next;
        });
      })
      .catch(() => showToast("Failed to load template", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, loadedTemplates]);

  // Rebuild rows whenever go-live changes (and we have something loaded).
  useEffect(() => {
    const selected = selectedIds.map((id) => loadedTemplates[id]).filter(Boolean);
    if (selected.length === 0) return;
    const total = workdaysThroughGoLive(mergeTemplates(selected));
    const anchor = goLive ? startFromGoLive(goLive, total) : new Date().toISOString().slice(0, 10);
    setRows(rowsFromTemplates(selected, anchor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goLive]);

  const goLivePhaseIdx = useMemo(() => findGoLivePhaseIdx(rows), [rows]);
  const computedGoLive = useMemo(() => {
    if (!rows.length) return "";
    // Prefer the flagged go-live phase's end; fall back to last phase end
    // (legacy behaviour when no template in the selection is flagged).
    const idx = goLivePhaseIdx >= 0 ? goLivePhaseIdx : rows.length - 1;
    return rows[idx].end;
  }, [rows, goLivePhaseIdx]);

  function toggleTemplate(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function setPhaseField(idx: number, patch: Partial<Row>) {
    setRows((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch, pinned: true };
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
      phase.tasks = applyTaskShift(phase.tasks, taskIdx, deltaWd);
      const anchor = next[0]?.start ?? new Date().toISOString().slice(0, 10);
      return recomputeChain(next, anchor);
    });
  }

  function clearOverrides() {
    const selected = selectedIds.map((id) => loadedTemplates[id]).filter(Boolean);
    if (selected.length === 0) return;
    const total = workdaysThroughGoLive(mergeTemplates(selected));
    const anchor = goLive ? startFromGoLive(goLive, total) : new Date().toISOString().slice(0, 10);
    setRows(rowsFromTemplates(selected, anchor));
  }

  async function handleApply() {
    if (!rows.length) return;
    setApplying(true);
    try {
      const result = await api.applyTimeline(project.id, {
        phases: rows.map((r) => ({
          name: r.name,
          start: r.start,
          end: r.end,
          tasks: r.tasks.map((t) => ({
            title: t.title,
            role: t.role,
            priority: t.priority,
            start: t.start,
            end: t.end,
          })),
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "start" }}>
          <div className="ms-label">
            <span>Templates</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 4, maxHeight: 160, overflowY: "auto" }}>
              {templates.length === 0 ? (
                <span style={{ color: "#94a3b8", fontSize: 12 }}>No templates available</span>
              ) : templates.map((t) => (
                <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(t.id)}
                    onChange={() => toggleTemplate(t.id)}
                    disabled={loading || applying}
                  />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
            {selectedIds.length > 1 && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#0369a1" }}>
                {selectedIds.length} templates selected — phases merged by name, longest workdays governs.
              </div>
            )}
          </div>
          <label className="ms-label">
            <span>Target Go-Live</span>
            <input
              className="ms-input"
              type="date"
              value={goLive}
              onChange={(e) => setGoLive(e.target.value)}
              disabled={selectedIds.length === 0 || applying}
            />
          </label>
          {selectedIds.length > 0 && (
            <button className="ms-btn-ghost" onClick={clearOverrides} disabled={applying} title="Reset all dates from the current go-live anchor" style={{ marginTop: 20 }}>
              Reset dates
            </button>
          )}
        </div>
        {rows.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
            Computed go-live ({goLivePhaseIdx >= 0 ? `${rows[goLivePhaseIdx].name} phase end` : "last phase end"}): <strong style={{ color: "#1e293b" }}>{computedGoLive ? formatDateForDisplay(computedGoLive) : "—"}</strong>
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
                  key={row.name}
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
        <tr key={t.uid} style={{ background: t.pinned ? "#fef9c3" : "#fafbfc", borderBottom: "1px solid #f1f5f9" }}>
          <td style={{ padding: "5px 14px 5px 36px", color: "#475569", fontSize: 12 }}>
            {t.title}
            {t.isGoLiveEvent && (
              <span title="Go-Live anchor — target go-live date = end of this task" style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "#fef3c7", color: "#854d0e", border: "1px solid #fde68a", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Go-Live Anchor
              </span>
            )}
          </td>
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

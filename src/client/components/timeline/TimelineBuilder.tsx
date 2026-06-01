import { useEffect, useMemo, useState } from "react";
import { api, type Phase, type Project, type Stage, type Task as ProjectTask, type Template } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";
import { chainForward, parseISODate, startFromGoLive, workday, workdaysBetween, type StageInput } from "../../../shared/workdayMath";
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
  /** Canonical go-live event for its source template. Its stage becomes the
   *  anchor: the project's target go-live date = end of this task's stage,
   *  with earlier stages chained backward and later stages (Closing,
   *  Hypercare) chained forward. */
  isGoLiveEvent: boolean;
};

type Row = {
  /** Canonical stage name (e.g. "Initiation"). Used as merge key + table key. */
  name: string;
  working_days: number;
  start: string;
  end: string;
  pinned: boolean;
  tasks: Task[];
};

type Props = {
  project: Project;
  /** Project's phases. Drives the per-phase picker on multi-phase projects;
   *  single-phase projects auto-target their sole phase with no picker. */
  phases: Phase[];
  /** Project's current stages — used to map existing tasks back to a phase
   *  so the apply warning can show "this will overwrite N tasks under
   *  <phase>", not project-wide. */
  stages: Stage[];
  /** Project's current tasks — same purpose as stages, used to count the
   *  tasks that will be wiped when applying to the selected phase. */
  tasks: ProjectTask[];
  onApplied: () => void;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateForDisplay(iso: string): string {
  if (!iso) return "";
  const d = parseISODate(iso);
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

/**
 * Merge stages across one or more templates by canonical name. For each
 * canonical name:
 *  - working_days = MAX(working_days) across contributing templates (since
 *    UCaaS + CCaaS teams work the same stage window in parallel; longest
 *    governs)
 *  - tasks = union from every contributing template, each tagged with its
 *    source solution_type via buildTaggedTitle()
 *
 * Stage order preserves the order_index of the first template that introduces
 * each stage.
 */
function mergeTemplates(templates: Template[]): Omit<Row, "start" | "end" | "pinned">[] {
  const orderedNames: string[] = [];
  const byName = new Map<string, { working_days: number; tasks: Task[] }>();

  for (const t of templates) {
    const solutionType: SolutionType | null = canonicalizeSolutionType(t.solution_type ?? "");
    for (const p of t.stages ?? []) {
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
 * Index of the merged stage that holds the go-live event anchor (any task with
 * isGoLiveEvent). Returns the LAST such stage so combo projects whose
 * templates disagree on go-live stage still treat the later stage as "the"
 * go-live (everything before chains back, everything after chains forward).
 * Returns -1 when no template in the selection has a flagged task — caller
 * falls back to anchoring on the very last stage's end (legacy behaviour).
 */
function findGoLiveStageIdx(merged: { tasks: { isGoLiveEvent: boolean }[] }[]): number {
  for (let i = merged.length - 1; i >= 0; i--) {
    if (merged[i].tasks.some((t) => t.isGoLiveEvent)) return i;
  }
  return -1;
}

/**
 * Total workdays from project start through the end of the go-live stage.
 * Used to back-compute the anchor start date from the target go-live so the
 * go-live stage's END lands on the target date — stages after (Closing,
 * Hypercare) then chain forward past it.
 */
function workdaysThroughGoLive(merged: { working_days: number; tasks: { isGoLiveEvent: boolean }[] }[]): number {
  const goLiveIdx = findGoLiveStageIdx(merged);
  const upto = goLiveIdx >= 0 ? goLiveIdx : merged.length - 1;
  let sum = 0;
  for (let i = 0; i <= upto; i++) sum += merged[i].working_days;
  return sum;
}

/**
 * Date window a task occupies inside its stage. Every task inherits the full
 * stage window EXCEPT the canonical go-live event, which is by nature a
 * single-day milestone landing on the exact go-live date the user supplied.
 *
 * We pin it to `goLiveDate` rather than the go-live stage's computed END
 * because `startFromGoLive` doesn't perfectly invert `chainForward` — the
 * stage end drifts a few workdays past the typed date (the supplied date
 * actually falls inside the go-live stage window). Pinning to the supplied
 * date keeps the event ON the date the PM entered, and `target_go_live_date`
 * (derived server-side from this task's due_date) then matches it exactly.
 *
 * When no go-live date is supplied yet, fall back to the stage end so the
 * event still collapses to a single day.
 */
function taskWindow(
  task: { isGoLiveEvent: boolean },
  stageStart: string,
  stageEnd: string,
  goLiveDate: string,
): { start: string; end: string } {
  if (task.isGoLiveEvent) {
    const d = goLiveDate || stageEnd;
    return { start: d, end: d };
  }
  return { start: stageStart, end: stageEnd };
}

function rowsFromTemplates(templates: Template[], anchorStart: string, goLiveDate: string): Row[] {
  const merged = mergeTemplates(templates);
  const inputs: StageInput[] = merged.map((m) => ({ id: m.name, working_days: m.working_days }));
  const computed = chainForward(anchorStart, inputs);
  return merged.map((m, i) => ({
    name: m.name,
    working_days: m.working_days,
    start: computed[i].start,
    end:   computed[i].end,
    pinned: false,
    tasks: m.tasks.map((t) => ({ ...t, ...taskWindow(t, computed[i].start, computed[i].end, goLiveDate) })),
  }));
}

function recomputeChain(rows: Row[], anchorStart: string, goLiveDate: string): Row[] {
  const inputs: StageInput[] = rows.map((r) => {
    const latestTaskEnd = r.tasks.reduce((acc, t) => {
      if (!t.pinned) return acc;
      return acc === null || t.end > acc ? t.end : acc;
    }, null as string | null);
    const stagePinnedEnd = r.pinned ? r.end : null;
    let effectivePinnedEnd: string | null = null;
    if (stagePinnedEnd && latestTaskEnd) {
      effectivePinnedEnd = stagePinnedEnd > latestTaskEnd ? stagePinnedEnd : latestTaskEnd;
    } else {
      effectivePinnedEnd = stagePinnedEnd ?? latestTaskEnd;
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
    const newStage = { ...r, start: computed[i].start, end: computed[i].end };
    newStage.tasks = r.tasks.map((t) => {
      if (!t.pinned) return { ...t, ...taskWindow(t, newStage.start, newStage.end, goLiveDate) };
      return t;
    });
    return newStage;
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

export default function TimelineBuilder({ project, phases, stages, tasks, onApplied }: Props) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  /** Selected template ids — multi-select. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Fully-loaded templates with stages + tasks, keyed by id. */
  const [loadedTemplates, setLoadedTemplates] = useState<Record<string, Template>>({});
  const [goLive, setGoLive] = useState<string>(project.target_go_live_date ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmingApply, setConfirmingApply] = useState(false);
  const isMultiPhase = phases.length > 1;
  /** Which phase the wipe + rebuild will target. Defaults to the first phase
   *  (display_order ASC, set by parent before sort). Single-phase projects
   *  never show the picker — it's just `phases[0]`. */
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>(phases[0]?.id ?? "");

  // Keep selectedPhaseId valid as phases load asynchronously / change.
  useEffect(() => {
    if (phases.length === 0) { setSelectedPhaseId(""); return; }
    if (!phases.some((p) => p.id === selectedPhaseId)) {
      setSelectedPhaseId(phases[0].id);
    }
  }, [phases, selectedPhaseId]);

  // Stages + tasks that would be replaced if the PM clicks "Apply". On
  // multi-phase projects this is scoped to the selected phase so the warning
  // accurately reflects what gets wiped — the shared Initiate stage at
  // phase_id=NULL is intentionally not counted (it's preserved server-side).
  const { existingStageCount, existingTaskCount } = useMemo(() => {
    if (!selectedPhaseId) return { existingStageCount: 0, existingTaskCount: 0 };
    const stageIdsInPhase = new Set(stages.filter((s) => s.phase_id === selectedPhaseId).map((s) => s.id));
    const taskCount = tasks.reduce((n, t) => (t.stage_id && stageIdsInPhase.has(t.stage_id) ? n + 1 : n), 0);
    return { existingStageCount: stageIdsInPhase.size, existingTaskCount: taskCount };
  }, [selectedPhaseId, stages, tasks]);

  const selectedPhaseName = useMemo(() => phases.find((p) => p.id === selectedPhaseId)?.name ?? "", [phases, selectedPhaseId]);

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
      setRows(rowsFromTemplates(selected, anchor, goLive));
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
    setRows(rowsFromTemplates(selected, anchor, goLive));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goLive]);

  const goLiveStageIdx = useMemo(() => findGoLiveStageIdx(rows), [rows]);
  const computedGoLive = useMemo(() => {
    if (!rows.length) return "";
    // Prefer the flagged go-live EVENT's date — that's the 1-day milestone the
    // PM cares about (pinned to the supplied go-live). Fall back to the go-live
    // stage's end, then the last stage end (legacy, no flagged task).
    const idx = goLiveStageIdx >= 0 ? goLiveStageIdx : rows.length - 1;
    const event = rows[idx].tasks.find((t) => t.isGoLiveEvent);
    return event?.end ?? rows[idx].end;
  }, [rows, goLiveStageIdx]);

  function toggleTemplate(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function setStageField(idx: number, patch: Partial<Row>) {
    setRows((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch, pinned: true };
      if (("start" in patch || "working_days" in patch) && !("end" in patch)) {
        merged.end = workday(merged.start, Math.max(merged.working_days, 0));
      }
      next[idx] = merged;
      const anchor = next[0]?.start ?? new Date().toISOString().slice(0, 10);
      return recomputeChain(next, anchor, goLive);
    });
  }

  function setTaskDate(stageIdx: number, taskIdx: number, field: "start" | "end", newDate: string) {
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, tasks: r.tasks.map((t) => ({ ...t })) }));
      const stage = next[stageIdx];
      const task = stage.tasks[taskIdx];
      const oldVal = task[field];
      const deltaWd = workdaysBetween(oldVal, newDate) || -workdaysBetween(newDate, oldVal);
      task[field] = newDate;
      task.pinned = true;
      stage.tasks = applyTaskShift(stage.tasks, taskIdx, deltaWd);
      const anchor = next[0]?.start ?? new Date().toISOString().slice(0, 10);
      return recomputeChain(next, anchor, goLive);
    });
  }

  function clearOverrides() {
    const selected = selectedIds.map((id) => loadedTemplates[id]).filter(Boolean);
    if (selected.length === 0) return;
    const total = workdaysThroughGoLive(mergeTemplates(selected));
    const anchor = goLive ? startFromGoLive(goLive, total) : new Date().toISOString().slice(0, 10);
    setRows(rowsFromTemplates(selected, anchor, goLive));
  }

  async function handleApply() {
    if (!rows.length) return;
    if (!selectedPhaseId) {
      showToast("Pick a phase to apply this timeline to", "error");
      return;
    }
    setApplying(true);
    try {
      const result = await api.applyTimeline(project.id, {
        phase_id: selectedPhaseId,
        stages: rows.map((r) => ({
          name: r.name,
          start: r.start,
          end: r.end,
          tasks: r.tasks.map((t) => ({
            title: t.title,
            role: t.role,
            priority: t.priority,
            start: t.start,
            end: t.end,
            isGoLiveEvent: t.isGoLiveEvent,
          })),
        })),
      });
      showToast(`Timeline applied: ${result.stages_created} stages, ${result.tasks_created} tasks.`, "success");
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
      {isMultiPhase && (
        <div className="ms-card" style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Apply to phase</span>
          {phases.map((p) => {
            const active = p.id === selectedPhaseId;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPhaseId(p.id)}
                disabled={applying}
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: active ? "1px solid #0369a1" : "1px solid #cbd5e1",
                  background: active ? "#e0f2fe" : "#ffffff",
                  color: active ? "#0c4a6e" : "#334155",
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  cursor: applying ? "not-allowed" : "pointer",
                }}
              >
                {p.name}
              </button>
            );
          })}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>
            Shared Initiate stage is preserved.
          </span>
        </div>
      )}
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
                {selectedIds.length} templates selected — stages merged by name, longest workdays governs.
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
            Computed go-live ({goLiveStageIdx >= 0 ? "go-live event" : "last stage end"}): <strong style={{ color: "#1e293b" }}>{computedGoLive ? formatDateForDisplay(computedGoLive) : "—"}</strong>
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
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11 }}>Stage / Task</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 100 }}>Role</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 110 }}>Workdays</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 150 }}>Start</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 150 }}>End</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <StageRows
                  key={row.name}
                  row={row}
                  idx={idx}
                  onStageChange={(patch) => setStageField(idx, patch)}
                  onTaskDate={(taskIdx, field, val) => setTaskDate(idx, taskIdx, field, val)}
                  disabled={applying}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          {!confirmingApply ? (
            <button className="ms-btn-primary" onClick={() => setConfirmingApply(true)} disabled={applying || !selectedPhaseId}>
              Apply Timeline
            </button>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#b91c1c", alignSelf: "center", marginRight: 12, maxWidth: 520, textAlign: "right" }}>
                {existingTaskCount > 0 ? (
                  <>
                    This will <strong>delete {existingStageCount} stage{existingStageCount === 1 ? "" : "s"} and {existingTaskCount} task{existingTaskCount === 1 ? "" : "s"}</strong>
                    {isMultiPhase && selectedPhaseName ? <> under the <strong>{selectedPhaseName}</strong> phase</> : null}
                    {isMultiPhase ? ", then rebuild from the timeline above. The shared Initiate stage is left alone. Continue?" : ", then rebuild from the timeline above. Continue?"}
                  </>
                ) : (
                  <>Rebuild {isMultiPhase && selectedPhaseName ? <>the <strong>{selectedPhaseName}</strong> phase</> : "this project"} from the timeline above? No existing tasks will be lost.</>
                )}
              </div>
              <button className="ms-btn-ghost" onClick={() => setConfirmingApply(false)} disabled={applying}>Cancel</button>
              <button className="ms-btn-primary" onClick={handleApply} disabled={applying}>
                {applying ? "Applying…" : existingTaskCount > 0 ? "Yes, replace timeline" : "Apply timeline"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Row sub-component (stage header row + indented task rows) ────────────────

function StageRows({
  row, idx, onStageChange, onTaskDate, disabled,
}: {
  row: Row;
  idx: number;
  onStageChange: (patch: Partial<Row>) => void;
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
            onChange={(e) => onStageChange({ working_days: Math.max(0, parseInt(e.target.value || "0", 10)) })}
            disabled={disabled}
            style={{ width: 60, padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 4 }}
          />
        </td>
        <td style={{ padding: "8px 14px" }}>
          <input
            type="date"
            value={row.start}
            onChange={(e) => onStageChange({ start: e.target.value })}
            disabled={disabled}
            style={{ padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 4 }}
          />
        </td>
        <td style={{ padding: "8px 14px" }}>
          <input
            type="date"
            value={row.end}
            onChange={(e) => onStageChange({ end: e.target.value })}
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

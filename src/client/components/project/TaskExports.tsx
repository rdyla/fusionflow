/**
 * Task-list exports for the project Tasks tab.
 *
 *   <TaskExportMenu … />  →  "⬇ Export ▾" dropdown with four items:
 *     • CSV   — current view / all tasks
 *     • Print — current view / all tasks
 *
 * "Current view" mirrors exactly what the PM is looking at: the phase picker's
 * stages (viewStages) intersected with the solution-type filter (viewTasks).
 * "All tasks" ignores both filters and also picks up stage-less tasks, which
 * the on-screen grouping can't render at all — so nothing is silently dropped
 * from a full export.
 *
 * The CSV escaping, print shell and dropdown chrome live in lib/exportKit +
 * ui/ExportMenu; the MedVet custom plan (customPlan/CustomPlanExports) shares
 * them but builds its own rows, since its model has sections instead of stages,
 * two dates, nesting, and Asana dependencies.
 */

import { useMemo } from "react";
import { parseTaggedTitle, solutionTypeLabel } from "../../../shared/solutionTypes";
import { humanize } from "../../lib/format";
import ExportMenu, { type ExportMenuItem } from "../ui/ExportMenu";
import {
  PF_NAVY,
  STATUS_COLOR,
  buildCsvText,
  coverBlock,
  downloadCsv,
  esc,
  footerBlock,
  logoAbsoluteUrl,
  longDate,
  openPrintWindow,
  printDocument,
  printTipBlock,
  rollupBlock,
  shortDate,
  slugify,
  statusPill,
  todayIso,
} from "../../lib/exportKit";
import type { Phase, Project, Risk, Stage, Task } from "../../lib/api";

/** Synthetic phase label for stages with phase_id = null — matches the
 *  "Initiate" tab the phase picker shows for the shared bucket. */
const SHARED_PHASE_LABEL = "Initiate";

// ── Row model ───────────────────────────────────────────────────────────────

/** Multi-value fields stay as arrays so the print doc can lay each entry out
 *  on its own line without splitting a joined string back apart — a contact
 *  name containing the separator would otherwise tear in half. CSV joins them
 *  on the way out. */
type ExportRow = {
  phase: string;
  stage: string;
  title: string;
  types: string[];
  status: string;
  priority: string;
  /** Empty when unassigned. Kept separate from `extras` so a CSV pivot on
   *  owner doesn't double-count the additional resources. */
  primary: string;
  extras: string[];
  due: string;
  completed: string;
  blockers: string[];
  notes: string;
  /** Derived once here so the CSV column and the print row agree. */
  overdue: boolean;
};

type ExportGroup = { stage: Stage | null; phase: string; rows: ExportRow[] };

type ExportSet = { groups: ExportGroup[]; rows: ExportRow[] };

function typeLabels(task: Task): string[] {
  return parseTaggedTitle(task.title).types.map(solutionTypeLabel);
}

function buildSet(opts: {
  stages: Stage[];
  tasks: Task[];
  phases: Phase[];
  blockersByTask: Map<string, Risk[]>;
  resolveAssignee: (a: { user_id: string | null; contact_id: string | null }) => string;
  /** All-tasks scope only: append a "(No stage)" group so stage-less tasks —
   *  invisible on the Tasks tab, which iterates stages — still export. */
  includeStageless: boolean;
}): ExportSet {
  const { stages, tasks, phases, blockersByTask, resolveAssignee, includeStageless } = opts;
  const phaseNames = new Map(phases.map((p) => [p.id, p.name]));
  const phaseOrder = new Map(phases.map((p) => [p.id, p.display_order]));
  const iso = todayIso();

  const toRow = (task: Task, stageName: string, phaseName: string): ExportRow => {
    const status = task.status ?? "not_started";
    const due = task.due_date ?? "";
    const extras = (task.assignees ?? []).map(resolveAssignee);
    return {
      phase: phaseName,
      stage: stageName,
      title: parseTaggedTitle(task.title).rawTitle || task.title,
      types: typeLabels(task),
      status: humanize(status, "Not Started"),
      priority: task.priority ? humanize(task.priority) : "",
      primary: task.assignee_user_id || task.assignee_contact_id
        ? resolveAssignee({ user_id: task.assignee_user_id, contact_id: task.assignee_contact_id })
        : "",
      extras,
      due,
      completed: task.completed_at?.slice(0, 10) ?? "",
      // Matches the Tasks tab's ⛔ glyph: active (non-closed) blockers only.
      blockers: (blockersByTask.get(task.id) ?? []).map((b) => b.title),
      notes: task.notes ?? "",
      overdue: !!due && status !== "completed" && due < iso,
    };
  };

  // Shared stages first, then by phase display_order, then stage sort_order —
  // the order the phase picker walks them in.
  const sorted = [...stages].sort((a, b) => {
    const pa = a.phase_id === null ? -1 : phaseOrder.get(a.phase_id) ?? 999;
    const pb = b.phase_id === null ? -1 : phaseOrder.get(b.phase_id) ?? 999;
    if (pa !== pb) return pa - pb;
    return a.sort_order - b.sort_order;
  });

  const groups: ExportGroup[] = sorted.map((stage) => {
    const phase = stage.phase_id === null ? SHARED_PHASE_LABEL : phaseNames.get(stage.phase_id) ?? "";
    return {
      stage,
      phase,
      rows: tasks.filter((t) => t.stage_id === stage.id).map((t) => toRow(t, stage.name, phase)),
    };
  });

  if (includeStageless) {
    const orphans = tasks.filter((t) => t.stage_id === null);
    if (orphans.length > 0) {
      groups.push({ stage: null, phase: "", rows: orphans.map((t) => toRow(t, "(No stage)", "")) });
    }
  }

  return { groups, rows: groups.flatMap((g) => g.rows) };
}

// ── CSV ─────────────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "Phase", "Stage", "Task", "Solution Types", "Status", "Priority",
  "Assignee", "Additional Resources", "Due Date", "Overdue",
  "Completed Date", "Blocked By", "Notes",
] as const;

function buildCsv(set: ExportSet): string {
  return buildCsvText(CSV_HEADERS, set.rows.map((r) => [
    r.phase, r.stage, r.title, r.types.join(" + "), r.status, r.priority,
    r.primary, r.extras.join("; "), r.due, r.overdue ? "Yes" : "",
    r.completed, r.blockers.join("; "), r.notes,
  ]));
}

// ── Print document ──────────────────────────────────────────────────────────

function buildTasksHtml(opts: {
  project: Project;
  set: ExportSet;
  scopeLabel: string;
}): string {
  const { project, set, scopeLabel } = opts;
  const logo = logoAbsoluteUrl();
  const cust = project.customer_display_name ?? project.customer_name ?? project.name;

  const rollup = rollupBlock([
    { n: set.rows.length, label: "Tasks", color: PF_NAVY },
    { n: set.rows.filter((r) => r.status === "Completed").length, label: "Completed", color: STATUS_COLOR.completed },
    { n: set.rows.filter((r) => r.status === "In Progress").length, label: "In Progress", color: STATUS_COLOR.in_progress },
    { n: set.rows.filter((r) => r.status === "Blocked" || r.blockers.length > 0).length, label: "Blocked", color: STATUS_COLOR.blocked },
    { n: set.rows.filter((r) => r.overdue).length, label: "Overdue", color: "#b45309" },
  ]);

  const stageSections = set.groups
    // Empty stages carry no information in a printed plan — the on-screen
    // "No tasks" placeholder exists so a PM knows where to add one.
    .filter((g) => g.rows.length > 0)
    .map((g) => {
      const s = g.stage;
      const subParts: string[] = [];
      if (g.phase) subParts.push(g.phase);
      if (s?.planned_start || s?.planned_end) {
        subParts.push(`${s?.planned_start ? shortDate(s.planned_start) : "—"} → ${s?.planned_end ? shortDate(s.planned_end) : "—"}`);
      }
      if (s?.status) subParts.push(humanize(s.status, "Not Started"));
      subParts.push(`${g.rows.length} task${g.rows.length === 1 ? "" : "s"}`);

      const rows = g.rows.map((r, i) => {
        const tags = r.types.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
        const people = [r.primary, ...r.extras].filter(Boolean);
        return `
          <tr class="${i % 2 === 0 ? "even" : "odd"}">
            <td>
              <div class="task-title">${tags}${esc(r.title)}</div>
              ${r.blockers.length ? `<div class="task-blocked">⛔ Blocked by: ${esc(r.blockers.join("; "))}</div>` : ""}
              ${r.notes ? `<div class="task-sub">${esc(r.notes)}</div>` : ""}
            </td>
            <td>${people.length ? people.map(esc).join("<br/>") : `<span class="muted">Unassigned</span>`}</td>
            <td class="${r.overdue ? "overdue" : ""}">${r.due ? esc(shortDate(r.due)) : `<span class="muted">—</span>`}${r.overdue ? " ⚠" : ""}</td>
            <td>${statusPill(r.status)}${r.completed ? `<div class="task-sub">${esc(shortDate(r.completed))}</div>` : ""}</td>
            <td>${r.priority ? esc(r.priority) : `<span class="muted">—</span>`}</td>
          </tr>
        `;
      }).join("");

      return `
        <div class="stage">
          <div class="stage-head">
            <div class="stage-name">${esc(g.stage?.name ?? "(No stage)")}</div>
            <div class="stage-sub">${esc(subParts.join(" · "))}</div>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th style="width:20%">Assignee</th>
                <th style="width:13%">Due</th>
                <th style="width:15%">Status</th>
                <th style="width:9%">Priority</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join("");

  return printDocument({
    title: `${cust} — Project Task Plan`,
    body: `
      ${printTipBlock()}
      ${coverBlock({
        eyebrow: "Implementation",
        title: "Project Task Plan",
        customerName: cust,
        meta: [
          { label: "Project", value: project.name },
          { label: "Scope", value: scopeLabel },
          { label: "Target Go-Live", value: longDate(project.target_go_live_date) },
          { label: "Issued", value: longDate(todayIso()) },
        ],
        logo,
      })}
      ${rollup}
      ${stageSections || `<p class="empty">No tasks to display.</p>`}
      ${footerBlock(logo)}
    `,
  });
}

// ── Menu ────────────────────────────────────────────────────────────────────

export default function TaskExportMenu({
  project,
  phases,
  stages,
  tasks,
  viewStages,
  viewTasks,
  viewLabel,
  blockersByTask,
  resolveAssignee,
}: {
  project: Project;
  phases: Phase[];
  /** Every stage on the project (all-tasks scope). */
  stages: Stage[];
  /** Every task on the project (all-tasks scope). */
  tasks: Task[];
  /** Stages currently on screen — phase-picker filtered. */
  viewStages: Stage[];
  /** Tasks passing the solution-type filter; intersected with viewStages here. */
  viewTasks: Task[];
  /** Phase name when the picker is narrowing the view, else null. */
  viewLabel: string | null;
  blockersByTask: Map<string, Risk[]>;
  resolveAssignee: (a: { user_id: string | null; contact_id: string | null }) => string;
}) {
  const viewSet = useMemo(
    () => buildSet({ stages: viewStages, tasks: viewTasks, phases, blockersByTask, resolveAssignee, includeStageless: false }),
    [viewStages, viewTasks, phases, blockersByTask, resolveAssignee]
  );
  const allSet = useMemo(
    () => buildSet({ stages, tasks, phases, blockersByTask, resolveAssignee, includeStageless: true }),
    [stages, tasks, phases, blockersByTask, resolveAssignee]
  );

  // Only worth offering both scopes when they'd actually differ. viewSet is
  // always a subset of allSet, so equal counts mean equal sets.
  const scopesDiffer = viewSet.rows.length !== allSet.rows.length;
  const viewScopeLabel = viewLabel ? `${viewLabel} (current view)` : "Current view";

  function filename(ext: string, scope: "view" | "all"): string {
    return `${slugify(project.name)}-tasks${scope === "all" ? "-all" : ""}-${todayIso()}.${ext}`;
  }

  function run(action: "csv" | "print", scope: "view" | "all") {
    const set = scope === "all" ? allSet : viewSet;
    if (action === "csv") {
      downloadCsv(buildCsv(set), filename("csv", scope));
    } else {
      openPrintWindow(buildTasksHtml({
        project,
        set,
        scopeLabel: scope === "all" ? "All tasks" : viewScopeLabel,
      }));
    }
  }

  const scopeItems = (icon: string, action: "csv" | "print"): ExportMenuItem[] => [
    { label: scopesDiffer ? viewScopeLabel : "Tasks", icon, count: viewSet.rows.length, onClick: () => run(action, "view") },
    ...(scopesDiffer ? [{ label: "All tasks", icon, count: allSet.rows.length, onClick: () => run(action, "all") }] : []),
  ];

  return (
    <ExportMenu
      groups={[
        { heading: "Spreadsheet", items: scopeItems("📊", "csv") },
        { heading: "Print / PDF", items: scopeItems("🖨", "print") },
      ]}
    />
  );
}

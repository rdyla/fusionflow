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
 * The print document follows the same window.open() → native print dialog
 * pattern as OptimizeExports / ScopeOfWorkDocument (PM hits Cmd-P → Save as
 * PDF). Its CSS shell is a trimmed copy of that one rather than a shared
 * import: those docs are customer-facing collateral with their own layout
 * vocabulary, and coupling them means a tweak to a cover page reflows three
 * unrelated documents.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import logoUrl from "../../assets/packetfusion-fullcolor.png";
import { parseTaggedTitle, solutionTypeLabel } from "../../../shared/solutionTypes";
import { humanize } from "../../lib/format";
import type { Phase, Project, Risk, Stage, Task } from "../../lib/api";

// ── Brand constants (mirrors OptimizeExports / ScopeOfWorkDocument) ─────────
const PF_NAVY  = "#003B5C";
const PF_GREEN = "#17C662";
const PF_GREY  = "#D9E1E2";

// Same palette the Tasks tab uses for status text + stage badges.
const STATUS_COLOR: Record<string, string> = {
  completed:   "#059669",
  in_progress: "#0891b2",
  not_started: "#94a3b8",
  blocked:     "#d13438",
};

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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

/** Quote-and-escape one cell. The leading-character guard stops Excel/Sheets
 *  from evaluating a task title like "=cmd|…" as a formula on open; "-" is
 *  deliberately not guarded since titles legitimately start with a dash far
 *  more often than they start a formula. */
function csvCell(value: string): string {
  const guarded = /^[=+@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function buildCsv(set: ExportSet): string {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const r of set.rows) {
    lines.push([
      r.phase, r.stage, r.title, r.types.join(" + "), r.status, r.priority,
      r.primary, r.extras.join("; "), r.due, r.overdue ? "Yes" : "",
      r.completed, r.blockers.join("; "), r.notes,
    ].map(csvCell).join(","));
  }
  // CRLF + BOM: Excel needs the BOM to read the UTF-8 "·" in assignee labels
  // (and em dashes in notes) as anything other than mojibake. Escaped rather
  // than a literal so the character survives a copy/paste of this file.
  return "\uFEFF" + lines.join("\r\n");
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
}

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Print document ──────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function longDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'avenir-lt-pro', 'Segoe UI', system-ui, -apple-system, Arial, sans-serif;
    font-size: 10.5pt; color: #1e293b; background: #fff;
  }
  .page { max-width: 900px; margin: 0 auto; padding: 48px 56px; }

  /* Cover */
  .cover { padding-bottom: 28px; margin-bottom: 24px; }
  .cover-banner {
    background: ${PF_GREY}; margin: -48px -56px 44px; padding: 50px 56px 22px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .cover-banner img { height: 60px; width: auto; display: block; }
  .cover-eyebrow { font-size: 10pt; font-weight: 700; color: ${PF_GREEN}; text-transform: uppercase; letter-spacing: 0.18em; margin-bottom: 16px; }
  .cover-title { font-size: 32pt; font-weight: 800; color: ${PF_NAVY}; letter-spacing: -0.02em; line-height: 1.05; margin-bottom: 22px; }
  .cover-for { font-size: 10.5pt; color: #64748b; margin-bottom: 6px; }
  .cover-customer { font-size: 20pt; font-weight: 800; color: ${PF_NAVY}; line-height: 1.1; margin-bottom: 26px; }
  .cover-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; padding-top: 20px; border-top: 2px solid ${PF_GREEN}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cover-meta-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: ${PF_GREEN}; margin-bottom: 5px; }
  .cover-meta-value { font-size: 10.5pt; font-weight: 700; color: ${PF_NAVY}; line-height: 1.3; }

  /* Roll-up strip */
  .rollup {
    display: flex; gap: 16px; padding: 18px 24px; background: ${PF_GREY};
    border-left: 6px solid ${PF_GREEN}; margin-bottom: 26px;
    page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .rollup-cell { flex: 1; text-align: center; }
  .rollup-num { font-size: 26pt; font-weight: 900; line-height: 1; }
  .rollup-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-top: 5px; }

  /* Stage sections */
  .stage { margin-bottom: 26px; page-break-inside: auto; }
  .stage-head { margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid ${PF_GREEN}; page-break-after: avoid; break-after: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .stage-name { font-size: 13pt; font-weight: 800; color: ${PF_NAVY}; letter-spacing: -0.01em; }
  .stage-sub { font-size: 9pt; color: #64748b; margin-top: 3px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; }
  .data-table thead tr { background: ${PF_NAVY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .data-table thead th { padding: 8px 10px; color: #fff; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: 0.06em; font-size: 7.5pt; }
  .data-table tbody tr.even { background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .data-table tbody td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; line-height: 1.45; font-size: 9.5pt; page-break-inside: avoid; }
  .task-title { font-weight: 600; color: ${PF_NAVY}; }
  .task-sub { font-size: 8.5pt; color: #64748b; margin-top: 2px; line-height: 1.4; }
  .task-blocked { font-size: 8.5pt; color: #d13438; font-weight: 600; margin-top: 2px; }

  .pill { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tag { display: inline-block; padding: 1px 7px; border-radius: 3px; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.04em; background: rgba(0,59,92,0.08); color: ${PF_NAVY}; margin-right: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .overdue { color: #b45309; font-weight: 700; }
  .muted { color: #94a3b8; }

  .empty { color: #64748b; font-size: 10pt; font-style: italic; padding: 6px 0; }

  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 7.5pt; color: #94a3b8; display: flex; align-items: center; justify-content: space-between; }
  .footer img { height: 16px; width: auto; opacity: 0.5; }

  .print-tip { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 16px; margin-bottom: 24px; font-size: 9.5pt; color: #92400e; display: flex; align-items: center; gap: 10px; }

  @media print {
    .print-tip { display: none !important; }
    @page { margin: 14mm 16mm; }
  }
`;

function logoAbsoluteUrl(): string {
  return logoUrl.startsWith("http") ? logoUrl : `${window.location.origin}${logoUrl}`;
}

function statusPill(status: string): string {
  const key = status.toLowerCase().replace(/ /g, "_");
  const color = STATUS_COLOR[key] ?? "#94a3b8";
  return `<span class="pill" style="background:${color}1a;color:${color};border:1px solid ${color}40">${esc(status)}</span>`;
}

function buildTasksHtml(opts: {
  project: Project;
  set: ExportSet;
  scopeLabel: string;
}): string {
  const { project, set, scopeLabel } = opts;
  const logo = logoAbsoluteUrl();
  const cust = project.customer_display_name ?? project.customer_name ?? project.name;

  const total     = set.rows.length;
  const done      = set.rows.filter((r) => r.status === "Completed").length;
  const active    = set.rows.filter((r) => r.status === "In Progress").length;
  const blocked   = set.rows.filter((r) => r.status === "Blocked" || r.blockers.length > 0).length;
  const overdue   = set.rows.filter((r) => r.overdue).length;

  const rollup = [
    { n: total,   label: "Tasks",       color: PF_NAVY },
    { n: done,    label: "Completed",   color: STATUS_COLOR.completed },
    { n: active,  label: "In Progress", color: STATUS_COLOR.in_progress },
    { n: blocked, label: "Blocked",     color: STATUS_COLOR.blocked },
    { n: overdue, label: "Overdue",     color: "#b45309" },
  ].map((c) => `
    <div class="rollup-cell">
      <div class="rollup-num" style="color:${c.color}">${c.n}</div>
      <div class="rollup-label">${esc(c.label)}</div>
    </div>
  `).join("");

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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(cust)} — Project Task Plan</title>
  <link rel="stylesheet" href="https://use.typekit.net/dty1vuu.css"/>
  <style>${PRINT_CSS}</style>
</head>
<body>
<div class="page">
  <div class="print-tip">
    <span style="font-size:14pt">💡</span>
    <span>In the print dialog, uncheck <strong>"Headers and footers"</strong> (Chrome) or <strong>"Print headers and footers"</strong> (Firefox/Edge) to remove the browser URL and date.</span>
  </div>

  <div class="cover">
    <div class="cover-banner">
      <img src="${logo}" alt="Packet Fusion" onerror="this.style.display='none'"/>
    </div>
    <div class="cover-eyebrow">Implementation</div>
    <div class="cover-title">Project Task Plan</div>
    <div class="cover-for">Prepared for</div>
    <div class="cover-customer">${esc(cust)}</div>
    <div class="cover-meta">
      <div><div class="cover-meta-label">Project</div><div class="cover-meta-value">${esc(project.name)}</div></div>
      <div><div class="cover-meta-label">Scope</div><div class="cover-meta-value">${esc(scopeLabel)}</div></div>
      <div><div class="cover-meta-label">Target Go-Live</div><div class="cover-meta-value">${esc(longDate(project.target_go_live_date))}</div></div>
      <div><div class="cover-meta-label">Issued</div><div class="cover-meta-value">${esc(longDate(todayIso()))}</div></div>
    </div>
  </div>

  <div class="rollup">${rollup}</div>

  ${stageSections || `<p class="empty">No tasks to display.</p>`}

  <div class="footer">
    <span>CloudConnect by Packet Fusion · ${esc(longDate(todayIso()))}</span>
    <img src="${logo}" alt="" onerror="this.style.display='none'"/>
  </div>
</div>
</body>
</html>`;
}

/** Open the doc in a new tab and fire the print dialog once images have
 *  decoded — printing earlier lays the logo out in a default squished box
 *  because its intrinsic ratio isn't known yet. (Lifted from OptimizeExports.) */
function openPrintWindow(html: string): void {
  const win = window.open("", "_blank", "width=1000,height=780");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try { win.focus(); win.print(); } catch { /* window closed */ }
  };

  const imgs = Array.from(win.document.images);
  if (imgs.length === 0) {
    setTimeout(triggerPrint, 250);
    return;
  }
  let remaining = imgs.length;
  const onSettled = () => { remaining -= 1; if (remaining <= 0) setTimeout(triggerPrint, 120); };
  for (const img of imgs) {
    if (img.complete) onSettled();
    else {
      img.addEventListener("load", onSettled);
      img.addEventListener("error", onSettled);
    }
  }
  setTimeout(triggerPrint, 2500);
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const viewSet = useMemo(
    () => buildSet({ stages: viewStages, tasks: viewTasks, phases, blockersByTask, resolveAssignee, includeStageless: false }),
    [viewStages, viewTasks, phases, blockersByTask, resolveAssignee]
  );
  const allSet = useMemo(
    () => buildSet({ stages, tasks, phases, blockersByTask, resolveAssignee, includeStageless: true }),
    [stages, tasks, phases, blockersByTask, resolveAssignee]
  );

  // Only worth offering both scopes when they'd actually differ.
  const scopesDiffer = viewSet.rows.length !== allSet.rows.length;
  const viewScopeLabel = viewLabel ? `${viewLabel} (current view)` : "Current view";

  function filename(ext: string, scope: "view" | "all"): string {
    return `${slugify(project.name)}-tasks${scope === "all" ? "-all" : ""}-${todayIso()}.${ext}`;
  }

  function run(action: "csv" | "print", scope: "view" | "all") {
    setOpen(false);
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

  const itemStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
    background: "none", border: "none", padding: "7px 12px", fontSize: 12.5,
    color: "#1e293b", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
  };
  const countStyle: React.CSSProperties = { marginLeft: "auto", color: "#94a3b8", fontSize: 11 };

  const item = (label: string, icon: string, count: number, onClick: () => void) => (
    <button
      type="button"
      style={itemStyle}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
      onClick={onClick}
    >
      <span>{icon}</span>
      <span>{label}</span>
      <span style={countStyle}>{count}</span>
    </button>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="ms-btn-secondary"
        onClick={() => setOpen((v) => !v)}
        style={{ fontSize: 12, padding: "4px 10px", whiteSpace: "nowrap" }}
        title="Export this task list to CSV or a print-ready document"
      >
        ⬇ Export ▾
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 30,
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6,
            boxShadow: "0 6px 20px rgba(0,0,0,0.12)", padding: "4px 0", minWidth: 236,
          }}
        >
          <div style={{ padding: "4px 12px 5px", fontSize: 9.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Spreadsheet
          </div>
          {item(scopesDiffer ? viewScopeLabel : "Tasks", "📊", viewSet.rows.length, () => run("csv", "view"))}
          {scopesDiffer && item("All tasks", "📊", allSet.rows.length, () => run("csv", "all"))}
          <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }} />
          <div style={{ padding: "4px 12px 5px", fontSize: 9.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Print / PDF
          </div>
          {item(scopesDiffer ? viewScopeLabel : "Tasks", "🖨", viewSet.rows.length, () => run("print", "view"))}
          {scopesDiffer && item("All tasks", "🖨", allSet.rows.length, () => run("print", "all"))}
        </div>
      )}
    </div>
  );
}

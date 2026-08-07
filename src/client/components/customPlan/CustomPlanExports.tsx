/**
 * ONE-OFF / THROWAWAY — exports for the MedVet Zoom custom plan.
 *
 * The standard Tasks tab gets its export from project/TaskExports. This plan
 * can't reuse that row model: its "stages" are Asana sections, tasks nest three
 * levels deep, each carries a Module tag and BOTH a start and a due date, and
 * dependencies ("blocked by" another task) are a real feature here. So this
 * module builds its own rows and its own document, sharing only the primitives
 * in lib/exportKit and the dropdown in ui/ExportMenu.
 *
 * Nothing outside this folder imports it, so the teardown in CustomPlan.tsx
 * stays a folder delete.
 */
import { useMemo } from "react";
import type { CustomPlanItem, Project, Risk } from "../../lib/api";
import { isPlanDate } from "../../../shared/planDates";
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

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started", in_progress: "In Progress", completed: "Completed", blocked: "Blocked",
};
// Mirrors CustomPlan's own MODULE_COLOR so a printed plan reads like the screen.
const MODULE_COLOR: Record<string, string> = {
  "UCaaS": "#0078d4", "CCaaS": "#8764b8", "Integrations": "#ca5010",
  "AI Expert Assist": "#059669", "Quality Management": "#e74856", "Workforce Management": "#b146c2",
};

// ── Row model ───────────────────────────────────────────────────────────────

type PlanRow = {
  section: string;
  depth: number;
  parent: string;
  name: string;
  module: string;
  start: string;
  due: string;
  status: string;
  statusKey: string;
  assignee: string;
  /** Prerequisite tasks, each already marked done / outstanding. */
  prereqs: string[];
  /** Whether any prerequisite is still incomplete — drives the print marker. */
  prereqsOpen: boolean;
  /** Active (non-closed) risk blockers linked to this item. */
  blockers: string[];
  notes: string;
  overdue: boolean;
  /** A date present but outside the plausible window (see isPlanDate). Printed
   *  as-is but never treated as overdue, and counted in a warning strip so an
   *  exported plan doesn't present a typo'd year as fact. */
  badDate: boolean;
};

type PlanGroup = { section: string; rows: PlanRow[] };
type PlanSet = { groups: PlanGroup[]; rows: PlanRow[] };

function buildSet(opts: {
  items: CustomPlanItem[];
  sections: string[];
  blockersByItem: Map<string, Risk[]>;
  resolveAssignee: (it: CustomPlanItem) => string;
}): PlanSet {
  const { items, sections, blockersByItem, resolveAssignee } = opts;
  const byId = new Map(items.map((i) => [i.id, i]));
  const iso = todayIso();

  const toRow = (it: CustomPlanItem): PlanRow => {
    const due = it.due_date ?? "";
    const start = it.start_date ?? "";
    const dueUsable = !!due && isPlanDate(due);
    const prereqItems = it.blocked_by.map((id) => byId.get(id)).filter((x): x is CustomPlanItem => !!x);
    return {
      section: it.section,
      depth: it.depth,
      parent: it.parent_id ? byId.get(it.parent_id)?.name ?? "" : "",
      name: it.name,
      // "Not Applicable" is the Asana tag for "no module" — blank reads better
      // in a spreadsheet than a phrase that looks like a real value.
      module: it.module && it.module !== "Not Applicable" ? it.module : "",
      start,
      due,
      status: STATUS_LABEL[it.status] ?? it.status,
      statusKey: it.status,
      assignee: resolveAssignee(it),
      prereqs: prereqItems.map((p) => `${p.status === "completed" ? "✓" : "•"} ${p.name}`),
      prereqsOpen: prereqItems.some((p) => p.status !== "completed"),
      blockers: (blockersByItem.get(it.id) ?? []).map((b) => b.title),
      notes: it.notes ?? "",
      overdue: dueUsable && it.status !== "completed" && due < iso,
      badDate: (!!due && !isPlanDate(due)) || (!!start && !isPlanDate(start)),
    };
  };

  // sort_order within a section already yields a correct parents-before-children
  // outline (the Asana seed is in document order) — same ordering the tab renders.
  const groups: PlanGroup[] = sections.map((section) => ({
    section,
    rows: items
      .filter((i) => i.section === section)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(toRow),
  }));

  // Anything whose section fell out of the section list would silently vanish.
  const known = new Set(sections);
  const orphans = items.filter((i) => !known.has(i.section));
  if (orphans.length > 0) {
    groups.push({ section: "(No section)", rows: orphans.sort((a, b) => a.sort_order - b.sort_order).map(toRow) });
  }

  return { groups, rows: groups.flatMap((g) => g.rows) };
}

// ── CSV ─────────────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "Section", "Level", "Parent Task", "Task", "Module", "Start Date", "Due Date",
  "Overdue", "Status", "Assignee", "Prerequisites", "Open Blockers", "Notes",
] as const;

function buildCsv(set: PlanSet): string {
  return buildCsvText(CSV_HEADERS, set.rows.map((r) => [
    r.section, String(r.depth + 1), r.parent, r.name, r.module, r.start, r.due,
    r.overdue ? "Yes" : "", r.status, r.assignee,
    r.prereqs.join("; "), r.blockers.join("; "), r.notes,
  ]));
}

// ── Print document ──────────────────────────────────────────────────────────

function buildPlanHtml(project: Project, set: PlanSet): string {
  const logo = logoAbsoluteUrl();
  const cust = project.customer_display_name ?? project.customer_name ?? project.name;

  const badDates = set.rows.filter((r) => r.badDate).length;

  // "Blocked" counts a hard status, a linked risk, OR an outstanding
  // prerequisite — on this plan any of the three actually stops the work.
  const rollup = rollupBlock([
    { n: set.rows.length, label: "Tasks", color: PF_NAVY },
    { n: set.rows.filter((r) => r.statusKey === "completed").length, label: "Completed", color: STATUS_COLOR.completed },
    { n: set.rows.filter((r) => r.statusKey === "in_progress").length, label: "In Progress", color: STATUS_COLOR.in_progress },
    { n: set.rows.filter((r) => r.statusKey === "blocked" || r.blockers.length > 0 || r.prereqsOpen).length, label: "Blocked", color: STATUS_COLOR.blocked },
    { n: set.rows.filter((r) => r.overdue).length, label: "Overdue", color: "#b45309" },
  ]);

  // Mirrors the Timeline tab's out-of-range warning so the printed plan doesn't
  // present a typo'd year as though it were real.
  const badDateNotice = badDates > 0
    ? `<div class="date-warning"><strong>${badDates} task${badDates === 1 ? "" : "s"}</strong> carry a date outside the plausible range and are shown as stored — fix them on the Tasks tab.</div>`
    : "";

  const sections = set.groups
    .filter((g) => g.rows.length > 0)
    .map((g) => {
      const rows = g.rows.map((r, i) => {
        const moduleChip = r.module
          ? `<span class="tag" style="background:${(MODULE_COLOR[r.module] ?? "#64748b")}1a;color:${MODULE_COLOR[r.module] ?? "#64748b"}">${esc(r.module)}</span>`
          : "";
        // Same outline cues the tab uses: └ for a subtask, · for its child.
        const marker = r.depth === 1 ? "└ " : r.depth === 2 ? "· " : "";
        const dateCell = (v: string, isOverdue: boolean) =>
          v
            ? `<span class="${isOverdue ? "overdue" : ""}">${esc(isPlanDate(v) ? shortDate(v) : v)}${isOverdue ? " ⚠" : ""}</span>`
            : `<span class="muted">—</span>`;
        return `
          <tr class="${i % 2 === 0 ? "even" : "odd"}">
            <td>
              <div class="task-title" style="padding-left:${r.depth * 16}px;font-weight:${r.depth === 0 ? 700 : 400}">
                ${moduleChip}<span class="muted">${marker}</span>${esc(r.name)}
              </div>
              ${r.blockers.length ? `<div class="task-blocked" style="padding-left:${r.depth * 16}px">⛔ Blocked by: ${esc(r.blockers.join("; "))}</div>` : ""}
              ${r.prereqs.length ? `<div class="task-sub" style="padding-left:${r.depth * 16}px"><strong>${r.prereqsOpen ? "⛔ Blocked by" : "✓ Prereqs done"}:</strong> ${esc(r.prereqs.join("  "))}</div>` : ""}
              ${r.notes ? `<div class="task-sub" style="padding-left:${r.depth * 16}px">${esc(r.notes)}</div>` : ""}
            </td>
            <td>${r.assignee ? esc(r.assignee) : `<span class="muted">Unassigned</span>`}</td>
            <td>${dateCell(r.start, false)}</td>
            <td>${dateCell(r.due, r.overdue)}</td>
            <td>${statusPill(r.status)}</td>
          </tr>
        `;
      }).join("");

      return `
        <div class="stage">
          <div class="stage-head">
            <div class="stage-name">${esc(g.section)}</div>
            <div class="stage-sub">${g.rows.length} task${g.rows.length === 1 ? "" : "s"}</div>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th style="width:17%">Assignee</th>
                <th style="width:12%">Start</th>
                <th style="width:12%">Due</th>
                <th style="width:14%">Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }).join("");

  return printDocument({
    title: `${cust} — Project Plan`,
    body: `
      ${printTipBlock()}
      ${coverBlock({
        eyebrow: "Implementation",
        title: "Project Plan",
        customerName: cust,
        meta: [
          { label: "Project", value: project.name },
          { label: "Sections", value: String(set.groups.filter((g) => g.rows.length > 0).length) },
          { label: "Target Go-Live", value: longDate(project.target_go_live_date) },
          { label: "Issued", value: longDate(todayIso()) },
        ],
        logo,
      })}
      ${rollup}
      ${badDateNotice}
      ${sections || `<p class="empty">No plan items to display.</p>`}
      ${footerBlock(logo)}
    `,
  });
}

// ── Menu ────────────────────────────────────────────────────────────────────

export default function CustomPlanExportMenu({
  project,
  items,
  sections,
  blockersByItem,
  resolveAssignee,
}: {
  project: Project;
  items: CustomPlanItem[];
  sections: string[];
  blockersByItem: Map<string, Risk[]>;
  /** Same resolution the table cell uses — real user/contact ref wins, else the
   *  imported Asana label. Passed in so there's one definition of it. */
  resolveAssignee: (it: CustomPlanItem) => string;
}) {
  const set = useMemo(
    () => buildSet({ items, sections, blockersByItem, resolveAssignee }),
    [items, sections, blockersByItem, resolveAssignee]
  );

  // The plan has no phase picker or type filter, so there's a single scope —
  // one item per format rather than the standard tab's view/all pair.
  const csvItem: ExportMenuItem = {
    label: "Project plan", icon: "📊", count: set.rows.length,
    onClick: () => downloadCsv(buildCsv(set), `${slugify(project.name)}-plan-${todayIso()}.csv`),
  };
  const printItem: ExportMenuItem = {
    label: "Project plan", icon: "🖨", count: set.rows.length,
    onClick: () => openPrintWindow(buildPlanHtml(project, set)),
  };

  return (
    <ExportMenu
      tooltip="Export this project plan to CSV or a print-ready document"
      groups={[
        { heading: "Spreadsheet", items: [csvItem] },
        { heading: "Print / PDF", items: [printItem] },
      ]}
    />
  );
}

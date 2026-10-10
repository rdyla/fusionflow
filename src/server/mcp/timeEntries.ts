import type { Bindings } from "../types";
import { addDays, pacificToUtc, utcToPacific } from "../lib/pacificTime";

/**
 * Time entries as CloudConnect recorded them — the project, stage and task
 * shadow tables, each row 1:1 with the amc_timeentry it pushed to CE. These are
 * the entries the MCP can later edit or delete; time keyed straight into CE
 * isn't here (it shows up in a project's hours_used instead).
 */

type EntryRow = {
  kind: "project" | "stage" | "task";
  id: string;
  project_id: string;
  project_name: string;
  customer_name: string | null;
  label: string | null;
  note: string | null;
  scheduled_start: string;
  scheduled_end: string;
  crm_time_entry_id: string | null;
  user_id: string | null;
  user_name: string | null;
  created_at: string | null;
};

const ENTRIES_SQL = `
  SELECT 'project' AS kind, e.id, e.project_id, NULL AS label, e.note,
         e.scheduled_start, e.scheduled_end, e.crm_time_entry_id, e.user_id, e.created_at
    FROM project_time_entries e
  UNION ALL
  SELECT 'stage', e.id, e.project_id, s.name, e.note,
         e.scheduled_start, e.scheduled_end, e.crm_time_entry_id, e.user_id, e.created_at
    FROM stage_time_entries e LEFT JOIN stages s ON s.id = e.stage_id
  UNION ALL
  SELECT 'task', e.id, e.project_id, t.title, NULL,
         e.scheduled_start, e.scheduled_end, e.crm_time_entry_id, e.user_id, e.created_at
    FROM task_time_entries e LEFT JOIN tasks t ON t.id = e.task_id
`;

export type ListEntriesOptions = {
  /** Only these projects. Callers must have checked visibility. */
  projectIds?: string[];
  /** Only this user's entries. */
  userId?: string;
  /** Inclusive Pacific dates, YYYY-MM-DD. */
  from?: string;
  to?: string;
};

export async function listTimeEntries(env: Bindings, opts: ListEntriesOptions) {
  const where: string[] = ["x.scheduled_start IS NOT NULL", "x.scheduled_end IS NOT NULL"];
  const binds: unknown[] = [];

  if (opts.projectIds) {
    if (opts.projectIds.length === 0) return [];
    where.push(`x.project_id IN (${opts.projectIds.map(() => "?").join(",")})`);
    binds.push(...opts.projectIds);
  }
  if (opts.userId) { where.push("x.user_id = ?"); binds.push(opts.userId); }
  // Stored values are UTC ISO strings, so the Pacific day bounds compare as text.
  if (opts.from) { where.push("x.scheduled_start >= ?"); binds.push(pacificToUtc(opts.from).toISOString()); }
  if (opts.to) { where.push("x.scheduled_start < ?"); binds.push(pacificToUtc(addDays(opts.to, 1)).toISOString()); }

  const rows = (await env.DB
    .prepare(
      `SELECT x.*, p.name AS project_name, COALESCE(c.name, p.customer_name) AS customer_name, u.name AS user_name
         FROM (${ENTRIES_SQL}) x
         JOIN projects p ON p.id = x.project_id
         LEFT JOIN customers c ON c.id = p.customer_id
         LEFT JOIN users u ON u.id = x.user_id
        WHERE ${where.join(" AND ")}
        ORDER BY x.scheduled_start DESC
        LIMIT 500`
    )
    .bind(...binds)
    .all<EntryRow>()).results ?? [];

  return rows.map(formatEntry);
}

function formatEntry(r: EntryRow) {
  const start = utcToPacific(r.scheduled_start);
  const end = utcToPacific(r.scheduled_end);
  const hours = (Date.parse(r.scheduled_end) - Date.parse(r.scheduled_start)) / 3600000;
  return {
    entry_id: r.id,
    // Which table it lives in; edit/delete need it alongside the id.
    level: r.kind,
    project_id: r.project_id,
    customer: r.customer_name,
    project: r.project_name,
    stage_or_task: r.label,
    description: r.note,
    date: start.date,
    start_time_pacific: start.time,
    end_time_pacific: end.time,
    hours: Math.round(hours * 100) / 100,
    logged_by: r.user_name,
    ce_time_entry_id: r.crm_time_entry_id,
    logged_at: r.created_at,
  };
}

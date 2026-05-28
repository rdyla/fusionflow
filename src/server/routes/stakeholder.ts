/**
 * Stakeholder Dashboard aggregation endpoint.
 *
 * Anchored on a single project. Stats are scoped to that project — there is
 * no longer a customer-rollup across sibling projects (that was the wrong
 * abstraction; see PR following #211). Multi-site behavior lives INSIDE the
 * project via the `sites` table: e.g. City of Thousand Oaks is one project
 * containing Libraries / Treatment / HQ sites, each with its own per-site
 * PMI stage chain and go-live date. The Initiate stage is shared across all
 * sites (its stage row has site_id = NULL).
 *
 * Single-site projects (sites table empty) get a clean two-row layout: stat
 * tiles + three detail columns. Multi-site projects render an adaptive
 * Sites row showing each site's progress / go-live / health.
 *
 * Access is gated by the existing `canViewProject()` — internal staff,
 * customer contacts authenticated as `client` matched by
 * `dynamics_account_id`, and partner AEs explicitly attached via
 * `project_staff` all see the same payload.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { canViewProject } from "../services/accessService";
import { computeProjectHealth, computeSiteHealth, type HealthValue } from "../lib/healthScore";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

type ProjectRow = {
  id: string;
  name: string;
  customer_name: string | null;
  customer_id: string | null;
  pm_user_id: string | null;
  target_go_live_date: string | null;
  updated_at: string | null;
  crm_case_id: string | null;
  sharepoint_folder_url: string | null;
  status_meeting_title: string | null;
  status_meeting_dow: number | null;
  status_meeting_time_local: string | null;
  status_meeting_timezone: string | null;
  status_meeting_duration_min: number | null;
  status_meeting_join_url: string | null;
};

type SiteRow = {
  id: string;
  name: string;
  target_go_live_date: string | null;
  display_order: number;
};

app.get("/:id/stakeholder-summary", async (c) => {
  const projectId = c.req.param("id");
  const auth = c.get("auth");
  if (!(await canViewProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Not allowed" });
  }

  const db = c.env.DB;
  const project = await db
    .prepare(
      `SELECT id, name, customer_name, customer_id, pm_user_id,
              target_go_live_date, updated_at, crm_case_id, sharepoint_folder_url,
              status_meeting_title, status_meeting_dow, status_meeting_time_local,
              status_meeting_timezone, status_meeting_duration_min, status_meeting_join_url
       FROM projects WHERE id = ?`
    )
    .bind(projectId)
    .first<ProjectRow>();

  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // ── Parallel: everything scoped to this one project ────────────────────────
  const [
    sitesRows,
    taskStats,
    perSiteTaskCounts,
    openTasks,
    assigneeAgg,
    assigneeStageAgg,
    blockers,
    notes,
    pmRow,
    engineerRows,
    primaryContactRow,
    partnerAeRow,
    customerRow,
    nextMeetingTaskRow,
    docRow,
    projectHealth,
    stageRows,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, target_go_live_date, display_order
         FROM sites WHERE project_id = ?
         ORDER BY display_order ASC, COALESCE(target_go_live_date, '9999-12-31') ASC, name ASC`
      )
      .bind(projectId)
      .all<SiteRow>(),
    db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'completed'   THEN 1 ELSE 0 END) AS done,
           SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
           SUM(CASE WHEN status IS NULL OR status NOT IN ('completed','in_progress') THEN 1 ELSE 0 END) AS not_started
         FROM tasks WHERE project_id = ?`
      )
      .bind(projectId)
      .first<{ total: number; done: number; in_progress: number; not_started: number }>(),
    // Per-site task counts joined through stages.site_id. Tasks on shared
    // stages (site_id IS NULL) land under a NULL key and aren't rolled into
    // any site card — they belong to the shared Initiate stage.
    db
      .prepare(
        `SELECT p.site_id AS site_id,
                COUNT(*) AS total,
                SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS done
         FROM tasks t
         JOIN stages p ON p.id = t.stage_id
         WHERE t.project_id = ?
         GROUP BY p.site_id`
      )
      .bind(projectId)
      .all<{ site_id: string | null; total: number; done: number }>(),
    db
      .prepare(
        `SELECT t.id, t.title, t.due_date, t.priority, t.stage_id, t.status,
                t.meeting_join_url, t.assignee_user_id, u.name AS assignee_name,
                p.site_id AS site_id
         FROM tasks t
         LEFT JOIN users u  ON u.id = t.assignee_user_id
         LEFT JOIN stages p ON p.id = t.stage_id
         WHERE t.project_id = ? AND (t.status IS NULL OR t.status != 'completed')
         ORDER BY COALESCE(t.due_date, '9999-12-31') ASC
         LIMIT 8`
      )
      .bind(projectId)
      .all<{ id: string; title: string; due_date: string | null; priority: string | null; stage_id: string | null; status: string | null; meeting_join_url: string | null; assignee_user_id: string | null; assignee_name: string | null; site_id: string | null }>(),
    // Per-assignee × per-site pivot. Tasks on shared stages land under a
    // NULL site_id key and surface in a separate "shared" total.
    db
      .prepare(
        `SELECT t.assignee_user_id, u.name AS assignee_name,
                p.site_id AS site_id, COUNT(*) AS cnt
         FROM tasks t
         LEFT JOIN users u  ON u.id = t.assignee_user_id
         LEFT JOIN stages p ON p.id = t.stage_id
         WHERE t.project_id = ? AND (t.status IS NULL OR t.status != 'completed')
           AND t.assignee_user_id IS NOT NULL
         GROUP BY t.assignee_user_id, p.site_id`
      )
      .bind(projectId)
      .all<{ assignee_user_id: string; assignee_name: string | null; site_id: string | null; cnt: number }>(),
    // Per-assignee × stage-name pivot for the "By assignee" breakdown on
    // the Open Tasks panel. Stages are grouped by NAME so multi-site
    // projects collapse "Plan" across all sites into a single column —
    // the PM wants "how many open tasks does Sarah have in Execute"
    // regardless of which site that work belongs to.
    db
      .prepare(
        `SELECT t.assignee_user_id, u.name AS assignee_name,
                p.name AS stage_name, MIN(p.sort_order) AS sort_order,
                COUNT(*) AS cnt
         FROM tasks t
         LEFT JOIN users u  ON u.id = t.assignee_user_id
         LEFT JOIN stages p ON p.id = t.stage_id
         WHERE t.project_id = ? AND (t.status IS NULL OR t.status != 'completed')
           AND t.assignee_user_id IS NOT NULL
           AND p.name IS NOT NULL
         GROUP BY t.assignee_user_id, p.name`
      )
      .bind(projectId)
      .all<{ assignee_user_id: string; assignee_name: string | null; stage_name: string; sort_order: number | null; cnt: number }>(),
    db
      .prepare(
        `SELECT r.id, r.title, r.description, r.severity, r.status,
                r.owner_user_id, u.name AS owner_name
         FROM risks r
         LEFT JOIN users u ON u.id = r.owner_user_id
         WHERE r.project_id = ? AND (r.status IS NULL OR r.status != 'resolved')
         ORDER BY
           CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           r.title`
      )
      .bind(projectId)
      .all<{ id: string; title: string; description: string | null; severity: string | null; status: string | null; owner_user_id: string | null; owner_name: string | null }>(),
    db
      .prepare(
        `SELECT n.id, n.body, n.created_at, n.visibility, u.name AS author_name
         FROM notes n
         LEFT JOIN users u ON u.id = n.author_user_id
         WHERE n.project_id = ?
         ORDER BY n.created_at DESC
         LIMIT 8`
      )
      .bind(projectId)
      .all<{ id: string; body: string; created_at: string; visibility: string | null; author_name: string | null }>(),
    project.pm_user_id
      ? db.prepare("SELECT id, name, email, title, phone, scheduler_url, avatar_url FROM users WHERE id = ?").bind(project.pm_user_id).first<{ id: string; name: string | null; email: string; title: string | null; phone: string | null; scheduler_url: string | null; avatar_url: string | null }>()
      : Promise.resolve(null),
    db
      .prepare(
        `SELECT u.id, u.name, u.email, u.title, u.phone, u.scheduler_url, u.avatar_url FROM project_staff ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.project_id = ? AND ps.staff_role = 'engineer'
         ORDER BY ps.created_at ASC`
      )
      .bind(projectId)
      .all<{ id: string; name: string | null; email: string; title: string | null; phone: string | null; scheduler_url: string | null; avatar_url: string | null }>(),
    db
      .prepare(
        `SELECT name, email, job_title FROM project_contacts
         WHERE project_id = ? ORDER BY added_at ASC LIMIT 1`
      )
      .bind(projectId)
      .first<{ name: string; email: string | null; job_title: string | null }>(),
    db
      .prepare(
        `SELECT u.id, u.name, u.email, u.title, u.phone, u.scheduler_url, u.avatar_url FROM project_staff ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.project_id = ? AND ps.staff_role = 'partner_ae'
         ORDER BY ps.created_at ASC LIMIT 1`
      )
      .bind(projectId)
      .first<{ id: string; name: string | null; email: string; title: string | null; phone: string | null; scheduler_url: string | null; avatar_url: string | null }>(),
    project.customer_id
      ? db.prepare("SELECT sharepoint_url FROM customers WHERE id = ?").bind(project.customer_id).first<{ sharepoint_url: string | null }>()
      : Promise.resolve(null),
    db
      .prepare(
        `SELECT id, title, due_date, meeting_join_url FROM tasks
         WHERE project_id = ?
           AND meeting_join_url IS NOT NULL AND meeting_join_url != ''
           AND (status IS NULL OR status != 'completed')
           AND due_date IS NOT NULL AND due_date >= ?
         ORDER BY due_date ASC LIMIT 1`
      )
      .bind(projectId, todayIso)
      .first<{ id: string; title: string; due_date: string; meeting_join_url: string }>(),
    db
      .prepare(
        `SELECT id, name, created_at, uploaded_by FROM documents
         WHERE project_id = ? ORDER BY created_at DESC LIMIT 4`
      )
      .bind(projectId)
      .all<{ id: string; name: string; created_at: string; uploaded_by: string | null }>(),
    computeProjectHealth(db, projectId, { target_go_live_date: project.target_go_live_date, updated_at: project.updated_at }),
    // Per-stage task counts for the stage-progress panel. Stages with
    // site_id IS NULL are project-shared (Initiate, on multi-site projects).
    db
      .prepare(
        `SELECT p.id, p.name, p.sort_order, p.status, p.site_id,
                COUNT(t.id) AS total_tasks,
                SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS done_tasks
         FROM stages p
         LEFT JOIN tasks t ON t.stage_id = p.id
         WHERE p.project_id = ?
         GROUP BY p.id`
      )
      .bind(projectId)
      .all<{ id: string; name: string; sort_order: number | null; status: string | null; site_id: string | null; total_tasks: number; done_tasks: number }>(),
  ]);

  const sites = sitesRows.results ?? [];

  // ── Build site rollups (only meaningful when sites exist) ──────────────────
  const siteCountsMap = new Map<string, { total: number; done: number }>();
  for (const row of perSiteTaskCounts.results ?? []) {
    if (row.site_id) siteCountsMap.set(row.site_id, { total: row.total, done: row.done });
  }
  const siteRollups: Array<{
    id: string; name: string; target_go_live_date: string | null;
    completion_pct: number; task_count: number; done_count: number;
    days_left: number | null; health: HealthValue;
  }> = [];
  for (const s of sites) {
    const counts = siteCountsMap.get(s.id) ?? { total: 0, done: 0 };
    const pct = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
    const daysLeft = s.target_go_live_date
      ? Math.round((new Date(s.target_go_live_date).getTime() - today.getTime()) / 86_400_000)
      : null;
    const health = await computeSiteHealth(db, { id: s.id, target_go_live_date: s.target_go_live_date });
    siteRollups.push({
      id: s.id,
      name: s.name,
      target_go_live_date: s.target_go_live_date,
      completion_pct: pct,
      task_count: counts.total,
      done_count: counts.done,
      days_left: daysLeft,
      health,
    });
  }

  // ── Next call ──────────────────────────────────────────────────────────────
  const milestoneNext = nextMeetingTaskRow
    ? { scheduled_at: nextMeetingTaskRow.due_date, title: nextMeetingTaskRow.title, join_url: nextMeetingTaskRow.meeting_join_url, source: "milestone" as const }
    : null;
  const statusNext = computeNextStatusOccurrence({
    dow: project.status_meeting_dow,
    time_local: project.status_meeting_time_local,
    timezone: project.status_meeting_timezone,
    title: project.status_meeting_title,
    join_url: project.status_meeting_join_url,
  }, today);
  const nextCall =
    milestoneNext && statusNext
      ? (new Date(milestoneNext.scheduled_at) <= new Date(statusNext.scheduled_at) ? milestoneNext : statusNext)
      : (milestoneNext ?? statusNext);

  // ── Stat tiles ─────────────────────────────────────────────────────────────
  const totalTasks = taskStats?.total ?? 0;
  const doneTasks = taskStats?.done ?? 0;
  const overallPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const blockerRows = blockers.results ?? [];
  const criticalCount = blockerRows.filter((b) => b.severity === "critical").length;

  // Days to final go-live: max(site target dates) for multi-site, otherwise
  // the project's own target_go_live_date.
  const finalGoLiveDate = sites.length > 0
    ? (siteRollups.map((s) => s.target_go_live_date).filter((d): d is string => !!d).sort().at(-1) ?? null)
    : project.target_go_live_date;
  const daysToFinalGoLive = finalGoLiveDate
    ? Math.round((new Date(finalGoLiveDate).getTime() - today.getTime()) / 86_400_000)
    : null;

  // ── Per-assignee pivot ─────────────────────────────────────────────────────
  // Multi-site: counts keyed by site_id + a separate `shared` total for
  // tasks on the project's shared stages (Initiate). Single-site: all task
  // counts collapse into `total`.
  const assigneeMap = new Map<string, { user_id: string; name: string; counts: Record<string, number>; shared: number; total: number }>();
  for (const row of assigneeAgg.results ?? []) {
    if (!row.assignee_user_id) continue;
    let entry = assigneeMap.get(row.assignee_user_id);
    if (!entry) {
      entry = { user_id: row.assignee_user_id, name: row.assignee_name ?? "Unknown", counts: {}, shared: 0, total: 0 };
      assigneeMap.set(row.assignee_user_id, entry);
    }
    if (row.site_id === null) entry.shared += row.cnt;
    else entry.counts[row.site_id] = (entry.counts[row.site_id] ?? 0) + row.cnt;
    entry.total += row.cnt;
  }
  const assigneeBreakdown = [...assigneeMap.values()].sort((a, b) => b.total - a.total);

  // ── Per-assignee × stage-name pivot (universal — single + multi-site) ──────
  // On multi-site, the same stage NAME ("Plan", "Execute") exists once per
  // site. We collapse them so the table reads as "how much open work does
  // each assignee have at each PMI stage" without exploding into N×M columns.
  const stageColumnOrder = new Map<string, number>();
  const assigneeStageMap = new Map<string, { user_id: string; name: string; counts: Record<string, number>; total: number }>();
  for (const row of assigneeStageAgg.results ?? []) {
    if (!row.assignee_user_id) continue;
    const existing = stageColumnOrder.get(row.stage_name);
    const order = row.sort_order ?? 9999;
    if (existing === undefined || order < existing) stageColumnOrder.set(row.stage_name, order);
    let entry = assigneeStageMap.get(row.assignee_user_id);
    if (!entry) {
      entry = { user_id: row.assignee_user_id, name: row.assignee_name ?? "Unknown", counts: {}, total: 0 };
      assigneeStageMap.set(row.assignee_user_id, entry);
    }
    entry.counts[row.stage_name] = (entry.counts[row.stage_name] ?? 0) + row.cnt;
    entry.total += row.cnt;
  }
  const stageColumns = [...stageColumnOrder.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);
  const assigneeStageBreakdown = [...assigneeStageMap.values()].sort((a, b) => b.total - a.total);

  // ── Site name map for labeling open tasks ──────────────────────────────────
  const siteNameMap = new Map(sites.map((s) => [s.id, s.name]));

  // ── Key updates ────────────────────────────────────────────────────────────
  const keyUpdatesFeed = [
    ...(notes.results ?? []).map((n) => ({
      id: n.id, kind: "note" as const, body: n.body, author_name: n.author_name, created_at: n.created_at,
    })),
    ...((docRow.results ?? []).map((d) => ({
      id: d.id, kind: "document" as const, body: `${d.name} uploaded`, author_name: null, created_at: d.created_at,
    }))),
  ]
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
    .slice(0, 6);

  return c.json({
    project: {
      id: project.id,
      name: project.name,
      customer_name: project.customer_name,
      customer_id: project.customer_id,
      crm_case_id: project.crm_case_id,
      updated_at: project.updated_at,
      health: projectHealth,
    },
    stats: {
      overall_complete_pct: overallPct,
      tasks: {
        total: totalTasks,
        done: doneTasks,
        in_progress: taskStats?.in_progress ?? 0,
        not_started: taskStats?.not_started ?? 0,
      },
      blockers: {
        total: blockerRows.length,
        critical: criticalCount,
      },
      days_to_final_go_live: daysToFinalGoLive,
      target_go_live_date: finalGoLiveDate,
      next_call: nextCall,
      site_count: sites.length,
    },
    sites: siteRollups,
    open_tasks: (openTasks.results ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      priority: t.priority,
      site_id: t.site_id,
      site_name: t.site_id ? (siteNameMap.get(t.site_id) ?? null) : null,
      assignee_name: t.assignee_name,
      is_meeting: !!t.meeting_join_url,
    })),
    assignee_breakdown: assigneeBreakdown,
    assignee_stage_breakdown: {
      stage_columns: stageColumns,
      rows: assigneeStageBreakdown,
    },
    blockers: blockerRows.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      severity: b.severity,
      status: b.status,
      owner_name: b.owner_name,
    })),
    key_updates: keyUpdatesFeed,
    team: {
      pm: pmRow ? { id: pmRow.id, name: pmRow.name, email: pmRow.email, title: pmRow.title, phone: pmRow.phone, scheduler_url: pmRow.scheduler_url, avatar_url: pmRow.avatar_url } : null,
      engineers: (engineerRows.results ?? []).map((e) => ({
        id: e.id, name: e.name, email: e.email, title: e.title, phone: e.phone, scheduler_url: e.scheduler_url, avatar_url: e.avatar_url,
      })),
      primary_contact: primaryContactRow ?? null,
      partner_ae: partnerAeRow ? { id: partnerAeRow.id, name: partnerAeRow.name, email: partnerAeRow.email, title: partnerAeRow.title, phone: partnerAeRow.phone, scheduler_url: partnerAeRow.scheduler_url, avatar_url: partnerAeRow.avatar_url } : null,
    },
    links: {
      // Prefer the project's own SharePoint folder so stakeholders land
      // directly on the right workspace (discovery workbooks, phone bills,
      // CSRs, etc.) instead of the shared customer root. Fall back to the
      // customer SP root for projects that pre-date the auto-folder feature
      // and haven't run the "Create project folder" retrofit yet.
      sharepoint_url: project.sharepoint_folder_url ?? customerRow?.sharepoint_url ?? null,
      crm_case_id: project.crm_case_id,
      timeline_url: `/projects/${project.id}#timeline`,
      next_call_join_url: nextCall?.join_url ?? null,
    },
    stage_progress: buildStageProgress(stageRows.results ?? [], sites),
  });
});

/**
 * Group stages by site_id and compute per-stage % completion. Output is a
 * column-major list — shared (site_id=NULL) first, then one entry per site
 * in display_order. Each entry carries stages sorted by sort_order ASC.
 *
 * Empty stages (no tasks) get 0% so the slider visually represents "not
 * started yet" instead of being absent. The stage row still surfaces so
 * PMs see the placeholder.
 */
function buildStageProgress(
  rows: Array<{ id: string; name: string; sort_order: number | null; status: string | null; site_id: string | null; total_tasks: number; done_tasks: number }>,
  sites: Array<{ id: string; name: string }>,
): Array<{ site_id: string | null; site_name: string | null; stages: Array<{ id: string; name: string; sort_order: number | null; status: string | null; total_tasks: number; done_tasks: number; pct: number }> }> {
  const groups = new Map<string | "shared", Array<typeof rows[number] & { pct: number }>>();
  for (const r of rows) {
    const key = r.site_id ?? "shared";
    const total = r.total_tasks ?? 0;
    const done = r.done_tasks ?? 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const arr = groups.get(key) ?? [];
    arr.push({ ...r, pct });
    groups.set(key, arr);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
  }
  const out: Array<{ site_id: string | null; site_name: string | null; stages: Array<{ id: string; name: string; sort_order: number | null; status: string | null; total_tasks: number; done_tasks: number; pct: number }> }> = [];
  const sharedStages = groups.get("shared");
  if (sharedStages && sharedStages.length > 0) {
    out.push({ site_id: null, site_name: null, stages: sharedStages.map((p) => ({ id: p.id, name: p.name, sort_order: p.sort_order, status: p.status, total_tasks: p.total_tasks, done_tasks: p.done_tasks, pct: p.pct })) });
  }
  for (const s of sites) {
    const siteStages = groups.get(s.id);
    if (siteStages && siteStages.length > 0) {
      out.push({ site_id: s.id, site_name: s.name, stages: siteStages.map((p) => ({ id: p.id, name: p.name, sort_order: p.sort_order, status: p.status, total_tasks: p.total_tasks, done_tasks: p.done_tasks, pct: p.pct })) });
    }
  }
  return out;
}

/**
 * Given a project's status-meeting cadence, return the next occurrence in
 * UTC ISO form (or null if cadence isn't configured). DST is handled by
 * Intl.DateTimeFormat on the project's local timezone.
 */
function computeNextStatusOccurrence(
  cadence: { dow: number | null; time_local: string | null; timezone: string | null; title: string | null; join_url: string | null },
  today: Date,
): { scheduled_at: string; title: string; join_url: string | null; source: "status" } | null {
  if (cadence.dow === null || !cadence.time_local) return null;
  const tz = cadence.timezone ?? "America/Los_Angeles";
  const [hh, mm] = cadence.time_local.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;

  for (let i = 0; i < 8; i++) {
    const candidate = new Date(today.getTime() + i * 86_400_000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(candidate);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const localDow = dowMap[wd];
    if (localDow !== cadence.dow) continue;

    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const mo = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    const localIsoCandidate = `${y}-${mo}-${d}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
    const occurrence = zonedTimeToUtc(localIsoCandidate, tz);
    if (occurrence.getTime() > today.getTime()) {
      return {
        scheduled_at: occurrence.toISOString(),
        title: cadence.title ?? "Status meeting",
        join_url: cadence.join_url,
        source: "status",
      };
    }
  }
  return null;
}

function zonedTimeToUtc(localIso: string, tz: string): Date {
  const guess = new Date(localIso + "Z");
  const offsetMin = getTzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - offsetMin * 60_000);
}

function getTzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const y = +(parts.find((p) => p.type === "year")?.value ?? "0");
  const mo = +(parts.find((p) => p.type === "month")?.value ?? "0");
  const d = +(parts.find((p) => p.type === "day")?.value ?? "0");
  const h = +(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mi = +(parts.find((p) => p.type === "minute")?.value ?? "0");
  const s = +(parts.find((p) => p.type === "second")?.value ?? "0");
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

export default app;

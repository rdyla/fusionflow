/**
 * Stakeholder Dashboard aggregation endpoint.
 *
 * Anchored on a single project but rolls up across all in-flight projects
 * under the same customer — modeling the way customers actually look at a
 * multi-site rollout (e.g. City of Thousand Oaks running Libraries,
 * Treatment/Waste, and HQ as three sibling projects with their own
 * go-live dates). Single-project customers degrade gracefully: the
 * related-projects section just contains the current project.
 *
 * Access is gated by the existing `canViewProject()` — internal staff,
 * customer contacts authenticated as `client` matched by
 * `dynamics_account_id`, and partner AEs explicitly attached via
 * `project_staff` all see the same payload.
 *
 * Note on access scoping: the rollup intentionally aggregates EVERY
 * non-archived project under the customer, not just ones the viewer is
 * explicitly attached to. The current viewer's access has already been
 * verified against the anchor project; the rollup numbers are derived
 * from the customer they're already authorized to see.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { canViewProject } from "../services/accessService";
import { computeProjectHealth, type HealthValue } from "../lib/healthScore";

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
  status_meeting_title: string | null;
  status_meeting_dow: number | null;
  status_meeting_time_local: string | null;
  status_meeting_timezone: string | null;
  status_meeting_duration_min: number | null;
  status_meeting_join_url: string | null;
};

type RelatedProjectRow = {
  id: string;
  name: string;
  target_go_live_date: string | null;
  updated_at: string | null;
  archived: number | null;
  status: string | null;
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
              target_go_live_date, updated_at, crm_case_id,
              status_meeting_title, status_meeting_dow, status_meeting_time_local,
              status_meeting_timezone, status_meeting_duration_min, status_meeting_join_url
       FROM projects WHERE id = ?`
    )
    .bind(projectId)
    .first<ProjectRow>();

  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // ── Resolve sibling projects (in-flight, same customer) ─────────────────────
  // Without customer_id we degrade to single-project rollup. With a customer,
  // we include every non-archived project the customer owns. "Complete" status
  // projects are still surfaced — the rollup is about implementation state, and
  // a completed sibling site is meaningful context. Archived ones are excluded.
  const relatedRows = project.customer_id
    ? await db
        .prepare(
          `SELECT id, name, target_go_live_date, updated_at, archived, status
           FROM projects
           WHERE customer_id = ? AND (archived = 0 OR archived IS NULL)
           ORDER BY COALESCE(target_go_live_date, '9999-12-31') ASC, name ASC`
        )
        .bind(project.customer_id)
        .all<RelatedProjectRow>()
    : { results: [{ id: project.id, name: project.name, target_go_live_date: project.target_go_live_date, updated_at: project.updated_at, archived: 0, status: null }] as RelatedProjectRow[] };

  const related = relatedRows.results ?? [];
  // If the anchor project is archived/orphaned and the customer query skipped
  // it, drop it back in so the user is never staring at a Dashboard that
  // doesn't include the project they clicked into.
  if (!related.find((p) => p.id === project.id)) {
    related.unshift({ id: project.id, name: project.name, target_go_live_date: project.target_go_live_date, updated_at: project.updated_at, archived: 0, status: null });
  }
  const relatedIds = related.map((p) => p.id);
  const ph = qs(relatedIds);

  // ── Parallel: all the cross-customer aggregations + per-project team/links ─
  const [
    taskStats,
    perProjectTaskCounts,
    openTasks,
    assigneeAgg,
    blockers,
    notes,
    pmRow,
    engineerRow,
    primaryContactRow,
    partnerAeRow,
    customerRow,
    nextMeetingTaskRow,
    docRow,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'completed'   THEN 1 ELSE 0 END) AS done,
           SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
           SUM(CASE WHEN status IS NULL OR status NOT IN ('completed','in_progress') THEN 1 ELSE 0 END) AS not_started
         FROM tasks WHERE project_id IN (${ph})`
      )
      .bind(...relatedIds)
      .first<{ total: number; done: number; in_progress: number; not_started: number }>(),
    db
      .prepare(
        `SELECT project_id,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done
         FROM tasks WHERE project_id IN (${ph})
         GROUP BY project_id`
      )
      .bind(...relatedIds)
      .all<{ project_id: string; total: number; done: number }>(),
    db
      .prepare(
        `SELECT t.id, t.project_id, t.title, t.due_date, t.priority, t.phase_id, t.status,
                t.meeting_join_url, t.assignee_user_id, u.name AS assignee_name
         FROM tasks t
         LEFT JOIN users u ON u.id = t.assignee_user_id
         WHERE t.project_id IN (${ph}) AND (t.status IS NULL OR t.status != 'completed')
         ORDER BY COALESCE(t.due_date, '9999-12-31') ASC
         LIMIT 8`
      )
      .bind(...relatedIds)
      .all<{ id: string; project_id: string; title: string; due_date: string | null; priority: string | null; phase_id: string | null; status: string | null; meeting_join_url: string | null; assignee_user_id: string | null; assignee_name: string | null }>(),
    db
      .prepare(
        `SELECT t.assignee_user_id, u.name AS assignee_name, t.project_id, COUNT(*) AS cnt
         FROM tasks t
         LEFT JOIN users u ON u.id = t.assignee_user_id
         WHERE t.project_id IN (${ph}) AND (t.status IS NULL OR t.status != 'completed')
           AND t.assignee_user_id IS NOT NULL
         GROUP BY t.assignee_user_id, t.project_id`
      )
      .bind(...relatedIds)
      .all<{ assignee_user_id: string; assignee_name: string | null; project_id: string; cnt: number }>(),
    db
      .prepare(
        `SELECT r.id, r.project_id, r.title, r.description, r.severity, r.status,
                r.owner_user_id, u.name AS owner_name
         FROM risks r
         LEFT JOIN users u ON u.id = r.owner_user_id
         WHERE r.project_id IN (${ph}) AND (r.status IS NULL OR r.status != 'resolved')
         ORDER BY
           CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           r.title`
      )
      .bind(...relatedIds)
      .all<{ id: string; project_id: string; title: string; description: string | null; severity: string | null; status: string | null; owner_user_id: string | null; owner_name: string | null }>(),
    db
      .prepare(
        `SELECT n.id, n.project_id, n.body, n.created_at, n.visibility, u.name AS author_name
         FROM notes n
         LEFT JOIN users u ON u.id = n.author_user_id
         WHERE n.project_id IN (${ph})
         ORDER BY n.created_at DESC
         LIMIT 8`
      )
      .bind(...relatedIds)
      .all<{ id: string; project_id: string; body: string; created_at: string; visibility: string | null; author_name: string | null }>(),
    // Team + links scope to the CURRENT (anchor) project only — the customer
    // might have different PMs per site, but the user is viewing one site at a
    // time and the team panel should reflect "who runs this site."
    project.pm_user_id
      ? db.prepare("SELECT id, name, email FROM users WHERE id = ?").bind(project.pm_user_id).first<{ id: string; name: string | null; email: string }>()
      : Promise.resolve(null),
    db
      .prepare(
        `SELECT u.id, u.name, u.email FROM project_staff ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.project_id = ? AND ps.staff_role = 'engineer'
         ORDER BY ps.created_at ASC LIMIT 1`
      )
      .bind(projectId)
      .first<{ id: string; name: string | null; email: string }>(),
    db
      .prepare(
        `SELECT name, email, job_title FROM project_contacts
         WHERE project_id = ? ORDER BY added_at ASC LIMIT 1`
      )
      .bind(projectId)
      .first<{ name: string; email: string | null; job_title: string | null }>(),
    db
      .prepare(
        `SELECT u.id, u.name, u.email FROM project_staff ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.project_id = ? AND ps.staff_role = 'partner_ae'
         ORDER BY ps.created_at ASC LIMIT 1`
      )
      .bind(projectId)
      .first<{ id: string; name: string | null; email: string }>(),
    project.customer_id
      ? db.prepare("SELECT sharepoint_url FROM customers WHERE id = ?").bind(project.customer_id).first<{ sharepoint_url: string | null }>()
      : Promise.resolve(null),
    // Next milestone meeting across all sibling projects (a kickoff on Site 1
    // is the customer's next call even if you're viewing Site 2).
    db
      .prepare(
        `SELECT id, project_id, title, due_date, meeting_join_url FROM tasks
         WHERE project_id IN (${ph})
           AND meeting_join_url IS NOT NULL AND meeting_join_url != ''
           AND (status IS NULL OR status != 'completed')
           AND due_date IS NOT NULL AND due_date >= ?
         ORDER BY due_date ASC LIMIT 1`
      )
      .bind(...relatedIds, todayIso)
      .first<{ id: string; project_id: string; title: string; due_date: string; meeting_join_url: string }>(),
    db
      .prepare(
        `SELECT id, project_id, name, created_at, uploaded_by FROM documents
         WHERE project_id IN (${ph}) ORDER BY created_at DESC LIMIT 6`
      )
      .bind(...relatedIds)
      .all<{ id: string; project_id: string; name: string; created_at: string; uploaded_by: string | null }>(),
  ]);

  // ── Per-related-project health (sequential, tiny) ───────────────────────────
  const perProjectStatsMap = new Map<string, { total: number; done: number }>();
  for (const r of perProjectTaskCounts.results ?? []) {
    perProjectStatsMap.set(r.project_id, { total: r.total, done: r.done });
  }
  const relatedProjects: Array<{
    id: string; name: string; target_go_live_date: string | null;
    completion_pct: number; task_count: number; done_count: number;
    days_left: number | null; health: HealthValue; is_current: boolean;
  }> = [];
  for (const rp of related) {
    const counts = perProjectStatsMap.get(rp.id) ?? { total: 0, done: 0 };
    const pct = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
    const daysLeft = rp.target_go_live_date
      ? Math.round((new Date(rp.target_go_live_date).getTime() - today.getTime()) / 86_400_000)
      : null;
    const health = await computeProjectHealth(db, rp.id, {
      target_go_live_date: rp.target_go_live_date,
      updated_at: rp.updated_at,
    });
    relatedProjects.push({
      id: rp.id,
      name: rp.name,
      target_go_live_date: rp.target_go_live_date,
      completion_pct: pct,
      task_count: counts.total,
      done_count: counts.done,
      days_left: daysLeft,
      health,
      is_current: rp.id === project.id,
    });
  }

  // ── Next call — earlier of next milestone (any sibling) vs status cadence ──
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

  // ── Rollup stats ────────────────────────────────────────────────────────────
  const totalTasks = taskStats?.total ?? 0;
  const doneTasks = taskStats?.done ?? 0;
  const overallPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const blockerRows = blockers.results ?? [];
  const criticalCount = blockerRows.filter((b) => b.severity === "critical").length;

  // "Days to final go-live" = latest target across siblings (the customer is
  // "done" when the last site cuts over). NULL targets are ignored.
  const finalGoLive = relatedProjects
    .map((r) => r.target_go_live_date)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1) ?? null;
  const daysToFinalGoLive = finalGoLive
    ? Math.round((new Date(finalGoLive).getTime() - today.getTime()) / 86_400_000)
    : null;

  // ── Per-assignee × per-PROJECT pivot (was per-phase) ────────────────────────
  const assigneeMap = new Map<string, { user_id: string; name: string; counts: Record<string, number> }>();
  for (const row of assigneeAgg.results ?? []) {
    if (!row.assignee_user_id) continue;
    let entry = assigneeMap.get(row.assignee_user_id);
    if (!entry) {
      entry = { user_id: row.assignee_user_id, name: row.assignee_name ?? "Unknown", counts: {} };
      assigneeMap.set(row.assignee_user_id, entry);
    }
    entry.counts[row.project_id] = (entry.counts[row.project_id] ?? 0) + row.cnt;
  }
  const assigneeBreakdown = [...assigneeMap.values()].sort((a, b) => {
    const aSum = Object.values(a.counts).reduce((s, n) => s + n, 0);
    const bSum = Object.values(b.counts).reduce((s, n) => s + n, 0);
    return bSum - aSum;
  });

  // ── Key updates feed (notes + docs across siblings) ─────────────────────────
  const keyUpdatesFeed = [
    ...(notes.results ?? []).map((n) => ({
      id: n.id, kind: "note" as const, body: n.body, author_name: n.author_name, created_at: n.created_at, project_id: n.project_id,
    })),
    ...((docRow.results ?? []).map((d) => ({
      id: d.id, kind: "document" as const, body: `${d.name} uploaded`, author_name: null, created_at: d.created_at, project_id: d.project_id,
    }))),
  ]
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
    .slice(0, 6);

  // Project name lookup so the client can label tasks/blockers with their site.
  const projectNameMap = new Map(relatedProjects.map((r) => [r.id, r.name]));

  return c.json({
    project: {
      id: project.id,
      name: project.name,
      customer_name: project.customer_name,
      customer_id: project.customer_id,
      crm_case_id: project.crm_case_id,
      updated_at: project.updated_at,
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
      target_go_live_date: finalGoLive,
      next_call: nextCall,
      site_count: relatedProjects.length,
    },
    related_projects: relatedProjects,
    open_tasks: (openTasks.results ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      priority: t.priority,
      project_id: t.project_id,
      project_name: projectNameMap.get(t.project_id) ?? null,
      assignee_name: t.assignee_name,
      is_meeting: !!t.meeting_join_url,
    })),
    assignee_breakdown: assigneeBreakdown,
    blockers: blockerRows.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      severity: b.severity,
      status: b.status,
      owner_name: b.owner_name,
      project_id: b.project_id,
      project_name: projectNameMap.get(b.project_id) ?? null,
    })),
    key_updates: keyUpdatesFeed,
    team: {
      pm: pmRow ? { id: pmRow.id, name: pmRow.name, email: pmRow.email } : null,
      engineer: engineerRow ? { id: engineerRow.id, name: engineerRow.name, email: engineerRow.email } : null,
      primary_contact: primaryContactRow ?? null,
      partner_ae: partnerAeRow ? { id: partnerAeRow.id, name: partnerAeRow.name, email: partnerAeRow.email } : null,
    },
    links: {
      sharepoint_url: customerRow?.sharepoint_url ?? null,
      crm_case_id: project.crm_case_id,
      timeline_url: `/projects/${project.id}#timeline`,
      next_call_join_url: nextCall?.join_url ?? null,
    },
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function qs(arr: unknown[]): string {
  return arr.map(() => "?").join(",");
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

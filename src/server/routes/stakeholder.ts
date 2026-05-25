/**
 * Stakeholder view aggregation endpoint.
 *
 * One round-trip that returns everything the stakeholder page renders:
 * project header data, top stat tiles, per-phase health, open tasks,
 * per-assignee × per-phase task counts, blockers, key updates feed, and
 * team + links column.
 *
 * Access is gated by the existing `canViewProject()` — internal staff,
 * the customer's contact-side users (matched on `dynamics_account_id`),
 * and partner AEs explicitly attached via `project_staff` all see the
 * same payload.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { canViewProject } from "../services/accessService";
import { computeProjectHealth, computePhaseHealth, type HealthValue } from "../lib/healthScore";

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

  // ── Parallel: phases + tasks + risks + staff + contacts + customer + notes ─
  const [
    phases,
    taskStats,
    openTasks,
    assigneeAgg,
    blockers,
    keyUpdates,
    pmRow,
    engineerRow,
    primaryContactRow,
    partnerAeRow,
    customerRow,
    nextMeetingTaskRow,
    docRow,
    projectHealth,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, planned_start, planned_end,
                (SELECT COUNT(*) FROM tasks WHERE phase_id = phases.id) AS task_count,
                (SELECT COUNT(*) FROM tasks WHERE phase_id = phases.id AND status = 'completed') AS done_count
         FROM phases WHERE project_id = ? ORDER BY COALESCE(planned_start, ''), name`
      )
      .bind(projectId)
      .all<{ id: string; name: string; planned_start: string | null; planned_end: string | null; task_count: number; done_count: number }>(),
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
    db
      .prepare(
        `SELECT t.id, t.title, t.due_date, t.priority, t.phase_id, t.status,
                t.meeting_join_url, t.assignee_user_id, u.name AS assignee_name
         FROM tasks t
         LEFT JOIN users u ON u.id = t.assignee_user_id
         WHERE t.project_id = ? AND (t.status IS NULL OR t.status != 'completed')
         ORDER BY COALESCE(t.due_date, '9999-12-31') ASC
         LIMIT 8`
      )
      .bind(projectId)
      .all<{ id: string; title: string; due_date: string | null; priority: string | null; phase_id: string | null; status: string | null; meeting_join_url: string | null; assignee_user_id: string | null; assignee_name: string | null }>(),
    db
      .prepare(
        `SELECT t.assignee_user_id, u.name AS assignee_name, t.phase_id, COUNT(*) AS cnt
         FROM tasks t
         LEFT JOIN users u ON u.id = t.assignee_user_id
         WHERE t.project_id = ? AND (t.status IS NULL OR t.status != 'completed')
           AND t.assignee_user_id IS NOT NULL
         GROUP BY t.assignee_user_id, t.phase_id`
      )
      .bind(projectId)
      .all<{ assignee_user_id: string; assignee_name: string | null; phase_id: string | null; cnt: number }>(),
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
    db
      .prepare(
        `SELECT id, title, due_date, meeting_join_url FROM tasks
         WHERE project_id = ?
           AND meeting_join_url IS NOT NULL AND meeting_join_url != ''
           AND (status IS NULL OR status != 'completed')
           AND due_date IS NOT NULL AND due_date >= ?
         ORDER BY due_date ASC LIMIT 1`
      )
      .bind(projectId, today.toISOString().slice(0, 10))
      .first<{ id: string; title: string; due_date: string; meeting_join_url: string }>(),
    db
      .prepare(
        `SELECT id, name, created_at, uploaded_by FROM documents
         WHERE project_id = ? ORDER BY created_at DESC LIMIT 4`
      )
      .bind(projectId)
      .all<{ id: string; name: string; created_at: string; uploaded_by: string | null }>(),
    computeProjectHealth(db, projectId, { target_go_live_date: project.target_go_live_date, updated_at: project.updated_at }),
  ]);

  // ── Per-phase health (sequential — each is a tiny query) ────────────────────
  const phaseHealthList: HealthValue[] = [];
  for (const ph of phases.results ?? []) {
    phaseHealthList.push(await computePhaseHealth(db, { id: ph.id, planned_end: ph.planned_end }));
  }

  // ── Compute "next call" — earlier of next milestone task vs next status occurrence ─
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

  // ── Overall completion % across all phases ──────────────────────────────────
  const totalTasks = taskStats?.total ?? 0;
  const doneTasks = taskStats?.done ?? 0;
  const overallPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // ── Blockers tile: total + critical ─────────────────────────────────────────
  const blockerRows = blockers.results ?? [];
  const criticalCount = blockerRows.filter((b) => b.severity === "critical").length;

  // ── Days to final go-live ───────────────────────────────────────────────────
  const daysToGoLive = project.target_go_live_date
    ? Math.round((new Date(project.target_go_live_date).getTime() - today.getTime()) / 86_400_000)
    : null;

  // ── Per-phase rows for the UI ───────────────────────────────────────────────
  const phaseRows = (phases.results ?? []).map((ph, i) => {
    const pct = ph.task_count > 0 ? Math.round((ph.done_count / ph.task_count) * 100) : 0;
    const daysLeft = ph.planned_end
      ? Math.round((new Date(ph.planned_end).getTime() - today.getTime()) / 86_400_000)
      : null;
    return {
      id: ph.id,
      name: ph.name,
      planned_start: ph.planned_start,
      planned_end: ph.planned_end,
      task_count: ph.task_count,
      done_count: ph.done_count,
      completion_pct: pct,
      days_left: daysLeft,
      health: phaseHealthList[i] ?? "on_track",
    };
  });

  // ── Per-assignee × per-phase pivot ──────────────────────────────────────────
  const assigneeMap = new Map<string, { user_id: string; name: string; counts: Record<string, number> }>();
  for (const row of assigneeAgg.results ?? []) {
    if (!row.assignee_user_id) continue;
    let entry = assigneeMap.get(row.assignee_user_id);
    if (!entry) {
      entry = { user_id: row.assignee_user_id, name: row.assignee_name ?? "Unknown", counts: {} };
      assigneeMap.set(row.assignee_user_id, entry);
    }
    const phaseKey = row.phase_id ?? "_unphased";
    entry.counts[phaseKey] = (entry.counts[phaseKey] ?? 0) + row.cnt;
  }
  const assigneeBreakdown = [...assigneeMap.values()].sort((a, b) => {
    const aSum = Object.values(a.counts).reduce((s, n) => s + n, 0);
    const bSum = Object.values(b.counts).reduce((s, n) => s + n, 0);
    return bSum - aSum;
  });

  // ── Key updates feed (notes + recent docs interleaved) ──────────────────────
  const keyUpdatesFeed = [
    ...(keyUpdates.results ?? []).map((n) => ({
      id: n.id,
      kind: "note" as const,
      body: n.body,
      author_name: n.author_name,
      created_at: n.created_at,
    })),
    ...((docRow.results ?? []).map((d) => ({
      id: d.id,
      kind: "document" as const,
      body: `${d.name} uploaded`,
      author_name: null,
      created_at: d.created_at,
    }))),
  ]
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
    .slice(0, 6);

  return c.json({
    project: {
      id: project.id,
      name: project.name,
      customer_name: project.customer_name,
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
      days_to_final_go_live: daysToGoLive,
      target_go_live_date: project.target_go_live_date,
      next_call: nextCall,
    },
    phases: phaseRows,
    open_tasks: (openTasks.results ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      priority: t.priority,
      phase_id: t.phase_id,
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

  // Walk forward up to 8 days finding the next instance where local-time
  // weekday matches `dow` AND the local time is still in the future.
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

    // Build a UTC date corresponding to local "candidate-date at HH:MM" in tz.
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

/**
 * Convert a "local time in tz" string to UTC by binary-searching the offset.
 * Cheap, dependency-free, and good enough for cadence math (we don't need
 * sub-second precision here).
 */
function zonedTimeToUtc(localIso: string, tz: string): Date {
  // Initial guess: treat the local-iso as if it were UTC, then correct by the
  // tz offset returned by Intl for that instant.
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

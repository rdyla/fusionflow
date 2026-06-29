import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { getTeamUserIds, inPlaceholders } from "../lib/teamUtils";
import { normalizeSolutionTypesField } from "../../shared/solutionTypes";
import { getDemoVendor } from "../lib/appSettings";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/summary", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;

  // Build project filter for scoping all queries to the current user's projects
  let projectFilter = "";
  let filterBindings: string[] = [];

  // Resolve team IDs for AE roles (manager sees self + direct reports)
  let teamIds: string[] = [auth.user.id];

  if (auth.role === "pm") {
    projectFilter = "WHERE (pm_user_id = ? OR id IN (SELECT project_id FROM project_staff WHERE user_id = ? AND staff_role = 'pm'))";
    filterBindings = [auth.user.id, auth.user.id];
  } else if (auth.role === "pf_ae") {
    teamIds = await getTeamUserIds(auth.user.id, db);
    const ph = inPlaceholders(teamIds);
    projectFilter = `WHERE (customer_id IN (SELECT id FROM customers WHERE pf_ae_user_id IN (${ph})) OR id IN (SELECT project_id FROM project_access WHERE user_id IN (${ph})))`;
    filterBindings = [...teamIds, ...teamIds];
  } else if (auth.role === "partner_ae") {
    teamIds = await getTeamUserIds(auth.user.id, db);
    const ph = inPlaceholders(teamIds);
    projectFilter = `WHERE id IN (
      SELECT project_id FROM project_access WHERE user_id IN (${ph})
      UNION
      SELECT project_id FROM project_staff WHERE staff_role = 'partner_ae' AND user_id IN (${ph})
    )`;
    filterBindings = [...teamIds, ...teamIds];
  } else if (auth.role === "client") {
    if (!auth.user.dynamics_account_id) {
      return c.json({ user: auth.user, summary: { activeProjects: 0, atRiskProjects: 0, openTasks: 0, openRisks: 0 }, projects: [], openTasks: [], openRisks: [], stageDistribution: [], vendorDistribution: [], typeDistribution: [] });
    }
    projectFilter = "WHERE dynamics_account_id = ?";
    filterBindings = [auth.user.dynamics_account_id];
  }
  // pf_sa, pf_csm, admin, and executive: no filter — portfolio-wide visibility

  // Always exclude archived projects from dashboard aggregations.
  projectFilter = projectFilter
    ? `${projectFilter} AND (archived = 0 OR archived IS NULL)`
    : "WHERE (archived = 0 OR archived IS NULL)";

  // Demo-mode vendor lens: every aggregation is scoped through projectFilter,
  // so layering a vendor AND clause here is enough to filter the entire response.
  const demoVendor = await getDemoVendor(db);
  if (demoVendor) {
    projectFilter = `${projectFilter} AND LOWER(vendor) = ?`;
    filterBindings = [...filterBindings, demoVendor];
  }

  const projectSubquery = projectFilter
    ? `SELECT id FROM projects ${projectFilter}`
    : `SELECT id FROM projects`;

  // AEs and engineers only see tasks assigned to them; managers and PMs/admins see all tasks
  const isAE = auth.role === "pf_ae" || auth.role === "partner_ae" || auth.role === "pf_sa";
  const isManager = teamIds.length > 1;
  const scopeToAssigned = (isAE && !isManager) || auth.role === "pf_engineer";
  const taskAssigneeClause = scopeToAssigned ? " AND assignee_user_id = ?" : "";
  const taskAssigneeBinding: string[] = scopeToAssigned ? [auth.user.id] : [];

  const isSalesLeader = (auth.role === "pf_ae" || auth.role === "partner_ae") && teamIds.length > 1;

  // Run every dashboard query in parallel. They're all independent (each
  // reads from `projectFilter`/`projectSubquery`/`filterBindings` which are
  // already resolved). Previously 12 sequential awaits stacked to ~600ms+
  // of D1 round-trip latency before the first byte left the worker.
  const aeQuery = isSalesLeader
    ? (auth.role === "pf_ae"
      ? `SELECT u.id AS id, COALESCE(u.name, 'Unassigned') AS label, COUNT(*) AS count
         FROM projects p
         LEFT JOIN customers c ON c.id = p.customer_id
         LEFT JOIN users u ON u.id = c.pf_ae_user_id
         WHERE p.id IN (${projectSubquery})
         GROUP BY u.id
         ORDER BY count DESC`
      : `SELECT id, label, COUNT(*) AS count FROM (
           SELECT u.id AS id, COALESCE(u.name, 'Unassigned') AS label
           FROM projects p
           LEFT JOIN project_staff ps ON ps.project_id = p.id AND ps.staff_role = 'partner_ae'
           LEFT JOIN users u ON u.id = ps.user_id
           WHERE p.id IN (${projectSubquery})
         )
         GROUP BY id
         ORDER BY count DESC`)
    : null;

  const [
    activeProjects,
    atRiskProjects,
    openTasksCount,
    openBlockersCount,
    projects,
    projectStages,
    openTasks,
    openBlockers,
    stageDistribution,
    vendorDistribution,
    aeRes,
    typeDistribution,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as count FROM projects ${projectFilter}`)
      .bind(...filterBindings)
      .first<{ count: number }>(),

    db.prepare(
        `SELECT COUNT(*) as count FROM projects ${projectFilter ? `${projectFilter} AND health = ?` : "WHERE health = ?"}`
      )
      .bind(...filterBindings, "at_risk")
      .first<{ count: number }>(),

    db.prepare(
        `SELECT COUNT(*) as count FROM tasks WHERE status != 'completed' AND project_id IN (${projectSubquery})${taskAssigneeClause}`
      )
      .bind(...filterBindings, ...taskAssigneeBinding)
      .first<{ count: number }>(),

    db.prepare(
        `SELECT COUNT(*) as count FROM risks WHERE status = 'open' AND project_id IN (${projectSubquery})`
      )
      .bind(...filterBindings)
      .first<{ count: number }>(),

    // Full project list
    db.prepare(
        `SELECT id, name, customer_name, customer_id, vendor, solution_types, status, health, on_hold,
                kickoff_date, target_go_live_date, actual_go_live_date, pm_user_id
         FROM projects ${projectFilter}
         ORDER BY
           CASE status WHEN 'completed' THEN 1 ELSE 0 END,
           updated_at DESC`
      )
      .bind(...filterBindings)
      .all(),

    // Per-project stage summary for the stage-flow indicator
    db.prepare(
        `SELECT ph.project_id, ph.name, ph.status, ph.sort_order
         FROM (
           SELECT project_id, name, status, sort_order
           FROM stages
           WHERE project_id IN (${projectSubquery})
           ORDER BY sort_order
         ) ph`
      )
      .bind(...filterBindings)
      .all<{ project_id: string; name: string; status: string; sort_order: number }>(),

    // Open tasks (not completed) with project name, most urgent first
    db.prepare(
        `SELECT t.id, t.project_id, t.stage_id, t.title, t.assignee_user_id,
                t.due_date, t.status, t.priority,
                p.name as project_name
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.status != 'completed'
           AND t.project_id IN (${projectSubquery})${taskAssigneeClause.replace("assignee_user_id", "t.assignee_user_id")}
         ORDER BY
           CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           t.due_date ASC
         LIMIT 8`
      )
      .bind(...filterBindings, ...taskAssigneeBinding)
      .all(),

    // Open blockers with project name, highest severity first
    db.prepare(
        `SELECT r.id, r.project_id, r.title, r.description, r.severity, r.status,
                r.owner_user_id, r.task_id, p.name as project_name
         FROM risks r
         JOIN projects p ON p.id = r.project_id
         WHERE r.status = 'open'
           AND r.project_id IN (${projectSubquery})
         ORDER BY
           CASE r.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
         LIMIT 6`
      )
      .bind(...filterBindings)
      .all(),

    // Projects grouped by current stage (in_progress > last completed > Not Started)
    db.prepare(
        `WITH current_stages AS (
           SELECT
             proj.id AS project_id,
             COALESCE(
               (SELECT ph.name FROM stages ph
                WHERE ph.project_id = proj.id AND ph.status = 'in_progress'
                ORDER BY ph.sort_order DESC LIMIT 1),
               (SELECT ph.name FROM stages ph
                WHERE ph.project_id = proj.id AND ph.status = 'completed'
                ORDER BY ph.sort_order DESC LIMIT 1),
               'Not Started'
             ) AS stage_name
           FROM projects proj
           WHERE proj.id IN (${projectSubquery})
         )
         SELECT stage_name, COUNT(*) AS count
         FROM current_stages
         GROUP BY stage_name
         ORDER BY count DESC`
      )
      .bind(...filterBindings)
      .all<{ stage_name: string; count: number }>(),

    db.prepare(
        `SELECT COALESCE(vendor, 'Unknown') AS label, COUNT(*) AS count
         FROM projects
         WHERE id IN (${projectSubquery})
         GROUP BY vendor
         ORDER BY count DESC`
      )
      .bind(...filterBindings)
      .all<{ label: string; count: number }>(),

    aeQuery
      ? db.prepare(aeQuery).bind(...filterBindings).all<{ id: string | null; label: string; count: number }>()
      : Promise.resolve(null),

    // Per-type counts: a project with multiple solution_types contributes to each bucket.
    // Projects with empty/null solution_types fall into the 'Unknown' bucket.
    db.prepare(
        `SELECT label, COUNT(*) AS count FROM (
           SELECT je.value AS label
           FROM projects p, json_each(p.solution_types) je
           WHERE p.id IN (${projectSubquery})
           UNION ALL
           SELECT 'Unknown' AS label
           FROM projects p
           WHERE p.id IN (${projectSubquery})
             AND (p.solution_types IS NULL OR p.solution_types = '' OR p.solution_types = '[]')
         )
         GROUP BY label
         ORDER BY count DESC`
      )
      .bind(...filterBindings, ...filterBindings)
      .all<{ label: string; count: number }>(),
  ]);

  const aeDistribution = aeRes?.results ?? [];

  return c.json({
    user: auth.user,
    summary: {
      activeProjects: activeProjects?.count ?? 0,
      atRiskProjects: atRiskProjects?.count ?? 0,
      openTasks: openTasksCount?.count ?? 0,
      openBlockers: openBlockersCount?.count ?? 0,
    },
    projects: (projects.results ?? []).map(normalizeSolutionTypesField),
    projectStages: projectStages.results ?? [],
    openTasks: openTasks.results ?? [],
    openBlockers: openBlockers.results ?? [],
    stageDistribution: stageDistribution.results ?? [],
    vendorDistribution: vendorDistribution.results ?? [],
    typeDistribution: typeDistribution.results ?? [],
    aeDistribution,
    isSalesLeader,
  });
});

app.get("/leadership", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin" && auth.role !== "executive") {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const db = c.env.DB;

  // ── Window math ──────────────────────────────────────────────────────────
  // Resolve the requested window into a day-count, then derive an exclusive
  // [start, end) range plus the immediately-preceding window of equal length.
  const rawWindow = c.req.query("window");
  const window = rawWindow === "month" || rawWindow === "quarter" ? rawWindow : "week";
  const days = window === "quarter" ? 90 : window === "month" ? 30 : 7;

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => {
    const next = new Date(d);
    next.setDate(next.getDate() + n);
    return next;
  };

  const now = new Date();
  const today = fmt(now);
  const end = fmt(addDays(now, 1));          // exclusive upper bound (today + 1)
  const start = fmt(addDays(now, -(days - 1)));
  const prevEnd = start;                      // current start = previous window's exclusive end
  const prevStart = fmt(addDays(now, -(days - 1) - days));
  const upcomingEnd = fmt(addDays(now, 30));

  const round1 = (n: number | null | undefined) => Math.round((n ?? 0) * 10) / 10;

  const hoursExpr =
    "(julianday(scheduled_end) - julianday(scheduled_start)) * 24";
  const hoursExprAlias =
    "(julianday(ste.scheduled_end) - julianday(ste.scheduled_start)) * 24";

  const [
    timeCur,
    timePrev,
    byEngineer,
    byProject,
    tasksCompleted,
    tasksByEngineer,
    goLives,
    upcomingGoLives,
    wentLiveStillOpen,
    activeProjects,
    atRisk,
    blocked,
    openBlockers,
  ] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS entries, COALESCE(SUM(${hoursExpr}),0) AS hours
       FROM stage_time_entries
       WHERE scheduled_start >= ? AND scheduled_start < ?
         AND scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL`
    ).bind(start, end).first<{ entries: number; hours: number }>(),

    db.prepare(
      `SELECT COUNT(*) AS entries, COALESCE(SUM(${hoursExpr}),0) AS hours
       FROM stage_time_entries
       WHERE scheduled_start >= ? AND scheduled_start < ?
         AND scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL`
    ).bind(prevStart, prevEnd).first<{ entries: number; hours: number }>(),

    db.prepare(
      `SELECT ste.user_id, u.name, u.email, COUNT(*) AS entries,
              COALESCE(SUM(${hoursExprAlias}),0) AS hours
       FROM stage_time_entries ste
       LEFT JOIN users u ON u.id = ste.user_id
       WHERE ste.scheduled_start >= ? AND ste.scheduled_start < ?
         AND ste.scheduled_end IS NOT NULL
       GROUP BY ste.user_id
       ORDER BY hours DESC`
    ).bind(start, end).all<{ user_id: string | null; name: string | null; email: string | null; entries: number; hours: number }>(),

    db.prepare(
      `SELECT ste.project_id, p.name, p.customer_name, COUNT(*) AS entries,
              COALESCE(SUM(${hoursExprAlias}),0) AS hours
       FROM stage_time_entries ste
       LEFT JOIN projects p ON p.id = ste.project_id
       WHERE ste.scheduled_start >= ? AND ste.scheduled_start < ?
         AND ste.scheduled_end IS NOT NULL
       GROUP BY ste.project_id
       ORDER BY hours DESC
       LIMIT 10`
    ).bind(start, end).all<{ project_id: string | null; name: string | null; customer_name: string | null; entries: number; hours: number }>(),

    db.prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE completed_at >= ? AND completed_at < ?`
    ).bind(start, end).first<{ n: number }>(),

    db.prepare(
      `SELECT t.assignee_user_id, u.name, COUNT(*) AS n
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_user_id
       WHERE t.completed_at >= ? AND t.completed_at < ?
         AND t.assignee_user_id IS NOT NULL
       GROUP BY t.assignee_user_id
       ORDER BY n DESC
       LIMIT 10`
    ).bind(start, end).all<{ assignee_user_id: string | null; name: string | null; n: number }>(),

    db.prepare(
      `SELECT id, name, customer_name, actual_go_live_date
       FROM projects
       WHERE actual_go_live_date >= ? AND actual_go_live_date < ?
       ORDER BY actual_go_live_date DESC`
    ).bind(start, end).all<{ id: string; name: string; customer_name: string | null; actual_go_live_date: string | null }>(),

    db.prepare(
      `SELECT id, name, customer_name, target_go_live_date
       FROM projects
       WHERE target_go_live_date >= ? AND target_go_live_date <= ?
         AND (actual_go_live_date IS NULL)
         AND (archived = 0 OR archived IS NULL)
       ORDER BY target_go_live_date ASC
       LIMIT 10`
    ).bind(today, upcomingEnd).all<{ id: string; name: string; customer_name: string | null; target_go_live_date: string | null }>(),

    // Went live (actual_go_live_date set) but the project is still open —
    // not archived and not yet graduated to Optimize. Surfaces projects that
    // hit go-live but haven't been wrapped up or moved on. Oldest first.
    db.prepare(
      `SELECT id, name, customer_name, actual_go_live_date, status
       FROM projects p
       WHERE p.actual_go_live_date IS NOT NULL
         AND (p.archived = 0 OR p.archived IS NULL)
         AND p.id NOT IN (SELECT project_id FROM optimize_accounts)
       ORDER BY p.actual_go_live_date ASC
       LIMIT 10`
    ).all<{ id: string; name: string; customer_name: string | null; actual_go_live_date: string | null; status: string | null }>(),

    db.prepare(
      `SELECT COUNT(*) AS n FROM projects WHERE (archived = 0 OR archived IS NULL)`
    ).first<{ n: number }>(),

    db.prepare(
      `SELECT COUNT(*) AS n FROM projects WHERE (archived = 0 OR archived IS NULL) AND health = 'at_risk'`
    ).first<{ n: number }>(),

    db.prepare(
      `SELECT COUNT(*) AS n FROM projects WHERE (archived = 0 OR archived IS NULL) AND status = 'blocked'`
    ).first<{ n: number }>(),

    db.prepare(
      `SELECT COUNT(*) AS n FROM risks WHERE status = 'open'`
    ).first<{ n: number }>(),
  ]);

  return c.json({
    window: { window, start, end },
    time: {
      totalHours: round1(timeCur?.hours),
      prevTotalHours: round1(timePrev?.hours),
      entries: timeCur?.entries ?? 0,
      byEngineer: (byEngineer.results ?? []).map((r) => ({
        user_id: r.user_id,
        name: r.name,
        email: r.email,
        hours: round1(r.hours),
        entries: r.entries,
      })),
      byProject: (byProject.results ?? []).map((r) => ({
        project_id: r.project_id,
        name: r.name,
        customer_name: r.customer_name,
        hours: round1(r.hours),
        entries: r.entries,
      })),
    },
    projects: {
      activeProjects: activeProjects?.n ?? 0,
      atRiskProjects: atRisk?.n ?? 0,
      blockedProjects: blocked?.n ?? 0,
      openBlockers: openBlockers?.n ?? 0,
      tasksCompleted: tasksCompleted?.n ?? 0,
      tasksByEngineer: (tasksByEngineer.results ?? []).map((r) => ({
        user_id: r.assignee_user_id,
        name: r.name,
        n: r.n,
      })),
      goLives: (goLives.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        customer_name: r.customer_name,
        date: r.actual_go_live_date,
      })),
      upcomingGoLives: (upcomingGoLives.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        customer_name: r.customer_name,
        date: r.target_go_live_date,
      })),
      wentLiveStillOpen: (wentLiveStillOpen.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        customer_name: r.customer_name,
        date: r.actual_go_live_date,
        status: r.status,
      })),
    },
  });
});

export default app;

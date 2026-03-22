import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { getTeamUserIds, inPlaceholders } from "../lib/teamUtils";

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
    projectFilter = "WHERE pm_user_id = ?";
    filterBindings = [auth.user.id];
  } else if (auth.role === "pf_ae") {
    teamIds = await getTeamUserIds(auth.user.id, db);
    projectFilter = `WHERE ae_user_id IN (${inPlaceholders(teamIds)})`;
    filterBindings = teamIds;
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
      return c.json({ user: auth.user, summary: { activeProjects: 0, atRiskProjects: 0, openTasks: 0, openRisks: 0 }, projects: [], openTasks: [], openRisks: [], phaseDistribution: [], vendorDistribution: [], typeDistribution: [] });
    }
    projectFilter = "WHERE dynamics_account_id = ?";
    filterBindings = [auth.user.dynamics_account_id];
  }
  // pf_sa, pf_csm, admin, and executive: no filter — portfolio-wide visibility

  const projectSubquery = projectFilter
    ? `SELECT id FROM projects ${projectFilter}`
    : `SELECT id FROM projects`;

  // Summary counts
  const activeProjects = await db
    .prepare(`SELECT COUNT(*) as count FROM projects ${projectFilter}`)
    .bind(...filterBindings)
    .first<{ count: number }>();

  const atRiskProjects = await db
    .prepare(
      `SELECT COUNT(*) as count FROM projects ${projectFilter ? `${projectFilter} AND health = ?` : "WHERE health = ?"}`
    )
    .bind(...filterBindings, "at_risk")
    .first<{ count: number }>();

  // AEs only see tasks assigned to them; managers and PMs/admins see all tasks on their projects
  const isAE = auth.role === "pf_ae" || auth.role === "partner_ae" || auth.role === "pf_sa";
  const isManager = teamIds.length > 1;
  const taskAssigneeClause = isAE && !isManager ? " AND assignee_user_id = ?" : "";
  const taskAssigneeBinding: string[] = isAE && !isManager ? [auth.user.id] : [];

  const openTasksCount = await db
    .prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE status != 'completed' AND project_id IN (${projectSubquery})${taskAssigneeClause}`
    )
    .bind(...filterBindings, ...taskAssigneeBinding)
    .first<{ count: number }>();

  const openRisksCount = await db
    .prepare(
      `SELECT COUNT(*) as count FROM risks WHERE status = 'open' AND project_id IN (${projectSubquery})`
    )
    .bind(...filterBindings)
    .first<{ count: number }>();

  // Full project list
  const projects = await db
    .prepare(
      `SELECT id, name, customer_name, vendor, solution_type, status, health,
              kickoff_date, target_go_live_date, actual_go_live_date,
              pm_user_id, ae_user_id
       FROM projects ${projectFilter}
       ORDER BY updated_at DESC`
    )
    .bind(...filterBindings)
    .all();

  // Open tasks (not completed) with project name, most urgent first
  const openTasks = await db
    .prepare(
      `SELECT t.id, t.project_id, t.phase_id, t.title, t.assignee_user_id,
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
    .all();

  // Open risks with project name, highest severity first
  const openRisks = await db
    .prepare(
      `SELECT r.id, r.project_id, r.title, r.description, r.severity, r.status,
              r.owner_user_id, p.name as project_name
       FROM risks r
       JOIN projects p ON p.id = r.project_id
       WHERE r.status = 'open'
         AND r.project_id IN (${projectSubquery})
       ORDER BY
         CASE r.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
       LIMIT 6`
    )
    .bind(...filterBindings)
    .all();

  // Projects grouped by current phase (in_progress > last completed > Not Started)
  const phaseDistribution = await db
    .prepare(
      `WITH current_phases AS (
         SELECT
           proj.id AS project_id,
           COALESCE(
             (SELECT ph.name FROM phases ph
              WHERE ph.project_id = proj.id AND ph.status = 'in_progress'
              ORDER BY ph.sort_order DESC LIMIT 1),
             (SELECT ph.name FROM phases ph
              WHERE ph.project_id = proj.id AND ph.status = 'completed'
              ORDER BY ph.sort_order DESC LIMIT 1),
             'Not Started'
           ) AS phase_name
         FROM projects proj
         WHERE proj.id IN (${projectSubquery})
       )
       SELECT phase_name, COUNT(*) AS count
       FROM current_phases
       GROUP BY phase_name
       ORDER BY count DESC`
    )
    .bind(...filterBindings)
    .all<{ phase_name: string; count: number }>();

  const vendorDistribution = await db
    .prepare(
      `SELECT COALESCE(vendor, 'Unknown') AS label, COUNT(*) AS count
       FROM projects
       WHERE id IN (${projectSubquery})
       GROUP BY vendor
       ORDER BY count DESC`
    )
    .bind(...filterBindings)
    .all<{ label: string; count: number }>();

  const typeDistribution = await db
    .prepare(
      `SELECT COALESCE(solution_type, 'Unknown') AS label, COUNT(*) AS count
       FROM projects
       WHERE id IN (${projectSubquery})
       GROUP BY solution_type
       ORDER BY count DESC`
    )
    .bind(...filterBindings)
    .all<{ label: string; count: number }>();

  return c.json({
    user: auth.user,
    summary: {
      activeProjects: activeProjects?.count ?? 0,
      atRiskProjects: atRiskProjects?.count ?? 0,
      openTasks: openTasksCount?.count ?? 0,
      openRisks: openRisksCount?.count ?? 0,
    },
    projects: projects.results ?? [],
    openTasks: openTasks.results ?? [],
    openRisks: openRisks.results ?? [],
    phaseDistribution: phaseDistribution.results ?? [],
    vendorDistribution: vendorDistribution.results ?? [],
    typeDistribution: typeDistribution.results ?? [],
  });
});

export default app;

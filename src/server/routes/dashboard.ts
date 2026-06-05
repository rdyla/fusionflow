import { Hono } from "hono";
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

export default app;

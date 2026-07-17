import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { getTeamUserIds, inPlaceholders } from "../lib/teamUtils";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const PAGE_SIZE = 20;

/**
 * GET /api/my-tasks
 * Query params:
 *   status   – not_started | in_progress | blocked | completed | overdue
 *   priority – low | medium | high
 *   search   – title substring
 *   page     – 1-based (default 1)
 */
app.get("/", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;

  const statusParam   = c.req.query("status")   ?? "";
  const priorityParam = c.req.query("priority") ?? "";
  const searchParam   = c.req.query("search")   ?? "";
  const page          = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const offset        = (page - 1) * PAGE_SIZE;

  // ── Build project scope (same logic as dashboard) ─────────────────────────
  let projectFilter = "";
  let projectBindings: string[] = [];

  if (auth.role === "pm") {
    projectFilter = "(pm_user_id = ? OR id IN (SELECT project_id FROM project_staff WHERE user_id = ? AND staff_role = 'pm'))";
    projectBindings = [auth.user.id, auth.user.id];
  } else if (auth.role === "pf_ae") {
    const teamIds = await getTeamUserIds(auth.user.id, db);
    const ph = inPlaceholders(teamIds);
    projectFilter = `(customer_id IN (SELECT id FROM customers WHERE pf_ae_user_id IN (${ph})) OR id IN (SELECT project_id FROM project_access WHERE user_id IN (${ph})))`;
    projectBindings = [...teamIds, ...teamIds];
  } else if (auth.role === "partner_ae") {
    const teamIds = await getTeamUserIds(auth.user.id, db);
    const ph = inPlaceholders(teamIds);
    projectFilter = `id IN (
      SELECT project_id FROM project_access WHERE user_id IN (${ph})
      UNION
      SELECT project_id FROM project_staff WHERE staff_role = 'partner_ae' AND user_id IN (${ph})
    )`;
    projectBindings = [...teamIds, ...teamIds];
  } else if (auth.role === "client") {
    if (!auth.user.dynamics_account_id) return c.json({ items: [], total: 0, page, hasMore: false });
    projectFilter = "dynamics_account_id = ?";
    projectBindings = [auth.user.dynamics_account_id];
  }
  // admin, pf_sa, pf_csm, executive: no project filter

  const projectSubquery = projectFilter
    ? `SELECT id FROM projects WHERE (archived = 0 OR archived IS NULL) AND ${projectFilter}`
    : `SELECT id FROM projects WHERE (archived = 0 OR archived IS NULL)`;

  // ── Task filters ──────────────────────────────────────────────────────────
  // "My Tasks" is personal for every internal role: you see only tasks assigned
  // to you (primary assignee OR an additional resource via task_assignees).
  // Admins/PMs/leads used to get the whole portfolio here — thousands of tasks,
  // useful to no one.
  //
  // Access-restricted roles (pf_ae, partner_ae — esp. external partners) ALSO
  // stay bound to the projects they can access, so a stale assignment on a
  // project they've been removed from can't leak its task/project names. The
  // portfolio-visible internal roles (admin/pm/pf_sa/pf_csm/executive/
  // pf_engineer) can see every project anyway, so no project bound is needed.
  // Clients aren't task assignees — scope them to their company's projects.
  // ── Assignment/scope branches ─────────────────────────────────────────────
  // Each branch projects a common column shape so the standard tasks table and
  // the MedVet throwaway custom_plan_items table can be UNIONed, then filtered
  // + paginated uniformly. Both use the same status vocabulary.
  const branches: { sql: string; binds: unknown[] }[] = [];

  if (auth.role === "client") {
    branches.push({
      sql: `SELECT t.id, t.project_id, t.stage_id, t.title, t.assignee_user_id,
                   t.due_date, t.status, t.priority, t.completed_at
            FROM tasks t WHERE t.project_id IN (${projectSubquery})`,
      binds: [...projectBindings],
    });
    // Clients aren't assignees; custom-plan items are internal-only, so skip.
  } else {
    const taskScope: string[] = ["(t.assignee_user_id = ? OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))"];
    const taskBinds: unknown[] = [auth.user.id, auth.user.id];
    if (auth.role === "pf_ae" || auth.role === "partner_ae") {
      taskScope.push(`t.project_id IN (${projectSubquery})`);
      taskBinds.push(...projectBindings);
    }
    branches.push({
      sql: `SELECT t.id, t.project_id, t.stage_id, t.title, t.assignee_user_id,
                   t.due_date, t.status, t.priority, t.completed_at
            FROM tasks t WHERE ${taskScope.join(" AND ")}`,
      binds: taskBinds,
    });
    // MedVet throwaway: custom_plan_items are real assignments too (no stage/
    // priority). Assignees are PF users, so no extra project bound is needed.
    branches.push({
      sql: `SELECT cpi.id, cpi.project_id, NULL AS stage_id, cpi.name AS title, cpi.assignee_user_id,
                   cpi.due_date, cpi.status, NULL AS priority, NULL AS completed_at
            FROM custom_plan_items cpi WHERE cpi.assignee_user_id = ?`,
      binds: [auth.user.id],
    });
  }

  const unionSql = branches.map((b) => b.sql).join("\n      UNION ALL\n      ");
  const unionBinds = branches.flatMap((b) => b.binds);

  // ── Outer filters (applied to the unioned set) ─────────────────────────────
  const outer: string[] = [];
  const outerBinds: unknown[] = [];
  if (statusParam === "overdue") {
    outer.push("x.status != 'completed'", "x.due_date IS NOT NULL", "x.due_date < date('now')");
  } else if (statusParam && statusParam !== "all") {
    outer.push("x.status = ?");
    outerBinds.push(statusParam);
  } else {
    outer.push("x.status != 'completed'");
  }
  if (priorityParam && priorityParam !== "all") {
    outer.push("x.priority = ?");
    outerBinds.push(priorityParam);
  }
  if (searchParam.trim()) {
    outer.push("x.title LIKE ?");
    outerBinds.push(`%${searchParam.trim()}%`);
  }
  const outerWhere = outer.length ? `WHERE ${outer.join(" AND ")}` : "";

  // ── Count ─────────────────────────────────────────────────────────────────
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM (${unionSql}) x ${outerWhere}`)
    .bind(...unionBinds, ...outerBinds)
    .first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  // ── Fetch page ────────────────────────────────────────────────────────────
  const rows = await db
    .prepare(
      `SELECT x.id, x.project_id, x.stage_id, x.title, x.assignee_user_id,
              x.due_date, x.status, x.priority, x.completed_at,
              p.name AS project_name,
              ph.name AS stage_name,
              u.name AS assignee_name
       FROM (${unionSql}) x
       JOIN projects p ON p.id = x.project_id
       LEFT JOIN stages ph ON ph.id = x.stage_id
       LEFT JOIN users u ON u.id = x.assignee_user_id
       ${outerWhere}
       ORDER BY
         CASE x.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 ELSE 3 END,
         CASE x.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         x.due_date ASC NULLS LAST
       LIMIT ? OFFSET ?`
    )
    .bind(...unionBinds, ...outerBinds, PAGE_SIZE, offset)
    .all();

  return c.json({
    items: rows.results ?? [],
    total,
    page,
    hasMore: offset + PAGE_SIZE < total,
  });
});

export default app;

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

  // ── Assignee scope ────────────────────────────────────────────────────────
  const isAE = auth.role === "pf_ae" || auth.role === "partner_ae" || auth.role === "pf_sa";
  const teamIds = isAE ? await getTeamUserIds(auth.user.id, db) : [auth.user.id];
  const isManager = teamIds.length > 1;
  const scopeToAssigned = (isAE && !isManager) || auth.role === "pf_engineer";

  // ── Task filters ──────────────────────────────────────────────────────────
  const conditions: string[] = [`t.project_id IN (${projectSubquery})`];
  const bindings: unknown[] = [...projectBindings];

  if (scopeToAssigned) {
    conditions.push("t.assignee_user_id = ?");
    bindings.push(auth.user.id);
  }

  // Status / overdue
  if (statusParam === "overdue") {
    conditions.push("t.status != 'completed'");
    conditions.push("t.due_date IS NOT NULL");
    conditions.push("t.due_date < date('now')");
  } else if (statusParam && statusParam !== "all") {
    conditions.push("t.status = ?");
    bindings.push(statusParam);
  } else {
    // default: exclude completed
    conditions.push("t.status != 'completed'");
  }

  if (priorityParam && priorityParam !== "all") {
    conditions.push("t.priority = ?");
    bindings.push(priorityParam);
  }

  if (searchParam.trim()) {
    conditions.push("t.title LIKE ?");
    bindings.push(`%${searchParam.trim()}%`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // ── Count ─────────────────────────────────────────────────────────────────
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM tasks t ${whereClause}`)
    .bind(...bindings)
    .first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  // ── Fetch page ────────────────────────────────────────────────────────────
  const rows = await db
    .prepare(
      `SELECT t.id, t.project_id, t.phase_id, t.title, t.assignee_user_id,
              t.due_date, t.status, t.priority, t.completed_at,
              p.name AS project_name,
              ph.name AS phase_name,
              u.name AS assignee_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN phases ph ON ph.id = t.phase_id
       LEFT JOIN users u ON u.id = t.assignee_user_id
       ${whereClause}
       ORDER BY
         CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 ELSE 3 END,
         CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         t.due_date ASC NULLS LAST
       LIMIT ? OFFSET ?`
    )
    .bind(...bindings, PAGE_SIZE, offset)
    .all();

  return c.json({
    items: rows.results ?? [],
    total,
    page,
    hasMore: offset + PAGE_SIZE < total,
  });
});

export default app;

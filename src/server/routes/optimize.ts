import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { fetchZoomUtilizationSnapshot } from "../services/zoomService";
import { searchAccounts } from "../services/dynamicsService";
import { scoreAssessment } from "../lib/scoringEngine";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Only internal PF roles can access Optimize
function assertOptimizeAccess(role: string) {
  if (!["admin", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer"].includes(role)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}
function assertOptimizeEdit(role: string) {
  if (!["admin", "pf_sa", "pf_csm", "pm"].includes(role)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}

// ── Account list ───────────────────────────────────────────────────────────────

app.get("/accounts", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const rows = await c.env.DB.prepare(`
    SELECT
      oa.id, oa.project_id, oa.graduated_at, oa.graduation_method,
      oa.optimize_status, oa.next_review_date, oa.sa_user_id, oa.csm_user_id,
      p.name AS project_name, p.customer_name, p.vendor, p.solution_type,
      p.actual_go_live_date, p.pm_user_id,
      sa.name AS sa_name, csm.name AS csm_name,
      (SELECT conducted_date FROM impact_assessments WHERE project_id = oa.project_id
       ORDER BY conducted_date DESC LIMIT 1) AS last_assessment_date,
      (SELECT overall_score FROM impact_assessments WHERE project_id = oa.project_id
       ORDER BY conducted_date DESC LIMIT 1) AS last_assessment_score
    FROM optimize_accounts oa
    JOIN projects p ON p.id = oa.project_id
    LEFT JOIN users sa  ON sa.id  = oa.sa_user_id
    LEFT JOIN users csm ON csm.id = oa.csm_user_id
    ORDER BY oa.graduated_at DESC
  `).all();
  return c.json(rows.results ?? []);
});

// ── Eligible projects (all phases complete, not yet graduated) ─────────────────

app.get("/eligible", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const rows = await c.env.DB.prepare(`
    SELECT p.id, p.name, p.customer_name, p.vendor, p.solution_type,
           p.actual_go_live_date, p.pm_user_id
    FROM projects p
    WHERE (p.archived = 0 OR p.archived IS NULL)
      AND p.id NOT IN (SELECT project_id FROM optimize_accounts)
      AND p.actual_go_live_date IS NOT NULL
    ORDER BY p.actual_go_live_date DESC
  `).all();
  return c.json(rows.results ?? []);
});

// ── Single account ─────────────────────────────────────────────────────────────

app.get("/accounts/:projectId", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const projectId = c.req.param("projectId");
  const row = await c.env.DB.prepare(`
    SELECT
      oa.id, oa.project_id, oa.graduated_at, oa.graduation_method,
      oa.optimize_status, oa.next_review_date, oa.notes, oa.sa_user_id, oa.csm_user_id,
      oa.updated_at,
      p.name AS project_name, p.customer_name, p.vendor, p.solution_type,
      p.actual_go_live_date, p.kickoff_date, p.pm_user_id,
      p.pm_name, p.ae_name, p.sa_name,
      sa.name  AS sa_user_name,  sa.email  AS sa_user_email,
      csm.name AS csm_user_name, csm.email AS csm_user_email
    FROM optimize_accounts oa
    JOIN projects p ON p.id = oa.project_id
    LEFT JOIN users sa  ON sa.id  = oa.sa_user_id
    LEFT JOIN users csm ON csm.id = oa.csm_user_id
    WHERE oa.project_id = ? LIMIT 1
  `).bind(projectId).first();
  if (!row) throw new HTTPException(404, { message: "Optimize account not found" });
  return c.json(row);
});

// ── CRM account search ─────────────────────────────────────────────────────────

app.get("/crm/accounts", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const q = c.req.query("q") ?? "";
  const results = await searchAccounts(c.env, q);
  return c.json(results);
});

// ── Direct enrollment (no prior project/solution) ──────────────────────────────

const directEnrollSchema = z.object({
  customer_name: z.string().min(1).max(500),
  vendor: z.string().max(100).nullable().optional(),
  solution_type: z.string().max(100).nullable().optional(),
  actual_go_live_date: z.string().nullable().optional(),
  sa_user_id: z.string().nullable().optional(),
  csm_user_id: z.string().nullable().optional(),
  next_review_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  dynamics_account_id: z.string().nullable().optional(),
});

app.post("/accounts/direct", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const auth = c.get("auth");

  const parsed = directEnrollSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const d = parsed.data;

  // Create a minimal project shell
  const projectId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO projects (id, name, customer_name, vendor, solution_type, actual_go_live_date,
      status, health, dynamics_account_id, archived)
    VALUES (?, ?, ?, ?, ?, ?, 'not_started', 'on_track', ?, 0)
  `).bind(
    projectId, d.customer_name, d.customer_name,
    d.vendor ?? null, d.solution_type ?? null,
    d.actual_go_live_date ?? null, d.dynamics_account_id ?? null
  ).run();

  // Create the optimize account
  const accountId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO optimize_accounts (id, project_id, graduated_by, graduation_method,
      sa_user_id, csm_user_id, next_review_date, notes)
    VALUES (?, ?, ?, 'direct', ?, ?, ?, ?)
  `).bind(
    accountId, projectId, auth.user.id,
    d.sa_user_id ?? null, d.csm_user_id ?? null,
    d.next_review_date ?? null, d.notes ?? null
  ).run();

  // Return in list-query shape
  const created = await db.prepare(`
    SELECT
      oa.id, oa.project_id, oa.graduated_at, oa.graduation_method,
      oa.optimize_status, oa.next_review_date, oa.sa_user_id, oa.csm_user_id,
      p.name AS project_name, p.customer_name, p.vendor, p.solution_type,
      p.actual_go_live_date, p.pm_user_id,
      sa.name AS sa_name, csm.name AS csm_name,
      NULL AS last_assessment_date, NULL AS last_assessment_score
    FROM optimize_accounts oa
    JOIN projects p ON p.id = oa.project_id
    LEFT JOIN users sa  ON sa.id  = oa.sa_user_id
    LEFT JOIN users csm ON csm.id = oa.csm_user_id
    WHERE oa.id = ? LIMIT 1
  `).bind(accountId).first();
  return c.json(created, 201);
});

// ── Graduate a project ─────────────────────────────────────────────────────────

const graduateSchema = z.object({
  sa_user_id: z.string().nullable().optional(),
  csm_user_id: z.string().nullable().optional(),
  next_review_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

app.post("/accounts/:projectId/graduate", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const projectId = c.req.param("projectId");
  const auth = c.get("auth");

  const project = await db.prepare("SELECT id FROM projects WHERE id = ? LIMIT 1").bind(projectId).first();
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const existing = await db.prepare("SELECT id FROM optimize_accounts WHERE project_id = ? LIMIT 1").bind(projectId).first();
  if (existing) throw new HTTPException(409, { message: "Project already in Optimize" });

  const body = await c.req.json().catch(() => ({}));
  const parsed = graduateSchema.safeParse(body);
  const data = parsed.success ? parsed.data : {};

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO optimize_accounts (id, project_id, graduated_by, graduation_method, sa_user_id, csm_user_id, next_review_date, notes)
    VALUES (?, ?, ?, 'manual', ?, ?, ?, ?)
  `).bind(id, projectId, auth.user.id, data.sa_user_id ?? null, data.csm_user_id ?? null, data.next_review_date ?? null, data.notes ?? null).run();

  const created = await db.prepare("SELECT * FROM optimize_accounts WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

// ── Update account ─────────────────────────────────────────────────────────────

const updateAccountSchema = z.object({
  sa_user_id: z.string().nullable().optional(),
  csm_user_id: z.string().nullable().optional(),
  optimize_status: z.enum(["active", "paused", "churned"]).optional(),
  next_review_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

app.patch("/accounts/:projectId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const projectId = c.req.param("projectId");

  const account = await db.prepare("SELECT id FROM optimize_accounts WHERE project_id = ? LIMIT 1").bind(projectId).first();
  if (!account) throw new HTTPException(404, { message: "Optimize account not found" });

  const parsed = updateAccountSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const fields: string[] = [], values: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); }
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });
  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db.prepare(`UPDATE optimize_accounts SET ${fields.join(", ")} WHERE project_id = ?`)
    .bind(...values, projectId).run();

  return c.json(await db.prepare("SELECT * FROM optimize_accounts WHERE project_id = ? LIMIT 1").bind(projectId).first());
});

// ── Impact Assessments ─────────────────────────────────────────────────────────

app.get("/accounts/:projectId/assessments", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const projectId = c.req.param("projectId");
  const rows = await c.env.DB.prepare(`
    SELECT ia.*, u.name AS conducted_by_name
    FROM impact_assessments ia
    LEFT JOIN users u ON u.id = ia.conducted_by_user_id
    WHERE ia.project_id = ?
    ORDER BY ia.conducted_date DESC
  `).bind(projectId).all();

  const results = (rows.results ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    solution_types: tryParseJSON(r.solution_types as string, []),
    answers: tryParseJSON(r.answers as string, {}),
    section_scores: tryParseJSON(r.section_scores as string | null, null),
    solution_scores: tryParseJSON(r.solution_scores as string | null, null),
    recommended_actions: tryParseJSON(r.recommended_actions as string | null, null),
    insights: tryParseJSON(r.insights as string | null, null),
  }));

  return c.json(results);
});

const impactAssessmentSchema = z.object({
  conducted_date: z.string().min(1),
  conducted_by_user_id: z.string().nullable().optional(),
  solution_types: z.array(z.string()).min(1),
  answers: z.record(z.unknown()),
});

app.post("/accounts/:projectId/assessments", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const projectId = c.req.param("projectId");

  const parsed = impactAssessmentSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const d = parsed.data;
  const result = scoreAssessment(d.answers, d.solution_types);

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO impact_assessments
      (id, project_id, survey_id, conducted_date, conducted_by_user_id,
       solution_types, answers, section_scores, solution_scores,
       overall_score, confidence_score, health_band, recommended_actions, insights)
    VALUES (?, ?, 'client_impact_assessment_unified_v1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, projectId,
    d.conducted_date, d.conducted_by_user_id ?? null,
    JSON.stringify(d.solution_types),
    JSON.stringify(d.answers),
    JSON.stringify(result.sectionScores),
    JSON.stringify(result.solutionScores),
    result.overallScore,
    result.confidenceScore,
    result.healthBand,
    JSON.stringify(result.recommendedActions),
    JSON.stringify(result.insights),
  ).run();

  const row = await db.prepare(`
    SELECT ia.*, u.name AS conducted_by_name
    FROM impact_assessments ia
    LEFT JOIN users u ON u.id = ia.conducted_by_user_id
    WHERE ia.id = ? LIMIT 1
  `).bind(id).first() as Record<string, unknown> | null;

  if (!row) throw new HTTPException(500, { message: "Failed to retrieve created assessment" });

  return c.json({
    ...row,
    solution_types: tryParseJSON(row.solution_types as string, []),
    answers: tryParseJSON(row.answers as string, {}),
    section_scores: tryParseJSON(row.section_scores as string | null, null),
    solution_scores: tryParseJSON(row.solution_scores as string | null, null),
    recommended_actions: tryParseJSON(row.recommended_actions as string | null, null),
    insights: tryParseJSON(row.insights as string | null, null),
  }, 201);
});

app.delete("/accounts/:projectId/assessments/:assessmentId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const { projectId, assessmentId } = c.req.param();
  const existing = await c.env.DB.prepare("SELECT id FROM impact_assessments WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(assessmentId, projectId).first();
  if (!existing) throw new HTTPException(404, { message: "Assessment not found" });
  await c.env.DB.prepare("DELETE FROM impact_assessments WHERE id = ?").bind(assessmentId).run();
  return c.json({ success: true });
});

function tryParseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

// ── Tech Stack ─────────────────────────────────────────────────────────────────

app.get("/accounts/:projectId/tech-stack", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const rows = await c.env.DB.prepare(
    "SELECT * FROM account_tech_stack WHERE project_id = ? ORDER BY tech_area ASC"
  ).bind(c.req.param("projectId")).all();
  return c.json(rows.results ?? []);
});

const techStackSchema = z.object({
  tech_area: z.enum(["uc", "security", "network", "datacenter", "backup_dr", "tem", "other"]),
  tech_area_label: z.string().nullable().optional(),
  current_vendor: z.string().nullable().optional(),
  current_solution: z.string().nullable().optional(),
  time_rating: z.enum(["tolerate", "invest", "migrate", "eliminate"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  last_reviewed: z.string().nullable().optional(),
});

app.post("/accounts/:projectId/tech-stack", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const projectId = c.req.param("projectId");
  const auth = c.get("auth");

  const parsed = techStackSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const d = parsed.data;
  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO account_tech_stack
      (id, project_id, tech_area, tech_area_label, current_vendor, current_solution,
       time_rating, notes, last_reviewed, reviewed_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, projectId, d.tech_area, d.tech_area_label ?? null, d.current_vendor ?? null,
    d.current_solution ?? null, d.time_rating ?? null, d.notes ?? null,
    d.last_reviewed ?? null, auth.user.id).run();

  return c.json(await db.prepare("SELECT * FROM account_tech_stack WHERE id = ? LIMIT 1").bind(id).first(), 201);
});

app.patch("/accounts/:projectId/tech-stack/:areaId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const { projectId, areaId } = c.req.param();
  const auth = c.get("auth");

  const existing = await db.prepare("SELECT id FROM account_tech_stack WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(areaId, projectId).first();
  if (!existing) throw new HTTPException(404, { message: "Tech stack area not found" });

  const parsed = techStackSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const fields: string[] = [], values: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); }
  }
  fields.push("reviewed_by_user_id = ?", "updated_at = CURRENT_TIMESTAMP");
  values.push(auth.user.id);

  await db.prepare(`UPDATE account_tech_stack SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, areaId).run();

  return c.json(await db.prepare("SELECT * FROM account_tech_stack WHERE id = ? LIMIT 1").bind(areaId).first());
});

app.delete("/accounts/:projectId/tech-stack/:areaId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const { projectId, areaId } = c.req.param();
  const existing = await db.prepare("SELECT id FROM account_tech_stack WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(areaId, projectId).first();
  if (!existing) throw new HTTPException(404, { message: "Tech stack area not found" });
  await db.prepare("DELETE FROM account_tech_stack WHERE id = ?").bind(areaId).run();
  return c.json({ success: true });
});

// ── Roadmap ────────────────────────────────────────────────────────────────────

app.get("/accounts/:projectId/roadmap", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const rows = await c.env.DB.prepare(`
    SELECT r.*, u.name AS created_by_name,
           ts.tech_area, ts.tech_area_label
    FROM roadmap_items r
    LEFT JOIN users u ON u.id = r.created_by
    LEFT JOIN account_tech_stack ts ON ts.id = r.tech_stack_id
    WHERE r.project_id = ?
    ORDER BY
      CASE r.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      r.created_at DESC
  `).bind(c.req.param("projectId")).all();
  return c.json(rows.results ?? []);
});

const roadmapSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  tech_stack_id: z.string().nullable().optional(),
  category: z.enum(["enhancement", "new_project", "optimization", "replacement"]).default("enhancement"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  time_rating: z.enum(["tolerate", "invest", "migrate", "eliminate"]).nullable().optional(),
  status: z.enum(["identified", "evaluating", "approved", "in_progress", "completed", "deferred"]).default("identified"),
  target_date: z.string().nullable().optional(),
});

app.post("/accounts/:projectId/roadmap", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const projectId = c.req.param("projectId");
  const auth = c.get("auth");

  const parsed = roadmapSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const d = parsed.data;
  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO roadmap_items
      (id, project_id, tech_stack_id, title, description, category, priority,
       time_rating, status, target_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, projectId, d.tech_stack_id ?? null, d.title, d.description ?? null,
    d.category, d.priority, d.time_rating ?? null, d.status, d.target_date ?? null, auth.user.id).run();

  return c.json(await db.prepare(`
    SELECT r.*, u.name AS created_by_name FROM roadmap_items r
    LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ? LIMIT 1
  `).bind(id).first(), 201);
});

app.patch("/accounts/:projectId/roadmap/:itemId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const { projectId, itemId } = c.req.param();

  const existing = await db.prepare("SELECT id FROM roadmap_items WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(itemId, projectId).first();
  if (!existing) throw new HTTPException(404, { message: "Roadmap item not found" });

  const parsed = roadmapSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const fields: string[] = [], values: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); }
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });
  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db.prepare(`UPDATE roadmap_items SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, itemId).run();

  return c.json(await db.prepare(`
    SELECT r.*, u.name AS created_by_name FROM roadmap_items r
    LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ? LIMIT 1
  `).bind(itemId).first());
});

app.delete("/accounts/:projectId/roadmap/:itemId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const { projectId, itemId } = c.req.param();
  const existing = await db.prepare("SELECT id FROM roadmap_items WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(itemId, projectId).first();
  if (!existing) throw new HTTPException(404, { message: "Roadmap item not found" });
  await db.prepare("DELETE FROM roadmap_items WHERE id = ?").bind(itemId).run();
  return c.json({ success: true });
});

// ── Utilization snapshots ──────────────────────────────────────────────────────

app.get("/accounts/:projectId/utilization", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const rows = await c.env.DB.prepare(
    "SELECT * FROM utilization_snapshots WHERE project_id = ? ORDER BY snapshot_date DESC"
  ).bind(c.req.param("projectId")).all();
  return c.json(rows.results ?? []);
});

app.post("/accounts/:projectId/utilization/sync", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const projectId = c.req.param("projectId");
  const db = c.env.DB;

  let data;
  try {
    data = await fetchZoomUtilizationSnapshot(c.env.KV, projectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zoom sync failed";
    throw new HTTPException(400, { message });
  }

  const id = crypto.randomUUID();
  const snapshot_date = new Date().toISOString().slice(0, 10);

  await db.prepare(`
    INSERT INTO utilization_snapshots
      (id, project_id, platform, snapshot_date, licenses_purchased, licenses_assigned,
       active_users_30d, active_users_90d, total_meetings, raw_data)
    VALUES (?, ?, 'zoom', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, projectId, snapshot_date,
    data.licenses_purchased, data.licenses_assigned,
    data.active_users_30d, data.active_users_90d,
    data.total_meetings,
    JSON.stringify(data.raw_data)
  ).run();

  const created = await db.prepare("SELECT * FROM utilization_snapshots WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

export default app;

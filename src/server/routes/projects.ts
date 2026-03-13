import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { canEditProject, canViewProject } from "../services/accessService";
import { STANDARD_PHASES } from "../lib/standardPhases";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;

  let sql = `
    SELECT id, name, customer_name, vendor, solution_type, status, health,
           kickoff_date, target_go_live_date, actual_go_live_date,
           pm_user_id, ae_user_id, created_at, updated_at
    FROM projects
  `;
  let bindings: string[] = [];

  if (auth.role === "pm") {
    sql += " WHERE pm_user_id = ?";
    bindings = [auth.user.id];
  } else if (auth.role === "pf_ae") {
    sql += " WHERE ae_user_id = ?";
    bindings = [auth.user.id];
  } else if (auth.role === "partner_ae") {
    sql += `
      WHERE id IN (
        SELECT project_id FROM project_access WHERE user_id = ?
      )
    `;
    bindings = [auth.user.id];
  }

  sql += " ORDER BY updated_at DESC";

  const rows = await db.prepare(sql).bind(...bindings).all();

  return c.json(rows.results ?? []);
});

app.get("/:id", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const project = await db
    .prepare(
      `
      SELECT id, name, customer_name, vendor, solution_type, status, health,
             kickoff_date, target_go_live_date, actual_go_live_date,
             pm_user_id, ae_user_id, created_at, updated_at
      FROM projects
      WHERE id = ?
      LIMIT 1
      `
    )
    .bind(projectId)
    .first();

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  return c.json(project);
});

const createProjectSchema = z.object({
  name: z.string().min(1).max(500),
  customer_name: z.string().max(500).optional(),
  vendor: z.string().max(500).optional(),
  solution_type: z.string().max(500).optional(),
  kickoff_date: z.string().optional(),
  target_go_live_date: z.string().optional(),
  pm_user_id: z.string().nullable().optional(),
  ae_user_id: z.string().nullable().optional(),
});

app.post("/", requireRole("admin", "pm"), async (c) => {
  const db = c.env.DB;
  const rawBody = await c.req.json();
  const parsed = createProjectSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { name, customer_name, vendor, solution_type, kickoff_date, target_go_live_date, pm_user_id: pmInput, ae_user_id: aeInput } = parsed.data;
  const projectId = crypto.randomUUID();
  const pm_user_id = pmInput ?? (auth.role === "pm" ? auth.user.id : null);
  const ae_user_id = aeInput ?? (auth.role === "pf_ae" ? auth.user.id : null);

  await db
    .prepare(
      `INSERT INTO projects (id, name, customer_name, vendor, solution_type, status, health, kickoff_date, target_go_live_date, pm_user_id, ae_user_id)
       VALUES (?, ?, ?, ?, ?, 'not_started', 'on_track', ?, ?, ?, ?)`
    )
    .bind(projectId, name, customer_name ?? null, vendor ?? null, solution_type ?? null, kickoff_date ?? null, target_go_live_date ?? null, pm_user_id, ae_user_id)
    .run();

  // Auto-seed standard phases
  for (let i = 0; i < STANDARD_PHASES.length; i++) {
    await db
      .prepare(
        `INSERT INTO phases (id, project_id, name, sort_order, status) VALUES (?, ?, ?, ?, 'not_started')`
      )
      .bind(crypto.randomUUID(), projectId, STANDARD_PHASES[i], i + 1)
      .run();
  }

  const created = await db
    .prepare(
      `
      SELECT id, name, customer_name, vendor, solution_type, status, health,
             kickoff_date, target_go_live_date, actual_go_live_date,
             pm_user_id, ae_user_id, created_at, updated_at
      FROM projects WHERE id = ? LIMIT 1
      `
    )
    .bind(projectId)
    .first();

  return c.json(created, 201);
});

const updateProjectSchema = z.object({
  status: z.string().min(1).optional(),
  health: z.string().min(1).optional(),
  target_go_live_date: z.string().optional(),
  actual_go_live_date: z.string().optional(),
  pm_user_id: z.string().nullable().optional(),
  ae_user_id: z.string().nullable().optional(),
});

app.patch("/:id", requireRole("admin", "pm"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateProjectSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const updates = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (!fields.length) {
    throw new HTTPException(400, { message: "No valid fields to update" });
  }

  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db
    .prepare(
      `
      UPDATE projects
      SET ${fields.join(", ")}
      WHERE id = ?
      `
    )
    .bind(...values, projectId)
    .run();

  const updated = await db
    .prepare("SELECT * FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first();

  return c.json(updated);
});

export default app;
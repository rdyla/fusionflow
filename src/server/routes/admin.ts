import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All admin routes require admin role
app.use("*", requireRole("admin"));

// ── Users ─────────────────────────────────────────────────────────────────────

app.get("/users", async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT id, email, name, organization_name, role, is_active, created_at, updated_at
       FROM users
       ORDER BY name ASC`
    )
    .all();
  return c.json(rows.results ?? []);
});

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(500).optional(),
  organization_name: z.string().max(500).optional(),
  role: z.enum(["admin", "pm", "pf_ae", "partner_ae"]),
});

app.post("/users", async (c) => {
  const db = c.env.DB;
  const rawBody = await c.req.json();
  const parsed = createUserSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { email, name, organization_name, role } = parsed.data;

  const existing = await db
    .prepare("SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1")
    .bind(email)
    .first();

  if (existing) {
    throw new HTTPException(409, { message: "A user with that email already exists" });
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO users (id, email, name, organization_name, role, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`
    )
    .bind(id, email.toLowerCase(), name ?? null, organization_name ?? null, role)
    .run();

  const created = await db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  email: z.string().email().optional(),
  organization_name: z.string().max(500).optional(),
  role: z.enum(["admin", "pm", "pf_ae", "partner_ae"]).optional(),
  is_active: z.number().int().min(0).max(1).optional(),
});

app.patch("/users/:id", async (c) => {
  const db = c.env.DB;
  const userId = c.req.param("id");
  const rawBody = await c.req.json();
  const parsed = updateUserSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const existing = await db
    .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first();

  if (!existing) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const updates = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(key === "email" && typeof value === "string" ? value.toLowerCase() : value);
    }
  }

  if (!fields.length) {
    throw new HTTPException(400, { message: "No valid fields to update" });
  }

  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db
    .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, userId)
    .run();

  const updated = await db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(userId).first();
  return c.json(updated);
});

// ── Project Access ─────────────────────────────────────────────────────────────

app.get("/projects/:projectId/access", async (c) => {
  const db = c.env.DB;
  const projectId = c.req.param("projectId");

  const project = await db
    .prepare("SELECT id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first();

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const rows = await db
    .prepare(
      `SELECT pa.id, pa.project_id, pa.user_id, pa.access_level,
              u.name, u.email, u.role, u.organization_name
       FROM project_access pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = ?
       ORDER BY u.name ASC`
    )
    .bind(projectId)
    .all();

  return c.json(rows.results ?? []);
});

const grantAccessSchema = z.object({
  user_id: z.string().min(1),
  access_level: z.string().optional(),
});

app.post("/projects/:projectId/access", async (c) => {
  const db = c.env.DB;
  const projectId = c.req.param("projectId");
  const rawBody = await c.req.json();
  const parsed = grantAccessSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { user_id, access_level } = parsed.data;

  const project = await db
    .prepare("SELECT id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first();

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const user = await db
    .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .bind(user_id)
    .first();

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const alreadyExists = await db
    .prepare("SELECT id FROM project_access WHERE project_id = ? AND user_id = ? LIMIT 1")
    .bind(projectId, user_id)
    .first();

  if (alreadyExists) {
    throw new HTTPException(409, { message: "User already has access to this project" });
  }

  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO project_access (id, project_id, user_id, access_level) VALUES (?, ?, ?, ?)")
    .bind(id, projectId, user_id, access_level ?? "viewer")
    .run();

  const created = await db
    .prepare(
      `SELECT pa.id, pa.project_id, pa.user_id, pa.access_level,
              u.name, u.email, u.role, u.organization_name
       FROM project_access pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.id = ? LIMIT 1`
    )
    .bind(id)
    .first();

  return c.json(created, 201);
});

app.delete("/projects/:projectId/access/:userId", async (c) => {
  const db = c.env.DB;
  const projectId = c.req.param("projectId");
  const userId = c.req.param("userId");

  const row = await db
    .prepare("SELECT id FROM project_access WHERE project_id = ? AND user_id = ? LIMIT 1")
    .bind(projectId, userId)
    .first();

  if (!row) {
    throw new HTTPException(404, { message: "Access record not found" });
  }

  await db
    .prepare("DELETE FROM project_access WHERE project_id = ? AND user_id = ?")
    .bind(projectId, userId)
    .run();

  return c.json({ success: true });
});

export default app;

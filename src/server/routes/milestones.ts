import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canViewProject, canEditProject } from "../services/accessService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/:id/milestones", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db
    .prepare(
      `SELECT id, project_id, phase_id, name, target_date, actual_date, status
       FROM milestones
       WHERE project_id = ?
       ORDER BY target_date ASC`
    )
    .bind(projectId)
    .all();

  return c.json(rows.results ?? []);
});

const milestoneSchema = z.object({
  name: z.string().min(1).max(500),
  phase_id: z.string().nullable().optional(),
  target_date: z.string().nullable().optional(),
  actual_date: z.string().nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
});

app.post("/:id/milestones", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = milestoneSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { name, phase_id, target_date, actual_date, status } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO milestones (id, project_id, phase_id, name, target_date, actual_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, projectId, phase_id ?? null, name, target_date ?? null, actual_date ?? null, status ?? "not_started")
    .run();

  const created = await db.prepare("SELECT * FROM milestones WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

const updateMilestoneSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  phase_id: z.string().nullable().optional(),
  target_date: z.string().nullable().optional(),
  actual_date: z.string().nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
});

app.patch("/:id/milestones/:milestoneId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const milestoneId = c.req.param("milestoneId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = updateMilestoneSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const existing = await db.prepare("SELECT id FROM milestones WHERE id = ? AND project_id = ? LIMIT 1").bind(milestoneId, projectId).first();
  if (!existing) throw new HTTPException(404, { message: "Milestone not found" });

  const updates = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (!fields.length) throw new HTTPException(400, { message: "No valid fields to update" });

  await db
    .prepare(`UPDATE milestones SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, milestoneId)
    .run();

  const updated = await db.prepare("SELECT * FROM milestones WHERE id = ? LIMIT 1").bind(milestoneId).first();
  return c.json(updated);
});

app.delete("/:id/milestones/:milestoneId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const milestoneId = c.req.param("milestoneId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const existing = await db.prepare("SELECT id FROM milestones WHERE id = ? AND project_id = ? LIMIT 1").bind(milestoneId, projectId).first();
  if (!existing) throw new HTTPException(404, { message: "Milestone not found" });

  await db.prepare("DELETE FROM milestones WHERE id = ?").bind(milestoneId).run();
  return c.json({ success: true });
});

export default app;

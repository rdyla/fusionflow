import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canEditProject, canViewProject } from "../services/accessService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const TASK_SELECT = `
  SELECT id, project_id, phase_id, title, assignee_user_id, due_date,
         completed_at, status, priority
  FROM tasks
`;

app.get("/:id/tasks", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const rows = await db
    .prepare(`${TASK_SELECT} WHERE project_id = ? ORDER BY due_date ASC`)
    .bind(projectId)
    .all();

  return c.json(rows.results ?? []);
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  phase_id: z.string().nullable().optional(),
  assignee_user_id: z.string().max(255).nullable().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed", "blocked"]).default("not_started"),
});

app.post("/:id/tasks", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const rawBody = await c.req.json();
  const parsed = createTaskSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { title, phase_id, assignee_user_id, due_date, priority, status } = parsed.data;
  const taskId = crypto.randomUUID();

  await db
    .prepare(
      `
      INSERT INTO tasks (id, project_id, phase_id, title, assignee_user_id, due_date, status, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .bind(taskId, projectId, phase_id ?? null, title, assignee_user_id ?? null, due_date ?? null, status, priority ?? null)
    .run();

  const created = await db
    .prepare(`${TASK_SELECT} WHERE id = ? LIMIT 1`)
    .bind(taskId)
    .first();

  return c.json(created, 201);
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  phase_id: z.string().nullable().optional(),
  assignee_user_id: z.string().max(255).nullable().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed", "blocked"]).optional(),
});

app.patch("/:id/tasks/:taskId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const existing = await db
    .prepare(`SELECT id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1`)
    .bind(taskId, projectId)
    .first();

  if (!existing) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const rawBody = await c.req.json();
  const parsed = updateTaskSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
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

  // Auto-set completed_at when marking complete
  if (updates.status === "completed") {
    fields.push("completed_at = CURRENT_TIMESTAMP");
  } else if (updates.status !== undefined) {
    fields.push("completed_at = NULL");
  }

  await db
    .prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND project_id = ?`)
    .bind(...values, taskId, projectId)
    .run();

  const updated = await db
    .prepare(`${TASK_SELECT} WHERE id = ? LIMIT 1`)
    .bind(taskId)
    .first();

  return c.json(updated);
});

app.delete("/:id/tasks/:taskId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const existing = await db
    .prepare(`SELECT id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1`)
    .bind(taskId, projectId)
    .first();

  if (!existing) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  await db
    .prepare(`DELETE FROM tasks WHERE id = ? AND project_id = ?`)
    .bind(taskId, projectId)
    .run();

  return c.json({ success: true });
});

export default app;

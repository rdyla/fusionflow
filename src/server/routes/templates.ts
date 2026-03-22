import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { canEditProject } from "../services/accessService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Admin CRUD (all require admin role) ────────────────────────────────────────

app.get("/templates", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templates = await db
    .prepare(
      `SELECT t.id, t.name, t.solution_type, t.description, t.created_at, t.updated_at,
              COUNT(DISTINCT tp.id) AS phase_count,
              COUNT(DISTINCT tt.id) AS task_count
       FROM templates t
       LEFT JOIN template_phases tp ON tp.template_id = t.id
       LEFT JOIN template_tasks tt ON tt.template_id = t.id
       GROUP BY t.id
       ORDER BY t.name ASC`
    )
    .all();
  return c.json(templates.results ?? []);
});

app.get("/templates/:id", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templateId = c.req.param("id");

  const template = await db
    .prepare("SELECT * FROM templates WHERE id = ? LIMIT 1")
    .bind(templateId)
    .first();
  if (!template) throw new HTTPException(404, { message: "Template not found" });

  const phases = await db
    .prepare(
      "SELECT * FROM template_phases WHERE template_id = ? ORDER BY order_index ASC"
    )
    .bind(templateId)
    .all();

  const tasks = await db
    .prepare(
      "SELECT * FROM template_tasks WHERE template_id = ? ORDER BY order_index ASC"
    )
    .bind(templateId)
    .all();

  const tasksByPhase: Record<string, unknown[]> = {};
  for (const task of tasks.results ?? []) {
    const t = task as { phase_id: string | null };
    const key = t.phase_id ?? "__none__";
    if (!tasksByPhase[key]) tasksByPhase[key] = [];
    tasksByPhase[key].push(task);
  }

  const phasesWithTasks = (phases.results ?? []).map((phase) => {
    const p = phase as { id: string };
    return { ...phase, tasks: tasksByPhase[p.id] ?? [] };
  });

  return c.json({ ...template, phases: phasesWithTasks });
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(500),
  solution_type: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
});

app.post("/templates", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const parsed = createTemplateSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { name, solution_type, description } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare(
      "INSERT INTO templates (id, name, solution_type, description) VALUES (?, ?, ?, ?)"
    )
    .bind(id, name, solution_type ?? null, description ?? null)
    .run();

  const created = await db.prepare("SELECT * FROM templates WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  solution_type: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});

app.patch("/templates/:id", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templateId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM templates WHERE id = ? LIMIT 1").bind(templateId).first();
  if (!existing) throw new HTTPException(404, { message: "Template not found" });

  const parsed = updateTemplateSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

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

  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db
    .prepare(`UPDATE templates SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, templateId)
    .run();

  const updated = await db.prepare("SELECT * FROM templates WHERE id = ? LIMIT 1").bind(templateId).first();
  return c.json(updated);
});

app.delete("/templates/:id", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templateId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM templates WHERE id = ? LIMIT 1").bind(templateId).first();
  if (!existing) throw new HTTPException(404, { message: "Template not found" });

  await db.prepare("DELETE FROM templates WHERE id = ?").bind(templateId).run();
  return c.json({ success: true });
});

// ── Phases ────────────────────────────────────────────────────────────────────

const addPhaseSchema = z.object({
  name: z.string().min(1).max(500),
  order_index: z.number().int().min(0),
});

app.post("/templates/:id/phases", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templateId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM templates WHERE id = ? LIMIT 1").bind(templateId).first();
  if (!existing) throw new HTTPException(404, { message: "Template not found" });

  const parsed = addPhaseSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { name, order_index } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare("INSERT INTO template_phases (id, template_id, name, order_index) VALUES (?, ?, ?, ?)")
    .bind(id, templateId, name, order_index)
    .run();

  const created = await db.prepare("SELECT * FROM template_phases WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

app.delete("/templates/:id/phases/:phaseId", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templateId = c.req.param("id");
  const phaseId = c.req.param("phaseId");

  const existing = await db
    .prepare("SELECT id FROM template_phases WHERE id = ? AND template_id = ? LIMIT 1")
    .bind(phaseId, templateId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Phase not found" });

  await db.prepare("DELETE FROM template_phases WHERE id = ?").bind(phaseId).run();
  return c.json({ success: true });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

const addTaskSchema = z.object({
  title: z.string().min(1).max(500),
  priority: z.enum(["low", "medium", "high"]).optional(),
  phase_id: z.string().nullable().optional(),
  order_index: z.number().int().min(0).optional(),
});

app.post("/templates/:id/tasks", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templateId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM templates WHERE id = ? LIMIT 1").bind(templateId).first();
  if (!existing) throw new HTTPException(404, { message: "Template not found" });

  const parsed = addTaskSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { title, priority, phase_id, order_index } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare(
      "INSERT INTO template_tasks (id, template_id, phase_id, title, priority, order_index) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, templateId, phase_id ?? null, title, priority ?? "medium", order_index ?? 0)
    .run();

  const created = await db.prepare("SELECT * FROM template_tasks WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

app.delete("/templates/:id/tasks/:taskId", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templateId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const existing = await db
    .prepare("SELECT id FROM template_tasks WHERE id = ? AND template_id = ? LIMIT 1")
    .bind(taskId, templateId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Task not found" });

  await db.prepare("DELETE FROM template_tasks WHERE id = ?").bind(taskId).run();
  return c.json({ success: true });
});

// ── Apply Template to Project ─────────────────────────────────────────────────

app.post("/:projectId/apply-template", requireRole("admin", "pm"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("projectId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const { template_id } = await c.req.json<{ template_id: string }>();
  if (!template_id) throw new HTTPException(400, { message: "template_id is required" });

  const template = await db.prepare("SELECT id FROM templates WHERE id = ? LIMIT 1").bind(template_id).first();
  if (!template) throw new HTTPException(404, { message: "Template not found" });

  const phases = await db
    .prepare("SELECT * FROM template_phases WHERE template_id = ? ORDER BY order_index ASC")
    .bind(template_id)
    .all<{ id: string; name: string; order_index: number }>();

  const tasks = await db
    .prepare("SELECT * FROM template_tasks WHERE template_id = ? ORDER BY order_index ASC")
    .bind(template_id)
    .all<{ id: string; phase_id: string | null; title: string; priority: string | null; order_index: number }>();

  // Determine starting sort_order for phases
  const maxSortRow = await db
    .prepare("SELECT MAX(sort_order) AS max_sort FROM phases WHERE project_id = ?")
    .bind(projectId)
    .first<{ max_sort: number | null }>();
  let sortOffset = (maxSortRow?.max_sort ?? 0) + 1;

  // Map template phase id -> newly created project phase id
  const phaseIdMap: Record<string, string> = {};
  let phasesCreated = 0;

  for (const phase of phases.results ?? []) {
    const newPhaseId = crypto.randomUUID();
    phaseIdMap[phase.id] = newPhaseId;
    await db
      .prepare(
        "INSERT INTO phases (id, project_id, name, sort_order, status) VALUES (?, ?, ?, ?, 'not_started')"
      )
      .bind(newPhaseId, projectId, phase.name, sortOffset)
      .run();
    sortOffset++;
    phasesCreated++;
  }

  let tasksCreated = 0;
  for (const task of tasks.results ?? []) {
    const newTaskId = crypto.randomUUID();
    const mappedPhaseId = task.phase_id ? (phaseIdMap[task.phase_id] ?? null) : null;
    await db
      .prepare(
        "INSERT INTO tasks (id, project_id, phase_id, title, priority, status) VALUES (?, ?, ?, ?, ?, 'not_started')"
      )
      .bind(newTaskId, projectId, mappedPhaseId, task.title, task.priority ?? "medium")
      .run();
    tasksCreated++;
  }

  return c.json({ phases_created: phasesCreated, tasks_created: tasksCreated });
});

export default app;

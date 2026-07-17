// ONE-OFF / THROWAWAY — MedVet Zoom custom plan (see migration 0129).
// A self-contained Timeline+Tasks plan mirroring the customer's Asana project.
// All routes are project-scoped and gated by canEditProject. Teardown: delete
// this file + its mount in index.ts + the CustomPlan* client + medvetPlan.json.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canEditProject, canViewProject } from "../services/accessService";
import { maybeSendEmail } from "../services/emailService";
import { taskAssigned } from "../lib/emailTemplates";
import { createNotification } from "../lib/notifications";
import medvetPlan from "../data/medvetPlan.json";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const COLS = "id, project_id, section, parent_id, depth, sort_order, name, module, start_date, due_date, status, assignee, assignee_user_id, assignee_contact_id, notes";

type SeedItem = {
  id: string; section: string; depth: number; parentId: string | null; sort: number;
  name: string; module: string | null; startDate: string | null; dueDate: string | null;
  status: string; assignee: string | null; notes: string | null;
};

// GET /api/projects/:id/custom-plan — list all plan items (ordered).
app.get("/:id/custom-plan", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  if (!(await canViewProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });
  const rows = await db
    .prepare(`SELECT ${COLS} FROM custom_plan_items WHERE project_id = ? ORDER BY sort_order ASC`)
    .bind(projectId)
    .all();
  return c.json({ items: rows.results ?? [] });
});

// POST /api/projects/:id/custom-plan/import — (re)seed from the bundled Asana
// export and flip projects.uses_custom_plan on. Idempotent: clears first.
app.post("/:id/custom-plan/import", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });

  const seed = medvetPlan as SeedItem[];
  // Fresh UUIDs so re-imports (and importing to multiple test projects) don't
  // collide on the Asana ids. Map Asana id → new id to resolve parent links.
  const idMap = new Map<string, string>();
  for (const it of seed) idMap.set(it.id, crypto.randomUUID());

  await db.prepare("DELETE FROM custom_plan_items WHERE project_id = ?").bind(projectId).run();

  // Insert in document order (parents precede children) in batches.
  const stmt = db.prepare(
    `INSERT INTO custom_plan_items (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  // Imported items carry only the free-text Asana label; real assignee refs
  // (assignee_user_id / assignee_contact_id) start null and are set via PATCH.
  const batch = seed.map((it) => stmt.bind(
    idMap.get(it.id)!, projectId, it.section, it.parentId ? idMap.get(it.parentId) ?? null : null,
    it.depth, it.sort, it.name, it.module, it.startDate, it.dueDate, it.status, it.assignee, null, null, it.notes,
  ));
  // D1 batch caps ~ a few hundred; chunk to be safe.
  for (let i = 0; i < batch.length; i += 100) await db.batch(batch.slice(i, i + 100));

  await db.prepare("UPDATE projects SET uses_custom_plan = 1 WHERE id = ?").bind(projectId).run();
  return c.json({ ok: true, imported: seed.length });
});

const itemSchema = z.object({
  section: z.string().min(1).max(120).optional(),
  parent_id: z.string().nullable().optional(),
  depth: z.number().int().min(0).max(3).optional(),
  name: z.string().min(1).max(500).optional(),
  module: z.string().max(120).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed", "blocked"]).optional(),
  assignee: z.string().max(255).nullable().optional(),
  assignee_user_id: z.string().max(255).nullable().optional(),
  assignee_contact_id: z.string().max(255).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

// POST /api/projects/:id/custom-plan — add an item (appended within its section).
app.post("/:id/custom-plan", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });
  const parsed = itemSchema.safeParse(await c.req.json());
  if (!parsed.success || !parsed.data.name) throw new HTTPException(400, { message: "name required" });
  const d = parsed.data;
  const id = crypto.randomUUID();

  // The outline renders purely by sort_order, so a new item must be inserted at
  // the right position (not just appended to the end). A subtask slots directly
  // beneath its parent; a new top-level task goes at the end of its section.
  // Section + depth are derived from the parent so they can't drift.
  let section: string, parentId: string | null, depth: number, sortOrder: number;
  if (d.parent_id) {
    const parent = await db
      .prepare("SELECT section, depth, sort_order FROM custom_plan_items WHERE id = ? AND project_id = ? LIMIT 1")
      .bind(d.parent_id, projectId).first<{ section: string; depth: number; sort_order: number }>();
    if (!parent) throw new HTTPException(400, { message: "Parent item not found" });
    section = parent.section; parentId = d.parent_id; depth = parent.depth + 1;
    sortOrder = parent.sort_order + 1;
    await db.prepare("UPDATE custom_plan_items SET sort_order = sort_order + 1 WHERE project_id = ? AND sort_order > ?")
      .bind(projectId, parent.sort_order).run();
  } else {
    if (!d.section) throw new HTTPException(400, { message: "section required" });
    section = d.section; parentId = null; depth = 0;
    const last = await db
      .prepare("SELECT MAX(sort_order) AS m FROM custom_plan_items WHERE project_id = ? AND section = ?")
      .bind(projectId, section).first<{ m: number | null }>();
    if (last?.m == null) {
      const g = await db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM custom_plan_items WHERE project_id = ?").bind(projectId).first<{ m: number }>();
      sortOrder = (g?.m ?? 0) + 1;
    } else {
      sortOrder = last.m + 1;
      await db.prepare("UPDATE custom_plan_items SET sort_order = sort_order + 1 WHERE project_id = ? AND sort_order > ?")
        .bind(projectId, last.m).run();
    }
  }

  await db
    .prepare(`INSERT INTO custom_plan_items (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, projectId, section, parentId, depth, sortOrder,
          d.name, d.module ?? null, d.start_date ?? null, d.due_date ?? null, d.status ?? "not_started",
          d.assignee ?? null, d.assignee_user_id ?? null, d.assignee_contact_id ?? null, d.notes ?? null)
    .run();
  const created = await db.prepare(`SELECT ${COLS} FROM custom_plan_items WHERE id = ? LIMIT 1`).bind(id).first();
  return c.json(created, 201);
});

// PATCH /api/projects/:id/custom-plan/:itemId — inline edits.
app.patch("/:id/custom-plan/:itemId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const itemId = c.req.param("itemId");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });
  const parsed = itemSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const editable: Record<string, unknown> = {};
  const map: Record<string, string> = { name: "name", module: "module", start_date: "start_date", due_date: "due_date", status: "status", assignee: "assignee", assignee_user_id: "assignee_user_id", assignee_contact_id: "assignee_contact_id", notes: "notes", section: "section" };
  for (const [k, col] of Object.entries(map)) {
    const v = (parsed.data as Record<string, unknown>)[k];
    if (v !== undefined) editable[col] = v;
  }
  const keys = Object.keys(editable);
  if (keys.length === 0) throw new HTTPException(400, { message: "No fields to update" });

  // Capture the prior user-assignee so we only notify on an actual (re)assignment.
  let priorAssigneeUserId: string | null = null;
  if ("assignee_user_id" in editable) {
    const prev = await db
      .prepare("SELECT assignee_user_id FROM custom_plan_items WHERE id = ? AND project_id = ? LIMIT 1")
      .bind(itemId, projectId).first<{ assignee_user_id: string | null }>();
    priorAssigneeUserId = prev?.assignee_user_id ?? null;
  }

  await db
    .prepare(`UPDATE custom_plan_items SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND project_id = ?`)
    .bind(...keys.map((k) => editable[k]), itemId, projectId)
    .run();
  const updated = await db.prepare(`SELECT ${COLS} FROM custom_plan_items WHERE id = ? AND project_id = ? LIMIT 1`).bind(itemId, projectId).first<{ name: string; due_date: string | null; assignee_user_id: string | null }>();
  if (!updated) throw new HTTPException(404, { message: "Not found" });

  // Real assignment parity with the standard tasks module: when a plan item is
  // (re)assigned to a PF user, fire the same task-assigned email + notification.
  const newAssigneeUserId = updated.assignee_user_id;
  if ("assignee_user_id" in editable && newAssigneeUserId && newAssigneeUserId !== priorAssigneeUserId) {
    const [assignee, project] = await Promise.all([
      db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(newAssigneeUserId).first<{ email: string; name: string }>(),
      db.prepare("SELECT name FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ name: string }>(),
    ]);
    if (assignee && project) {
      const appUrl = c.env.APP_URL ?? "";
      c.executionCtx.waitUntil(maybeSendEmail(c.env, db, newAssigneeUserId, "important", {
        to: assignee.email,
        subject: `You've been assigned: ${updated.name}`,
        html: taskAssigned({ assigneeName: assignee.name ?? assignee.email, taskTitle: updated.name, projectName: project.name, dueDate: updated.due_date, priority: null, appUrl, projectId }),
      }));
      c.executionCtx.waitUntil(createNotification(db, {
        recipientUserId: newAssigneeUserId,
        type: "task_assigned",
        title: `You've been assigned: ${updated.name}`,
        body: project.name,
        // Custom-plan items aren't rows in `tasks`; link to the project (its
        // Tasks tab renders the custom plan) so the notification resolves.
        entityType: "project",
        entityId: projectId,
        projectId,
        senderUserId: auth.user.id,
      }));
    }
  }
  return c.json(updated);
});

// DELETE /api/projects/:id/custom-plan/:itemId — deletes the item + its subtree.
app.delete("/:id/custom-plan/:itemId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const itemId = c.req.param("itemId");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });
  // Recursive subtree delete (self-referential parent_id).
  await db
    .prepare(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM custom_plan_items WHERE id = ? AND project_id = ?
         UNION ALL
         SELECT c.id FROM custom_plan_items c JOIN subtree s ON c.parent_id = s.id
       )
       DELETE FROM custom_plan_items WHERE id IN (SELECT id FROM subtree)`
    )
    .bind(itemId, projectId)
    .run();
  return c.json({ ok: true });
});

export default app;

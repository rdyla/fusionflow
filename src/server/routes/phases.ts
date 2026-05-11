import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canViewProject, canEditProject } from "../services/accessService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/:id/phases", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db
    .prepare(
      `SELECT id, project_id, name, sort_order, planned_start, planned_end,
              actual_start, actual_end, status
       FROM phases
       WHERE project_id = ?
       ORDER BY sort_order ASC`
    )
    .bind(projectId)
    .all();

  return c.json(rows.results ?? []);
});

const createPhaseSchema = z.object({
  name: z.string().min(1).max(120),
  planned_start: z.string().nullable().optional(),
  planned_end: z.string().nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
});

app.post("/:id/phases", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = createPhaseSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const { name, planned_start, planned_end, status } = parsed.data;

  // Append: new phase gets max(sort_order) + 1, or 0 if this is the first.
  const maxRow = await db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS max_so FROM phases WHERE project_id = ?")
    .bind(projectId)
    .first<{ max_so: number }>();
  const sortOrder = (maxRow?.max_so ?? -1) + 1;

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO phases (id, project_id, name, sort_order, planned_start, planned_end, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, projectId, name.trim(), sortOrder, planned_start ?? null, planned_end ?? null, status ?? "not_started")
    .run();

  const created = await db.prepare("SELECT * FROM phases WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

const updatePhaseSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
  planned_start: z.string().nullable().optional(),
  planned_end: z.string().nullable().optional(),
  actual_start: z.string().nullable().optional(),
  actual_end: z.string().nullable().optional(),
});

app.patch("/:id/phases/:phaseId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const phaseId = c.req.param("phaseId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = updatePhaseSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const existing = await db
    .prepare("SELECT id FROM phases WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(phaseId, projectId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Phase not found" });

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
    .prepare(`UPDATE phases SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, phaseId)
    .run();

  const updated = await db.prepare("SELECT * FROM phases WHERE id = ? LIMIT 1").bind(phaseId).first();

  // Auto-graduation: if all phases are now completed, graduate to Optimize
  if (updates.status === "completed") {
    const incomplete = await db
      .prepare("SELECT COUNT(*) as cnt FROM phases WHERE project_id = ? AND status != 'completed'")
      .bind(projectId)
      .first<{ cnt: number }>();

    if ((incomplete?.cnt ?? 1) === 0) {
      const existing = await db
        .prepare("SELECT id FROM optimize_accounts WHERE project_id = ? LIMIT 1")
        .bind(projectId)
        .first();

      if (!existing) {
        await db
          .prepare(
            `INSERT INTO optimize_accounts (id, project_id, graduated_by, graduation_method)
             VALUES (?, ?, ?, 'auto')`
          )
          .bind(crypto.randomUUID(), projectId, auth.user.id)
          .run();
      }
    }
  }

  return c.json(updated);
});

// DELETE /:id/phases/:phaseId
// Removes the phase and cleans up its dependents:
//   - risks    pointing at tasks-in-phase → orphan (task_id = NULL) so the
//                blocker stays visible at project level
//   - documents pointing at tasks-in-phase → orphan (task_id = NULL) so the
//                file is preserved
//   - tasks      → DELETE (otherwise the next DELETE FROM phases blocks)
//   - milestones → DELETE (phase-scoped, nothing else references them)
//   - documents tied directly to the phase → orphan (phase_id = NULL)
//   - zoom_recordings.phase_id → auto-NULL via FK ON DELETE SET NULL
//   - zoom_recordings.task_id  → auto-NULL via FK ON DELETE SET NULL
//   - task_comments / task_time_entries → ON DELETE CASCADE already
app.delete("/:id/phases/:phaseId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const phaseId = c.req.param("phaseId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const existing = await db
    .prepare("SELECT id FROM phases WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(phaseId, projectId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Phase not found" });

  // Cascade run as a single D1 batch — all statements commit atomically or
  // not at all. Important because risks.task_id and documents.task_id are
  // accepted by the risks/documents POST/PATCH endpoints without verifying
  // the task belongs to the same project as the row owning the reference
  // — so orphan refs can in principle exist across projects. We match by
  // the FK relationship only (no project_id filter on the UPDATEs) so a
  // stray cross-project reference doesn't leave a half-cleaned cascade.
  //
  // risks.task_id and documents.task_id reference tasks(id) with NO ON
  // DELETE clause (default NO ACTION blocks the DELETE), so we must NULL
  // them before deleting tasks. documents.phase_id same reasoning.
  await db.batch([
    db.prepare(
      "UPDATE risks SET task_id = NULL WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ? AND phase_id = ?)"
    ).bind(projectId, phaseId),
    db.prepare(
      "UPDATE documents SET task_id = NULL WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ? AND phase_id = ?)"
    ).bind(projectId, phaseId),
    db.prepare("DELETE FROM tasks WHERE project_id = ? AND phase_id = ?").bind(projectId, phaseId),
    db.prepare("DELETE FROM milestones WHERE project_id = ? AND phase_id = ?").bind(projectId, phaseId),
    // Documents tied directly to the phase (not just to tasks within it):
    // orphan to project level so files aren't lost.
    db.prepare("UPDATE documents SET phase_id = NULL WHERE phase_id = ?").bind(phaseId),
    db.prepare("DELETE FROM phases WHERE id = ?").bind(phaseId),
  ]);

  return c.json({ success: true });
});

export default app;

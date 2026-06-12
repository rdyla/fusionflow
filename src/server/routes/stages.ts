import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canViewProject, canEditProject, visiblePhaseIds } from "../services/accessService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/:id/stages", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  // Phase-scoped clients see only their phases' stages (+ shared phase_id NULL).
  const vp = await visiblePhaseIds(db, auth.user, projectId);
  const vpIds = vp === "ALL" ? [] : vp;
  const phaseClause = vp === "ALL" ? "" : ` AND (phase_id IS NULL OR phase_id IN (${vpIds.map(() => "?").join(",")}))`;

  const rows = await db
    .prepare(
      `SELECT id, project_id, name, sort_order, planned_start, planned_end,
              actual_start, actual_end, status, phase_id
       FROM stages
       WHERE project_id = ?${phaseClause}
       ORDER BY sort_order ASC`
    )
    .bind(projectId, ...vpIds)
    .all();

  return c.json(rows.results ?? []);
});

const createStageSchema = z.object({
  name: z.string().min(1).max(120),
  planned_start: z.string().nullable().optional(),
  planned_end: z.string().nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
});

app.post("/:id/stages", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = createStageSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const { name, planned_start, planned_end, status } = parsed.data;

  // Append: new stage gets max(sort_order) + 1, or 0 if this is the first.
  const maxRow = await db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS max_so FROM stages WHERE project_id = ?")
    .bind(projectId)
    .first<{ max_so: number }>();
  const sortOrder = (maxRow?.max_so ?? -1) + 1;

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO stages (id, project_id, name, sort_order, planned_start, planned_end, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, projectId, name.trim(), sortOrder, planned_start ?? null, planned_end ?? null, status ?? "not_started")
    .run();

  const created = await db.prepare("SELECT * FROM stages WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

// Stage status is auto-derived from the stage's tasks — see
// teamUtils.syncStageStatus, called from routes/tasks.ts on task POST /
// PATCH / DELETE. PMs can't set it manually anymore (May-2026), so it's
// not in this schema. Clients that still send `status` get it silently
// dropped by zod.
const updateStageSchema = z.object({
  planned_start: z.string().nullable().optional(),
  planned_end: z.string().nullable().optional(),
  actual_start: z.string().nullable().optional(),
  actual_end: z.string().nullable().optional(),
});

app.patch("/:id/stages/:stageId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const stageId = c.req.param("stageId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = updateStageSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const existing = await db
    .prepare("SELECT id FROM stages WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(stageId, projectId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Stage not found" });

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
    .prepare(`UPDATE stages SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, stageId)
    .run();

  const updated = await db.prepare("SELECT * FROM stages WHERE id = ? LIMIT 1").bind(stageId).first();

  // Auto-graduation moved to teamUtils.maybeGraduateProject and is fired
  // from routes/tasks.ts when a task update flips a stage to completed.

  return c.json(updated);
});

// DELETE /:id/stages/:stageId
// Removes the stage and cleans up its dependents:
//   - risks    pointing at tasks-in-stage → orphan (task_id = NULL) so the
//                blocker stays visible at project level
//   - documents pointing at tasks-in-stage → orphan (task_id = NULL) so the
//                file is preserved
//   - tasks      → DELETE (otherwise the next DELETE FROM stages blocks)
//   - documents tied directly to the stage → orphan (stage_id = NULL)
//   - zoom_recordings.stage_id → auto-NULL via FK ON DELETE SET NULL
//   - zoom_recordings.task_id  → auto-NULL via FK ON DELETE SET NULL
//   - task_comments / task_time_entries → ON DELETE CASCADE already
//
// The `milestones` table was dropped in migration 0041 — even though it
// still appears in 0001_initial.sql, it does not exist on staging or prod.
app.delete("/:id/stages/:stageId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const stageId = c.req.param("stageId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const existing = await db
    .prepare("SELECT id FROM stages WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(stageId, projectId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Stage not found" });

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
  // them before deleting tasks. documents.stage_id same reasoning.
  await db.batch([
    db.prepare(
      "UPDATE risks SET task_id = NULL WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ? AND stage_id = ?)"
    ).bind(projectId, stageId),
    db.prepare(
      "UPDATE documents SET task_id = NULL WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ? AND stage_id = ?)"
    ).bind(projectId, stageId),
    db.prepare("DELETE FROM tasks WHERE project_id = ? AND stage_id = ?").bind(projectId, stageId),
    // Documents tied directly to the stage (not just to tasks within it):
    // orphan to project level so files aren't lost.
    db.prepare("UPDATE documents SET stage_id = NULL WHERE stage_id = ?").bind(stageId),
    db.prepare("DELETE FROM stages WHERE id = ?").bind(stageId),
  ]);

  return c.json({ success: true });
});

export default app;

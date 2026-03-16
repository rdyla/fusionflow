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

export default app;

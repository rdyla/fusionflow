/**
 * Phases CRUD for multi-phase projects (e.g. City of Thousand Oaks rolling
 * out Libraries → Treatment → HQ on staggered timelines).
 *
 * Schema lives at migration 0085: `phases` table + `stages.phase_id` (nullable).
 * phase_id IS NULL on a stage means "shared" — the project's Initiate stage
 * is shared across all phases. Non-null means the stage belongs to that
 * phase's per-phase PMI chain (Plan / Execute / Monitor / Go-Live / Hypercare).
 *
 * Create-time stage wiring (the part that earns its keep):
 *   - First phase on a project that already has post-Initiate stages:
 *     MOVE those stages under the new phase (set phase_id). Tasks come along
 *     for free since they reference stage_id. "Initiate"-like stages stay
 *     shared (detected by name match — case-insensitive 'initiat').
 *   - Subsequent phases: CLONE the first phase's stage shape (new stage
 *     rows, same names/dates/sort_order). Tasks are NOT cloned —
 *     downstream phases typically have their own task lists, and copying
 *     N tasks × M phases quickly becomes a mess to clean up.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canViewProject, canEditProject } from "../services/accessService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

type PhaseRow = {
  id: string;
  project_id: string;
  name: string;
  target_go_live_date: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── List ─────────────────────────────────────────────────────────────────────

app.get("/:id/phases", async (c) => {
  const projectId = c.req.param("id");
  const auth = c.get("auth");
  if (!(await canViewProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const rows = await c.env.DB
    .prepare(
      `SELECT id, project_id, name, target_go_live_date, display_order, created_at, updated_at
       FROM phases WHERE project_id = ?
       ORDER BY display_order ASC, COALESCE(target_go_live_date, '9999-12-31') ASC, name ASC`
    )
    .bind(projectId)
    .all<PhaseRow>();
  return c.json(rows.results ?? []);
});

// ── Create ───────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(255),
  target_go_live_date: z.string().regex(ISO_DATE).nullable().optional(),
});

app.post("/:id/phases", async (c) => {
  const projectId = c.req.param("id");
  const auth = c.get("auth");
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const { name, target_go_live_date } = parsed.data;

  const db = c.env.DB;
  const phaseId = crypto.randomUUID();

  // Pick the next display_order slot (1-based, after any existing phase).
  const maxRow = await db
    .prepare("SELECT COALESCE(MAX(display_order), 0) AS m FROM phases WHERE project_id = ?")
    .bind(projectId)
    .first<{ m: number }>();
  const displayOrder = (maxRow?.m ?? 0) + 1;

  await db
    .prepare(
      `INSERT INTO phases (id, project_id, name, target_go_live_date, display_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(phaseId, projectId, name, target_go_live_date ?? null, displayOrder)
    .run();

  // ── Stage wiring ─────────────────────────────────────────────────────────
  // How many phases existed BEFORE this one?
  const otherPhasesRow = await db
    .prepare("SELECT COUNT(*) AS c FROM phases WHERE project_id = ? AND id != ?")
    .bind(projectId, phaseId)
    .first<{ c: number }>();
  const isFirstPhase = (otherPhasesRow?.c ?? 0) === 0;

  if (isFirstPhase) {
    // Move all non-Initiate, currently-shared stages to this phase.
    // "Initiate" detection: stage name contains 'initiat' (case-insensitive).
    await db
      .prepare(
        `UPDATE stages SET phase_id = ?
         WHERE project_id = ? AND phase_id IS NULL
           AND LOWER(name) NOT LIKE '%initiat%'`
      )
      .bind(phaseId, projectId)
      .run();
  } else {
    // Clone the FIRST phase's stage shape under this new phase. Pull the first
    // phase's stages (by display_order on phases) and re-insert with new IDs
    // and phase_id = the new phase. Tasks intentionally NOT cloned.
    const firstPhaseRow = await db
      .prepare(
        `SELECT id FROM phases
         WHERE project_id = ? AND id != ?
         ORDER BY display_order ASC LIMIT 1`
      )
      .bind(projectId, phaseId)
      .first<{ id: string }>();
    if (firstPhaseRow) {
      const sourceStages = await db
        .prepare(
          `SELECT name, sort_order, planned_start, planned_end, status
           FROM stages WHERE project_id = ? AND phase_id = ?
           ORDER BY COALESCE(sort_order, 0) ASC`
        )
        .bind(projectId, firstPhaseRow.id)
        .all<{ name: string; sort_order: number | null; planned_start: string | null; planned_end: string | null; status: string | null }>();
      for (const ph of (sourceStages.results ?? [])) {
        await db
          .prepare(
            `INSERT INTO stages (id, project_id, phase_id, name, sort_order, planned_start, planned_end, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(crypto.randomUUID(), projectId, phaseId, ph.name, ph.sort_order, ph.planned_start, ph.planned_end, ph.status)
          .run();
      }
    }
  }

  const created = await db
    .prepare(
      `SELECT id, project_id, name, target_go_live_date, display_order, created_at, updated_at
       FROM phases WHERE id = ?`
    )
    .bind(phaseId)
    .first<PhaseRow>();

  return c.json(created, 201);
});

// ── Update ───────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  target_go_live_date: z.string().regex(ISO_DATE).nullable().optional(),
  display_order: z.number().int().min(0).optional(),
});

app.patch("/:id/phases/:phaseId", async (c) => {
  const projectId = c.req.param("id");
  const phaseId = c.req.param("phaseId");
  const auth = c.get("auth");
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (fields.length === 0) throw new HTTPException(400, { message: "No valid fields to update" });
  fields.push("updated_at = CURRENT_TIMESTAMP");

  await c.env.DB
    .prepare(`UPDATE phases SET ${fields.join(", ")} WHERE id = ? AND project_id = ?`)
    .bind(...values, phaseId, projectId)
    .run();

  const updated = await c.env.DB
    .prepare(
      `SELECT id, project_id, name, target_go_live_date, display_order, created_at, updated_at
       FROM phases WHERE id = ?`
    )
    .bind(phaseId)
    .first<PhaseRow>();

  if (!updated) throw new HTTPException(404, { message: "Phase not found" });
  return c.json(updated);
});

// ── Delete ───────────────────────────────────────────────────────────────────

app.delete("/:id/phases/:phaseId", async (c) => {
  const projectId = c.req.param("id");
  const phaseId = c.req.param("phaseId");
  const auth = c.get("auth");
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  // Verify the phase belongs to this project before deleting.
  const exists = await c.env.DB
    .prepare("SELECT id FROM phases WHERE id = ? AND project_id = ?")
    .bind(phaseId, projectId)
    .first();
  if (!exists) throw new HTTPException(404, { message: "Phase not found" });

  // Stages (and their tasks) cascade via the FK ON DELETE CASCADE established
  // in migration 0085. Tasks reference stage_id, so deleting stages cleans
  // tasks transitively through the stage ref — but tasks.stage_id has no
  // formal CASCADE constraint, so explicitly null those out first to avoid
  // dangling references. We also delete the orphaned tasks (only the ones
  // that belong to a stage being removed).
  const stageRows = await c.env.DB
    .prepare("SELECT id FROM stages WHERE phase_id = ?")
    .bind(phaseId)
    .all<{ id: string }>();
  const stageIds = (stageRows.results ?? []).map((p) => p.id);
  if (stageIds.length > 0) {
    const placeholders = stageIds.map(() => "?").join(",");
    // Delete tasks for these stages first.
    await c.env.DB
      .prepare(`DELETE FROM tasks WHERE stage_id IN (${placeholders})`)
      .bind(...stageIds)
      .run();
  }
  // Then drop the phase — stages cascade via FK.
  await c.env.DB.prepare("DELETE FROM phases WHERE id = ?").bind(phaseId).run();

  return c.json({ success: true, deleted_stage_count: stageIds.length });
});

export default app;

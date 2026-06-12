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
import { canViewProject, canEditProject, visiblePhaseIds } from "../services/accessService";

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
  // Phase-scoped clients see only the phases they're attached to.
  const vp = await visiblePhaseIds(c.env.DB, auth.user, projectId);
  const vpIds = vp === "ALL" ? [] : vp;
  const phaseClause = vp === "ALL" ? "" : ` AND id IN (${vpIds.map(() => "?").join(",")})`;

  const rows = await c.env.DB
    .prepare(
      `SELECT id, project_id, name, target_go_live_date, display_order, created_at, updated_at
       FROM phases WHERE project_id = ?${phaseClause}
       ORDER BY display_order ASC, COALESCE(target_go_live_date, '9999-12-31') ASC, name ASC`
    )
    .bind(projectId, ...vpIds)
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
  const phasesBefore = otherPhasesRow?.c ?? 0;

  if (phasesBefore === 0) {
    // Legacy / defensive path: project has no other phases (shouldn't happen
    // after PR E2 since project creation seeds a Main phase, but covers any
    // project whose Main got deleted). Pull all shared stages — including
    // Initiate — under this phase, since "shared with one phase" is
    // meaningless.
    await db
      .prepare("UPDATE stages SET phase_id = ? WHERE project_id = ? AND phase_id IS NULL")
      .bind(phaseId, projectId)
      .run();
  } else if (phasesBefore === 1) {
    // Going from single-phase (Initiate currently lives under the existing
    // phase, per E2's invariant) to multi-phase. Unshare Initiate by lifting
    // it back to phase_id = NULL so it acts as the project's shared
    // Initiate, then clone the existing phase's NON-Initiate stage chain
    // under the new phase.
    const existingPhase = await db
      .prepare("SELECT id FROM phases WHERE project_id = ? AND id != ? LIMIT 1")
      .bind(projectId, phaseId)
      .first<{ id: string }>();
    if (existingPhase) {
      await db
        .prepare(
          `UPDATE stages SET phase_id = NULL
           WHERE project_id = ? AND phase_id = ?
             AND LOWER(name) LIKE '%initiat%'`
        )
        .bind(projectId, existingPhase.id)
        .run();
      // Fall through to the standard "clone first phase" path below.
    }
  }
  if (phasesBefore >= 1) {
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

  // If the project just dropped back to a single phase, fold the shared
  // Initiate stages under the remaining phase. Mirrors the unshare done
  // on going single-→-multi in the POST handler above.
  const remainingPhases = await c.env.DB
    .prepare("SELECT id FROM phases WHERE project_id = ? ORDER BY display_order ASC LIMIT 2")
    .bind(projectId)
    .all<{ id: string }>();
  const remaining = remainingPhases.results ?? [];
  if (remaining.length === 1) {
    await c.env.DB
      .prepare(
        `UPDATE stages SET phase_id = ?
         WHERE project_id = ? AND phase_id IS NULL`
      )
      .bind(remaining[0].id, projectId)
      .run();
  }

  return c.json({ success: true, deleted_stage_count: stageIds.length });
});

// ── Phase contacts (customer-side) ───────────────────────────────────────────
// phase_id NULL = "All phases" (the college/district tier). Email drives the
// client-visibility match in accessService.visiblePhaseIds().

app.get("/:id/phase-contacts", async (c) => {
  const projectId = c.req.param("id");
  const auth = c.get("auth");
  if (!(await canViewProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const rows = await c.env.DB
    .prepare(
      `SELECT id, project_id, phase_id, customer_contact_id, name, email, job_title, contact_role, created_at
       FROM phase_contacts WHERE project_id = ? ORDER BY created_at ASC`
    )
    .bind(projectId)
    .all();
  return c.json(rows.results ?? []);
});

const phaseContactSchema = z.object({
  phase_id: z.string().nullable().optional(),     // null/omitted = All phases
  customer_contact_id: z.string().nullable().optional(),
  name: z.string().min(1).max(255),
  email: z.string().max(320).nullable().optional(),
  job_title: z.string().max(255).nullable().optional(),
  contact_role: z.string().max(255).nullable().optional(),
});

app.post("/:id/phase-contacts", async (c) => {
  const projectId = c.req.param("id");
  const auth = c.get("auth");
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const parsed = phaseContactSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const d = parsed.data;

  if (d.phase_id) {
    const ok = await c.env.DB.prepare("SELECT id FROM phases WHERE id = ? AND project_id = ? LIMIT 1").bind(d.phase_id, projectId).first();
    if (!ok) throw new HTTPException(400, { message: "phase_id does not belong to this project" });
  }

  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO phase_contacts (id, project_id, phase_id, customer_contact_id, name, email, job_title, contact_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, projectId, d.phase_id ?? null, d.customer_contact_id ?? null, d.name, d.email ?? null, d.job_title ?? null, d.contact_role ?? null)
    .run();
  const created = await c.env.DB.prepare("SELECT * FROM phase_contacts WHERE id = ?").bind(id).first();
  return c.json(created, 201);
});

app.delete("/:id/phase-contacts/:contactId", async (c) => {
  const { id: projectId, contactId } = c.req.param();
  const auth = c.get("auth");
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  await c.env.DB.prepare("DELETE FROM phase_contacts WHERE id = ? AND project_id = ?").bind(contactId, projectId).run();
  return c.json({ success: true });
});

// ── Phase staff (PF-side) — assignment/display metadata, no visibility gate ──

app.get("/:id/phase-staff", async (c) => {
  const projectId = c.req.param("id");
  const auth = c.get("auth");
  if (!(await canViewProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const rows = await c.env.DB
    .prepare(
      `SELECT ps.id, ps.project_id, ps.phase_id, ps.user_id, ps.staff_role, ps.created_at,
              u.name AS user_name, u.email AS user_email
       FROM phase_staff ps JOIN users u ON u.id = ps.user_id
       WHERE ps.project_id = ? ORDER BY ps.created_at ASC`
    )
    .bind(projectId)
    .all();
  return c.json(rows.results ?? []);
});

const phaseStaffSchema = z.object({
  phase_id: z.string().min(1),
  user_id: z.string().min(1),
  staff_role: z.string().max(40).nullable().optional(),
});

app.post("/:id/phase-staff", async (c) => {
  const projectId = c.req.param("id");
  const auth = c.get("auth");
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const parsed = phaseStaffSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const d = parsed.data;

  const ok = await c.env.DB.prepare("SELECT id FROM phases WHERE id = ? AND project_id = ? LIMIT 1").bind(d.phase_id, projectId).first();
  if (!ok) throw new HTTPException(400, { message: "phase_id does not belong to this project" });

  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO phase_staff (id, project_id, phase_id, user_id, staff_role)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(phase_id, user_id, staff_role) DO NOTHING`
    )
    .bind(id, projectId, d.phase_id, d.user_id, d.staff_role ?? null)
    .run();
  const created = await c.env.DB
    .prepare(
      `SELECT ps.id, ps.project_id, ps.phase_id, ps.user_id, ps.staff_role, ps.created_at,
              u.name AS user_name, u.email AS user_email
       FROM phase_staff ps JOIN users u ON u.id = ps.user_id
       WHERE ps.phase_id = ? AND ps.user_id = ? AND (ps.staff_role IS ? OR ps.staff_role = ?)
       ORDER BY ps.created_at DESC LIMIT 1`
    )
    .bind(d.phase_id, d.user_id, d.staff_role ?? null, d.staff_role ?? null)
    .first();
  return c.json(created, 201);
});

app.delete("/:id/phase-staff/:rowId", async (c) => {
  const { id: projectId, rowId } = c.req.param();
  const auth = c.get("auth");
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  await c.env.DB.prepare("DELETE FROM phase_staff WHERE id = ? AND project_id = ?").bind(rowId, projectId).run();
  return c.json({ success: true });
});

export default app;

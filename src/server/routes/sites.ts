/**
 * Sites CRUD for multi-site projects (e.g. City of Thousand Oaks rolling
 * out Libraries → Treatment → HQ on staggered timelines).
 *
 * Schema lives at migration 0085: `sites` table + `stages.site_id` (nullable).
 * site_id IS NULL on a stage means "shared" — the project's Initiate stage
 * is shared across all sites. Non-null means the stage belongs to that
 * site's per-site PMI chain (Plan / Execute / Monitor / Go-Live / Hypercare).
 *
 * Create-time stage wiring (the part that earns its keep):
 *   - First site on a project that already has post-Initiate stages:
 *     MOVE those stages under the new site (set site_id). Tasks come along
 *     for free since they reference stage_id. "Initiate"-like stages stay
 *     shared (detected by name match — case-insensitive 'initiat').
 *   - Subsequent sites: CLONE the first site's stage shape (new stage
 *     rows, same names/dates/sort_order). Tasks are NOT cloned —
 *     downstream sites typically have their own task lists, and copying
 *     N tasks × M sites quickly becomes a mess to clean up.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canViewProject, canEditProject } from "../services/accessService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

type SiteRow = {
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

app.get("/:id/sites", async (c) => {
  const projectId = c.req.param("id");
  const auth = c.get("auth");
  if (!(await canViewProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const rows = await c.env.DB
    .prepare(
      `SELECT id, project_id, name, target_go_live_date, display_order, created_at, updated_at
       FROM sites WHERE project_id = ?
       ORDER BY display_order ASC, COALESCE(target_go_live_date, '9999-12-31') ASC, name ASC`
    )
    .bind(projectId)
    .all<SiteRow>();
  return c.json(rows.results ?? []);
});

// ── Create ───────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(255),
  target_go_live_date: z.string().regex(ISO_DATE).nullable().optional(),
});

app.post("/:id/sites", async (c) => {
  const projectId = c.req.param("id");
  const auth = c.get("auth");
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const { name, target_go_live_date } = parsed.data;

  const db = c.env.DB;
  const siteId = crypto.randomUUID();

  // Pick the next display_order slot (1-based, after any existing site).
  const maxRow = await db
    .prepare("SELECT COALESCE(MAX(display_order), 0) AS m FROM sites WHERE project_id = ?")
    .bind(projectId)
    .first<{ m: number }>();
  const displayOrder = (maxRow?.m ?? 0) + 1;

  await db
    .prepare(
      `INSERT INTO sites (id, project_id, name, target_go_live_date, display_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(siteId, projectId, name, target_go_live_date ?? null, displayOrder)
    .run();

  // ── Stage wiring ─────────────────────────────────────────────────────────
  // How many sites existed BEFORE this one?
  const otherSitesRow = await db
    .prepare("SELECT COUNT(*) AS c FROM sites WHERE project_id = ? AND id != ?")
    .bind(projectId, siteId)
    .first<{ c: number }>();
  const isFirstSite = (otherSitesRow?.c ?? 0) === 0;

  if (isFirstSite) {
    // Move all non-Initiate, currently-shared stages to this site.
    // "Initiate" detection: stage name contains 'initiat' (case-insensitive).
    await db
      .prepare(
        `UPDATE stages SET site_id = ?
         WHERE project_id = ? AND site_id IS NULL
           AND LOWER(name) NOT LIKE '%initiat%'`
      )
      .bind(siteId, projectId)
      .run();
  } else {
    // Clone the FIRST site's stage shape under this new site. Pull the first
    // site's stages (by display_order on sites) and re-insert with new IDs
    // and site_id = the new site. Tasks intentionally NOT cloned.
    const firstSiteRow = await db
      .prepare(
        `SELECT id FROM sites
         WHERE project_id = ? AND id != ?
         ORDER BY display_order ASC LIMIT 1`
      )
      .bind(projectId, siteId)
      .first<{ id: string }>();
    if (firstSiteRow) {
      const sourceStages = await db
        .prepare(
          `SELECT name, sort_order, planned_start, planned_end, status
           FROM stages WHERE project_id = ? AND site_id = ?
           ORDER BY COALESCE(sort_order, 0) ASC`
        )
        .bind(projectId, firstSiteRow.id)
        .all<{ name: string; sort_order: number | null; planned_start: string | null; planned_end: string | null; status: string | null }>();
      for (const ph of (sourceStages.results ?? [])) {
        await db
          .prepare(
            `INSERT INTO stages (id, project_id, site_id, name, sort_order, planned_start, planned_end, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(crypto.randomUUID(), projectId, siteId, ph.name, ph.sort_order, ph.planned_start, ph.planned_end, ph.status)
          .run();
      }
    }
  }

  const created = await db
    .prepare(
      `SELECT id, project_id, name, target_go_live_date, display_order, created_at, updated_at
       FROM sites WHERE id = ?`
    )
    .bind(siteId)
    .first<SiteRow>();

  return c.json(created, 201);
});

// ── Update ───────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  target_go_live_date: z.string().regex(ISO_DATE).nullable().optional(),
  display_order: z.number().int().min(0).optional(),
});

app.patch("/:id/sites/:siteId", async (c) => {
  const projectId = c.req.param("id");
  const siteId = c.req.param("siteId");
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
    .prepare(`UPDATE sites SET ${fields.join(", ")} WHERE id = ? AND project_id = ?`)
    .bind(...values, siteId, projectId)
    .run();

  const updated = await c.env.DB
    .prepare(
      `SELECT id, project_id, name, target_go_live_date, display_order, created_at, updated_at
       FROM sites WHERE id = ?`
    )
    .bind(siteId)
    .first<SiteRow>();

  if (!updated) throw new HTTPException(404, { message: "Site not found" });
  return c.json(updated);
});

// ── Delete ───────────────────────────────────────────────────────────────────

app.delete("/:id/sites/:siteId", async (c) => {
  const projectId = c.req.param("id");
  const siteId = c.req.param("siteId");
  const auth = c.get("auth");
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  // Verify the site belongs to this project before deleting.
  const exists = await c.env.DB
    .prepare("SELECT id FROM sites WHERE id = ? AND project_id = ?")
    .bind(siteId, projectId)
    .first();
  if (!exists) throw new HTTPException(404, { message: "Site not found" });

  // Stages (and their tasks) cascade via the FK ON DELETE CASCADE established
  // in migration 0085. Tasks reference stage_id, so deleting stages cleans
  // tasks transitively through the stage ref — but tasks.stage_id has no
  // formal CASCADE constraint, so explicitly null those out first to avoid
  // dangling references. We also delete the orphaned tasks (only the ones
  // that belong to a stage being removed).
  const stageRows = await c.env.DB
    .prepare("SELECT id FROM stages WHERE site_id = ?")
    .bind(siteId)
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
  // Then drop the site — stages cascade via FK.
  await c.env.DB.prepare("DELETE FROM sites WHERE id = ?").bind(siteId).run();

  return c.json({ success: true, deleted_stage_count: stageIds.length });
});

export default app;

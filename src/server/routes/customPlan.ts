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
  const items = (rows.results ?? []) as Record<string, unknown>[];

  // Attach each item's dependencies (the tasks it is "blocked by") as an id list.
  const deps = await db
    .prepare(
      `SELECT d.item_id, d.depends_on_item_id FROM custom_plan_deps d
       JOIN custom_plan_items i ON i.id = d.item_id WHERE i.project_id = ?`
    )
    .bind(projectId)
    .all<{ item_id: string; depends_on_item_id: string }>();
  const byItem = new Map<string, string[]>();
  for (const d of deps.results ?? []) {
    const arr = byItem.get(d.item_id) ?? [];
    arr.push(d.depends_on_item_id);
    byItem.set(d.item_id, arr);
  }
  for (const it of items) it.blocked_by = byItem.get(it.id as string) ?? [];

  return c.json({ items });
});

// POST /api/projects/:id/custom-plan/import — seed from the bundled Asana
// export and flip projects.uses_custom_plan on.
//
// FIRST IMPORT ONLY. This clears the project's plan before reseeding, and
// MedVet now has months of post-import work on theirs — statuses, dates,
// assignees, added tasks, dependencies, blocker links. Re-importing is never
// what anyone wants, so the endpoint refuses when a plan already exists rather
// than relying on the UI not to offer it. The re-import button is gone from
// the Tasks tab; this is what makes that a guarantee instead of a convention.
app.post("/:id/custom-plan/import", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });

  const existing = await db
    .prepare("SELECT COUNT(*) AS n FROM custom_plan_items WHERE project_id = ?")
    .bind(projectId)
    .first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) {
    throw new HTTPException(409, {
      message: `This project already has a plan (${existing?.n} items). Re-importing would replace it and discard every change made since the original import.`,
    });
  }

  const seed = medvetPlan as SeedItem[];
  // Fresh UUIDs so importing to multiple test projects doesn't collide on the
  // Asana ids. Map Asana id → new id to resolve parent links.
  const idMap = new Map<string, string>();
  for (const it of seed) idMap.set(it.id, crypto.randomUUID());

  // No-op after the guard above — kept so a partially-failed first import
  // can't leave orphan rows behind on a retry.
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

// A plan date must be a real calendar date in a plausible project window. The
// bare `^\d{4}-\d{2}-\d{2}$` shape check accepted "0026-09-02" — the value a
// `<input type="date">` reports for a half-typed year — and one such row scaled
// the Timeline axis out by ~2000 years, squashing every bar into a sliver.
const planDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => d >= "2000-01-01" && d <= "2100-12-31", { message: "Date must be between 2000-01-01 and 2100-12-31" })
  .refine((d) => new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d, { message: "Not a real calendar date" });

const itemSchema = z.object({
  section: z.string().min(1).max(120).optional(),
  parent_id: z.string().nullable().optional(),
  depth: z.number().int().min(0).max(3).optional(),
  name: z.string().min(1).max(500).optional(),
  module: z.string().max(120).nullable().optional(),
  start_date: planDate.nullable().optional(),
  due_date: planDate.nullable().optional(),
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
  // Surface the specific issue — a rejected date needs to say WHY, or the PM
  // just sees "Save failed" and retypes the same bad year.
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid request body" });
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

// POST /api/projects/:id/custom-plan/:itemId/deps — add a dependency (itemId is
// "blocked by" depends_on_item_id). Guards self-links, cross-project links, and
// cycles so the "blocked" indicator can't loop forever.
const depSchema = z.object({ depends_on_item_id: z.string().min(1) });
app.post("/:id/custom-plan/:itemId/deps", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const itemId = c.req.param("itemId");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });
  const parsed = depSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "depends_on_item_id required" });
  const dependsOn = parsed.data.depends_on_item_id;
  if (dependsOn === itemId) throw new HTTPException(400, { message: "A task can't depend on itself." });

  // Both tasks must live in this project.
  const both = await db
    .prepare("SELECT COUNT(*) AS n FROM custom_plan_items WHERE project_id = ? AND id IN (?, ?)")
    .bind(projectId, itemId, dependsOn).first<{ n: number }>();
  if ((both?.n ?? 0) !== 2) throw new HTTPException(400, { message: "Task not found in this plan." });

  // Cycle guard: reject if the target already (transitively) depends on this
  // task — adding the edge would close a loop.
  const cycle = await db
    .prepare(
      `WITH RECURSIVE chain(id) AS (
         SELECT depends_on_item_id FROM custom_plan_deps WHERE item_id = ?
         UNION
         SELECT d.depends_on_item_id FROM custom_plan_deps d JOIN chain ch ON d.item_id = ch.id
       )
       SELECT 1 AS hit FROM chain WHERE id = ? LIMIT 1`
    )
    .bind(dependsOn, itemId).first<{ hit: number }>();
  if (cycle) throw new HTTPException(400, { message: "That would create a circular dependency." });

  await db
    .prepare("INSERT OR IGNORE INTO custom_plan_deps (item_id, depends_on_item_id) VALUES (?, ?)")
    .bind(itemId, dependsOn).run();
  return c.json({ ok: true });
});

// DELETE /api/projects/:id/custom-plan/:itemId/deps/:depId — remove a dependency.
app.delete("/:id/custom-plan/:itemId/deps/:depId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const itemId = c.req.param("itemId");
  const depId = c.req.param("depId");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });
  await db
    .prepare(
      `DELETE FROM custom_plan_deps
       WHERE item_id = ? AND depends_on_item_id = ?
         AND item_id IN (SELECT id FROM custom_plan_items WHERE project_id = ?)`
    )
    .bind(itemId, depId, projectId).run();
  return c.json({ ok: true });
});

// ── ONE-OFF: Wave 3 restructure ──────────────────────────────────────────────
// MedVet's PM deferred Quality Management, Workforce Management and AI Expert
// Assist out of the earlier phases into a new WAVE 3 Phase. Doing it by hand is
// not possible in the UI at all — sections are derived from existing items, so
// there is no way to create one — and by-hand deletion of 37 rows across six
// sections invites mistakes.
//
// Shape of the operation:
//   DELETE  the three named items (and their subtrees) from PLANNING, ALPHA,
//           ALPHA+, PILOT, WAVE 1 and WAVE 2
//   CREATE  a WAVE 3 Phase section holding Quality Management, Workforce
//           Management, and AI Expert Assist + its child tasks
//   REPOINT any risk that referenced a deleted item at its WAVE 3 replacement,
//           so the link survives (risks.custom_plan_item_id is ON DELETE SET
//           NULL, which would otherwise silently orphan them)
//
// Recreate-and-delete, not move: PATCH can change `section` but updates only the
// one row, leaving children behind in the old section with stale sort_order —
// the outline renders purely by sort_order, so a moved parent lands in the wrong
// place. Fresh rows sidestep that entirely. Status resets to not_started and
// dates clear (Wave 3 is future work and must not inherit Planning-era dates);
// names, modules, assignees and notes carry over.
//
// GET previews, POST commits. Intentionally NO UI button: the re-import button
// was removed from the Tasks tab precisely so a destructive plan-wide operation
// can't be a stray click, and this is more destructive than that one.
// Teardown: delete this block with the rest of the file.

const WAVE3_SECTION = "WAVE 3 Phase";
const WAVE3_TARGET_NAMES = ["Quality Management", "Workforce Management", "AI Expert Assist"];
const WAVE3_SOURCE_SECTIONS = ["PLANNING", "ALPHA Phase", "ALPHA+ Phase", "PILOT Phase", "WAVE 1 Phase", "WAVE 2 Phase"];

type PlanRow = {
  id: string; section: string; parent_id: string | null; depth: number; sort_order: number;
  name: string; module: string | null; status: string; assignee: string | null;
  assignee_user_id: string | null; assignee_contact_id: string | null; notes: string | null;
  start_date: string | null; due_date: string | null;
};

/** Shared planner for the preview and the commit, so what you approve is what runs. */
async function planWave3Restructure(db: D1Database, projectId: string) {
  const all = (
    await db
      .prepare(`SELECT ${COLS} FROM custom_plan_items WHERE project_id = ? ORDER BY sort_order`)
      .bind(projectId).all<PlanRow>()
  ).results ?? [];

  const byParent = new Map<string | null, PlanRow[]>();
  for (const r of all) {
    const arr = byParent.get(r.parent_id) ?? [];
    arr.push(r);
    byParent.set(r.parent_id, arr);
  }
  const subtree = (root: PlanRow): PlanRow[] => {
    const out = [root];
    for (const kid of byParent.get(root.id) ?? []) out.push(...subtree(kid));
    return out;
  };

  const targets = all.filter(
    (r) => WAVE3_SOURCE_SECTIONS.includes(r.section) &&
           WAVE3_TARGET_NAMES.some((n) => n.toLowerCase() === r.name.trim().toLowerCase())
  );
  // Dedup: the same name appears once per phase, so collapse to the richest
  // instance (most children) per name — that's the one worth reproducing in
  // Wave 3. The AI Expert Assist section in PLANNING carries the child tasks;
  // the per-phase copies are bare go-live-readiness checklist leaves.
  const templates = WAVE3_TARGET_NAMES.map((name) => {
    const matches = targets.filter((t) => t.name.trim().toLowerCase() === name.toLowerCase());
    let best: PlanRow | null = null;
    let bestKids = -1;
    for (const m of matches) {
      const kids = subtree(m).length;
      if (kids > bestKids) { best = m; bestKids = kids; }
    }
    return best ? { name, template: best, children: subtree(best).slice(1) } : null;
  }).filter((x): x is { name: string; template: PlanRow; children: PlanRow[] } => !!x);

  const toDelete: PlanRow[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    for (const row of subtree(t)) if (!seen.has(row.id)) { seen.add(row.id); toDelete.push(row); }
  }

  const deletedIds = new Set(toDelete.map((r) => r.id));
  const riskRows = deletedIds.size
    ? (await db
        .prepare(`SELECT id, description, custom_plan_item_id FROM risks WHERE project_id = ? AND custom_plan_item_id IS NOT NULL`)
        .bind(projectId).all<{ id: string; description: string | null; custom_plan_item_id: string }>()
      ).results ?? []
    : [];
  // Only risks pointing INTO the delete set need repointing, and only when a
  // same-named Wave 3 item will exist to receive them.
  const riskRepoints = riskRows
    .filter((r) => deletedIds.has(r.custom_plan_item_id))
    .map((r) => {
      const old = toDelete.find((d) => d.id === r.custom_plan_item_id)!;
      const target = templates.find((t) => t.name.toLowerCase() === old.name.trim().toLowerCase());
      return { risk_id: r.id, description: r.description, from_item: old.name, to_name: target?.name ?? null };
    });

  // Anything not yet started is free to recreate; anything else means real work
  // recorded against a row we're about to drop. Surfaced, never silently eaten.
  const warnings: string[] = [];
  const notFresh = toDelete.filter((r) => r.status !== "not_started");
  for (const r of notFresh) {
    warnings.push(`"${r.name}" (${r.section}) is status=${r.status} — deleting it discards that progress.`);
  }
  for (const rp of riskRepoints) {
    if (!rp.to_name) warnings.push(`Risk ${rp.risk_id} points at "${rp.from_item}", which has no Wave 3 replacement — its plan link will be cleared.`);
  }
  const missing = WAVE3_TARGET_NAMES.filter((n) => !templates.some((t) => t.name === n));
  for (const n of missing) warnings.push(`No source item named "${n}" was found — Wave 3 will not contain it.`);

  const maxSort = all.reduce((m, r) => Math.max(m, r.sort_order), 0);

  return { all, templates, toDelete, riskRepoints, warnings, maxSort };
}

// GET /api/projects/:id/custom-plan/wave3 — preview. Read-only; open it in a
// logged-in browser tab to review before committing.
app.get("/:id/custom-plan/wave3", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });

  const { templates, toDelete, riskRepoints, warnings } = await planWave3Restructure(db, projectId);
  const already = await db
    .prepare("SELECT COUNT(*) AS n FROM custom_plan_items WHERE project_id = ? AND section = ?")
    .bind(projectId, WAVE3_SECTION).first<{ n: number }>();

  return c.json({
    dry_run: true,
    already_has_wave3: (already?.n ?? 0) > 0,
    source_sections: WAVE3_SOURCE_SECTIONS,
    will_create: {
      section: WAVE3_SECTION,
      items: templates.map((t) => ({ name: t.name, module: t.template.module, from_section: t.template.section, children: t.children.map((k) => k.name) })),
      total: templates.reduce((n, t) => n + 1 + t.children.length, 0),
    },
    will_delete: {
      total: toDelete.length,
      by_section: WAVE3_SOURCE_SECTIONS.map((s) => ({ section: s, count: toDelete.filter((r) => r.section === s).length })),
      items: toDelete.map((r) => ({ section: r.section, depth: r.depth, name: r.name, status: r.status })),
    },
    will_repoint_risks: riskRepoints,
    warnings,
    to_commit: `POST this same URL with body {"confirm":"${WAVE3_SECTION}"}. Add "start_date"/"due_date" (YYYY-MM-DD) to date the new items — without dates the section is invisible on the Timeline tab.`,
  });
});

// POST /api/projects/:id/custom-plan/wave3 — commit. Requires the section name
// as an explicit confirmation string so it can't fire from a stray request.
app.post("/:id/custom-plan/wave3", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });

  const raw = await c.req.json().catch(() => ({}));
  const parsedBody = z
    .object({
      confirm: z.string(),
      // Optional window applied to every created Wave 3 item. Worth setting on
      // the first run: the Timeline view skips any section with no dated items
      // (see CustomPlan.tsx), so a date-less WAVE 3 Phase renders on the Tasks
      // tab but is invisible on the Timeline until someone fills dates in.
      start_date: planDate.nullable().optional(),
      due_date: planDate.nullable().optional(),
    })
    .safeParse(raw);
  if (!parsedBody.success) throw new HTTPException(400, { message: parsedBody.error.issues[0]?.message ?? "Invalid body" });
  if (parsedBody.data.confirm !== WAVE3_SECTION) {
    throw new HTTPException(400, { message: `Send {"confirm":"${WAVE3_SECTION}"} to run this. GET the same URL for a dry run.` });
  }
  const newStart = parsedBody.data.start_date ?? null;
  const newDue = parsedBody.data.due_date ?? null;

  // Single-shot: a second run would duplicate the whole section, and the
  // deletes are already gone so a re-run can't be a no-op recovery.
  const already = await db
    .prepare("SELECT COUNT(*) AS n FROM custom_plan_items WHERE project_id = ? AND section = ?")
    .bind(projectId, WAVE3_SECTION).first<{ n: number }>();
  if ((already?.n ?? 0) > 0) {
    throw new HTTPException(409, { message: `${WAVE3_SECTION} already exists (${already?.n} items). Refusing to run twice.` });
  }

  const { templates, toDelete, riskRepoints, warnings, maxSort } = await planWave3Restructure(db, projectId);
  if (templates.length === 0) throw new HTTPException(400, { message: "Found no QM / WFM / AI Expert Assist items to restructure." });

  const insert = db.prepare(`INSERT INTO custom_plan_items (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const stmts: D1PreparedStatement[] = [];
  let sort = maxSort + 1;
  // name → new id, so risk repointing can find its replacement.
  const newIdByName = new Map<string, string>();

  for (const t of templates) {
    const parentId = crypto.randomUUID();
    newIdByName.set(t.name.toLowerCase(), parentId);
    stmts.push(insert.bind(
      parentId, projectId, WAVE3_SECTION, null, 0, sort++,
      t.template.name, t.template.module, newStart, newDue, "not_started",
      t.template.assignee, t.template.assignee_user_id, t.template.assignee_contact_id, t.template.notes,
    ));
    // Children keep their original relative order (templates walk the source
    // subtree depth-first) and sit one level under the new parent. Source
    // depth is re-derived rather than copied: a child three levels deep in
    // PLANNING becomes depth 1 here, since its grandparent isn't coming along.
    for (const kid of t.children) {
      stmts.push(insert.bind(
        crypto.randomUUID(), projectId, WAVE3_SECTION, parentId, 1, sort++,
        kid.name, kid.module, newStart, newDue, "not_started",
        kid.assignee, kid.assignee_user_id, kid.assignee_contact_id, kid.notes,
      ));
    }
  }

  for (const rp of riskRepoints) {
    const newId = rp.to_name ? newIdByName.get(rp.to_name.toLowerCase()) : null;
    if (newId) {
      stmts.push(db.prepare("UPDATE risks SET custom_plan_item_id = ? WHERE id = ? AND project_id = ?").bind(newId, rp.risk_id, projectId));
    }
  }

  // Deletes last: the risk repoints above must land before the FK's ON DELETE
  // SET NULL fires, or the links are nulled out before we can move them.
  for (const r of toDelete) {
    stmts.push(db.prepare("DELETE FROM custom_plan_items WHERE id = ? AND project_id = ?").bind(r.id, projectId));
  }

  // D1 batch caps out in the hundreds; chunk like the import path does. Chunks
  // are individually atomic, not collectively — inserts before repoints before
  // deletes means a mid-way failure leaves a duplicated-looking plan rather
  // than a plan missing tasks, which is the recoverable direction.
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));

  return c.json({
    ok: true,
    created: templates.reduce((n, t) => n + 1 + t.children.length, 0),
    deleted: toDelete.length,
    risks_repointed: riskRepoints.filter((r) => r.to_name).length,
    warnings,
  });
});

export default app;

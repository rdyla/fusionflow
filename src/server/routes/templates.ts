import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { canEditProject } from "../services/accessService";
import {
  buildTaggedTitle,
  canonicalizeSolutionType,
  parseTaggedTitle,
  type SolutionType,
} from "../../shared/solutionTypes";
import { toTitleCase } from "../../shared/titleCase";

// ── Fuzzy title matching ──────────────────────────────────────────────────────
// Two template tasks count as the same work if their normalized token sets
// have Jaccard similarity ≥ 0.6 — tolerates wording variation ("Kickoff meeting"
// vs "Project kickoff meeting") without over-deduping near-misses ("Test" vs
// "Test plan" lands at 0.5).

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "with", "for", "of", "on", "to", "in",
  "at", "by", "from", "into",
]);

function normalizeTitleTokens(title: string): Set<string> {
  const { rawTitle } = parseTaggedTitle(title);
  const tokens = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

const FUZZY_MATCH_THRESHOLD = 0.6;

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

// PMs need read access to the full template tree (phases + tasks + working
// days) to drive the Timeline Builder; the existing admin-only details endpoint
// is reused by relaxing the gate.
app.get("/templates/:id", requireRole("admin", "pm"), async (c) => {
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

  const template = await db
    .prepare("SELECT id, solution_type FROM templates WHERE id = ? LIMIT 1")
    .bind(template_id)
    .first<{ id: string; solution_type: string | null }>();
  if (!template) throw new HTTPException(404, { message: "Template not found" });

  // Templates without a canonical solution_type fall back to legacy behaviour
  // (no tagging, no fuzzy dedupe) so we don't pollute task titles with junk tags.
  const templateSolutionType: SolutionType | null = canonicalizeSolutionType(template.solution_type ?? "");

  const phases = await db
    .prepare("SELECT * FROM template_phases WHERE template_id = ? ORDER BY order_index ASC")
    .bind(template_id)
    .all<{ id: string; name: string; order_index: number }>();

  const tasks = await db
    .prepare("SELECT * FROM template_tasks WHERE template_id = ? ORDER BY order_index ASC")
    .bind(template_id)
    .all<{ id: string; phase_id: string | null; title: string; priority: string | null; order_index: number; default_assignee_role: string | null }>();

  // Load existing phases by name so we can reuse them instead of duplicating
  const existingPhases = await db
    .prepare("SELECT id, name, sort_order FROM phases WHERE project_id = ?")
    .bind(projectId)
    .all<{ id: string; name: string; sort_order: number }>();
  const existingByName: Record<string, string> = {};
  for (const ep of existingPhases.results ?? []) {
    existingByName[ep.name.trim().toLowerCase()] = ep.id;
  }

  const maxSort = existingPhases.results.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0);
  let sortOffset = maxSort + 1;

  // Map template phase id -> project phase id (existing or newly created)
  const phaseIdMap: Record<string, string> = {};
  let phasesCreated = 0;

  for (const phase of phases.results ?? []) {
    const key = phase.name.trim().toLowerCase();
    if (existingByName[key]) {
      // Reuse existing phase — no new phase created
      phaseIdMap[phase.id] = existingByName[key];
    } else {
      const newPhaseId = crypto.randomUUID();
      phaseIdMap[phase.id] = newPhaseId;
      await db
        .prepare(
          "INSERT INTO phases (id, project_id, name, sort_order, status) VALUES (?, ?, ?, ?, 'not_started')"
        )
        .bind(newPhaseId, projectId, phase.name, sortOffset)
        .run();
      existingByName[key] = newPhaseId;
      sortOffset++;
      phasesCreated++;
    }
  }

  // Build role → user_id and role → contact_id lookups so we can auto-assign
  // template tasks at apply time. Roles come from template_tasks.default_-
  // assignee_role; the lookups are project-scoped.
  //
  // User-side resolution:
  //   pm  → projects.pm_user_id
  //   ie  → first project_staff with staff_role='engineer' (by created_at)
  //   pf  → fallback to PM (Packet Fusion generic, PM owns coordination)
  //
  // Contact-side resolution (non-user assignees, project_contacts):
  //   zoom_porting → project_contacts with contact_role='Porting Coordinator'
  //
  // Roles that intentionally stay unassigned:
  //   customer       — no single customer-side primary user concept
  //   all            — multi-recipient
  //   customer/ie    — joint action; awaits multi-assignee on tasks
  const projectRow = await db
    .prepare("SELECT pm_user_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ pm_user_id: string | null }>();
  const pmUserId = projectRow?.pm_user_id ?? null;

  const ieRow = await db
    .prepare(
      "SELECT user_id FROM project_staff WHERE project_id = ? AND staff_role = 'engineer' ORDER BY created_at ASC LIMIT 1"
    )
    .bind(projectId)
    .first<{ user_id: string }>();
  const ieUserId = ieRow?.user_id ?? null;

  const portingContactRow = await db
    .prepare(
      "SELECT id FROM project_contacts WHERE project_id = ? AND contact_role = 'Porting Coordinator' ORDER BY added_at ASC LIMIT 1"
    )
    .bind(projectId)
    .first<{ id: string }>();
  const portingContactId = portingContactRow?.id ?? null;

  const roleToUserId: Record<string, string | null> = {
    pm: pmUserId,
    pf: pmUserId,
    ie: ieUserId,
  };
  const roleToContactId: Record<string, string | null> = {
    zoom_porting: portingContactId,
  };
  const resolveAssignee = (role: string | null | undefined): { userId: string | null; contactId: string | null } => {
    if (!role) return { userId: null, contactId: null };
    const key = role.toLowerCase();
    return {
      userId:    roleToUserId[key]    ?? null,
      contactId: roleToContactId[key] ?? null,
    };
  };

  // Preload existing tasks per destination phase so we can fuzzy-match new
  // template tasks and either upgrade an existing tag or insert a fresh task.
  // Mutated as we insert so multiple template tasks in the same phase compete
  // against each other too (rare but possible if a template has near-duplicates).
  const destPhaseIds = [...new Set(Object.values(phaseIdMap))];
  type ExistingTask = { id: string; title: string; tokens: Set<string> };
  const tasksByPhase = new Map<string, ExistingTask[]>();
  for (const phaseId of destPhaseIds) {
    const rows = await db
      .prepare("SELECT id, title FROM tasks WHERE project_id = ? AND phase_id = ?")
      .bind(projectId, phaseId)
      .all<{ id: string; title: string }>();
    tasksByPhase.set(
      phaseId,
      (rows.results ?? []).map((r) => ({ id: r.id, title: r.title, tokens: normalizeTitleTokens(r.title) }))
    );
  }

  let tasksCreated = 0;
  let tasksMerged = 0;

  for (const task of tasks.results ?? []) {
    const mappedPhaseId = task.phase_id ? (phaseIdMap[task.phase_id] ?? null) : null;
    const { userId, contactId } = resolveAssignee(task.default_assignee_role);

    // Normalize the source title to Title Case so every applied task reads
    // consistently regardless of how the template author cased it.
    const normalizedTitle = toTitleCase(task.title);

    // Try to fuzzy-match against an existing task in the same destination phase.
    let matched: ExistingTask | null = null;
    if (mappedPhaseId && templateSolutionType) {
      const existing = tasksByPhase.get(mappedPhaseId) ?? [];
      const newTokens = normalizeTitleTokens(normalizedTitle);
      let bestScore = 0;
      for (const e of existing) {
        const score = jaccard(newTokens, e.tokens);
        if (score > bestScore) {
          bestScore = score;
          matched = e;
        }
      }
      if (bestScore < FUZZY_MATCH_THRESHOLD) matched = null;
    }

    if (matched) {
      // Upgrade the existing task's tag to include this template's solution type.
      // Re-normalize the raw title too so older untouched tasks pick up TC on merge.
      const { types, rawTitle } = parseTaggedTitle(matched.title);
      const mergedTypes = [...new Set([...types, templateSolutionType!])];
      const newTitle = buildTaggedTitle(mergedTypes, toTitleCase(rawTitle));
      if (newTitle !== matched.title) {
        await db.prepare("UPDATE tasks SET title = ? WHERE id = ?").bind(newTitle, matched.id).run();
        matched.title = newTitle;
        matched.tokens = normalizeTitleTokens(newTitle);
      }
      tasksMerged++;
      continue;
    }

    // No match — insert as a new task, tagged with this template's solution
    // type when known. If templateSolutionType is null (legacy template) we
    // fall back to the untagged title.
    const newTaskId = crypto.randomUUID();
    const insertedTitle = templateSolutionType
      ? buildTaggedTitle([templateSolutionType], normalizedTitle)
      : normalizedTitle;
    await db
      .prepare(
        "INSERT INTO tasks (id, project_id, phase_id, title, priority, status, assignee_user_id, assignee_contact_id) VALUES (?, ?, ?, ?, ?, 'not_started', ?, ?)"
      )
      .bind(newTaskId, projectId, mappedPhaseId, insertedTitle, task.priority ?? "medium", userId, contactId)
      .run();
    if (mappedPhaseId) {
      const phaseTasks = tasksByPhase.get(mappedPhaseId);
      if (phaseTasks) {
        phaseTasks.push({ id: newTaskId, title: insertedTitle, tokens: normalizeTitleTokens(insertedTitle) });
      }
    }
    tasksCreated++;
  }

  return c.json({ phases_created: phasesCreated, tasks_created: tasksCreated, tasks_merged: tasksMerged });
});

// ──────────────────────────────────────────────────────────────────────────────
// Timeline Builder apply — wipes the project's existing phases + tasks, then
// rebuilds them from a client-computed structure.
//
// The Timeline Builder supports multi-template selection (e.g., UCaaS + CCaaS
// for combo projects). The client loads each selected template, merges phases
// by canonical name (Initiation / Planning / Executing / etc.), takes the MAX
// working_days across templates, and unions tasks (each tagged with its source
// solution_type via buildTaggedTitle). The fully resolved structure is sent
// here; the server's job is just to persist it, plus resolve role strings to
// project-scoped user/contact ids.
// ──────────────────────────────────────────────────────────────────────────────

const applyTimelineSchema = z.object({
  phases: z.array(z.object({
    name: z.string().min(1),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tasks: z.array(z.object({
      /** Pre-tagged, already title-cased. */
      title: z.string().min(1),
      /** default_assignee_role string ('pm' / 'ie' / 'pf' / 'zoom_porting' / etc.). */
      role: z.string().nullable().optional(),
      priority: z.string().nullable().optional(),
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })),
  })).min(1),
});

app.post("/:projectId/apply-timeline", requireRole("admin", "pm"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("projectId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = applyTimelineSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const { phases: phasePayload } = parsed.data;

  // Generate project-phase ids up front so tasks can reference them.
  type NewPhase = { id: string; name: string; sort_order: number; start: string; end: string };
  const newPhases: NewPhase[] = phasePayload.map((p, i) => ({
    id: crypto.randomUUID(),
    name: p.name,
    sort_order: i + 1,
    start: p.start,
    end:   p.end,
  }));

  // Assignee resolution (mirrors /apply-template logic — pm / ie / pf for users,
  // zoom_porting for project_contacts).
  const projectRow = await db
    .prepare("SELECT pm_user_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ pm_user_id: string | null }>();
  const pmUserId = projectRow?.pm_user_id ?? null;

  const ieRow = await db
    .prepare("SELECT user_id FROM project_staff WHERE project_id = ? AND staff_role = 'engineer' ORDER BY created_at ASC LIMIT 1")
    .bind(projectId)
    .first<{ user_id: string }>();
  const ieUserId = ieRow?.user_id ?? null;

  const portingContactRow = await db
    .prepare("SELECT id FROM project_contacts WHERE project_id = ? AND contact_role = 'Porting Coordinator' ORDER BY added_at ASC LIMIT 1")
    .bind(projectId)
    .first<{ id: string }>();
  const portingContactId = portingContactRow?.id ?? null;

  const roleToUserId: Record<string, string | null>    = { pm: pmUserId, pf: pmUserId, ie: ieUserId };
  const roleToContactId: Record<string, string | null> = { zoom_porting: portingContactId };

  // Build all the task inserts so the wipe + rebuild runs in a single atomic batch.
  type NewTask = { id: string; phase_id: string; title: string; priority: string; assignee_user_id: string | null; assignee_contact_id: string | null; scheduled_start: string; scheduled_end: string; due_date: string };
  const newTasks: NewTask[] = [];
  for (let phaseIdx = 0; phaseIdx < phasePayload.length; phaseIdx++) {
    const phasePayloadEntry = phasePayload[phaseIdx];
    const phaseId = newPhases[phaseIdx].id;
    for (const t of phasePayloadEntry.tasks) {
      const role = t.role?.toLowerCase() ?? "";
      const userId    = roleToUserId[role]    ?? null;
      const contactId = roleToContactId[role] ?? null;
      newTasks.push({
        id: crypto.randomUUID(),
        phase_id: phaseId,
        title: t.title,
        priority: t.priority ?? "medium",
        assignee_user_id: userId,
        assignee_contact_id: contactId,
        scheduled_start: t.start,
        scheduled_end: t.end,
        due_date: t.end,
      });
    }
  }

  // Atomic batch: wipe-then-rebuild. Non-CASCADE FK refs (risks.task_id,
  // documents.task_id, documents.phase_id) get nulled first so the DELETEs
  // succeed.
  const stmts = [
    db.prepare("UPDATE risks SET task_id = NULL WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)").bind(projectId),
    db.prepare("UPDATE documents SET task_id = NULL WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)").bind(projectId),
    db.prepare("UPDATE documents SET phase_id = NULL WHERE phase_id IN (SELECT id FROM phases WHERE project_id = ?)").bind(projectId),
    db.prepare("DELETE FROM tasks  WHERE project_id = ?").bind(projectId),
    db.prepare("DELETE FROM phases WHERE project_id = ?").bind(projectId),
    ...newPhases.map((p) => db
      .prepare("INSERT INTO phases (id, project_id, name, sort_order, planned_start, planned_end, status) VALUES (?, ?, ?, ?, ?, ?, 'not_started')")
      .bind(p.id, projectId, p.name, p.sort_order, p.start, p.end)),
    ...newTasks.map((t) => db
      .prepare("INSERT INTO tasks (id, project_id, phase_id, title, priority, status, assignee_user_id, assignee_contact_id, scheduled_start, scheduled_end, due_date) VALUES (?, ?, ?, ?, ?, 'not_started', ?, ?, ?, ?, ?)")
      .bind(t.id, projectId, t.phase_id, t.title, t.priority, t.assignee_user_id, t.assignee_contact_id, t.scheduled_start, t.scheduled_end, t.due_date)),
  ];
  await db.batch(stmts);

  return c.json({ phases_created: newPhases.length, tasks_created: newTasks.length });
});

export default app;

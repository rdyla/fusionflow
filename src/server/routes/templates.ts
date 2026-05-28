import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { canEditProject } from "../services/accessService";
import { syncProjectGoLiveDate } from "../lib/teamUtils";
import {
  buildTaggedTitle,
  canonicalizeSolutionType,
  parseTaggedTitle,
  type SolutionType,
} from "../../shared/solutionTypes";
import { toTitleCase } from "../../shared/titleCase";
import { chainForward, startFromGoLive } from "../../shared/workdayMath";

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

// ── Template CRUD — read endpoints open to PM so they can pick a template
//    to apply; mutations stay admin-only so PMs can't edit the global library.

app.get("/templates", requireRole("admin", "pm"), async (c) => {
  const db = c.env.DB;
  const templates = await db
    .prepare(
      `SELECT t.id, t.name, t.solution_type, t.description, t.created_at, t.updated_at,
              COUNT(DISTINCT tp.id) AS stage_count,
              COUNT(DISTINCT tt.id) AS task_count
       FROM templates t
       LEFT JOIN template_stages tp ON tp.template_id = t.id
       LEFT JOIN template_tasks tt ON tt.template_id = t.id
       GROUP BY t.id
       ORDER BY t.name ASC`
    )
    .all();
  return c.json(templates.results ?? []);
});

// PMs need read access to the full template tree (stages + tasks + working
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

  const stages = await db
    .prepare(
      "SELECT * FROM template_stages WHERE template_id = ? ORDER BY order_index ASC"
    )
    .bind(templateId)
    .all();

  const tasks = await db
    .prepare(
      "SELECT * FROM template_tasks WHERE template_id = ? ORDER BY order_index ASC"
    )
    .bind(templateId)
    .all();

  const tasksByStage: Record<string, unknown[]> = {};
  for (const task of tasks.results ?? []) {
    const t = task as { stage_id: string | null };
    const key = t.stage_id ?? "__none__";
    if (!tasksByStage[key]) tasksByStage[key] = [];
    tasksByStage[key].push(task);
  }

  const stagesWithTasks = (stages.results ?? []).map((stage) => {
    const p = stage as { id: string };
    return { ...stage, tasks: tasksByStage[p.id] ?? [] };
  });

  return c.json({ ...template, stages: stagesWithTasks });
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

// ── Stages ────────────────────────────────────────────────────────────────────

const addStageSchema = z.object({
  name: z.string().min(1).max(500),
  order_index: z.number().int().min(0),
});

app.post("/templates/:id/stages", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templateId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM templates WHERE id = ? LIMIT 1").bind(templateId).first();
  if (!existing) throw new HTTPException(404, { message: "Template not found" });

  const parsed = addStageSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { name, order_index } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare("INSERT INTO template_stages (id, template_id, name, order_index) VALUES (?, ?, ?, ?)")
    .bind(id, templateId, name, order_index)
    .run();

  const created = await db.prepare("SELECT * FROM template_stages WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

app.delete("/templates/:id/stages/:stageId", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templateId = c.req.param("id");
  const stageId = c.req.param("stageId");

  const existing = await db
    .prepare("SELECT id FROM template_stages WHERE id = ? AND template_id = ? LIMIT 1")
    .bind(stageId, templateId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Stage not found" });

  await db.prepare("DELETE FROM template_stages WHERE id = ?").bind(stageId).run();
  return c.json({ success: true });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

const addTaskSchema = z.object({
  title: z.string().min(1).max(500),
  priority: z.enum(["low", "medium", "high"]).optional(),
  stage_id: z.string().nullable().optional(),
  order_index: z.number().int().min(0).optional(),
});

app.post("/templates/:id/tasks", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templateId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM templates WHERE id = ? LIMIT 1").bind(templateId).first();
  if (!existing) throw new HTTPException(404, { message: "Template not found" });

  const parsed = addTaskSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { title, priority, stage_id, order_index } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare(
      "INSERT INTO template_tasks (id, template_id, stage_id, title, priority, order_index) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, templateId, stage_id ?? null, title, priority ?? "medium", order_index ?? 0)
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

  const { template_id, phase_id, target_go_live_date } = await c.req.json<{
    template_id: string;
    phase_id?: string | null;
    /** When set, drives stage + task date scheduling via the same workday
     *  math the Timeline Builder uses (anchor = startFromGoLive(date, total
     *  working days); each stage chained forward with chainForward; every
     *  new task gets scheduled_start / scheduled_end / due_date = stage's
     *  computed window). Omit to keep legacy dateless behavior. */
    target_go_live_date?: string | null;
  }>();
  if (!template_id) throw new HTTPException(400, { message: "template_id is required" });
  if (target_go_live_date && !/^\d{4}-\d{2}-\d{2}$/.test(target_go_live_date)) {
    throw new HTTPException(400, { message: "target_go_live_date must be YYYY-MM-DD" });
  }

  const template = await db
    .prepare("SELECT id, solution_type FROM templates WHERE id = ? LIMIT 1")
    .bind(template_id)
    .first<{ id: string; solution_type: string | null }>();
  if (!template) throw new HTTPException(404, { message: "Template not found" });

  // Optional phase scoping: when phase_id is set, stage reuse and new-stage
  // inserts are scoped to that phase. Lets PMs apply (say) the ZCC template
  // under a "Zoom Contact Center" phase without colliding with the Zoom Phone
  // phase's stages of the same name (Plan / Execute / Monitor / Go-Live).
  const scopedPhaseId = phase_id ?? null;
  if (scopedPhaseId) {
    const phaseCheck = await db
      .prepare("SELECT id FROM phases WHERE id = ? AND project_id = ? LIMIT 1")
      .bind(scopedPhaseId, projectId)
      .first();
    if (!phaseCheck) throw new HTTPException(400, { message: "phase_id does not belong to this project" });
  }

  // Templates without a canonical solution_type fall back to legacy behaviour
  // (no tagging, no fuzzy dedupe) so we don't pollute task titles with junk tags.
  const templateSolutionType: SolutionType | null = canonicalizeSolutionType(template.solution_type ?? "");

  const stages = await db
    .prepare("SELECT * FROM template_stages WHERE template_id = ? ORDER BY order_index ASC")
    .bind(template_id)
    .all<{ id: string; name: string; order_index: number; working_days: number | null }>();

  const tasks = await db
    .prepare("SELECT * FROM template_tasks WHERE template_id = ? ORDER BY order_index ASC")
    .bind(template_id)
    .all<{ id: string; stage_id: string | null; title: string; priority: string | null; order_index: number; default_assignee_role: string | null; is_go_live_event: number | null }>();

  // When the caller supplied a go-live, anchor the GO-LIVE STAGE's end on
  // that date (not the total chain end). Stages after the go-live stage
  // — Closing, Hypercare — extend forward past the date. Mirrors the
  // Timeline Builder's `workdaysThroughGoLive` (see shared/workdayMath.ts
  // and TimelineBuilder.tsx). Falls back to total-chain anchoring when
  // the template has no flagged go-live task (legacy templates).
  const stageDateMap = new Map<string, { start: string; end: string }>(); // template_stage_id -> dates
  if (target_go_live_date) {
    const stageList = stages.results ?? [];
    const taskList = tasks.results ?? [];
    // Find the LAST stage containing a flagged go-live task. Last so combo
    // templates (multi-solution) anchor on the latest go-live.
    let goLiveStageIdx = -1;
    for (let i = stageList.length - 1; i >= 0; i--) {
      const stageId = stageList[i].id;
      if (taskList.some((t) => t.stage_id === stageId && t.is_go_live_event === 1)) {
        goLiveStageIdx = i;
        break;
      }
    }
    const anchorIdx = goLiveStageIdx >= 0 ? goLiveStageIdx : stageList.length - 1;
    const workdaysThroughAnchor = stageList
      .slice(0, anchorIdx + 1)
      .reduce((sum, p) => sum + (p.working_days ?? 0), 0);
    if (workdaysThroughAnchor > 0) {
      const anchor = startFromGoLive(target_go_live_date, workdaysThroughAnchor);
      const chain = chainForward(
        anchor,
        stageList.map((p) => ({ id: p.id, working_days: p.working_days ?? 0 }))
      );
      for (const r of chain) stageDateMap.set(r.id, { start: r.start, end: r.end });
    }
  }

  // Load existing stages by name so we can reuse them instead of duplicating.
  // When phase-scoped, consider both the same-phase stages AND any project-
  // shared stages (phase_id IS NULL — Initiate on multi-phase projects).
  // Without the shared-stage union, applying a template to a phase that
  // doesn't yet have a phase-scoped Initiate row would CREATE a duplicate
  // Initiate stage under that phase even though the project already has
  // a shared one. That left projects with two Initiate stages and one of
  // them empty after the per-phase filter (see PR review notes).
  const existingStages = await (
    scopedPhaseId
      ? db
          .prepare("SELECT id, name, sort_order, planned_start, planned_end FROM stages WHERE project_id = ? AND (phase_id = ? OR phase_id IS NULL)")
          .bind(projectId, scopedPhaseId)
      : db
          .prepare("SELECT id, name, sort_order, planned_start, planned_end FROM stages WHERE project_id = ? AND phase_id IS NULL")
          .bind(projectId)
  ).all<{ id: string; name: string; sort_order: number; planned_start: string | null; planned_end: string | null }>();
  const existingByName: Record<string, string> = {};
  const existingDatesById = new Map<string, { planned_start: string | null; planned_end: string | null }>();
  for (const ep of existingStages.results ?? []) {
    existingByName[ep.name.trim().toLowerCase()] = ep.id;
    existingDatesById.set(ep.id, { planned_start: ep.planned_start, planned_end: ep.planned_end });
  }

  const maxSort = existingStages.results.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0);
  let sortOffset = maxSort + 1;

  // Map template stage id -> project stage id (existing or newly created)
  const stageIdMap: Record<string, string> = {};
  let stagesCreated = 0;

  // Track resolved planned_start/planned_end per destination stage so the task
  // insert loop can use them as the task's scheduled window.
  const stageDatesByDestId = new Map<string, { planned_start: string | null; planned_end: string | null }>();

  for (const stage of stages.results ?? []) {
    const key = stage.name.trim().toLowerCase();
    const computed = stageDateMap.get(stage.id) ?? null;

    if (existingByName[key]) {
      // Reuse existing stage — no new stage created
      const reusedId = existingByName[key];
      stageIdMap[stage.id] = reusedId;
      const cur = existingDatesById.get(reusedId) ?? { planned_start: null, planned_end: null };

      // Fill in missing dates only when we have computed ones AND the existing
      // stage has none. Don't trample PM-set dates.
      let updatedStart = cur.planned_start;
      let updatedEnd   = cur.planned_end;
      if (computed) {
        const fields: string[] = [];
        const values: unknown[] = [];
        if (!cur.planned_start) { fields.push("planned_start = ?"); values.push(computed.start); updatedStart = computed.start; }
        if (!cur.planned_end)   { fields.push("planned_end = ?");   values.push(computed.end);   updatedEnd   = computed.end; }
        if (fields.length > 0) {
          await db
            .prepare(`UPDATE stages SET ${fields.join(", ")} WHERE id = ?`)
            .bind(...values, reusedId)
            .run();
        }
      }
      stageDatesByDestId.set(reusedId, { planned_start: updatedStart, planned_end: updatedEnd });
    } else {
      const newStageId = crypto.randomUUID();
      stageIdMap[stage.id] = newStageId;
      await db
        .prepare(
          "INSERT INTO stages (id, project_id, phase_id, name, sort_order, planned_start, planned_end, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'not_started')"
        )
        .bind(newStageId, projectId, scopedPhaseId, stage.name, sortOffset, computed?.start ?? null, computed?.end ?? null)
        .run();
      existingByName[key] = newStageId;
      stageDatesByDestId.set(newStageId, { planned_start: computed?.start ?? null, planned_end: computed?.end ?? null });
      sortOffset++;
      stagesCreated++;
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

  // Preload existing tasks per destination stage so we can fuzzy-match new
  // template tasks and either upgrade an existing tag or insert a fresh task.
  // Mutated as we insert so multiple template tasks in the same stage compete
  // against each other too (rare but possible if a template has near-duplicates).
  const destStageIds = [...new Set(Object.values(stageIdMap))];
  type ExistingTask = { id: string; title: string; tokens: Set<string> };
  const tasksByStage = new Map<string, ExistingTask[]>();
  for (const stageId of destStageIds) {
    const rows = await db
      .prepare("SELECT id, title FROM tasks WHERE project_id = ? AND stage_id = ?")
      .bind(projectId, stageId)
      .all<{ id: string; title: string }>();
    tasksByStage.set(
      stageId,
      (rows.results ?? []).map((r) => ({ id: r.id, title: r.title, tokens: normalizeTitleTokens(r.title) }))
    );
  }

  let tasksCreated = 0;
  let tasksMerged = 0;

  for (const task of tasks.results ?? []) {
    const mappedStageId = task.stage_id ? (stageIdMap[task.stage_id] ?? null) : null;
    const { userId, contactId } = resolveAssignee(task.default_assignee_role);

    // Normalize the source title to Title Case so every applied task reads
    // consistently regardless of how the template author cased it.
    const normalizedTitle = toTitleCase(task.title);

    // Try to fuzzy-match against an existing task in the same destination stage.
    let matched: ExistingTask | null = null;
    if (mappedStageId && templateSolutionType) {
      const existing = tasksByStage.get(mappedStageId) ?? [];
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
    //
    // When the stage has computed dates (target_go_live_date was supplied),
    // every task in that stage gets scheduled_start = stage.start and
    // scheduled_end/due_date = stage.end. Matches Timeline Builder's
    // "every task spans its stage window" convention — PMs stagger
    // individual tasks afterward via the Tasks tab.
    const newTaskId = crypto.randomUUID();
    const insertedTitle = templateSolutionType
      ? buildTaggedTitle([templateSolutionType], normalizedTitle)
      : normalizedTitle;
    const stageDates = mappedStageId ? stageDatesByDestId.get(mappedStageId) : undefined;
    const taskStart = stageDates?.planned_start ?? null;
    const taskEnd   = stageDates?.planned_end ?? null;
    await db
      .prepare(
        "INSERT INTO tasks (id, project_id, stage_id, title, priority, status, assignee_user_id, assignee_contact_id, scheduled_start, scheduled_end, due_date, is_go_live_event) VALUES (?, ?, ?, ?, ?, 'not_started', ?, ?, ?, ?, ?, ?)"
      )
      .bind(newTaskId, projectId, mappedStageId, insertedTitle, task.priority ?? "medium", userId, contactId, taskStart, taskEnd, taskEnd, task.is_go_live_event ?? 0)
      .run();
    if (mappedStageId) {
      const stageTasks = tasksByStage.get(mappedStageId);
      if (stageTasks) {
        stageTasks.push({ id: newTaskId, title: insertedTitle, tokens: normalizeTitleTokens(insertedTitle) });
      }
    }
    tasksCreated++;
  }

  // Sync project.target_go_live_date from any flagged go-live event tasks
  // that were just inserted from the template.
  await syncProjectGoLiveDate(db, projectId);

  return c.json({ stages_created: stagesCreated, tasks_created: tasksCreated, tasks_merged: tasksMerged });
});

// ──────────────────────────────────────────────────────────────────────────────
// Timeline Builder apply — wipes the project's existing stages + tasks, then
// rebuilds them from a client-computed structure.
//
// The Timeline Builder supports multi-template selection (e.g., UCaaS + CCaaS
// for combo projects). The client loads each selected template, merges stages
// by canonical name (Initiation / Planning / Executing / etc.), takes the MAX
// working_days across templates, and unions tasks (each tagged with its source
// solution_type via buildTaggedTitle). The fully resolved structure is sent
// here; the server's job is just to persist it, plus resolve role strings to
// project-scoped user/contact ids.
// ──────────────────────────────────────────────────────────────────────────────

const applyTimelineSchema = z.object({
  stages: z.array(z.object({
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
      /** Carries the canonical-go-live flag forward from template_tasks
       *  so project.target_go_live_date can derive from this task's date. */
      isGoLiveEvent: z.boolean().optional(),
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
  const { stages: stagePayload } = parsed.data;

  // Generate project-stage ids up front so tasks can reference them.
  type NewStage = { id: string; name: string; sort_order: number; start: string; end: string };
  const newStages: NewStage[] = stagePayload.map((p, i) => ({
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
  type NewTask = { id: string; stage_id: string; title: string; priority: string; assignee_user_id: string | null; assignee_contact_id: string | null; scheduled_start: string; scheduled_end: string; due_date: string; is_go_live_event: number };
  const newTasks: NewTask[] = [];
  for (let stageIdx = 0; stageIdx < stagePayload.length; stageIdx++) {
    const stagePayloadEntry = stagePayload[stageIdx];
    const stageId = newStages[stageIdx].id;
    for (const t of stagePayloadEntry.tasks) {
      const role = t.role?.toLowerCase() ?? "";
      const userId    = roleToUserId[role]    ?? null;
      const contactId = roleToContactId[role] ?? null;
      newTasks.push({
        id: crypto.randomUUID(),
        stage_id: stageId,
        title: t.title,
        priority: t.priority ?? "medium",
        assignee_user_id: userId,
        assignee_contact_id: contactId,
        scheduled_start: t.start,
        scheduled_end: t.end,
        due_date: t.end,
        is_go_live_event: t.isGoLiveEvent ? 1 : 0,
      });
    }
  }

  // Atomic batch: wipe-then-rebuild. Non-CASCADE FK refs (risks.task_id,
  // documents.task_id, documents.stage_id) get nulled first so the DELETEs
  // succeed.
  const stmts = [
    db.prepare("UPDATE risks SET task_id = NULL WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)").bind(projectId),
    db.prepare("UPDATE documents SET task_id = NULL WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)").bind(projectId),
    db.prepare("UPDATE documents SET stage_id = NULL WHERE stage_id IN (SELECT id FROM stages WHERE project_id = ?)").bind(projectId),
    db.prepare("DELETE FROM tasks  WHERE project_id = ?").bind(projectId),
    db.prepare("DELETE FROM stages WHERE project_id = ?").bind(projectId),
    ...newStages.map((p) => db
      .prepare("INSERT INTO stages (id, project_id, name, sort_order, planned_start, planned_end, status) VALUES (?, ?, ?, ?, ?, ?, 'not_started')")
      .bind(p.id, projectId, p.name, p.sort_order, p.start, p.end)),
    ...newTasks.map((t) => db
      .prepare("INSERT INTO tasks (id, project_id, stage_id, title, priority, status, assignee_user_id, assignee_contact_id, scheduled_start, scheduled_end, due_date, is_go_live_event) VALUES (?, ?, ?, ?, ?, 'not_started', ?, ?, ?, ?, ?, ?)")
      .bind(t.id, projectId, t.stage_id, t.title, t.priority, t.assignee_user_id, t.assignee_contact_id, t.scheduled_start, t.scheduled_end, t.due_date, t.is_go_live_event)),
  ];
  await db.batch(stmts);

  // Sync the project's target_go_live_date from the newly-inserted go-live
  // event task(s). If the timeline didn't flag any, no-op (project keeps
  // whatever was set before the rebuild).
  await syncProjectGoLiveDate(db, projectId);

  return c.json({ stages_created: newStages.length, tasks_created: newTasks.length });
});

export default app;

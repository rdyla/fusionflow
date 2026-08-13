import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { canEditProject, canViewProject } from "../services/accessService";
import { syncProjectGoLiveDate } from "../lib/teamUtils";
import {
  canonicalizeSolutionType,
  parseTaggedTitle,
  type SolutionType,
} from "../../shared/solutionTypes";
import { toTitleCase } from "../../shared/titleCase";
import { chainForward, startFromGoLive, workdaysBetween } from "../../shared/workdayMath";

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

// Mounted at /api/admin/templates — this is the ADMIN LIBRARY list (api.adminTemplates),
// which manages the shared global set. Private user templates are excluded outright:
// the library page offers edit/delete on every row it shows, and those mutations are
// scoped to globals, so listing private templates here would only render rows whose
// buttons 404. Note the consequence — an admin has no view of users' private
// templates and so can't tidy up someone else's clutter for them.
// The apply pickers read /api/admin/templates-list (see routes/admin.ts) instead.
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
       WHERE t.owner_user_id IS NULL
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
  const auth = c.get("auth");
  const templateId = c.req.param("id");

  // Owner filter, not just an id lookup: template ids are guessable enough that
  // without it any PM could read another user's private template by id. 404
  // rather than 403 — a private template shouldn't confirm its own existence.
  const template = await db
    .prepare("SELECT * FROM templates WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?) LIMIT 1")
    .bind(templateId, auth.user.id)
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

/**
 * Existence check for the admin-only mutation routes below, narrowed to the
 * GLOBAL library. Every route here is reached through the admin templates UI,
 * which has no business editing a user's private template — without the owner
 * clause an admin could rename, gut or delete someone's saved template by id.
 *
 * Only the existence check needs the clause, not the follow-up UPDATE/DELETE:
 * ownership is set once at creation and never changes, so there's no window in
 * which a row could become private between the two statements.
 *
 * 404, not 403 — a private template shouldn't confirm its own existence.
 */
async function assertGlobalTemplate(db: D1Database, templateId: string): Promise<void> {
  const row = await db
    .prepare("SELECT id FROM templates WHERE id = ? AND owner_user_id IS NULL LIMIT 1")
    .bind(templateId)
    .first();
  if (!row) throw new HTTPException(404, { message: "Template not found" });
}

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  solution_type: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});

app.patch("/templates/:id", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const templateId = c.req.param("id");

  await assertGlobalTemplate(db, templateId);

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

  await assertGlobalTemplate(db, templateId);

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

  await assertGlobalTemplate(db, templateId);

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

  await assertGlobalTemplate(db, templateId);

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

// ── Save a project's plan as a private template ───────────────────────────────
// PMs already add, remove and re-title tasks freely on a live project, so the
// cheapest route to "a task list tuned exactly how I want it" is to snapshot a
// plan they've already built and proved out, rather than build a second editor.
//
// What is deliberately NOT carried over:
//   * dates — a template holds shape, not schedule. Stage windows are reduced to
//     working_days (what the Timeline Builder actually consumes) and per-task
//     dates are dropped; apply recomputes them from the target go-live.
//   * concrete assignees — storing assignee_user_id would bake this project's
//     people into a template reused on unrelated projects. Assignees are instead
//     reverse-mapped to the same role strings apply-template resolves forward
//     ('pm' / 'ie' / 'zoom_porting'), and anything else becomes unassigned.
//   * status / completion — every task comes back as fresh work.

const PER_USER_TEMPLATE_CAP = 25;

const saveAsTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  /** Which phase's stages to capture. Required on multi-phase projects for the
   *  same reason apply-timeline requires it: a template spanning two phases'
   *  worth of same-named stages would merge into nonsense on apply. */
  phase_id: z.string().min(1).nullable().optional(),
});

app.post("/:projectId/save-as-template", requireRole("admin", "pm", "pf_sa", "pf_csm", "pf_engineer"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("projectId");

  // View, not edit: this only reads the plan, and produces a private asset in
  // the caller's own account. A PM with read access to a project they aren't
  // assigned to can still learn from its plan shape.
  if (!(await canViewProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = saveAsTemplateSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid request body" });
  const { name, description, phase_id } = parsed.data;

  const owned = await db
    .prepare("SELECT COUNT(*) AS n FROM templates WHERE owner_user_id = ?")
    .bind(auth.user.id).first<{ n: number }>();
  if ((owned?.n ?? 0) >= PER_USER_TEMPLATE_CAP) {
    throw new HTTPException(409, { message: `You already have ${PER_USER_TEMPLATE_CAP} saved templates. Delete one from your profile first.` });
  }

  // Resolve which phase to capture, mirroring apply-timeline's rules.
  const phases = (await db
    .prepare("SELECT id, name FROM phases WHERE project_id = ? ORDER BY display_order ASC")
    .bind(projectId).all<{ id: string; name: string }>()).results ?? [];
  let targetPhaseId: string | null = null;
  if (phase_id) {
    if (!phases.some((p) => p.id === phase_id)) throw new HTTPException(400, { message: "phase_id does not belong to this project" });
    targetPhaseId = phase_id;
  } else if (phases.length > 1) {
    throw new HTTPException(400, { message: "phase_id is required for multi-phase projects" });
  }

  // Stages: the target phase's own stages, plus any shared stage (phase_id IS
  // NULL) — that's where multi-phase projects keep the shared Initiate, and a
  // template that silently omitted it would come back missing its first stage.
  const stages = (await db
    .prepare(
      targetPhaseId
        ? `SELECT id, name, sort_order, planned_start, planned_end FROM stages
           WHERE project_id = ? AND (phase_id = ? OR phase_id IS NULL) ORDER BY sort_order ASC`
        : `SELECT id, name, sort_order, planned_start, planned_end FROM stages
           WHERE project_id = ? ORDER BY sort_order ASC`
    )
    .bind(...(targetPhaseId ? [projectId, targetPhaseId] : [projectId]))
    .all<{ id: string; name: string; sort_order: number; planned_start: string | null; planned_end: string | null }>()).results ?? [];
  if (stages.length === 0) throw new HTTPException(400, { message: "This project has no stages to save." });

  const stageIds = new Set(stages.map((s) => s.id));
  const allTasks = (await db
    .prepare("SELECT id, stage_id, title, priority, assignee_user_id, assignee_contact_id, is_go_live_event FROM tasks WHERE project_id = ? ORDER BY stage_id, id")
    .bind(projectId)
    .all<{ id: string; stage_id: string | null; title: string; priority: string | null; assignee_user_id: string | null; assignee_contact_id: string | null; is_go_live_event: number }>()).results ?? [];
  // Only tasks under a captured stage. Stage-less tasks are dropped rather than
  // stored unstaged: on apply they'd land nowhere useful, and the PM would have
  // no way to see why a task vanished.
  const tasks = allTasks.filter((t) => t.stage_id && stageIds.has(t.stage_id));

  // Reverse assignee resolution — the inverse of the roleToUserId maps used by
  // apply-template and apply-timeline.
  const projectRow = await db.prepare("SELECT pm_user_id FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ pm_user_id: string | null }>();
  const ieRow = await db
    .prepare("SELECT user_id FROM project_staff WHERE project_id = ? AND staff_role = 'engineer' ORDER BY created_at ASC LIMIT 1")
    .bind(projectId).first<{ user_id: string }>();
  const portingRow = await db
    .prepare("SELECT id FROM project_contacts WHERE project_id = ? AND contact_role = 'Porting Coordinator' ORDER BY added_at ASC LIMIT 1")
    .bind(projectId).first<{ id: string }>();
  const roleFor = (t: { assignee_user_id: string | null; assignee_contact_id: string | null }): string | null => {
    if (t.assignee_contact_id && portingRow?.id && t.assignee_contact_id === portingRow.id) return "zoom_porting";
    if (t.assignee_user_id && projectRow?.pm_user_id && t.assignee_user_id === projectRow.pm_user_id) return "pm";
    if (t.assignee_user_id && ieRow?.user_id && t.assignee_user_id === ieRow.user_id) return "ie";
    return null;
  };

  const templateId = crypto.randomUUID();
  const stmts: D1PreparedStatement[] = [
    // solution_type stays NULL: a snapshot may span several solution types, and
    // the merge path treats a null type as "already-tagged, don't re-tag" —
    // which is right, since these titles carry whatever tags apply gave them.
    db.prepare("INSERT INTO templates (id, name, solution_type, description, owner_user_id) VALUES (?, ?, NULL, ?, ?)")
      .bind(templateId, name.trim(), description?.trim() || null, auth.user.id),
  ];

  const insertStage = db.prepare("INSERT INTO template_stages (id, template_id, name, order_index, working_days) VALUES (?, ?, ?, ?, ?)");
  const insertTask = db.prepare("INSERT INTO template_tasks (id, template_id, stage_id, title, priority, order_index, default_assignee_role, is_go_live_event) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

  stages.forEach((s, i) => {
    const tplStageId = crypto.randomUUID();
    // workdaysBetween is exclusive of the end date, so a stage that starts and
    // ends on the same day is 0 there — store 1 so applying it can't produce a
    // zero-length stage. Undated stages also fall back to 1.
    const wd = s.planned_start && s.planned_end ? Math.max(1, workdaysBetween(s.planned_start, s.planned_end)) : 1;
    stmts.push(insertStage.bind(tplStageId, templateId, s.name, i + 1, wd));
    tasks.filter((t) => t.stage_id === s.id).forEach((t, ti) => {
      stmts.push(insertTask.bind(
        crypto.randomUUID(), templateId, tplStageId, t.title, t.priority ?? "medium", ti + 1,
        roleFor(t), t.is_go_live_event ? 1 : 0,
      ));
    });
  });

  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));

  return c.json({
    id: templateId,
    name: name.trim(),
    stages_saved: stages.length,
    tasks_saved: tasks.length,
    tasks_skipped_no_stage: allTasks.length - tasks.length,
  }, 201);
});

// ── Apply Template to Project ─────────────────────────────────────────────────

app.post("/:projectId/apply-template", requireRole("admin", "pm", "pf_sa", "pf_csm", "pf_engineer"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("projectId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const { template_id, phase_id, target_go_live_date, redate_existing_stages } = await c.req.json<{
    template_id: string;
    phase_id?: string | null;
    /** When set, drives stage + task date scheduling via the same workday
     *  math the Timeline Builder uses (anchor = startFromGoLive(date, total
     *  working days); each stage chained forward with chainForward; every
     *  new task gets scheduled_start / scheduled_end / due_date = stage's
     *  computed window). Omit to keep legacy dateless behavior. */
    target_go_live_date?: string | null;
    /** Re-applying a template onto a phase whose stages are already dated is
     *  ambiguous: honour the newly-typed go-live, or preserve the schedule the
     *  PM has been maintaining? Rather than guess, the route returns 409
     *  `stage_redate_required` listing what would change and the caller decides.
     *  true  → overwrite those stages (and their tasks) from the new anchor
     *  false → keep their dates; only the canonical go-live event is re-pinned
     *  null/undefined → unresolved, so ask (the 409). */
    redate_existing_stages?: boolean | null;
  }>();
  if (!template_id) throw new HTTPException(400, { message: "template_id is required" });
  if (target_go_live_date && !/^\d{4}-\d{2}-\d{2}$/.test(target_go_live_date)) {
    throw new HTTPException(400, { message: "target_go_live_date must be YYYY-MM-DD" });
  }

  // Owner clause: template_id arrives from the client, so without it any PM
  // could apply another user's private template by supplying its id — the plan
  // it produces would expose that template's whole task list.
  const template = await db
    .prepare("SELECT id, solution_type FROM templates WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?) LIMIT 1")
    .bind(template_id, auth.user.id)
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
          .prepare("SELECT id, name, sort_order, planned_start, planned_end, phase_id FROM stages WHERE project_id = ? AND (phase_id = ? OR phase_id IS NULL)")
          .bind(projectId, scopedPhaseId)
      : db
          .prepare("SELECT id, name, sort_order, planned_start, planned_end, phase_id FROM stages WHERE project_id = ? AND phase_id IS NULL")
          .bind(projectId)
  ).all<{ id: string; name: string; sort_order: number; planned_start: string | null; planned_end: string | null; phase_id: string | null }>();
  const existingByName: Record<string, string> = {};
  const existingDatesById = new Map<string, { planned_start: string | null; planned_end: string | null }>();
  // phase_id IS NULL means the stage is shared across every phase (the Initiate
  // convention on multi-phase projects). Re-dating one of those moves it for the
  // other phases too, so the conflict payload flags it explicitly.
  const sharedStageIds = new Set<string>();
  for (const ep of existingStages.results ?? []) {
    existingByName[ep.name.trim().toLowerCase()] = ep.id;
    existingDatesById.set(ep.id, { planned_start: ep.planned_start, planned_end: ep.planned_end });
    if (ep.phase_id === null) sharedStageIds.add(ep.id);
  }

  // ── Re-date conflict check ─────────────────────────────────────────────────
  // Must run BEFORE any write below: the apply is not transactional, so
  // bailing out mid-loop would leave the project half-rebuilt.
  //
  // A conflict is a stage we'd reuse that already carries dates which differ
  // from what the new go-live anchor computes. Stages with no dates aren't a
  // conflict (nothing to lose) and neither are stages already on the computed
  // dates (no-op).
  const redateConflicts: Array<{
    stage_id: string; name: string;
    from_start: string | null; from_end: string | null;
    to_start: string; to_end: string;
    /** Stage is shared by every phase — re-dating affects the other phases too. */
    shared: boolean;
  }> = [];
  if (target_go_live_date && stageDateMap.size > 0) {
    for (const stage of stages.results ?? []) {
      const reusedId = existingByName[stage.name.trim().toLowerCase()];
      if (!reusedId) continue;
      const computed = stageDateMap.get(stage.id);
      const cur = existingDatesById.get(reusedId);
      if (!computed || !cur) continue;
      if (!cur.planned_start && !cur.planned_end) continue;
      if (cur.planned_start === computed.start && cur.planned_end === computed.end) continue;
      redateConflicts.push({
        stage_id: reusedId, name: stage.name,
        from_start: cur.planned_start, from_end: cur.planned_end,
        to_start: computed.start, to_end: computed.end,
        shared: sharedStageIds.has(reusedId),
      });
    }
  }
  if (redateConflicts.length > 0 && (redate_existing_stages === null || redate_existing_stages === undefined)) {
    return c.json({
      error: "stage_redate_required",
      message:
        `${redateConflicts.length} existing stage${redateConflicts.length === 1 ? "" : "s"} in this phase already ` +
        `${redateConflicts.length === 1 ? "has" : "have"} dates that don't match a ${target_go_live_date} go-live. ` +
        `Re-send with redate_existing_stages=true to re-date them, or false to keep them.`,
      target_go_live_date,
      conflicts: redateConflicts,
    }, 409);
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

      // Fill in missing dates when we have computed ones. PM-set dates are
      // preserved unless the caller explicitly confirmed a re-date (see the
      // 409 `stage_redate_required` above), in which case the new go-live
      // anchor wins and overwrites them.
      let updatedStart = cur.planned_start;
      let updatedEnd   = cur.planned_end;
      if (computed) {
        const overwrite = redate_existing_stages === true;
        const fields: string[] = [];
        const values: unknown[] = [];
        if (overwrite || !cur.planned_start) { fields.push("planned_start = ?"); values.push(computed.start); updatedStart = computed.start; }
        if (overwrite || !cur.planned_end)   { fields.push("planned_end = ?");   values.push(computed.end);   updatedEnd   = computed.end; }
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

    const isGoLiveEvent = (task.is_go_live_event ?? 0) === 1;

    if (matched) {
      // A matching task already exists — don't insert a duplicate. Just clean
      // its title (strip any legacy [type] tag + title-case). Technology-type
      // tags are no longer applied to task titles.
      const { rawTitle } = parseTaggedTitle(matched.title);
      const newTitle = toTitleCase(rawTitle);
      if (newTitle !== matched.title) {
        await db.prepare("UPDATE tasks SET title = ? WHERE id = ?").bind(newTitle, matched.id).run();
        matched.title = newTitle;
        matched.tokens = normalizeTitleTokens(newTitle);
      }

      // The canonical go-live event has to track the supplied date even when
      // the task already exists. This branch used to `continue` straight past
      // the date logic, so re-applying a template with a corrected go-live
      // left the event — and therefore projects.target_go_live_date, which is
      // derived from it — sitting on the old date. That read as "I set the
      // go-live date and nothing happened."
      //
      // Also (re)assert the flag: tasks created before migration 0095, or by a
      // path that didn't carry it, are invisible to syncProjectGoLiveDate.
      if (isGoLiveEvent) {
        if (target_go_live_date) {
          await db
            .prepare("UPDATE tasks SET is_go_live_event = 1, scheduled_start = ?, scheduled_end = ?, due_date = ? WHERE id = ?")
            .bind(target_go_live_date, target_go_live_date, target_go_live_date, matched.id)
            .run();
        } else {
          await db.prepare("UPDATE tasks SET is_go_live_event = 1 WHERE id = ?").bind(matched.id).run();
        }
      } else if (redate_existing_stages === true && mappedStageId) {
        // Confirmed re-date: pull merged tasks onto the recomputed stage
        // window too, so the phase doesn't end up with stages on the new
        // schedule and their tasks on the old one.
        const sd = stageDatesByDestId.get(mappedStageId);
        if (sd?.planned_start && sd.planned_end) {
          await db
            .prepare("UPDATE tasks SET scheduled_start = ?, scheduled_end = ?, due_date = ? WHERE id = ?")
            .bind(sd.planned_start, sd.planned_end, sd.planned_end, matched.id)
            .run();
        }
      }

      tasksMerged++;
      continue;
    }

    // No match — insert as a new task. Technology-type tags are no longer added
    // to task titles (each type gets its own phase instead).
    //
    // When the stage has computed dates (target_go_live_date was supplied),
    // every task in that stage gets scheduled_start = stage.start and
    // scheduled_end/due_date = stage.end. Matches Timeline Builder's
    // "every task spans its stage window" convention — PMs stagger
    // individual tasks afterward via the Tasks tab.
    //
    // The canonical go-live event is the exception: it's a single-day
    // milestone landing on the exact go-live date the user supplied — NOT the
    // go-live stage's end. The anchor math (startFromGoLive/chainForward)
    // leaves the stage end a few workdays past the typed date, so the supplied
    // date falls inside the stage window; the stage can carry post-go-live
    // tasks that end after the event. Pinning the event to target_go_live_date
    // keeps it on the date entered and keeps the derived project go-live date
    // (synced from this task's due_date) exact. Mirrors taskWindow() in
    // TimelineBuilder.
    const newTaskId = crypto.randomUUID();
    const insertedTitle = normalizedTitle;
    const stageDates = mappedStageId ? stageDatesByDestId.get(mappedStageId) : undefined;
    const taskStart = isGoLiveEvent && target_go_live_date
      ? target_go_live_date
      : (stageDates?.planned_start ?? null);
    const taskEnd = isGoLiveEvent && target_go_live_date
      ? target_go_live_date
      : (stageDates?.planned_end ?? null);
    await db
      .prepare(
        "INSERT INTO tasks (id, project_id, stage_id, title, priority, status, assignee_user_id, assignee_contact_id, scheduled_start, scheduled_end, due_date, is_go_live_event) VALUES (?, ?, ?, ?, ?, 'not_started', ?, ?, ?, ?, ?, ?)"
      )
      .bind(newTaskId, projectId, mappedStageId, insertedTitle, task.priority ?? "medium", userId, contactId, taskStart, taskEnd, taskEnd, isGoLiveEvent ? 1 : 0)
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
  /** Target phase. Optional when the project has a single phase (we resolve
   *  it server-side); required when the project has 2+ phases so the wipe
   *  only touches that phase's stages. Multi-phase projects keep their
   *  shared Initiate stage at phase_id=NULL untouched. */
  phase_id: z.string().min(1).nullable().optional(),
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

app.post("/:projectId/apply-timeline", requireRole("admin", "pm", "pf_sa", "pf_csm", "pf_engineer"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("projectId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = applyTimelineSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const { stages: stagePayload, phase_id: payloadPhaseId } = parsed.data;

  // ── Resolve target phase ──────────────────────────────────────────────────
  // A timeline always applies into exactly one phase. We wipe + rebuild only
  // that phase's stages so multi-phase projects can re-build (say) the
  // Zoom Phone phase without nuking Zoom Contact Center work already in
  // flight on another phase. The shared Initiate stage (phase_id=NULL on
  // multi-phase projects) is intentionally left untouched.
  const projectPhases = await db
    .prepare("SELECT id, name FROM phases WHERE project_id = ? ORDER BY display_order ASC")
    .bind(projectId)
    .all<{ id: string; name: string }>();
  const allPhases = projectPhases.results ?? [];
  if (allPhases.length === 0) {
    // Projects post-PR #267 always seed a Main phase on create, but defend
    // against legacy data — without a phase we can't scope the wipe.
    throw new HTTPException(400, { message: "Project has no phases — cannot apply timeline" });
  }
  let targetPhaseId: string;
  if (payloadPhaseId) {
    const match = allPhases.find((p) => p.id === payloadPhaseId);
    if (!match) throw new HTTPException(400, { message: "phase_id does not belong to this project" });
    targetPhaseId = match.id;
  } else if (allPhases.length === 1) {
    targetPhaseId = allPhases[0].id;
  } else {
    throw new HTTPException(400, { message: "phase_id is required for multi-phase projects" });
  }
  const isMultiPhase = allPhases.length > 1;

  // On multi-phase projects, Initiate lives at phase_id=NULL and is shared
  // across all phases. Filter any Initiate-named stage out of the payload so
  // we don't accidentally create a duplicate per-phase Initiate next to the
  // shared one (mirrors the LIKE '%initiat%' guard in routes/phases.ts).
  const stagePayloadFiltered = isMultiPhase
    ? stagePayload.filter((p) => !/initiat/i.test(p.name))
    : stagePayload;
  if (stagePayloadFiltered.length === 0) {
    throw new HTTPException(400, { message: "No stages to apply after filtering shared Initiate" });
  }

  // Generate project-stage ids up front so tasks can reference them.
  type NewStage = { id: string; name: string; sort_order: number; start: string; end: string };
  const newStages: NewStage[] = stagePayloadFiltered.map((p, i) => ({
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
  for (let stageIdx = 0; stageIdx < stagePayloadFiltered.length; stageIdx++) {
    const stagePayloadEntry = stagePayloadFiltered[stageIdx];
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

  // Atomic batch: wipe-then-rebuild, scoped to the target phase. Non-CASCADE
  // FK refs (risks.task_id, documents.task_id, documents.stage_id) get nulled
  // first so the DELETEs succeed. Stages with phase_id=NULL (the shared
  // Initiate on multi-phase projects) survive — only this phase's chain
  // gets replaced.
  const stmts = [
    db.prepare("UPDATE risks     SET task_id  = NULL WHERE task_id  IN (SELECT id FROM tasks  WHERE project_id = ? AND stage_id IN (SELECT id FROM stages WHERE project_id = ? AND phase_id = ?))").bind(projectId, projectId, targetPhaseId),
    db.prepare("UPDATE documents SET task_id  = NULL WHERE task_id  IN (SELECT id FROM tasks  WHERE project_id = ? AND stage_id IN (SELECT id FROM stages WHERE project_id = ? AND phase_id = ?))").bind(projectId, projectId, targetPhaseId),
    db.prepare("UPDATE documents SET stage_id = NULL WHERE stage_id IN (SELECT id FROM stages WHERE project_id = ? AND phase_id = ?)").bind(projectId, targetPhaseId),
    db.prepare("DELETE FROM tasks  WHERE project_id = ? AND stage_id IN (SELECT id FROM stages WHERE project_id = ? AND phase_id = ?)").bind(projectId, projectId, targetPhaseId),
    db.prepare("DELETE FROM stages WHERE project_id = ? AND phase_id = ?").bind(projectId, targetPhaseId),
    ...newStages.map((p) => db
      .prepare("INSERT INTO stages (id, project_id, phase_id, name, sort_order, planned_start, planned_end, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'not_started')")
      .bind(p.id, projectId, targetPhaseId, p.name, p.sort_order, p.start, p.end)),
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

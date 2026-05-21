/**
 * Date cascade — shift downstream task dates by N working days from a chosen
 * source task, with a preview-then-apply flow so PMs can opt out specific
 * tasks before committing.
 *
 *   GET  /api/projects/:id/cascade/preview?from_task_id=…&slip_days=…
 *     → { from_task, affected_tasks:[…], new_target_go_live }
 *
 *   POST /api/projects/:id/cascade/apply
 *     body { from_task_id, slip_days, exclude_task_ids?:[] }
 *     → atomic db.batch shift + project target_go_live update + summary email
 *       per recipient (fired via c.executionCtx.waitUntil so the response is fast)
 *
 * "Downstream" = tasks with due_date strictly after the source task's due_date.
 * Phases that own any shifted task have their planned_start / planned_end
 * shifted by the same slip so the Gantt stays coherent. target_go_live_date
 * shifts when it is set; otherwise we leave it untouched.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { canEditProject } from "../services/accessService";
import { workday } from "../../shared/workdayMath";
import { EmailBatch, sendBatchSummary } from "../lib/emailBatch";
import { createNotification } from "../lib/notifications";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Shared types + helpers ────────────────────────────────────────────────

type TaskRow = {
  id: string;
  phase_id: string | null;
  title: string;
  due_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  assignee_user_id: string | null;
};

type PhaseRow = {
  id: string;
  planned_start: string | null;
  planned_end: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  target_go_live_date: string | null;
  pm_user_id: string | null;
};

/**
 * Shift an ISO date (or null) by N working days. Returns null for null in.
 *
 * Slip 0 returns the original date verbatim — keeps the preview consistent
 * with the apply path's zero-slip no-op short-circuit. (Calling workday()
 * directly with days=0 would bump weekend dates to the next weekday, which
 * is intentional for the Timeline Builder anchor flow but would mislead
 * PMs here by showing fake shifts on tasks that happen to have weekend
 * due dates.)
 */
function shiftDate(iso: string | null, slipDays: number): string | null {
  if (!iso) return null;
  if (slipDays === 0) return iso;
  return workday(iso, slipDays);
}

/** Build the set of tasks affected by a cascade, with their projected new dates. */
async function computeAffected(
  db: D1Database,
  projectId: string,
  fromTaskId: string,
  slipDays: number,
): Promise<{
  fromTask: TaskRow;
  affected: Array<TaskRow & { new_due_date: string | null; new_scheduled_start: string | null; new_scheduled_end: string | null }>;
}> {
  const fromTask = await db
    .prepare(
      "SELECT id, phase_id, title, due_date, scheduled_start, scheduled_end, assignee_user_id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1"
    )
    .bind(fromTaskId, projectId)
    .first<TaskRow>();
  if (!fromTask) throw new HTTPException(404, { message: "Source task not found" });
  if (!fromTask.due_date) {
    throw new HTTPException(400, { message: "Source task has no due date — set one before cascading" });
  }

  // Downstream = tasks with due_date strictly later than the source's.
  const downstream = await db
    .prepare(
      `SELECT id, phase_id, title, due_date, scheduled_start, scheduled_end, assignee_user_id
       FROM tasks
       WHERE project_id = ?
         AND due_date IS NOT NULL
         AND due_date > ?
       ORDER BY due_date ASC`
    )
    .bind(projectId, fromTask.due_date)
    .all<TaskRow>();

  const affected = (downstream.results ?? []).map((t) => ({
    ...t,
    new_due_date:        shiftDate(t.due_date, slipDays),
    new_scheduled_start: shiftDate(t.scheduled_start, slipDays),
    new_scheduled_end:   shiftDate(t.scheduled_end, slipDays),
  }));

  return { fromTask, affected };
}

// ── Preview ───────────────────────────────────────────────────────────────

app.get("/:id/cascade/preview", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const fromTaskId = c.req.query("from_task_id");
  const slipDays = parseInt(c.req.query("slip_days") ?? "0", 10);
  if (!fromTaskId) throw new HTTPException(400, { message: "from_task_id is required" });
  if (Number.isNaN(slipDays)) throw new HTTPException(400, { message: "slip_days must be an integer" });

  const { fromTask, affected } = await computeAffected(db, projectId, fromTaskId, slipDays);

  const project = await db
    .prepare("SELECT target_go_live_date FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ target_go_live_date: string | null }>();
  const newTargetGoLive = shiftDate(project?.target_go_live_date ?? null, slipDays);

  return c.json({
    from_task: fromTask,
    slip_days: slipDays,
    affected_tasks: affected,
    current_target_go_live: project?.target_go_live_date ?? null,
    new_target_go_live: newTargetGoLive,
  });
});

// ── Apply ─────────────────────────────────────────────────────────────────

const applySchema = z.object({
  from_task_id: z.string().min(1),
  slip_days: z.number().int(),
  exclude_task_ids: z.array(z.string()).default([]),
});

app.post("/:id/cascade/apply", requireRole("admin", "pm", "pf_sa"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = applySchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const { from_task_id, slip_days, exclude_task_ids } = parsed.data;

  if (slip_days === 0) {
    return c.json({ tasks_shifted: 0, phases_shifted: 0, new_target_go_live: null });
  }

  const excluded = new Set(exclude_task_ids);

  const { affected: allAffected } = await computeAffected(db, projectId, from_task_id, slip_days);
  const tasksToShift = allAffected.filter((t) => !excluded.has(t.id));
  if (tasksToShift.length === 0) {
    return c.json({ tasks_shifted: 0, phases_shifted: 0, new_target_go_live: null });
  }

  const project = await db
    .prepare("SELECT id, name, target_go_live_date, pm_user_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<ProjectRow>();
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  const newTargetGoLive = shiftDate(project.target_go_live_date, slip_days);

  // Phases that contain at least one shifted task → shift their planned dates
  // by the same slip so the Gantt stays coherent.
  const affectedPhaseIds = [...new Set(tasksToShift.map((t) => t.phase_id).filter((id): id is string => !!id))];
  const phaseRows = affectedPhaseIds.length > 0
    ? await db
        .prepare(`SELECT id, planned_start, planned_end FROM phases WHERE project_id = ? AND id IN (${affectedPhaseIds.map(() => "?").join(",")})`)
        .bind(projectId, ...affectedPhaseIds)
        .all<PhaseRow>()
    : { results: [] as PhaseRow[] };

  const phaseUpdates = (phaseRows.results ?? []).map((p) => ({
    id: p.id,
    new_planned_start: shiftDate(p.planned_start, slip_days),
    new_planned_end:   shiftDate(p.planned_end, slip_days),
  }));

  // Single atomic batch: task shifts + phase shifts + target go-live update.
  const stmts = [
    ...tasksToShift.map((t) => db
      .prepare("UPDATE tasks SET due_date = ?, scheduled_start = ?, scheduled_end = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?")
      .bind(t.new_due_date, t.new_scheduled_start, t.new_scheduled_end, t.id, projectId)),
    ...phaseUpdates.map((p) => db
      .prepare("UPDATE phases SET planned_start = ?, planned_end = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?")
      .bind(p.new_planned_start, p.new_planned_end, p.id, projectId)),
  ];
  if (newTargetGoLive && newTargetGoLive !== project.target_go_live_date) {
    stmts.push(
      db.prepare("UPDATE projects SET target_go_live_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(newTargetGoLive, projectId)
    );
  }
  await db.batch(stmts);

  // ── Notifications ───────────────────────────────────────────────────────
  // Build a batched summary email per affected recipient (assignees + PM).
  // Each shifted task lands as one event in that recipient's bucket.
  const recipientIds = [...new Set(
    tasksToShift.map((t) => t.assignee_user_id).filter((id): id is string => !!id)
  )];
  if (project.pm_user_id && !recipientIds.includes(project.pm_user_id)) {
    recipientIds.push(project.pm_user_id);
  }

  const userRows = recipientIds.length > 0
    ? await db
        .prepare(`SELECT id, email, name FROM users WHERE id IN (${recipientIds.map(() => "?").join(",")}) AND is_active = 1`)
        .bind(...recipientIds)
        .all<{ id: string; email: string; name: string | null }>()
    : { results: [] as { id: string; email: string; name: string | null }[] };
  const userMap = new Map((userRows.results ?? []).map((u) => [u.id, u]));

  const batch = new EmailBatch();
  for (const t of tasksToShift) {
    const recipients = [t.assignee_user_id, project.pm_user_id].filter((id, i, arr): id is string =>
      !!id && arr.indexOf(id) === i
    );
    for (const userId of recipients) {
      const user = userMap.get(userId);
      if (!user) continue;
      batch.add(userId, user.email, user.name, {
        kind: "task_due_shifted",
        taskId: t.id,
        taskTitle: t.title,
        oldDue: t.due_date,
        newDue: t.new_due_date,
      });
    }
  }

  // In-app notification per recipient (one summary row), too.
  for (const { userId, entry } of batch.entries()) {
    await createNotification(db, {
      recipientUserId: userId,
      type: "cascade_applied",
      title: `${entry.events.length} task${entry.events.length === 1 ? "" : "s"} rescheduled in ${project.name}`,
      body: newTargetGoLive ? `New target go-live: ${newTargetGoLive}` : null,
      entityType: "project",
      entityId: projectId,
      projectId,
      senderUserId: auth.user.id,
    });
  }

  // Fire-and-forget the email batch so the response doesn't wait on Graph.
  if (batch.size() > 0) {
    c.executionCtx.waitUntil(
      sendBatchSummary(c.env, batch, {
        subject: `${tasksToShift.length} task${tasksToShift.length === 1 ? "" : "s"} rescheduled in ${project.name}`,
        projectName: project.name,
        projectId,
        appUrl: c.env.APP_URL ?? "",
        intro: `A cascade shift of ${slip_days} working day${Math.abs(slip_days) === 1 ? "" : "s"} was applied to ${project.name}.`,
        newTargetGoLive: newTargetGoLive,
        actorName: auth.user.name ?? auth.user.email,
      })
    );
  }

  return c.json({
    tasks_shifted: tasksToShift.length,
    phases_shifted: phaseUpdates.length,
    new_target_go_live: newTargetGoLive,
    recipients_notified: batch.size(),
  });
});

export default app;

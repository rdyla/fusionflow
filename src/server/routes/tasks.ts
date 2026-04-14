import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canEditProject, canViewProject } from "../services/accessService";
import { sendEmail } from "../services/emailService";
import { taskAssigned, taskBlocked, pmTaskUpdate } from "../lib/emailTemplates";
import { createNotification } from "../lib/notifications";
import {
  getPayCodes, getCaseAndJob, getCostCodesForJob, getSystemUserIdByEmail, createTimeEntry,
} from "../services/dynamicsService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const TASK_SELECT = `
  SELECT id, project_id, phase_id, title, assignee_user_id, due_date,
         completed_at, status, priority,
         scheduled_start, scheduled_end, pay_code_id, cost_code_id, crm_time_entry_id
  FROM tasks
`;

app.get("/:id/tasks", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const rows = await db
    .prepare(`${TASK_SELECT} WHERE project_id = ? ORDER BY due_date ASC`)
    .bind(projectId)
    .all();

  return c.json(rows.results ?? []);
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  phase_id: z.string().nullable().optional(),
  assignee_user_id: z.string().max(255).nullable().optional(),
  due_date: z.string().nullable().optional(),
  scheduled_start: z.string().nullable().optional(),
  scheduled_end: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed", "blocked"]).default("not_started"),
});

app.post("/:id/tasks", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const rawBody = await c.req.json();
  const parsed = createTaskSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { title, phase_id, assignee_user_id, due_date, scheduled_start, scheduled_end, priority, status } = parsed.data;
  const taskId = crypto.randomUUID();

  await db
    .prepare(
      `
      INSERT INTO tasks (id, project_id, phase_id, title, assignee_user_id, due_date, scheduled_start, scheduled_end, status, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .bind(taskId, projectId, phase_id ?? null, title, assignee_user_id ?? null, due_date ?? null, scheduled_start ?? null, scheduled_end ?? null, status, priority ?? null)
    .run();

  const created = await db
    .prepare(`${TASK_SELECT} WHERE id = ? LIMIT 1`)
    .bind(taskId)
    .first<{ id: string; title: string; assignee_user_id: string | null; due_date: string | null; priority: string | null }>();

  // Notify assignee if one was set
  if (created?.assignee_user_id) {
    const [assignee, project] = await Promise.all([
      db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(created.assignee_user_id).first<{ email: string; name: string }>(),
      db.prepare("SELECT name FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ name: string }>(),
    ]);
    if (assignee && project) {
      const appUrl = c.env.APP_URL ?? "";
      c.executionCtx.waitUntil(sendEmail(c.env, {
        to: assignee.email,
        subject: `You've been assigned: ${created.title}`,
        html: taskAssigned({ assigneeName: assignee.name ?? assignee.email, taskTitle: created.title, projectName: project.name, dueDate: created.due_date, priority: created.priority, appUrl, projectId }),
      }));
      c.executionCtx.waitUntil(createNotification(db, {
        recipientUserId: created.assignee_user_id,
        type: "task_assigned",
        title: `You've been assigned: ${created.title}`,
        body: project.name,
        entityType: "task",
        entityId: created.id,
        projectId,
        senderUserId: auth.user.id,
      }));
    }
  }

  return c.json(created, 201);
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  phase_id: z.string().nullable().optional(),
  assignee_user_id: z.string().max(255).nullable().optional(),
  due_date: z.string().nullable().optional(),
  scheduled_start: z.string().nullable().optional(),
  scheduled_end: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed", "blocked"]).optional(),
});

app.patch("/:id/tasks/:taskId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const existing = await db
    .prepare(`${TASK_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`)
    .bind(taskId, projectId)
    .first<{ id: string; title: string; assignee_user_id: string | null; status: string | null; due_date: string | null; priority: string | null }>();

  if (!existing) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  // pf_engineer may update status of tasks assigned to them
  const isEngineerOnOwnTask =
    auth.role === "pf_engineer" && existing.assignee_user_id === auth.user.id;
  const canEdit = await canEditProject(db, auth.user, projectId);
  if (!canEdit && !isEngineerOnOwnTask) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const rawBody = await c.req.json();
  const parsed = updateTaskSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  // Engineers on own tasks may only change status
  if (isEngineerOnOwnTask && !canEdit) {
    const disallowed = Object.keys(parsed.data).filter(
      (k) => k !== "status" && parsed.data[k as keyof typeof parsed.data] !== undefined
    );
    if (disallowed.length > 0) {
      throw new HTTPException(403, { message: "Engineers may only update task status" });
    }
  }

  const updates = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (!fields.length) {
    throw new HTTPException(400, { message: "No valid fields to update" });
  }

  // Auto-set completed_at when marking complete
  if (updates.status === "completed") {
    fields.push("completed_at = CURRENT_TIMESTAMP");
  } else if (updates.status !== undefined) {
    fields.push("completed_at = NULL");
  }

  await db
    .prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND project_id = ?`)
    .bind(...values, taskId, projectId)
    .run();

  const updated = await db
    .prepare(`${TASK_SELECT} WHERE id = ? LIMIT 1`)
    .bind(taskId)
    .first<{ id: string; title: string; assignee_user_id: string | null; status: string | null; due_date: string | null; priority: string | null }>();

  const appUrl = c.env.APP_URL ?? "";
  const project = await db.prepare("SELECT name, pm_user_id FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ name: string; pm_user_id: string | null }>();

  // Notify new assignee if assignee changed
  const assigneeChanged = updates.assignee_user_id !== undefined && updates.assignee_user_id !== existing.assignee_user_id;
  if (assigneeChanged && updated?.assignee_user_id) {
    const assignee = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(updated.assignee_user_id).first<{ email: string; name: string }>();
    if (assignee && project) {
      c.executionCtx.waitUntil(sendEmail(c.env, {
        to: assignee.email,
        subject: `You've been assigned: ${updated.title}`,
        html: taskAssigned({ assigneeName: assignee.name ?? assignee.email, taskTitle: updated.title, projectName: project.name, dueDate: updated.due_date, priority: updated.priority, appUrl, projectId }),
      }));
      c.executionCtx.waitUntil(createNotification(db, {
        recipientUserId: updated.assignee_user_id,
        type: "task_assigned",
        title: `You've been assigned: ${updated.title}`,
        body: project.name,
        entityType: "task",
        entityId: taskId,
        projectId,
        senderUserId: auth.user.id,
      }));
    }
  }

  // Notify PM of general task update (skip if PM made the change, skip if it's a blocked transition — handled separately below)
  const justBlocked = updates.status === "blocked" && existing.status !== "blocked";
  if (!justBlocked && project?.pm_user_id && project.pm_user_id !== auth.user.id && updated) {
    const pm = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(project.pm_user_id).first<{ email: string; name: string }>();
    if (pm) {
      c.executionCtx.waitUntil(sendEmail(c.env, {
        to: pm.email,
        subject: `Task updated on ${project.name}: ${updated.title}`,
        html: pmTaskUpdate({ pmName: pm.name ?? pm.email, taskTitle: updated.title, projectName: project.name, updatedByName: auth.user.name ?? auth.user.email, status: updated.status, appUrl, projectId }),
      }));
    }
  }

  // Notify PM if task just became blocked
  if (justBlocked && project?.pm_user_id) {
    const pm = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(project.pm_user_id).first<{ email: string; name: string }>();
    let assigneeName: string | null = null;
    if (updated?.assignee_user_id) {
      const a = await db.prepare("SELECT name FROM users WHERE id = ? LIMIT 1").bind(updated.assignee_user_id).first<{ name: string }>();
      assigneeName = a?.name ?? null;
    }
    if (pm && project) {
      c.executionCtx.waitUntil(sendEmail(c.env, {
        to: pm.email,
        subject: `Task blocked: ${updated?.title ?? ""}`,
        html: taskBlocked({ pmName: pm.name ?? pm.email, taskTitle: updated?.title ?? "", projectName: project.name, assigneeName, appUrl, projectId }),
      }));
      if (project.pm_user_id !== auth.user.id) {
        c.executionCtx.waitUntil(createNotification(db, {
          recipientUserId: project.pm_user_id,
          type: "task_blocked",
          title: `Task blocked: ${updated?.title ?? ""}`,
          body: `${assigneeName ? `Assigned to ${assigneeName} · ` : ""}${project.name}`,
          entityType: "task",
          entityId: taskId,
          projectId,
          senderUserId: auth.user.id,
        }));
      }
    }
  }

  return c.json(updated);
});

// ── Task Comments ─────────────────────────────────────────────────────────────

app.get("/:id/tasks/:taskId/comments", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db
    .prepare(
      `SELECT tc.id, tc.task_id, tc.project_id, tc.author_user_id, tc.body, tc.created_at,
              u.name AS author_name, u.email AS author_email
       FROM task_comments tc
       LEFT JOIN users u ON u.id = tc.author_user_id
       WHERE tc.task_id = ? AND tc.project_id = ?
       ORDER BY tc.created_at ASC`
    )
    .bind(taskId, projectId)
    .all();

  return c.json(rows.results ?? []);
});

app.post("/:id/tasks/:taskId/comments", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const task = await db
    .prepare("SELECT id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(taskId, projectId)
    .first();
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  const { body } = await c.req.json<{ body: string }>();
  if (!body?.trim()) throw new HTTPException(400, { message: "Comment body required" });

  const commentId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO task_comments (id, task_id, project_id, author_user_id, body)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(commentId, taskId, projectId, auth.user.id, body.trim())
    .run();

  const created = await db
    .prepare(
      `SELECT tc.id, tc.task_id, tc.project_id, tc.author_user_id, tc.body, tc.created_at,
              u.name AS author_name, u.email AS author_email
       FROM task_comments tc
       LEFT JOIN users u ON u.id = tc.author_user_id
       WHERE tc.id = ? LIMIT 1`
    )
    .bind(commentId)
    .first();

  return c.json(created, 201);
});

app.delete("/:id/tasks/:taskId/comments/:commentId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");
  const commentId = c.req.param("commentId");

  const comment = await db
    .prepare("SELECT id, author_user_id FROM task_comments WHERE id = ? AND task_id = ? AND project_id = ? LIMIT 1")
    .bind(commentId, taskId, projectId)
    .first<{ id: string; author_user_id: string | null }>();

  if (!comment) throw new HTTPException(404, { message: "Comment not found" });

  // Only author, admins, or PMs can delete
  const isOwner = comment.author_user_id === auth.user.id;
  const isPrivileged = auth.role === "admin" || auth.role === "pm";
  if (!isOwner && !isPrivileged) throw new HTTPException(403, { message: "Forbidden" });

  await db.prepare("DELETE FROM task_comments WHERE id = ?").bind(commentId).run();
  return c.json({ success: true });
});

// ── Time Entry ────────────────────────────────────────────────────────────────

/** Temporary: return lookup field names on amc_timeentry for discovery. Admin only. */
app.get("/time-entry/metadata", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin") throw new HTTPException(403, { message: "Forbidden" });
  const { getTimeEntryLookupFields } = await import("../services/dynamicsService");
  const fields = await getTimeEntryLookupFields(c.env);
  return c.json(fields);
});

/** Return pay codes + cost codes for the project's CRM job. Used to populate the time entry form. */
app.get("/:id/time-entry/setup", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("id");
  const allowed = await canViewProject(c.env.DB, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const project = await c.env.DB
    .prepare("SELECT crm_case_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ crm_case_id: string | null }>();

  console.log("[time-entry/setup] crm_case_id:", project?.crm_case_id ?? "(null)");

  let payCodes: Awaited<ReturnType<typeof getPayCodes>> = [];
  let caseAndJob: Awaited<ReturnType<typeof getCaseAndJob>> = null;
  let caseError: string | null = null;

  try {
    [payCodes, caseAndJob] = await Promise.all([
      getPayCodes(c.env),
      project?.crm_case_id ? getCaseAndJob(c.env, project.crm_case_id) : Promise.resolve(null),
    ]);
  } catch (err) {
    caseError = err instanceof Error ? err.message : String(err);
    console.error("[time-entry/setup] CRM lookup failed:", caseError);
    // still try pay codes alone
    try { payCodes = await getPayCodes(c.env); } catch { /* ignore */ }
  }

  console.log("[time-entry/setup] caseAndJob:", JSON.stringify(caseAndJob), "error:", caseError);

  const costCodes = caseAndJob?.jobId
    ? await getCostCodesForJob(c.env, caseAndJob.jobId)
    : [];

  return c.json({
    pay_codes: payCodes,
    cost_codes: costCodes,
    case_id: caseAndJob?.caseId ?? null,
    job_id: caseAndJob?.jobId ?? null,
    account_id: caseAndJob?.accountId ?? null,
    _debug: {
      crm_case_id: project?.crm_case_id ?? null,
      case_found: !!caseAndJob,
      case_error: caseError,
    },
  });
});

const logTimeSchema = z.object({
  scheduled_start: z.string(),
  scheduled_end: z.string(),
  pay_code_id: z.string(),
  cost_code_id: z.string().nullable().optional(),
  case_id: z.string(),
  job_id: z.string(),
  account_id: z.string().nullable().optional(),
});

/** List time entries for a task. */
app.get("/:id/tasks/:taskId/time-entries", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db
    .prepare(`
      SELECT tte.*, u.name AS user_name
      FROM task_time_entries tte
      LEFT JOIN users u ON u.id = tte.user_id
      WHERE tte.task_id = ? AND tte.project_id = ?
      ORDER BY tte.scheduled_start ASC
    `)
    .bind(taskId, projectId)
    .all();

  return c.json(rows.results ?? []);
});

/** Log a time entry against a task and ship it to Dynamics CRM. Does not change task status. */
app.post("/:id/tasks/:taskId/time-entries", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const task = await db
    .prepare(`${TASK_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`)
    .bind(taskId, projectId)
    .first<{ id: string; title: string; assignee_user_id: string | null; status: string | null }>();
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  const isEngineerOnOwnTask = auth.role === "pf_engineer" && task.assignee_user_id === auth.user.id;
  const canEdit = await canEditProject(db, auth.user, projectId);
  if (!canEdit && !isEngineerOnOwnTask) throw new HTTPException(403, { message: "Forbidden" });

  const body = await c.req.json();
  const parsed = logTimeSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid time entry data" });

  const { scheduled_start, scheduled_end, pay_code_id, cost_code_id, case_id, job_id, account_id } = parsed.data;

  const ownerId = await getSystemUserIdByEmail(c.env, auth.user.email);
  if (!ownerId) throw new HTTPException(422, { message: `No Dynamics user found for ${auth.user.email}` });

  let crmTimeEntryId: string;
  try {
    crmTimeEntryId = await createTimeEntry(c.env, {
      subject: task.title,
      scheduledStart: scheduled_start,
      scheduledEnd: scheduled_end,
      caseId: case_id,
      jobId: job_id,
      payCodeId: pay_code_id,
      costCodeId: cost_code_id ?? null,
      companyId: account_id ?? null,
      ownerId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "CRM time entry failed";
    console.error("createTimeEntry error:", message);
    throw new HTTPException(502, { message: `CRM error: ${message}` });
  }

  const entryId = crypto.randomUUID();
  await db
    .prepare(`
      INSERT INTO task_time_entries (id, task_id, project_id, crm_time_entry_id, scheduled_start, scheduled_end, pay_code_id, cost_code_id, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(entryId, taskId, projectId, crmTimeEntryId, scheduled_start, scheduled_end, pay_code_id, cost_code_id ?? null, auth.user.id)
    .run();

  const created = await db
    .prepare(`SELECT tte.*, u.name AS user_name FROM task_time_entries tte LEFT JOIN users u ON u.id = tte.user_id WHERE tte.id = ? LIMIT 1`)
    .bind(entryId)
    .first();

  return c.json(created, 201);
});

app.delete("/:id/tasks/:taskId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const existing = await db
    .prepare(`SELECT id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1`)
    .bind(taskId, projectId)
    .first();

  if (!existing) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  await db
    .prepare(`DELETE FROM tasks WHERE id = ? AND project_id = ?`)
    .bind(taskId, projectId)
    .run();

  return c.json({ success: true });
});

export default app;

import { HTTPException } from "hono/http-exception";
import type { AuthContext, Bindings } from "../types";
import { canLogTimeOnProject } from "../services/accessService";
import {
  getCostCodesForJob, getPayCodes, updateTimeEntry, type DynamicsCostCode,
} from "../services/dynamicsService";
import { pushTimeEntryToCrm, removeTimeEntryFromCrm, resolveCaseForTime } from "../services/timeEntryService";
import { writeAuditLog } from "../lib/auditLog";
import { pacificToUtc, utcToPacific } from "../lib/pacificTime";

/**
 * Time writes for the Claude connector: create, edit, delete — each one the
 * same CRM contract as the UI (create-then-close, reopen-patch-close, reopen-
 * delete), against the same local shadow tables.
 *
 * Every function returns either a result or a ToolFailure the tool layer turns
 * into an isError response. Failures carry enough for the model to recover
 * (the stage list, the job's cost codes) without another round trip.
 */

export type ToolFailure = { error: string; [k: string]: unknown };
const fail = (error: string, extra: Record<string, unknown> = {}): ToolFailure => ({ error, ...extra });
export const isFailure = (x: unknown): x is ToolFailure => typeof x === "object" && x !== null && "error" in x;

const DEFAULT_START = "08:00";

// ── Codes ───────────────────────────────────────────────────────────────────

/**
 * Cost codes are per job — every job carries its own copy, named like
 * "Labor-Direc-Proj -Mgmnt-1" — so a work type is matched on the name, with
 * spacing and punctuation ignored.
 */
export const WORK_TYPES = {
  project_management: "projmgmnt",
  software_config: "softwconfg",
  go_live: "golive",
  service_support: "srvcespprt",
} as const;
export type WorkType = keyof typeof WORK_TYPES;
const DEFAULT_WORK_TYPE: WorkType = "project_management";

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const codeView = (c: DynamicsCostCode) => ({ id: c.amc_costcodeid, name: c.amc_name });

/**
 * Explicit cost_code (name or id) → work_type → the cost code this user last
 * logged on this project → the default work type. Anything that can't be
 * matched returns the job's actual codes so the model can ask.
 */
async function resolveCostCode(
  env: Bindings, jobId: string, userId: string, projectId: string,
  opts: { workType?: WorkType; costCode?: string }
): Promise<{ id: string; name: string } | ToolFailure> {
  const codes = await getCostCodesForJob(env, jobId);
  if (codes.length === 0) return fail("This project's CE job has no cost codes.");
  const options = codes.map(codeView);

  if (opts.costCode) {
    const want = squash(opts.costCode);
    const hit = codes.find((c) => c.amc_costcodeid.toLowerCase() === opts.costCode!.toLowerCase())
      ?? codes.find((c) => squash(c.amc_name) === want)
      ?? (() => { const m = codes.filter((c) => squash(c.amc_name).includes(want)); return m.length === 1 ? m[0] : undefined; })();
    return hit ? codeView(hit) : fail(`No cost code on this job matches "${opts.costCode}".`, { cost_codes: options });
  }

  const byWorkType = (wt: WorkType) => codes.find((c) => squash(c.amc_name).includes(WORK_TYPES[wt]));

  if (opts.workType) {
    const hit = byWorkType(opts.workType);
    return hit ? codeView(hit) : fail(`This job has no ${opts.workType.replace("_", " ")} cost code.`, { cost_codes: options });
  }

  const last = await env.DB
    .prepare(
      `SELECT cost_code_id FROM (
         SELECT cost_code_id, created_at FROM project_time_entries WHERE project_id = ?1 AND user_id = ?2
         UNION ALL SELECT cost_code_id, created_at FROM stage_time_entries WHERE project_id = ?1 AND user_id = ?2
         UNION ALL SELECT cost_code_id, created_at FROM task_time_entries WHERE project_id = ?1 AND user_id = ?2
       ) WHERE cost_code_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`
    )
    .bind(projectId, userId)
    .first<{ cost_code_id: string }>();
  const lastHit = last && codes.find((c) => c.amc_costcodeid === last.cost_code_id);
  if (lastHit) return codeView(lastHit);

  const fallback = byWorkType(DEFAULT_WORK_TYPE);
  return fallback ? codeView(fallback) : fail("Couldn't pick a cost code for this job — choose one.", { cost_codes: options });
}

/**
 * Pay codes are per employee. The user's saved default, else whatever they
 * last logged with (stable for nearly everyone), else ask an admin to set one.
 */
async function resolvePayCode(env: Bindings, userId: string): Promise<{ id: string; name: string } | ToolFailure> {
  const row = await env.DB
    .prepare(
      `SELECT COALESCE(
         (SELECT default_pay_code_id FROM users WHERE id = ?1),
         (SELECT pay_code_id FROM (
            SELECT pay_code_id, created_at FROM project_time_entries WHERE user_id = ?1
            UNION ALL SELECT pay_code_id, created_at FROM stage_time_entries WHERE user_id = ?1
            UNION ALL SELECT pay_code_id, created_at FROM task_time_entries WHERE user_id = ?1
          ) WHERE pay_code_id IS NOT NULL ORDER BY created_at DESC LIMIT 1)
       ) AS pay_code_id`
    )
    .bind(userId)
    .first<{ pay_code_id: string | null }>();
  if (!row?.pay_code_id) {
    return fail("No pay code on file for you. Ask a CloudConnect admin to set your default pay code (Admin → Users).");
  }
  const code = (await getPayCodes(env)).find((p) => p.amc_paycodeid === row.pay_code_id);
  return { id: row.pay_code_id, name: code?.amc_name ?? row.pay_code_id };
}

// ── Target (project / stage → CE case) ──────────────────────────────────────

type ProjectForTime = { id: string; name: string; crm_case_id: string | null; phase_scoped_visibility: number | null };
type StageForTime = { id: string; name: string; phase_case_id: string | null };

async function resolveStage(db: D1Database, projectId: string, query: string): Promise<StageForTime | ToolFailure> {
  const stages = (await db
    .prepare(
      `SELECT s.id, s.name, ph.crm_case_id AS phase_case_id
         FROM stages s LEFT JOIN phases ph ON ph.id = s.phase_id
        WHERE s.project_id = ? ORDER BY s.sort_order`
    )
    .bind(projectId)
    .all<StageForTime>()).results ?? [];
  const q = query.trim().toLowerCase();
  const exact = stages.filter((s) => s.id === query || s.name.toLowerCase() === q);
  const matches = exact.length > 0 ? exact : stages.filter((s) => s.name.toLowerCase().includes(q));
  if (matches.length === 1) return matches[0];
  return fail(
    matches.length === 0 ? `No stage on this project matches "${query}".` : `"${query}" matches more than one stage.`,
    { stages: (matches.length ? matches : stages).map((s) => ({ id: s.id, name: s.name })) }
  );
}

/**
 * The CE case time goes to. A stage on a phase-scoped project routes to its
 * phase's case when that phase has one (per-campus cases, LACCD-style) — the
 * same rule as GET /:id/time-entry/setup — otherwise the project's case.
 */
function caseFor(project: ProjectForTime, stage: StageForTime | null): string | null {
  if (stage && project.phase_scoped_visibility && stage.phase_case_id) return stage.phase_case_id;
  return project.crm_case_id;
}

// ── Duplicate guard ─────────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Claim =
  | { kind: "claimed"; requestId: string }
  | { kind: "done"; result: Record<string, unknown> }
  | { kind: "in_flight"; since: string };

/** Does a 'done' request's entry still exist with the times it was created with? */
async function entryStillMatches(db: D1Database, entryId: string | null, startIso: string, endIso: string): Promise<boolean> {
  if (!entryId) return false;
  const found = await findEntry(db, entryId);
  return !!found && sameInstant(found.scheduled_start, startIso) && sameInstant(found.scheduled_end, endIso);
}

const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);

/**
 * Claim the request key before calling CE. The INSERT … ON CONFLICT is atomic,
 * so of two concurrent identical calls exactly one gets "claimed".
 */
async function claimRequest(db: D1Database, userId: string, key: string, startIso: string, endIso: string): Promise<Claim> {
  const requestId = crypto.randomUUID();
  const ins = await db
    .prepare(
      `INSERT INTO mcp_time_requests (id, user_id, request_key, status) VALUES (?, ?, ?, 'pending')
       ON CONFLICT(user_id, request_key) DO NOTHING`
    )
    .bind(requestId, userId, key)
    .run();
  if (ins.meta.changes === 1) return { kind: "claimed", requestId };

  const row = await db
    .prepare("SELECT id, status, entry_id, result_json, updated_at FROM mcp_time_requests WHERE user_id = ? AND request_key = ?")
    .bind(userId, key)
    .first<{ id: string; status: string; entry_id: string | null; result_json: string | null; updated_at: string }>();
  if (!row) return claimRequest(db, userId, key, startIso, endIso); // deleted between statements

  if (row.status === "pending") return { kind: "in_flight", since: row.updated_at };
  if (row.status === "done" && (await entryStillMatches(db, row.entry_id, startIso, endIso))) {
    return { kind: "done", result: JSON.parse(row.result_json ?? "{}") };
  }

  // Failed, or done-but-since-deleted/edited: reclaim, guarded on the status we
  // read so a concurrent retry can't reclaim it too.
  const re = await db
    .prepare(
      `UPDATE mcp_time_requests SET status = 'pending', entry_id = NULL, result_json = NULL, error = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = ?`
    )
    .bind(row.id, row.status)
    .run();
  return re.meta.changes === 1 ? { kind: "claimed", requestId: row.id } : { kind: "in_flight", since: row.updated_at };
}

// ── Create ──────────────────────────────────────────────────────────────────

export type CreateInput = {
  project: ProjectForTime;
  stage?: string;
  date: string;
  startTime?: string;
  hours: number;
  description: string;
  workType?: WorkType;
  costCode?: string;
  idempotencyKey?: string;
  allowDuplicate?: boolean;
};

export async function createTimeEntryForUser(env: Bindings, ctx: ExecutionContext, auth: AuthContext, input: CreateInput) {
  const db = env.DB;
  const user = auth.user;
  const { project } = input;

  if (!(await canLogTimeOnProject(db, user, project.id))) return fail("You can't log time on this project.");

  const stage = input.stage ? await resolveStage(db, project.id, input.stage) : null;
  if (isFailure(stage)) return stage;

  const crmCaseId = caseFor(project, stage);
  if (!crmCaseId) return fail("This project has no linked CE case, so time can't be logged to it.");

  const start = pacificToUtc(input.date, input.startTime ?? DEFAULT_START);
  const end = new Date(start.getTime() + Math.round(input.hours * 60) * 60000);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const description = input.description.trim();

  // Same person, same project, same start and end: a duplicate, whether it was
  // logged here, in the UI, or by an earlier retry.
  if (!input.allowDuplicate) {
    const existing = await db
      .prepare(
        `SELECT id FROM (
           SELECT id, user_id, project_id, scheduled_start, scheduled_end FROM project_time_entries
           UNION ALL SELECT id, user_id, project_id, scheduled_start, scheduled_end FROM stage_time_entries
           UNION ALL SELECT id, user_id, project_id, scheduled_start, scheduled_end FROM task_time_entries
         ) WHERE user_id = ? AND project_id = ?
           AND abs(julianday(scheduled_start) - julianday(?)) < 0.0000116
           AND abs(julianday(scheduled_end) - julianday(?)) < 0.0000116
         LIMIT 1`
      )
      .bind(user.id, project.id, startIso, endIso)
      .first<{ id: string }>();
    if (existing) {
      return {
        status: "duplicate",
        message: "You already have an entry on this project at exactly this time, so nothing was logged. " +
          "Set allow_duplicate to log a second one anyway.",
        existing_entry: await describeEntry(db, existing.id),
      };
    }
  }

  const key = input.allowDuplicate
    ? `dup:${crypto.randomUUID()}`
    : input.idempotencyKey
      ? `key:${input.idempotencyKey}`
      : `auto:${await sha256([project.id, stage?.id ?? "", startIso, endIso].join("|"))}`;
  const claim = await claimRequest(db, user.id, key, startIso, endIso);
  if (claim.kind === "done") return { ...claim.result, status: "duplicate", message: "Already logged by an earlier identical request; returning that entry." };
  if (claim.kind === "in_flight") {
    return fail(`An identical request is already being logged (started ${claim.since} UTC). Don't retry — check list_time_entries in a minute.`);
  }

  const markFailed = (message: string) => db
    .prepare("UPDATE mcp_time_requests SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(message, claim.requestId)
    .run();

  let crmTimeEntryId: string;
  let payCode: { id: string; name: string };
  let costCode: { id: string; name: string };
  try {
    const caseAndJob = await resolveCaseForTime(env, crmCaseId);
    const [pay, cost] = await Promise.all([
      resolvePayCode(env, user.id),
      resolveCostCode(env, caseAndJob.jobId, user.id, project.id, { workType: input.workType, costCode: input.costCode }),
    ]);
    if (isFailure(pay) || isFailure(cost)) {
      const f = isFailure(pay) ? pay : (cost as ToolFailure);
      await markFailed(f.error);
      return f;
    }
    payCode = pay;
    costCode = cost;

    // Same CRM subjects as the UI: "{stage} | {note}" / "Project Admin | {note}".
    const subject = `${stage ? stage.name : "Project Admin"} | ${description}`;
    crmTimeEntryId = await pushTimeEntryToCrm(env, {
      subject,
      scheduledStart: startIso,
      scheduledEnd: endIso,
      caseId: caseAndJob.caseId,
      jobId: caseAndJob.jobId,
      payCodeId: payCode.id,
      costCodeId: costCode.id,
      companyId: caseAndJob.accountId,
      ownerEmail: user.email,
    }, "mcp");
  } catch (err) {
    const message = err instanceof HTTPException || err instanceof Error ? err.message : "CE push failed";
    await markFailed(message);
    return fail("The entry was not logged — the push to CE failed.", { ce_push: { succeeded: false, error: message } });
  }

  const entryId = crypto.randomUUID();
  if (stage) {
    await db
      .prepare(
        `INSERT INTO stage_time_entries (id, stage_id, project_id, crm_time_entry_id, scheduled_start, scheduled_end, pay_code_id, cost_code_id, note, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(entryId, stage.id, project.id, crmTimeEntryId, startIso, endIso, payCode.id, costCode.id, description, user.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO project_time_entries (id, project_id, crm_time_entry_id, scheduled_start, scheduled_end, pay_code_id, cost_code_id, note, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(entryId, project.id, crmTimeEntryId, startIso, endIso, payCode.id, costCode.id, description, user.id)
      .run();
  }

  const result = {
    status: "created",
    entry_id: entryId,
    logged_at: new Date().toISOString(),
    ce_push: { succeeded: true, ce_time_entry_id: crmTimeEntryId },
    project: project.name,
    level: stage ? "stage" : "project",
    stage: stage?.name ?? null,
    date: input.date,
    start_time_pacific: utcToPacific(startIso).time,
    end_time_pacific: utcToPacific(endIso).time,
    hours: Math.round(input.hours * 100) / 100,
    description,
    pay_code: payCode.name,
    cost_code: costCode.name,
  };
  await db
    .prepare(
      `UPDATE mcp_time_requests SET status = 'done', entry_id = ?, result_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    )
    .bind(entryId, JSON.stringify(result), claim.requestId)
    .run();

  audit(env, ctx, auth, entryId, "mcp_time_create");
  return result;
}

// ── Find / edit / delete ────────────────────────────────────────────────────

type FoundEntry = {
  table: "project_time_entries" | "stage_time_entries" | "task_time_entries";
  id: string;
  project_id: string;
  user_id: string | null;
  crm_time_entry_id: string | null;
  scheduled_start: string;
  scheduled_end: string;
  note: string | null;
  label: string | null;
  cost_code_id: string | null;
};

async function findEntry(db: D1Database, entryId: string): Promise<FoundEntry | null> {
  return db
    .prepare(
      `SELECT * FROM (
         SELECT 'project_time_entries' AS "table", id, project_id, user_id, crm_time_entry_id, scheduled_start, scheduled_end, note, NULL AS label, cost_code_id
           FROM project_time_entries
         UNION ALL
         SELECT 'stage_time_entries', e.id, e.project_id, e.user_id, e.crm_time_entry_id, e.scheduled_start, e.scheduled_end, e.note, s.name, e.cost_code_id
           FROM stage_time_entries e LEFT JOIN stages s ON s.id = e.stage_id
         UNION ALL
         SELECT 'task_time_entries', e.id, e.project_id, e.user_id, e.crm_time_entry_id, e.scheduled_start, e.scheduled_end, NULL, t.title, e.cost_code_id
           FROM task_time_entries e LEFT JOIN tasks t ON t.id = e.task_id
       ) WHERE id = ? LIMIT 1`
    )
    .bind(entryId)
    .first<FoundEntry>();
}

async function describeEntry(db: D1Database, entryId: string) {
  const e = await findEntry(db, entryId);
  if (!e) return null;
  const start = utcToPacific(e.scheduled_start);
  return {
    entry_id: e.id,
    date: start.date,
    start_time_pacific: start.time,
    end_time_pacific: utcToPacific(e.scheduled_end).time,
    hours: Math.round(((Date.parse(e.scheduled_end) - Date.parse(e.scheduled_start)) / 3600000) * 100) / 100,
    description: e.note ?? e.label,
    ce_time_entry_id: e.crm_time_entry_id,
  };
}

/** Edits and deletes are limited to the caller's own entries, as the request asked. */
async function findOwnEntry(db: D1Database, userId: string, entryId: string): Promise<FoundEntry | ToolFailure> {
  const entry = await findEntry(db, entryId);
  if (!entry) return fail(`No time entry with id ${entryId}.`);
  if (entry.user_id !== userId) return fail("That entry was logged by someone else — you can only change your own.");
  return entry;
}

export type UpdateInput = {
  entryId: string;
  date?: string;
  startTime?: string;
  hours?: number;
  description?: string;
  workType?: WorkType;
  costCode?: string;
};

export async function updateTimeEntryForUser(env: Bindings, ctx: ExecutionContext, auth: AuthContext, input: UpdateInput) {
  const db = env.DB;
  const entry = await findOwnEntry(db, auth.user.id, input.entryId);
  if (isFailure(entry)) return entry;
  if (!entry.crm_time_entry_id) return fail("This entry never reached CE, so it can't be edited here.");
  if (input.description !== undefined && entry.table === "task_time_entries") {
    return fail("Task-level entries take their CE subject from the task title, so their description can't be edited.");
  }

  // Unchanged parts keep their current values, read in Pacific.
  const curStart = utcToPacific(entry.scheduled_start);
  const curHours = (Date.parse(entry.scheduled_end) - Date.parse(entry.scheduled_start)) / 3600000;
  const start = pacificToUtc(input.date ?? curStart.date, input.startTime ?? curStart.time);
  const end = new Date(start.getTime() + Math.round((input.hours ?? curHours) * 60) * 60000);
  const timesChanged = !sameInstant(start.toISOString(), entry.scheduled_start) || !sameInstant(end.toISOString(), entry.scheduled_end);

  let costCode: { id: string; name: string } | undefined;
  if (input.workType || input.costCode) {
    // Cost codes hang off the job of the case this entry was routed to: the
    // stage's phase case on a phase-scoped project, else the project's case.
    const target = await db
      .prepare(
        `SELECT p.id, p.name, p.crm_case_id, p.phase_scoped_visibility, ph.crm_case_id AS phase_case_id
           FROM projects p
           LEFT JOIN stage_time_entries se ON se.id = ?2
           LEFT JOIN stages s ON s.id = se.stage_id
           LEFT JOIN phases ph ON ph.id = s.phase_id
          WHERE p.id = ?1`
      )
      .bind(entry.project_id, entry.id)
      .first<ProjectForTime & { phase_case_id: string | null }>();
    const caseId = target
      ? caseFor(target, target.phase_case_id ? { id: "", name: "", phase_case_id: target.phase_case_id } : null)
      : null;
    if (!caseId) return fail("This project has no linked CE case.");
    try {
      const { jobId } = await resolveCaseForTime(env, caseId);
      const cost = await resolveCostCode(env, jobId, auth.user.id, entry.project_id, { workType: input.workType, costCode: input.costCode });
      if (isFailure(cost)) return cost;
      costCode = cost;
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Couldn't resolve the project's CE job.");
    }
  }

  const description = input.description?.trim();
  const subjectPrefix = entry.table === "stage_time_entries" ? entry.label ?? "Stage" : "Project Admin";
  try {
    await updateTimeEntry(env, entry.crm_time_entry_id, {
      subject: description !== undefined ? `${subjectPrefix} | ${description}` : undefined,
      scheduledStart: timesChanged ? start.toISOString() : undefined,
      scheduledEnd: timesChanged ? end.toISOString() : undefined,
      costCodeId: costCode?.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "CE update failed";
    return fail("Nothing was changed — the update to CE failed.", { ce_push: { succeeded: false, error: message } });
  }

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (timesChanged) { sets.push("scheduled_start = ?", "scheduled_end = ?"); binds.push(start.toISOString(), end.toISOString()); }
  if (costCode) { sets.push("cost_code_id = ?"); binds.push(costCode.id); }
  if (description !== undefined) { sets.push("note = ?"); binds.push(description); }
  if (sets.length > 0) {
    await db.prepare(`UPDATE ${entry.table} SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, entry.id).run();
  }

  audit(env, ctx, auth, entry.id, "mcp_time_update");
  return {
    status: "updated",
    updated_at: new Date().toISOString(),
    ce_push: { succeeded: true, ce_time_entry_id: entry.crm_time_entry_id },
    entry: await describeEntry(db, entry.id),
    ...(costCode ? { cost_code: costCode.name } : {}),
  };
}

export async function deleteTimeEntryForUser(env: Bindings, ctx: ExecutionContext, auth: AuthContext, entryId: string) {
  const db = env.DB;
  const entry = await findOwnEntry(db, auth.user.id, entryId);
  if (isFailure(entry)) return entry;
  const before = await describeEntry(db, entry.id);

  try {
    await removeTimeEntryFromCrm(env, entry.crm_time_entry_id, "mcp");
  } catch (err) {
    const message = err instanceof Error ? err.message : "CE delete failed";
    return fail("Nothing was deleted — removing it from CE failed.", { ce_push: { succeeded: false, error: message } });
  }
  await db.prepare(`DELETE FROM ${entry.table} WHERE id = ?`).bind(entry.id).run();

  audit(env, ctx, auth, entry.id, "mcp_time_delete");
  return {
    status: "deleted",
    deleted_at: new Date().toISOString(),
    ce_push: { succeeded: true, ce_time_entry_id: entry.crm_time_entry_id },
    deleted_entry: before,
  };
}

function audit(env: Bindings, ctx: ExecutionContext, auth: AuthContext, entryId: string, action: string) {
  ctx.waitUntil(writeAuditLog(env.DB, {
    entityType: "time_entry",
    entityId: entryId,
    action,
    method: "MCP",
    path: "/mcp",
    status: 200,
    actor: { id: auth.user.id, name: auth.user.name, email: auth.user.email },
  }));
}

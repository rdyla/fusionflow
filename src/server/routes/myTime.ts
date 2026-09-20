import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { getCalendarEvents, CalendarAccessError } from "../services/graphService";
import { getUserRecordingsInRange } from "../services/zoomService";
import { inferStage, type StageForInference } from "../lib/stageInference";
import {
  buildSuggestions,
  type CandidateMeeting,
  type ProjectForMatch,
} from "../lib/timeSuggestions";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * "What did I do last week?" — suggested time entries for the signed-in user.
 *
 * Reads Zoom recordings and the Outlook calendar for a window, matches meetings
 * to the user's own active projects, and returns SUGGESTIONS.
 *
 * Nothing here writes time. Confirming a suggestion is a separate call to
 * POST /projects/:id/time-entries, which creates the Dynamics amc_timeentry and
 * closes it for payroll — so a bad match would be a billable record against SOW
 * hours, not a dismissible hint. The human stays in the loop by construction.
 *
 * Gated on users.is_time_assist: a personal convenience, off for everyone else.
 */
app.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (!auth?.user) throw new HTTPException(401, { message: "Unauthorized" });
  const row = await c.env.DB
    .prepare("SELECT is_time_assist FROM users WHERE id = ? LIMIT 1")
    .bind(auth.user.id)
    .first<{ is_time_assist: number }>();
  if (!row || row.is_time_assist !== 1) throw new HTTPException(403, { message: "Forbidden" });
  await next();
});

/** Default window: the previous 7 days, which is the "I can never remember what
 *  I did last week" case this exists for. */
function defaultWindow(): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now.getTime());
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

// GET /api/my-time/suggestions?from=<iso>&to=<iso>
app.get("/suggestions", async (c) => {
  const auth = c.get("auth")!;
  const db = c.env.DB;

  const win = defaultWindow();
  const fromIso = c.req.query("from") || win.from;
  const toIso = c.req.query("to") || win.to;
  if (Number.isNaN(Date.parse(fromIso)) || Number.isNaN(Date.parse(toIso))) {
    throw new HTTPException(400, { message: "from and to must be ISO timestamps" });
  }

  // Only the user's OWN active projects, and only ones that can actually take a
  // time entry: the write path needs a linked CRM case to resolve case + job.
  const projectRows = await db
    .prepare(
      `SELECT p.id, p.name, p.crm_case_id, p.zoom_email_alias,
              COALESCE(c.name, p.customer_name) AS customer_name
         FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
        WHERE (p.pm_user_id = ?
               OR p.id IN (SELECT project_id FROM project_staff WHERE user_id = ?))
          AND p.closed_at IS NULL
          AND COALESCE(p.archived, 0) = 0
          AND p.status != 'complete'
          AND p.crm_case_id IS NOT NULL AND TRIM(p.crm_case_id) <> ''`
    )
    .bind(auth.user.id, auth.user.id)
    .all<{ id: string; name: string; crm_case_id: string | null; zoom_email_alias: string | null; customer_name: string | null }>();

  // Zoom user id, so the recordings lookup can hit the user directly. Without
  // it getUserRecordingsInRange falls back to listing every Zoom user in the
  // org and matching by email — fine for one person, needlessly expensive once
  // a whole implementation team is calling this.
  const me = await db
    .prepare("SELECT zoom_user_id FROM users WHERE id = ? LIMIT 1")
    .bind(auth.user.id)
    .first<{ zoom_user_id: string | null }>();

  const projectIds = (projectRows.results ?? []).map((p) => p.id);
  if (projectIds.length === 0) {
    return c.json({ suggestions: [], sources: { zoom: "ok", outlook: "ok" }, projectCount: 0 });
  }

  const ph = projectIds.map(() => "?").join(",");
  const [contactRows, entryRows, dismissRows, stageRows] = await Promise.all([
    db.prepare(`SELECT project_id, email FROM project_contacts WHERE project_id IN (${ph}) AND email IS NOT NULL AND TRIM(email) <> ''`)
      .bind(...projectIds).all<{ project_id: string; email: string }>(),
    // Already-logged check, across ALL THREE time tables and scoped to THIS user.
    //
    // Both details matter once more than one person uses this. Time can be
    // logged against a task, a stage, or the project, so reading only
    // project_time_entries would re-suggest a meeting someone already logged
    // against a task. And two people attend the same call — without the
    // user_id filter, whoever logs first would suppress everyone else's
    // suggestion for a meeting they also attended and still need to log.
    //
    // scheduled_start/end are nullable on the task and stage tables, so rows
    // without a window are excluded — they can't overlap anything.
    db.prepare(
      `SELECT project_id, scheduled_start, scheduled_end FROM project_time_entries
        WHERE project_id IN (${ph}) AND user_id = ?
          AND scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL
       UNION ALL
       SELECT project_id, scheduled_start, scheduled_end FROM stage_time_entries
        WHERE project_id IN (${ph}) AND user_id = ?
          AND scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL
       UNION ALL
       SELECT project_id, scheduled_start, scheduled_end FROM task_time_entries
        WHERE project_id IN (${ph}) AND user_id = ?
          AND scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL`
    )
      .bind(...projectIds, auth.user.id, ...projectIds, auth.user.id, ...projectIds, auth.user.id)
      .all<{ project_id: string; scheduled_start: string; scheduled_end: string }>(),
    db.prepare("SELECT source, source_event_id FROM time_entry_suggestion_dismissals WHERE user_id = ?")
      .bind(auth.user.id).all<{ source: string; source_event_id: string }>(),
    // Stages power the inferred stage on each suggestion, and the dropdown the
    // user corrects it with.
    db.prepare(`SELECT id, project_id, name, status, sort_order FROM stages WHERE project_id IN (${ph}) ORDER BY project_id, sort_order`)
      .bind(...projectIds).all<{ id: string; project_id: string; name: string; status: string | null; sort_order: number | null }>(),
  ]);

  const contactsByProject = new Map<string, string[]>();
  for (const r of contactRows.results ?? []) {
    const list = contactsByProject.get(r.project_id) ?? [];
    list.push(r.email.toLowerCase());
    contactsByProject.set(r.project_id, list);
  }

  const projects: ProjectForMatch[] = (projectRows.results ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    customerName: p.customer_name,
    crmCaseId: p.crm_case_id,
    // The CAS-xxxxx ticket number isn't stored locally — only the case GUID is.
    // People type the ticket number in meeting titles, so this is a known gap;
    // matching falls back to project/customer name and attendees.
    crmTicketNumber: null,
    zoomEmailAlias: p.zoom_email_alias,
    contactEmails: contactsByProject.get(p.id) ?? [],
  }));

  // Both sources are best-effort and independent: Zoom failing shouldn't cost
  // the Outlook suggestions, and Calendars.Read not being granted yet shouldn't
  // make the whole feature unusable.
  const sources: { zoom: string; outlook: string } = { zoom: "ok", outlook: "ok" };
  const candidates: CandidateMeeting[] = [];

  const zoomFrom = fromIso.slice(0, 10);
  const zoomTo = toIso.slice(0, 10);
  try {
    const meetings = await getUserRecordingsInRange(
      c.env.KV, c.env,
      { zoom_user_id: me?.zoom_user_id ?? null, email: auth.user.email },
      zoomFrom, zoomTo
    );
    for (const m of meetings) {
      const start = new Date(m.start_time);
      const end = new Date(start.getTime() + (Number(m.duration) || 0) * 60000);
      candidates.push({
        source: "zoom",
        eventId: String(m.uuid || m.id),
        subject: m.topic ?? "",
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        attendeeEmails: m.host_email ? [m.host_email.toLowerCase()] : [],
      });
    }
  } catch (err) {
    sources.zoom = err instanceof Error ? err.message : "Zoom lookup failed";
  }

  try {
    const events = await getCalendarEvents(c.env, auth.user.email, fromIso, toIso);
    for (const e of events) {
      candidates.push({
        source: "outlook",
        eventId: e.id,
        subject: e.subject,
        startIso: e.start,
        endIso: e.end,
        attendeeEmails: [...e.attendeeEmails, ...(e.organizerEmail ? [e.organizerEmail] : [])],
      });
    }
  } catch (err) {
    sources.outlook = err instanceof CalendarAccessError
      ? err.message
      : err instanceof Error ? err.message : "Calendar lookup failed";
  }

  const suggestions = buildSuggestions({
    candidates,
    projects,
    existingEntries: (entryRows.results ?? []).map((e) => ({
      projectId: e.project_id,
      startIso: e.scheduled_start,
      endIso: e.scheduled_end,
    })),
    dismissedKeys: new Set((dismissRows.results ?? []).map((d) => `${d.source}:${d.source_event_id}`)),
  });

  const stagesByProject = new Map<string, StageForInference[]>();
  for (const r of stageRows.results ?? []) {
    const list = stagesByProject.get(r.project_id) ?? [];
    list.push({ id: r.id, name: r.name, status: r.status, sortOrder: r.sort_order ?? 0 });
    stagesByProject.set(r.project_id, list);
  }

  // Attach an inferred stage to each suggestion. It's a pre-filled default the
  // user can change — the UI renders it as a dropdown, and a suggestion with no
  // stage falls back to a project-level ("Project Admin") entry.
  const withStage = suggestions.map((s) => {
    const inferred = inferStage(s.subject, stagesByProject.get(s.projectId) ?? []);
    return {
      ...s,
      inferredStageId: inferred.stageId,
      inferredStageName: inferred.stageName,
      stageReason: inferred.reason,
      stageConfidence: inferred.confidence,
    };
  });

  return c.json({
    suggestions: withStage,
    // Only the fields the picker needs, keyed by project.
    stagesByProject: Object.fromEntries(
      [...stagesByProject].map(([pid, list]) => [pid, list.map((x) => ({ id: x.id, name: x.name, status: x.status }))])
    ),
    sources,
    projectCount: projects.length,
    window: { from: fromIso, to: toIso },
  });
});

// POST /api/my-time/suggestions/dismiss  { source, source_event_id }
app.post("/suggestions/dismiss", async (c) => {
  const auth = c.get("auth")!;
  let body: { source?: string; source_event_id?: string };
  try { body = await c.req.json(); } catch { throw new HTTPException(400, { message: "JSON body required" }); }

  const source = (body.source ?? "").trim();
  const eventId = (body.source_event_id ?? "").trim();
  if (source !== "zoom" && source !== "outlook") throw new HTTPException(400, { message: "source must be zoom or outlook" });
  if (!eventId) throw new HTTPException(400, { message: "source_event_id required" });

  // Idempotent: dismissing twice is a no-op rather than a duplicate-key error.
  await c.env.DB
    .prepare(
      `INSERT INTO time_entry_suggestion_dismissals (id, user_id, source, source_event_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, source, source_event_id) DO NOTHING`
    )
    .bind(crypto.randomUUID(), auth.user.id, source, eventId)
    .run();

  return c.json({ ok: true });
});

export default app;

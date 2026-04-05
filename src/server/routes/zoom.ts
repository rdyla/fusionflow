import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { saveCreds, deleteCreds, getCredsConfigured, getZoomStatus, getZoomRecordings, matchRecordingsToPhases } from "../services/zoomService";
import { canEditProject, canViewProject } from "../services/accessService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const RECORDING_SELECT = `
  SELECT zr.*, ph.name AS phase_name, t.title AS task_name
  FROM zoom_recordings zr
  LEFT JOIN phases ph ON ph.id = zr.phase_id
  LEFT JOIN tasks t ON t.id = zr.task_id
`;

const credsSchema = z.object({
  account_id: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});

// GET /api/projects/:projectId/zoom/configured
app.get("/:projectId/zoom/configured", async (c) => {
  const projectId = c.req.param("projectId");
  const configured = await getCredsConfigured(c.env.KV, projectId);
  return c.json({ configured });
});

// PUT /api/projects/:projectId/zoom/credentials
app.put("/:projectId/zoom/credentials", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const parsed = credsSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid credentials payload" });
  await saveCreds(c.env.KV, projectId, parsed.data);
  return c.json({ ok: true });
});

// DELETE /api/projects/:projectId/zoom/credentials
app.delete("/:projectId/zoom/credentials", async (c) => {
  const projectId = c.req.param("projectId");
  await deleteCreds(c.env.KV, projectId);
  return c.json({ ok: true });
});

// GET /api/projects/:projectId/zoom/status
app.get("/:projectId/zoom/status", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const status = await getZoomStatus(c.env.KV, projectId);
    if (!status) return c.json({ configured: false });
    return c.json({ configured: true, ...status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Zoom API error";
    console.error("Zoom status fetch error:", message);
    return c.json({ configured: true, error: message });
  }
});

// ── Recordings ────────────────────────────────────────────────────────────────

app.get("/:projectId/zoom/recordings", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const allowed = await canViewProject(c.env.DB, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await c.env.DB
    .prepare(`${RECORDING_SELECT} WHERE zr.project_id = ? ORDER BY zr.start_time DESC`)
    .bind(projectId)
    .all<Record<string, unknown>>();

  return c.json((rows.results ?? []).map((r) => ({
    ...r,
    recording_files: JSON.parse((r.recording_files as string) || "[]"),
  })));
});

app.post("/:projectId/zoom/recordings/sync", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const allowed = await canEditProject(c.env.DB, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const project = await c.env.DB
    .prepare("SELECT crm_case_id, pm_user_id, customer_name FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ crm_case_id: string | null; pm_user_id: string | null; customer_name: string | null }>();

  // Look up PM's Zoom user ID and email if a PM is assigned
  let pmInfo: { zoom_user_id: string | null; email: string | null } | null = null;
  if (project?.pm_user_id) {
    pmInfo = await c.env.DB
      .prepare("SELECT zoom_user_id, email FROM users WHERE id = ? LIMIT 1")
      .bind(project.pm_user_id)
      .first<{ zoom_user_id: string | null; email: string | null }>() ?? null;
  }

  const [phasesResult, linkedResult, alreadyLinked] = await Promise.all([
    c.env.DB
      .prepare("SELECT id, name, planned_start, planned_end FROM phases WHERE project_id = ? ORDER BY sort_order ASC")
      .bind(projectId)
      .all<{ id: string; name: string; planned_start: string | null; planned_end: string | null }>(),
    c.env.DB
      .prepare("SELECT meeting_id FROM zoom_recordings WHERE project_id = ?")
      .bind(projectId)
      .all<{ meeting_id: string }>(),
    c.env.DB
      .prepare(`${RECORDING_SELECT} WHERE zr.project_id = ? ORDER BY zr.start_time DESC`)
      .bind(projectId)
      .all<Record<string, unknown>>(),
  ]);

  const phases = phasesResult.results ?? [];
  const linkedMeetingIds = new Set((linkedResult.results ?? []).map((r) => r.meeting_id));

  let meetings;
  try {
    meetings = await getZoomRecordings(c.env.KV, projectId, c.env, pmInfo ?? undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zoom API error";
    console.error("Zoom recordings sync error:", message);
    throw new HTTPException(502, { message });
  }

  const newMeetings = meetings.filter((m) => !linkedMeetingIds.has(String(m.id)));
  const hasPm = pmInfo !== null;
  const matches = matchRecordingsToPhases(newMeetings, phases, project?.crm_case_id ?? null, project?.customer_name ?? null, hasPm);

  const suggestions = matches
    .filter((m) => (m.meeting.recording_files ?? []).length > 0)
    .map((m) => {
      const phaseId = m.phase_id;
      const phaseName = phaseId ? (phases.find((p) => p.id === phaseId)?.name ?? null) : null;
      return {
        meeting_id: String(m.meeting.id),
        topic: m.meeting.topic,
        start_time: m.meeting.start_time,
        duration_mins: m.meeting.duration,
        host_email: m.meeting.host_email ?? null,
        recording_files: m.meeting.recording_files ?? [],
        suggested_phase_id: phaseId,
        suggested_phase_name: phaseName,
        match_reason: m.match_reason,
      };
    });

  return c.json({
    suggestions,
    already_linked: (alreadyLinked.results ?? []).map((r) => ({
      ...r,
      recording_files: JSON.parse((r.recording_files as string) || "[]"),
    })),
  });
});

const confirmSchema = z.object({
  confirmations: z.array(z.object({
    meeting_id: z.string(),
    phase_id: z.string().nullable(),
    task_id: z.string().nullable().optional(),
    topic: z.string(),
    start_time: z.string(),
    duration_mins: z.number().int(),
    host_email: z.string().nullable().optional(),
    recording_files: z.array(z.unknown()),
    match_reason: z.string().nullable().optional(),
  })),
});

app.post("/:projectId/zoom/recordings/confirm", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const allowed = await canEditProject(c.env.DB, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const body = await c.req.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

  const inserted: Record<string, unknown>[] = [];
  for (const conf of parsed.data.confirmations) {
    const id = crypto.randomUUID();
    await c.env.DB
      .prepare(`
        INSERT INTO zoom_recordings (id, project_id, phase_id, task_id, meeting_id, topic, start_time, duration_mins, host_email, recording_files, match_reason, manually_assigned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT (project_id, meeting_id) DO UPDATE SET
          phase_id = excluded.phase_id,
          task_id = excluded.task_id,
          match_reason = excluded.match_reason,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(id, projectId, conf.phase_id ?? null, conf.task_id ?? null, conf.meeting_id, conf.topic, conf.start_time, conf.duration_mins, conf.host_email ?? null, JSON.stringify(conf.recording_files), conf.match_reason ?? null)
      .run();

    const row = await c.env.DB
      .prepare(`${RECORDING_SELECT} WHERE zr.project_id = ? AND zr.meeting_id = ? LIMIT 1`)
      .bind(projectId, conf.meeting_id)
      .first<Record<string, unknown>>();

    if (row) inserted.push({ ...row, recording_files: JSON.parse((row.recording_files as string) || "[]") });
  }

  return c.json(inserted);
});

app.patch("/:projectId/zoom/recordings/:recordingId", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const recordingId = c.req.param("recordingId");
  const allowed = await canEditProject(c.env.DB, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const { phase_id, task_id } = await c.req.json() as { phase_id: string | null; task_id?: string | null };

  await c.env.DB
    .prepare("UPDATE zoom_recordings SET phase_id = ?, task_id = ?, manually_assigned = 1, match_reason = 'manual', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?")
    .bind(phase_id ?? null, task_id ?? null, recordingId, projectId)
    .run();

  const row = await c.env.DB
    .prepare(`${RECORDING_SELECT} WHERE zr.id = ? LIMIT 1`)
    .bind(recordingId)
    .first<Record<string, unknown>>();

  if (!row) throw new HTTPException(404, { message: "Recording not found" });
  return c.json({ ...row, recording_files: JSON.parse((row.recording_files as string) || "[]") });
});

app.delete("/:projectId/zoom/recordings/:recordingId", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const recordingId = c.req.param("recordingId");
  const allowed = await canEditProject(c.env.DB, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  await c.env.DB
    .prepare("DELETE FROM zoom_recordings WHERE id = ? AND project_id = ?")
    .bind(recordingId, projectId)
    .run();

  return c.json({ ok: true });
});

export default app;

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canViewProject } from "../services/accessService";
import { maybeSendEmail } from "../services/emailService";
import { pmNoteAdded, partnerNotePosted } from "../lib/emailTemplates";
import { createNotification } from "../lib/notifications";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/:id/notes", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  let sql = `
    SELECT n.id, n.project_id, n.author_user_id, n.body, n.visibility, n.created_at,
           COALESCE(u.name, n.author_name) AS author_name,
           COALESCE(u.organization_name, n.author_org) AS author_org
    FROM notes n
    LEFT JOIN users u ON u.id = n.author_user_id
    WHERE n.project_id = ?
  `;

  if (auth.role === "partner_ae") {
    sql += ` AND n.visibility IN ('partner', 'public')`;
  } else if (auth.role === "client") {
    sql += ` AND n.visibility = 'public'`;
  }

  sql += ` ORDER BY n.created_at DESC`;

  const rows = await db.prepare(sql).bind(projectId).all();
  return c.json(rows.results ?? []);
});

const createNoteSchema = z.object({
  body: z.string().min(1, "Note body is required").max(5000),
  visibility: z.enum(["internal", "partner", "public"]).default("internal"),
});

app.post("/:id/notes", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  // Anyone who can view the project can post a comment
  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rawBody = await c.req.json();
  const parsed = createNoteSchema.safeParse(rawBody);
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { body } = parsed.data;
  // Partner AEs can only post partner-visible comments; clients can only post
  // public-visible comments. Enforce server-side regardless of payload.
  const visibility = auth.role === "partner_ae" ? "partner"
    : auth.role === "client" ? "public"
    : parsed.data.visibility;

  // Clients are synthetic AppUsers (built from a Dynamics portal contact) with
  // no row in the users table, so author_user_id must be NULL for them — a real
  // id would violate the FK. Denormalize their name/org onto the note instead.
  const authorUserId = auth.role === "client" ? null : auth.user.id;

  const noteId = crypto.randomUUID();
  await db
    .prepare("INSERT INTO notes (id, project_id, author_user_id, body, visibility, author_name, author_org) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(noteId, projectId, authorUserId, body, visibility, auth.user.name ?? null, auth.user.organization_name ?? null)
    .run();

  const created = await db
    .prepare(`
      SELECT n.id, n.project_id, n.author_user_id, n.body, n.visibility, n.created_at,
             COALESCE(u.name, n.author_name) AS author_name,
             COALESCE(u.organization_name, n.author_org) AS author_org
      FROM notes n LEFT JOIN users u ON u.id = n.author_user_id
      WHERE n.id = ? LIMIT 1
    `)
    .bind(noteId)
    .first();

  // Notify PM of new comment (skip if PM wrote it)
  const project = await db
    .prepare("SELECT name, pm_user_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ name: string; pm_user_id: string | null }>();

  const appUrl = c.env.APP_URL ?? "";

  // Notify PM of new note (skip if PM wrote it)
  if (project?.pm_user_id && project.pm_user_id !== auth.user.id) {
    const pm = await db
      .prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1")
      .bind(project.pm_user_id)
      .first<{ email: string; name: string }>();
    if (pm) {
      c.executionCtx.waitUntil(maybeSendEmail(c.env, db, project.pm_user_id, "routine", {
        to: pm.email,
        subject: `New note on ${project.name}`,
        html: pmNoteAdded({ pmName: pm.name ?? pm.email, authorName: auth.user.name ?? auth.user.email, projectName: project.name, noteBody: body, visibility, appUrl, projectId }),
      }));
      c.executionCtx.waitUntil(createNotification(db, {
        recipientUserId: project.pm_user_id,
        type: "note_added",
        title: `New note on ${project.name}`,
        body: body.slice(0, 120) + (body.length > 120 ? "…" : ""),
        entityType: "note",
        entityId: noteId,
        projectId,
        senderUserId: authorUserId,
      }));
    }
  }

  // Notify partner AEs when a partner- or public-visible note is posted by PF team
  if ((visibility === "partner" || visibility === "public") && auth.role !== "partner_ae") {
    const partnerAes = await db
      .prepare(
        `SELECT u.id, u.email, u.name FROM project_staff ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.project_id = ? AND ps.staff_role = 'partner_ae' AND u.is_active = 1
           AND u.id != ?`
      )
      .bind(projectId, auth.user.id)
      .all<{ id: string; email: string; name: string }>();

    const authorName = auth.user.name ?? auth.user.email;
    for (const ae of partnerAes.results ?? []) {
      c.executionCtx.waitUntil(maybeSendEmail(c.env, db, ae.id, "important", {
        to: ae.email,
        subject: `New comment on ${project!.name}`,
        html: partnerNotePosted({
          recipientName: ae.name ?? ae.email,
          authorName,
          projectName: project!.name,
          noteBody: body,
          appUrl,
          projectId,
        }),
      }));
      c.executionCtx.waitUntil(createNotification(db, {
        recipientUserId: ae.id,
        type: "note_added",
        title: `New comment on ${project!.name}`,
        body: body.slice(0, 120) + (body.length > 120 ? "…" : ""),
        entityType: "note",
        entityId: noteId,
        projectId,
        senderUserId: authorUserId,
      }));
    }
  }

  return c.json(created, 201);
});

export default app;
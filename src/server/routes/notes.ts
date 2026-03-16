import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canEditProject, canViewProject } from "../services/accessService";
import { sendEmail } from "../services/emailService";
import { pmNoteAdded } from "../lib/emailTemplates";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/:id/notes", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  let sql = `
    SELECT id, project_id, author_user_id, body, visibility, created_at
    FROM notes
    WHERE project_id = ?
  `;

  if (auth.role === "partner_ae") {
    sql += ` AND visibility IN ('partner', 'public')`;
  }

  sql += ` ORDER BY created_at DESC`;

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

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const rawBody = await c.req.json();
  const parsed = createNoteSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { body, visibility } = parsed.data;
  const noteId = crypto.randomUUID();

  await db
    .prepare(
      `
      INSERT INTO notes (id, project_id, author_user_id, body, visibility)
      VALUES (?, ?, ?, ?, ?)
      `
    )
    .bind(noteId, projectId, auth.user.id, body, visibility)
    .run();

  const created = await db
    .prepare(
      `
      SELECT id, project_id, author_user_id, body, visibility, created_at
      FROM notes
      WHERE id = ?
      LIMIT 1
      `
    )
    .bind(noteId)
    .first();

  // Notify PM of new note (skip if PM wrote it)
  const project = await db.prepare("SELECT name, pm_user_id FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ name: string; pm_user_id: string | null }>();
  if (project?.pm_user_id && project.pm_user_id !== auth.user.id) {
    const pm = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(project.pm_user_id).first<{ email: string; name: string }>();
    if (pm) {
      const appUrl = c.env.APP_URL ?? "";
      c.executionCtx.waitUntil(sendEmail(c.env, {
        to: pm.email,
        subject: `New note on ${project.name}`,
        html: pmNoteAdded({ pmName: pm.name ?? pm.email, authorName: auth.user.name ?? auth.user.email, projectName: project.name, noteBody: body, visibility, appUrl, projectId }),
      }));
    }
  }

  return c.json(created, 201);
});

export default app;
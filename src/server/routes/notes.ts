import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canEditProject, canViewProject } from "../services/accessService";

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

  return c.json(created, 201);
});

export default app;
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { canViewProject } from "../services/accessService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/:id/risks", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const rows = await db
    .prepare(
      `
      SELECT id, project_id, title, description, severity, status, owner_user_id
      FROM risks
      WHERE project_id = ?
      ORDER BY title ASC
      `
    )
    .bind(projectId)
    .all();

  return c.json(rows.results ?? []);
});

export default app;
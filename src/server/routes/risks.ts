import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canViewProject, canEditProject } from "../services/accessService";
import { sendEmail } from "../services/emailService";
import { highRiskAdded } from "../lib/emailTemplates";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/:id/risks", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db
    .prepare(
      `SELECT id, project_id, title, description, severity, status, owner_user_id
       FROM risks
       WHERE project_id = ?
       ORDER BY title ASC`
    )
    .bind(projectId)
    .all();

  return c.json(rows.results ?? []);
});

const riskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["open", "mitigated", "closed"]).optional(),
  owner_user_id: z.string().nullable().optional(),
});

app.post("/:id/risks", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = riskSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { title, description, severity, status, owner_user_id } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO risks (id, project_id, title, description, severity, status, owner_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, projectId, title, description ?? null, severity ?? "medium", status ?? "open", owner_user_id ?? null)
    .run();

  const created = await db.prepare("SELECT * FROM risks WHERE id = ? LIMIT 1").bind(id).first<{ id: string; title: string; description: string | null; severity: string | null }>();

  // Notify PM on high severity risks
  if (created?.severity === "high") {
    const project = await db.prepare("SELECT name, pm_user_id FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ name: string; pm_user_id: string | null }>();
    if (project?.pm_user_id) {
      const pm = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(project.pm_user_id).first<{ email: string; name: string }>();
      if (pm) {
        const appUrl = c.env.APP_URL ?? "";
        c.executionCtx.waitUntil(sendEmail(c.env, {
          to: pm.email,
          subject: `High severity risk logged: ${created.title}`,
          html: highRiskAdded({ pmName: pm.name ?? pm.email, riskTitle: created.title, riskDescription: created.description, projectName: project.name, appUrl, projectId }),
        }));
      }
    }
  }

  return c.json(created, 201);
});

const updateRiskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["open", "mitigated", "closed"]).optional(),
  owner_user_id: z.string().nullable().optional(),
});

app.patch("/:id/risks/:riskId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const riskId = c.req.param("riskId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = updateRiskSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const existing = await db.prepare("SELECT id FROM risks WHERE id = ? AND project_id = ? LIMIT 1").bind(riskId, projectId).first();
  if (!existing) throw new HTTPException(404, { message: "Risk not found" });

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

  await db
    .prepare(`UPDATE risks SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, riskId)
    .run();

  const updated = await db.prepare("SELECT * FROM risks WHERE id = ? LIMIT 1").bind(riskId).first();
  return c.json(updated);
});

app.delete("/:id/risks/:riskId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const riskId = c.req.param("riskId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const existing = await db.prepare("SELECT id FROM risks WHERE id = ? AND project_id = ? LIMIT 1").bind(riskId, projectId).first();
  if (!existing) throw new HTTPException(404, { message: "Risk not found" });

  await db.prepare("DELETE FROM risks WHERE id = ?").bind(riskId).run();
  return c.json({ success: true });
});

export default app;

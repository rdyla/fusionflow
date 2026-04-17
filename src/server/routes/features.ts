import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const STATUSES = ["submitted", "under_review", "planned", "in_progress", "released", "declined"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const CATEGORIES = ["ui_ux", "performance", "integration", "reporting", "security", "other"] as const;

// GET /api/features — all requests with vote counts + current user's vote status
app.get("/", async (c) => {
  const auth = c.get("auth");
  const rows = await c.env.DB.prepare(`
    SELECT fr.*,
           u.name  AS submitter_name,
           u.email AS submitter_email,
           COUNT(frv.user_id) AS vote_count,
           MAX(CASE WHEN frv.user_id = ? THEN 1 ELSE 0 END) AS user_has_voted
    FROM feature_requests fr
    LEFT JOIN users u ON u.id = fr.submitter_id
    LEFT JOIN feature_request_votes frv ON frv.feature_request_id = fr.id
    GROUP BY fr.id
    ORDER BY vote_count DESC, fr.created_at DESC
  `).bind(auth.user.id).all();
  return c.json(rows.results ?? []);
});

// POST /api/features — any authenticated user can submit
app.post("/", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json();
  const schema = z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(5000).optional(),
    category: z.enum(CATEGORIES).optional(),
  });
  const data = schema.parse(body);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO feature_requests (id, title, description, category, submitter_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, data.title, data.description ?? null, data.category ?? null, auth.user.id, now, now).run();
  const row = await c.env.DB.prepare(`
    SELECT fr.*, u.name AS submitter_name, u.email AS submitter_email,
           0 AS vote_count, 1 AS user_has_voted
    FROM feature_requests fr
    LEFT JOIN users u ON u.id = fr.submitter_id
    WHERE fr.id = ?
  `).bind(id).first();
  return c.json(row, 201);
});

// PATCH /api/features/:id — admin only
app.patch("/:id", requireRole("admin"), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const schema = z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).nullable().optional(),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    category: z.enum(CATEGORIES).nullable().optional(),
    admin_notes: z.string().max(5000).nullable().optional(),
  });
  const data = schema.parse(body);
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.title !== undefined)       { fields.push("title = ?");       values.push(data.title); }
  if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
  if (data.status !== undefined)      { fields.push("status = ?");      values.push(data.status); }
  if (data.priority !== undefined)    { fields.push("priority = ?");    values.push(data.priority); }
  if (data.category !== undefined)    { fields.push("category = ?");    values.push(data.category); }
  if (data.admin_notes !== undefined) { fields.push("admin_notes = ?"); values.push(data.admin_notes); }
  if (fields.length === 0) return c.json({ ok: true });
  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);
  await c.env.DB.prepare(`UPDATE feature_requests SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values).run();
  return c.json({ ok: true });
});

// DELETE /api/features/:id — admin only
app.delete("/:id", requireRole("admin"), async (c) => {
  const { id } = c.req.param();
  await c.env.DB.prepare("DELETE FROM feature_requests WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// POST /api/features/:id/vote — toggle vote for current user
app.post("/:id/vote", async (c) => {
  const auth = c.get("auth");
  const { id } = c.req.param();
  const db = c.env.DB;
  const existing = await db.prepare(
    "SELECT 1 FROM feature_request_votes WHERE user_id = ? AND feature_request_id = ?"
  ).bind(auth.user.id, id).first();
  if (existing) {
    await db.prepare(
      "DELETE FROM feature_request_votes WHERE user_id = ? AND feature_request_id = ?"
    ).bind(auth.user.id, id).run();
    return c.json({ voted: false });
  }
  await db.prepare(
    "INSERT INTO feature_request_votes (user_id, feature_request_id, created_at) VALUES (?, ?, ?)"
  ).bind(auth.user.id, id, new Date().toISOString()).run();
  return c.json({ voted: true });
});

export default app;

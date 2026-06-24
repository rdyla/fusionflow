import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { createNotification } from "../lib/notifications";
import { maybeSendEmail } from "../services/emailService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

// POST /api/help-requests — any authenticated user files a contextual-help
// request. Fans out to every admin: an in-app notification (instant) plus an
// "important" email. Local-only; never touches Dynamics.
app.post("/", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const body = await c.req.json();
  const data = z
    .object({
      subject: z.string().min(1).max(500),
      body: z.string().max(5000).optional(),
      module: z.string().max(100).optional(),
      page_path: z.string().max(500).optional(),
    })
    .parse(body);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO help_requests (id, requester_id, module, page_path, subject, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, auth.user.id, data.module ?? null, data.page_path ?? null, data.subject, data.body ?? null, now, now)
    .run();

  // Notify admins — in-app bell (always) + email (respects their preference).
  const admins = (await db
    .prepare("SELECT id, email FROM users WHERE role = 'admin' AND is_active = 1")
    .all<{ id: string; email: string | null }>()).results ?? [];

  const requesterName = auth.user.name || auth.user.email || "A user";
  const where = data.module ? ` (${data.module})` : "";
  const appUrl = (c.env.APP_URL || "").replace(/\/$/, "");
  const link = `${appUrl}/admin/help-requests`;

  for (const admin of admins) {
    await createNotification(db, {
      recipientUserId: admin.id,
      type: "help_request",
      title: `Help request: ${data.subject}`,
      body: `${requesterName} asked for help${where}.`,
      entityType: "help_request",
      entityId: id,
      senderUserId: auth.user.id,
    });
    if (admin.email) {
      try {
        await maybeSendEmail(c.env, db, admin.id, "important", {
          to: admin.email,
          subject: `New CloudConnect help request: ${data.subject}`,
          html:
            `<p><strong>${requesterName}</strong> filed a help request${where}.</p>` +
            `<p><strong>Subject:</strong> ${escapeHtml(data.subject)}</p>` +
            (data.body ? `<p>${escapeHtml(data.body)}</p>` : "") +
            (data.page_path ? `<p style="color:#64748b">From: ${escapeHtml(data.page_path)}</p>` : "") +
            `<p><a href="${link}">Review in CloudConnect →</a></p>`,
        });
      } catch (err) {
        console.error("[help-requests] admin email failed:", err);
      }
    }
  }

  const row = await db
    .prepare("SELECT * FROM help_requests WHERE id = ?")
    .bind(id)
    .first();
  return c.json(row, 201);
});

// GET /api/help-requests — admin queue. Optional ?status= filter.
app.get("/", requireRole("admin"), async (c) => {
  const status = c.req.query("status");
  const valid = status && (STATUSES as readonly string[]).includes(status) ? status : null;
  const sql =
    `SELECT hr.*, u.name AS requester_name, u.email AS requester_email
     FROM help_requests hr
     LEFT JOIN users u ON u.id = hr.requester_id` +
    (valid ? ` WHERE hr.status = ?` : ``) +
    ` ORDER BY CASE hr.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, hr.created_at DESC`;
  const stmt = valid ? c.env.DB.prepare(sql).bind(valid) : c.env.DB.prepare(sql);
  const rows = await stmt.all();
  return c.json(rows.results ?? []);
});

// PATCH /api/help-requests/:id — admin updates status / notes.
app.patch("/:id", requireRole("admin"), async (c) => {
  const auth = c.get("auth");
  const { id } = c.req.param();
  const data = z
    .object({
      status: z.enum(STATUSES).optional(),
      admin_notes: z.string().max(5000).nullable().optional(),
    })
    .parse(await c.req.json());

  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.status !== undefined) {
    fields.push("status = ?");
    values.push(data.status);
    // Stamp resolver when moving to a terminal state; clear when reopened.
    if (data.status === "resolved" || data.status === "closed") {
      fields.push("resolved_by = ?", "resolved_at = ?");
      values.push(auth.user.id, new Date().toISOString());
    } else {
      fields.push("resolved_by = NULL", "resolved_at = NULL");
    }
  }
  if (data.admin_notes !== undefined) {
    fields.push("admin_notes = ?");
    values.push(data.admin_notes);
  }
  if (fields.length === 0) return c.json({ ok: true });
  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);
  await c.env.DB.prepare(`UPDATE help_requests SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
  return c.json({ ok: true });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default app;

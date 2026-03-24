import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { createNotification } from "../lib/notifications";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── GET /api/inbox/unread-count ───────────────────────────────────────────────

app.get("/unread-count", async (c) => {
  const auth = c.get("auth");
  const row = await c.env.DB
    .prepare("SELECT COUNT(*) AS count FROM notifications WHERE recipient_user_id = ? AND read_at IS NULL")
    .bind(auth.user.id)
    .first<{ count: number }>();
  return c.json({ count: row?.count ?? 0 });
});

// ── GET /api/inbox ────────────────────────────────────────────────────────────
// Query params: ?tab=notifications|messages|all  &page=1

app.get("/", async (c) => {
  const auth = c.get("auth");
  const tab = c.req.query("tab") ?? "all";
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1"));
  const limit = 30;
  const offset = (page - 1) * limit;

  let typeFilter = "";
  if (tab === "notifications") typeFilter = "AND n.type != 'direct_message'";
  else if (tab === "messages") typeFilter = "AND n.type = 'direct_message'";

  const rows = await c.env.DB
    .prepare(
      `SELECT n.id, n.type, n.title, n.body, n.entity_type, n.entity_id,
              n.project_id, n.read_at, n.created_at,
              s.id AS sender_id, s.name AS sender_name, s.email AS sender_email
       FROM notifications n
       LEFT JOIN users s ON s.id = n.sender_user_id
       WHERE n.recipient_user_id = ? ${typeFilter}
       ORDER BY n.read_at IS NOT NULL ASC, n.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(auth.user.id, limit, offset)
    .all<{
      id: string; type: string; title: string; body: string | null;
      entity_type: string | null; entity_id: string | null;
      project_id: string | null; read_at: string | null; created_at: string;
      sender_id: string | null; sender_name: string | null; sender_email: string | null;
    }>();

  const totalRow = await c.env.DB
    .prepare(`SELECT COUNT(*) AS count FROM notifications WHERE recipient_user_id = ? ${typeFilter}`)
    .bind(auth.user.id)
    .first<{ count: number }>();

  return c.json({
    items: rows.results ?? [],
    total: totalRow?.count ?? 0,
    page,
    hasMore: offset + limit < (totalRow?.count ?? 0),
  });
});

// ── PATCH /api/inbox/:id/read ─────────────────────────────────────────────────

app.patch("/:id/read", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");

  await c.env.DB
    .prepare(
      `UPDATE notifications SET read_at = datetime('now')
       WHERE id = ? AND recipient_user_id = ? AND read_at IS NULL`
    )
    .bind(id, auth.user.id)
    .run();

  return c.json({ ok: true });
});

// ── POST /api/inbox/read-all ──────────────────────────────────────────────────

app.post("/read-all", async (c) => {
  const auth = c.get("auth");
  await c.env.DB
    .prepare(
      `UPDATE notifications SET read_at = datetime('now')
       WHERE recipient_user_id = ? AND read_at IS NULL`
    )
    .bind(auth.user.id)
    .run();
  return c.json({ ok: true });
});

// ── DELETE /api/inbox/:id ─────────────────────────────────────────────────────

app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  await c.env.DB
    .prepare("DELETE FROM notifications WHERE id = ? AND recipient_user_id = ?")
    .bind(id, auth.user.id)
    .run();
  return c.json({ ok: true });
});

// ── POST /api/inbox/messages ──────────────────────────────────────────────────

const messageSchema = z.object({
  recipient_user_id: z.string().min(1),
  body: z.string().min(1).max(2000),
});

app.post("/messages", async (c) => {
  const auth = c.get("auth");

  const parsed = messageSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { recipient_user_id, body } = parsed.data;

  if (recipient_user_id === auth.user.id) {
    throw new HTTPException(400, { message: "Cannot message yourself" });
  }

  const recipient = await c.env.DB
    .prepare("SELECT id, name FROM users WHERE id = ? AND is_active = 1 LIMIT 1")
    .bind(recipient_user_id)
    .first<{ id: string; name: string }>();

  if (!recipient) throw new HTTPException(404, { message: "Recipient not found" });

  const senderName = auth.user.name ?? auth.user.email;

  await createNotification(c.env.DB, {
    recipientUserId: recipient_user_id,
    type: "direct_message",
    title: `Message from ${senderName}`,
    body,
    entityType: "message",
    senderUserId: auth.user.id,
  });

  return c.json({ ok: true }, 201);
});

export default app;

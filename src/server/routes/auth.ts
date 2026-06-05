import { Hono } from "hono";
import type { Bindings, Variables } from "../types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/me", (c) => {
  const auth = c.get("auth");

  return c.json({
    user: auth.user,
    role: auth.role,
    organization: auth.organization,
  });
});

app.get("/users", async (c) => {
  const rows = await c.env.DB
    .prepare(
      `SELECT id, name, email, role, organization_name, is_project_resource, is_pm_eligible
       FROM users
       WHERE is_active = 1
       ORDER BY name ASC`
    )
    .all();
  return c.json(rows.results ?? []);
});

// GET /api/users/:userId/avatar?v=stamp
// Streams the user's uploaded R2 avatar. Cache buster `v` doesn't affect
// the lookup (we always serve the latest avatar_r2_key); it just changes
// the URL when the user re-uploads so browser caches invalidate.
//
// 404 when the user has no uploaded avatar — the client should fall back
// to whatever avatar_url it already has cached (typically the Zoom CDN URL).
app.get("/users/:userId/avatar", async (c) => {
  const userId = c.req.param("userId");
  const row = await c.env.DB
    .prepare("SELECT avatar_r2_key FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first<{ avatar_r2_key: string | null }>();
  if (!row?.avatar_r2_key) return c.json({ error: "No uploaded avatar" }, 404);

  const obj = await c.env.R2.get(row.avatar_r2_key);
  if (!obj) return c.json({ error: "Avatar object missing on R2" }, 404);

  const headers = new Headers();
  headers.set("Content-Type", obj.httpMetadata?.contentType ?? "application/octet-stream");
  // Cache for an hour — the URL changes on re-upload (cache buster) so this
  // is safe. Short enough that user-driven changes propagate quickly anyway.
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(obj.body, { headers });
});

export default app;
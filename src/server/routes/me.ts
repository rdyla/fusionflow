/**
 * Self-service profile editor — accessible to every authenticated role.
 *
 * Wired endpoints:
 *   GET    /api/me/profile          — current user's editable fields
 *   PATCH  /api/me/profile          — update name / title / phone / scheduler_url
 *   POST   /api/me/avatar           — upload avatar (multipart, image only)
 *   DELETE /api/me/avatar           — remove uploaded avatar, fall back to Zoom-cached
 *
 * Session cache:
 *   AppUser blobs are cached in KV at login time (see auth middleware comment
 *   in CLAUDE.md). When a user edits their own profile we busts THEIR session
 *   cache so the next request picks up the fresh data immediately, instead of
 *   forcing them to log out and back in. Other users seeing this profile (e.g.
 *   the Dashboard team panel) refresh on their next page load via the normal
 *   D1 read paths.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AuthContext, Bindings, Variables } from "../types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const ALLOWED_AVATAR_MIME = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Clients sign in via D365-portal OTP and don't get a `users` row at login
 * time — their AppUser blob is synthesized from the D365 contact record
 * (id = contact GUID) and cached in KV. Every /me endpoint here does
 * `UPDATE users WHERE id = ?` though, which silently no-ops for clients
 * and surfaces as "Profile unavailable" / 404 in the UI.
 *
 * Solution: on first call into /me/profile (or /me/avatar) provision a
 * users row backed by the D365 contact id. Staff and partner-AE users
 * already have rows so this is a no-op for them. We check by email AND
 * id so a legacy users row under a different id (rare but possible)
 * isn't duplicated.
 */
async function ensureUserRow(db: D1Database, auth: AuthContext): Promise<void> {
  const existing = await db
    .prepare("SELECT id FROM users WHERE id = ? OR email = ? LIMIT 1")
    .bind(auth.user.id, auth.user.email)
    .first<{ id: string }>();
  if (existing) return;
  await db
    .prepare(
      `INSERT INTO users (id, email, name, role, organization_name, dynamics_account_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )
    .bind(
      auth.user.id,
      auth.user.email,
      auth.user.name,
      auth.role,
      auth.user.organization_name,
      auth.user.dynamics_account_id ?? null,
    )
    .run();
}

// ── Profile read ────────────────────────────────────────────────────────────

app.get("/profile", async (c) => {
  const auth = c.get("auth");
  await ensureUserRow(c.env.DB, auth);
  const row = await c.env.DB
    .prepare(
      "SELECT id, email, name, role, organization_name, title, phone, scheduler_url, email_notifications, avatar_url, avatar_r2_key FROM users WHERE id = ? OR email = ? LIMIT 1"
    )
    .bind(auth.user.id, auth.user.email)
    .first<{
      id: string; email: string; name: string | null; role: string;
      organization_name: string | null; title: string | null; phone: string | null;
      scheduler_url: string | null; email_notifications: string | null; avatar_url: string | null; avatar_r2_key: string | null;
    }>();
  if (!row) throw new HTTPException(404, { message: "User not found" });
  return c.json({
    id: row.id,
    email: row.email,
    role: row.role,
    organization_name: row.organization_name,
    name: row.name,
    title: row.title,
    phone: row.phone,
    scheduler_url: row.scheduler_url,
    email_notifications: row.email_notifications ?? "all",
    avatar_url: row.avatar_url,
    has_custom_avatar: !!row.avatar_r2_key,
  });
});

// ── Profile patch ───────────────────────────────────────────────────────────

const profilePatchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  title: z.string().max(255).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  // Schedule link is vendor-neutral — Zoom Scheduler, RingCentral's
  // scheduler app, Calendly, etc. We don't whitelist domains.
  scheduler_url: z.string().max(2000).nullable().optional(),
  email_notifications: z.enum(["all", "important", "off"]).optional(),
});

app.patch("/profile", async (c) => {
  const auth = c.get("auth");
  await ensureUserRow(c.env.DB, auth);
  const parsed = profilePatchSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (fields.length === 0) throw new HTTPException(400, { message: "No fields to update" });
  fields.push("updated_at = CURRENT_TIMESTAMP");

  await c.env.DB
    .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, auth.user.id)
    .run();

  await invalidateUserSession(c.env, auth.user.id);
  return c.json({ ok: true });
});

// ── Avatar upload ───────────────────────────────────────────────────────────

app.post("/avatar", async (c) => {
  const auth = c.get("auth");
  await ensureUserRow(c.env.DB, auth);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) throw new HTTPException(400, { message: "file field required" });
  if (file.size > MAX_AVATAR_BYTES) {
    throw new HTTPException(400, { message: `Avatar must be under ${(MAX_AVATAR_BYTES / 1024 / 1024).toFixed(0)} MB` });
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_AVATAR_MIME.has(mime)) {
    throw new HTTPException(400, { message: `Unsupported image type: ${mime}` });
  }

  // Cache-buster appended to the URL so any browser-cached copy invalidates
  // on next read. Stored in the R2 key too so two upload races don't collide.
  const stamp = Date.now().toString(36);
  const ext = mime.split("/")[1] || "bin";
  const r2Key = `avatars/${auth.user.id}/${stamp}.${ext}`;

  await c.env.R2.put(r2Key, file.stream(), { httpMetadata: { contentType: mime } });

  // Clean up any previous uploads for this user — keeps the R2 footprint tight.
  // Best-effort; failures here log and continue.
  try {
    const listed = await c.env.R2.list({ prefix: `avatars/${auth.user.id}/` });
    for (const obj of listed.objects) {
      if (obj.key !== r2Key) await c.env.R2.delete(obj.key);
    }
  } catch (err) {
    console.warn(`[me.avatar] cleanup failed for ${auth.user.id}:`, err instanceof Error ? err.message : err);
  }

  const avatarUrl = `/api/users/${auth.user.id}/avatar?v=${stamp}`;
  await c.env.DB
    .prepare("UPDATE users SET avatar_r2_key = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(r2Key, avatarUrl, auth.user.id)
    .run();

  await invalidateUserSession(c.env, auth.user.id);
  return c.json({ avatar_url: avatarUrl });
});

// ── Avatar reset (back to Zoom default) ─────────────────────────────────────

app.delete("/avatar", async (c) => {
  const auth = c.get("auth");
  await ensureUserRow(c.env.DB, auth);
  const row = await c.env.DB
    .prepare("SELECT avatar_r2_key FROM users WHERE id = ? LIMIT 1")
    .bind(auth.user.id)
    .first<{ avatar_r2_key: string | null }>();
  if (row?.avatar_r2_key) {
    try { await c.env.R2.delete(row.avatar_r2_key); }
    catch (err) { console.warn("[me.avatar] R2 delete failed:", err instanceof Error ? err.message : err); }
  }
  // Clear both — server-fed Zoom-cached avatars will repopulate on next
  // staff/photos lookup if the user has a Zoom profile photo.
  await c.env.DB
    .prepare("UPDATE users SET avatar_r2_key = NULL, avatar_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(auth.user.id)
    .run();
  await invalidateUserSession(c.env, auth.user.id);
  return c.json({ ok: true });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Bust the KV-cached session for a user so their next request reloads the
 * AppUser blob from D1. Session keys are stored as `session:<token>` with
 * a secondary index at `user-sessions:<user_id>` listing active tokens.
 *
 * If the secondary index isn't present yet (older deploys), the next page
 * load still picks up the fresh data once the existing session TTL expires;
 * this is a soft "make it immediate" — not a security boundary.
 */
async function invalidateUserSession(env: Bindings, userId: string): Promise<void> {
  try {
    const index = await env.KV.get(`user-sessions:${userId}`);
    if (!index) return;
    const tokens = JSON.parse(index) as string[];
    await Promise.all(tokens.map((t) => env.KV.delete(`session:${t}`)));
    await env.KV.delete(`user-sessions:${userId}`);
  } catch (err) {
    console.warn("[me] session invalidation failed:", err instanceof Error ? err.message : err);
  }
}

export default app;

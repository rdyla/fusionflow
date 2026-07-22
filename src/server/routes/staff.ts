import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { getStaffPhotos } from "../services/zoomService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/staff/photos?emails=a@b.com,b@c.com
// Returns { "a@b.com": "https://...", "b@c.com": null }
app.get("/photos", async (c) => {
  const db = c.env.DB;
  const raw = c.req.query("emails") ?? "";
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes("@"));

  if (emails.length === 0) throw new HTTPException(400, { message: "No valid emails provided" });
  if (emails.length > 50) throw new HTTPException(400, { message: "Too many emails (max 50)" });

  const result: Record<string, string | null> = {};
  const toFetch: string[] = [];

  const placeholders = emails.map(() => "?").join(",");
  const dbRows = await db
    .prepare(`SELECT email, avatar_url, avatar_r2_key FROM users WHERE lower(email) IN (${placeholders})`)
    .bind(...emails)
    .all<{ email: string; avatar_url: string | null; avatar_r2_key: string | null }>();
  const rowByEmail = new Map<string, { avatar_url: string | null; avatar_r2_key: string | null }>();
  for (const r of dbRows.results ?? []) {
    rowByEmail.set(r.email.toLowerCase(), { avatar_url: r.avatar_url, avatar_r2_key: r.avatar_r2_key });
  }

  for (const email of emails) {
    const row = rowByEmail.get(email);
    // A user-UPLOADED avatar (R2-backed, avatar_r2_key set) is stable — use it.
    // Everything else (a Zoom-derived URL, or nothing) is re-resolved from Zoom
    // via the KV cache so it can't go stale: Zoom photo URLs rotate, and a value
    // frozen permanently in D1 would 404 forever once Zoom cycles it.
    if (row?.avatar_r2_key && row.avatar_url) {
      result[email] = row.avatar_url;
    } else {
      result[email] = null;
      toFetch.push(email);
    }
  }

  if (toFetch.length > 0) {
    const zoomPhotos = await getStaffPhotos(c.env.KV, c.env, toFetch);
    for (const email of toFetch) {
      const url = zoomPhotos[email] ?? null;
      result[email] = url;
      // Mirror the freshly-resolved value into D1 for surfaces that read
      // users.avatar_url directly — but only for non-uploaded rows, and only
      // when it actually changed (writes the new URL, or clears a stale one).
      const prev = rowByEmail.get(email)?.avatar_url ?? null;
      if (rowByEmail.has(email) && url !== prev) {
        await db
          .prepare("UPDATE users SET avatar_url = ? WHERE lower(email) = ? AND avatar_r2_key IS NULL")
          .bind(url, email)
          .run();
      }
    }
  }

  return c.json(result);
});

export default app;

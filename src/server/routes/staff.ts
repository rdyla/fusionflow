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

  // Check DB first
  const placeholders = emails.map(() => "?").join(",");
  const dbRows = await db
    .prepare(`SELECT email, avatar_url FROM users WHERE lower(email) IN (${placeholders})`)
    .bind(...emails)
    .all<{ email: string; avatar_url: string | null }>();

  for (const email of emails) {
    const row = dbRows.results?.find((r) => r.email.toLowerCase() === email);
    if (row?.avatar_url) {
      result[email] = row.avatar_url;
    } else {
      result[email] = null;
      toFetch.push(email);
    }
  }

  // For those without a stored URL, try Zoom and persist any hits
  if (toFetch.length > 0) {
    const zoomPhotos = await getStaffPhotos(c.env.KV, c.env, toFetch);
    for (const [email, url] of Object.entries(zoomPhotos)) {
      result[email] = url;
      if (url) {
        await db
          .prepare("UPDATE users SET avatar_url = ? WHERE lower(email) = ? AND (avatar_url IS NULL OR avatar_url = '')")
          .bind(url, email)
          .run();
      }
    }
  }

  return c.json(result);
});

export default app;

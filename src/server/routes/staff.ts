import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { getStaffPhotos } from "../services/zoomService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/staff/photos?emails=a@b.com,b@c.com
// Returns { "a@b.com": "https://...", "b@c.com": null }
app.get("/photos", async (c) => {
  const raw = c.req.query("emails") ?? "";
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes("@"));

  if (emails.length === 0) throw new HTTPException(400, { message: "No valid emails provided" });
  if (emails.length > 50) throw new HTTPException(400, { message: "Too many emails (max 50)" });

  const photos = await getStaffPhotos(c.env.KV, c.env, emails);
  return c.json(photos);
});

export default app;

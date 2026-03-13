import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { saveCreds, deleteCreds, getCredsConfigured, getZoomStatus } from "../services/zoomService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const credsSchema = z.object({
  account_id: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});

// GET /api/projects/:projectId/zoom/configured
app.get("/:projectId/zoom/configured", async (c) => {
  const projectId = c.req.param("projectId");
  const configured = await getCredsConfigured(c.env.KV, projectId);
  return c.json({ configured });
});

// PUT /api/projects/:projectId/zoom/credentials
app.put("/:projectId/zoom/credentials", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const parsed = credsSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid credentials payload" });
  await saveCreds(c.env.KV, projectId, parsed.data);
  return c.json({ ok: true });
});

// DELETE /api/projects/:projectId/zoom/credentials
app.delete("/:projectId/zoom/credentials", async (c) => {
  const projectId = c.req.param("projectId");
  await deleteCreds(c.env.KV, projectId);
  return c.json({ ok: true });
});

// GET /api/projects/:projectId/zoom/status
app.get("/:projectId/zoom/status", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const status = await getZoomStatus(c.env.KV, projectId);
    if (!status) return c.json({ configured: false });
    return c.json({ configured: true, ...status });
  } catch (err) {
    console.error("Zoom status fetch error:", err);
    throw new HTTPException(502, { message: err instanceof Error ? err.message : "Zoom API error" });
  }
});

export default app;

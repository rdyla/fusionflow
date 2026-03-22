import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { saveCreds, deleteCreds, getCredsConfigured, getRCStatus } from "../services/ringCentralService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const credsSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  jwt_token: z.string().min(1),
});

// GET /api/projects/:projectId/ringcentral/configured
app.get("/:projectId/ringcentral/configured", async (c) => {
  const projectId = c.req.param("projectId");
  const configured = await getCredsConfigured(c.env.KV, projectId);
  return c.json({ configured });
});

// PUT /api/projects/:projectId/ringcentral/credentials
app.put("/:projectId/ringcentral/credentials", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const parsed = credsSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid credentials payload" });
  await saveCreds(c.env.KV, projectId, parsed.data);
  return c.json({ ok: true });
});

// DELETE /api/projects/:projectId/ringcentral/credentials
app.delete("/:projectId/ringcentral/credentials", async (c) => {
  const projectId = c.req.param("projectId");
  await deleteCreds(c.env.KV, projectId);
  return c.json({ ok: true });
});

// GET /api/projects/:projectId/ringcentral/status
app.get("/:projectId/ringcentral/status", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const status = await getRCStatus(c.env.KV, projectId);
    if (!status) return c.json({ configured: false });
    return c.json({ configured: true, ...status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown RingCentral API error";
    console.error("RingCentral status fetch error:", message);
    return c.json({ configured: true, error: message });
  }
});

export default app;

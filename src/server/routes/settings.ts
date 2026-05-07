/**
 * Public read of app-wide runtime settings. Mirror of the admin PUT endpoint
 * in admin.ts — kept separate so any authenticated user can read the demo
 * vendor (the client uses it to filter solution-type pickers, default the
 * vendor on create forms, etc.) without exposing the full admin surface.
 */

import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { getDemoVendor } from "../lib/appSettings";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/public", async (c) => {
  const demoVendor = await getDemoVendor(c.env.DB);
  return c.json({ demoVendor });
});

export default app;

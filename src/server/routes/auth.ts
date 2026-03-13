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
      `SELECT id, name, email, role, organization_name
       FROM users
       WHERE is_active = 1
       ORDER BY name ASC`
    )
    .all();
  return c.json(rows.results ?? []);
});

export default app;
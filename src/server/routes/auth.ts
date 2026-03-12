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

export default app;
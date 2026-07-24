import { Hono } from "hono";
import type { AuthContext, Bindings, Variables } from "../types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function canAccess(auth: AuthContext) {
  return auth.role === "admin" || auth.user.is_sales_tools === 1;
}

app.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (!canAccess(auth)) return c.json({ error: "Forbidden" }, 403);
  await next();
});

export default app;

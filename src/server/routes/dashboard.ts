import { Hono } from "hono";
import type { Bindings, Variables } from "../types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/summary", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;

  let projectFilterSql = "";
  let bindings: string[] = [];

  if (auth.role === "pm") {
    projectFilterSql = "WHERE pm_user_id = ?";
    bindings = [auth.user.id];
  } else if (auth.role === "pf_ae") {
    projectFilterSql = "WHERE ae_user_id = ?";
    bindings = [auth.user.id];
  } else if (auth.role === "partner_ae") {
    projectFilterSql = `
      WHERE id IN (
        SELECT project_id FROM project_access WHERE user_id = ?
      )
    `;
    bindings = [auth.user.id];
  }

  const activeProjects = await db
    .prepare(`SELECT COUNT(*) as count FROM projects ${projectFilterSql}`)
    .bind(...bindings)
    .first<{ count: number }>();

  const atRiskProjects = await db
    .prepare(
      `SELECT COUNT(*) as count FROM projects ${projectFilterSql ? `${projectFilterSql} AND health = ?` : "WHERE health = ?"}`
    )
    .bind(...bindings, "at_risk")
    .first<{ count: number }>();

  return c.json({
    user: auth.user,
    summary: {
      activeProjects: activeProjects?.count ?? 0,
      atRiskProjects: atRiskProjects?.count ?? 0,
    },
  });
});

export default app;
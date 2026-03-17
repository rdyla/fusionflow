import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { canEditProject, canViewProject } from "../services/accessService";
import { STANDARD_PHASES } from "../lib/standardPhases";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;

  let sql = `
    SELECT id, name, customer_name, vendor, solution_type, status, health,
           kickoff_date, target_go_live_date, actual_go_live_date,
           pm_user_id, pm_name, ae_user_id, ae_name, sa_name, csm_name, engineer_name, created_at, updated_at
    FROM projects
    WHERE (archived = 0 OR archived IS NULL)
  `;
  let bindings: string[] = [];

  if (auth.role === "pm") {
    sql += " AND pm_user_id = ?";
    bindings = [auth.user.id];
  } else if (auth.role === "pf_ae") {
    sql += " AND ae_user_id = ?";
    bindings = [auth.user.id];
  } else if (auth.role === "partner_ae") {
    sql += `
      AND id IN (
        SELECT project_id FROM project_access WHERE user_id = ?
      )
    `;
    bindings = [auth.user.id];
  } else if (auth.role === "client") {
    if (!auth.user.dynamics_account_id) return c.json([]);
    sql += " AND dynamics_account_id = ?";
    bindings = [auth.user.dynamics_account_id];
  }
  // pf_sa, pf_csm, and admin: no filter — portfolio-wide visibility

  sql += " ORDER BY updated_at DESC";

  const rows = await db.prepare(sql).bind(...bindings).all();

  return c.json(rows.results ?? []);
});

app.get("/:id", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const project = await db
    .prepare(
      `
      SELECT id, name, customer_name, vendor, solution_type, status, health,
             kickoff_date, target_go_live_date, actual_go_live_date,
             pm_user_id, pm_name, ae_user_id, ae_name, sa_name, csm_name, engineer_name,
             dynamics_account_id, created_at, updated_at
      FROM projects
      WHERE id = ?
      LIMIT 1
      `
    )
    .bind(projectId)
    .first();

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  return c.json(project);
});

const createProjectSchema = z.object({
  name: z.string().min(1).max(500),
  customer_name: z.string().max(500).optional(),
  vendor: z.string().max(500).optional(),
  solution_type: z.string().max(500).optional(),
  kickoff_date: z.string().optional(),
  target_go_live_date: z.string().optional(),
  pm_user_id: z.string().nullable().optional(),
  pm_name: z.string().max(500).nullable().optional(),
  ae_user_id: z.string().nullable().optional(),
  ae_name: z.string().max(500).nullable().optional(),
  sa_name: z.string().max(500).nullable().optional(),
  csm_name: z.string().max(500).nullable().optional(),
  engineer_name: z.string().max(500).nullable().optional(),
  dynamics_account_id: z.string().nullable().optional(),
});

app.post("/", requireRole("admin", "pm"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const rawBody = await c.req.json();
  const parsed = createProjectSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { name, customer_name, vendor, solution_type, kickoff_date, target_go_live_date, pm_user_id: pmInput, pm_name, ae_user_id: aeInput, ae_name, sa_name, csm_name, engineer_name, dynamics_account_id } = parsed.data;
  const projectId = crypto.randomUUID();
  const pm_user_id = pmInput ?? (auth.role === "pm" ? auth.user.id : null);
  const ae_user_id = aeInput ?? (auth.role === "pf_ae" ? auth.user.id : null);

  await db
    .prepare(
      `INSERT INTO projects (id, name, customer_name, vendor, solution_type, status, health, kickoff_date, target_go_live_date, pm_user_id, pm_name, ae_user_id, ae_name, sa_name, csm_name, engineer_name, dynamics_account_id)
       VALUES (?, ?, ?, ?, ?, 'not_started', 'on_track', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(projectId, name, customer_name ?? null, vendor ?? null, solution_type ?? null, kickoff_date ?? null, target_go_live_date ?? null, pm_user_id, pm_name ?? null, ae_user_id, ae_name ?? null, sa_name ?? null, csm_name ?? null, engineer_name ?? null, dynamics_account_id ?? null)
    .run();

  // Auto-seed standard phases
  for (let i = 0; i < STANDARD_PHASES.length; i++) {
    await db
      .prepare(
        `INSERT INTO phases (id, project_id, name, sort_order, status) VALUES (?, ?, ?, ?, 'not_started')`
      )
      .bind(crypto.randomUUID(), projectId, STANDARD_PHASES[i], i + 1)
      .run();
  }

  const created = await db
    .prepare(
      `
      SELECT id, name, customer_name, vendor, solution_type, status, health,
             kickoff_date, target_go_live_date, actual_go_live_date,
             pm_user_id, pm_name, ae_user_id, ae_name, sa_name, csm_name, engineer_name, created_at, updated_at
      FROM projects WHERE id = ? LIMIT 1
      `
    )
    .bind(projectId)
    .first();

  return c.json(created, 201);
});

const updateProjectSchema = z.object({
  status: z.string().min(1).optional(),
  health: z.string().min(1).optional(),
  target_go_live_date: z.string().optional(),
  actual_go_live_date: z.string().optional(),
  pm_user_id: z.string().nullable().optional(),
  pm_name: z.string().max(500).nullable().optional(),
  ae_user_id: z.string().nullable().optional(),
  ae_name: z.string().max(500).nullable().optional(),
  sa_name: z.string().max(500).nullable().optional(),
  csm_name: z.string().max(500).nullable().optional(),
  engineer_name: z.string().max(500).nullable().optional(),
});

app.patch("/:id", requireRole("admin", "pm"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateProjectSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const updates = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (!fields.length) {
    throw new HTTPException(400, { message: "No valid fields to update" });
  }

  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db
    .prepare(
      `
      UPDATE projects
      SET ${fields.join(", ")}
      WHERE id = ?
      `
    )
    .bind(...values, projectId)
    .run();

  const updated = await db
    .prepare("SELECT * FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first();

  return c.json(updated);
});

// ── Project Contacts ──────────────────────────────────────────────────────────

app.get("/:id/contacts", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  try {
    const rows = await db
      .prepare("SELECT * FROM project_contacts WHERE project_id = ? ORDER BY name ASC")
      .bind(projectId)
      .all();
    return c.json(rows.results ?? []);
  } catch {
    return c.json([]);
  }
});

const addContactSchema = z.object({
  dynamics_contact_id: z.string().optional(),
  name: z.string().min(1).max(500),
  email: z.string().max(500).nullable().optional(),
  phone: z.string().max(100).nullable().optional(),
  job_title: z.string().max(500).nullable().optional(),
  contact_role: z.string().max(100).nullable().optional(),
});

app.post("/:id/contacts", requireRole("admin", "pm", "pf_ae"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = addContactSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { dynamics_contact_id, name, email, phone, job_title, contact_role } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare("INSERT INTO project_contacts (id, project_id, dynamics_contact_id, name, email, phone, job_title, contact_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, projectId, dynamics_contact_id ?? null, name, email ?? null, phone ?? null, job_title ?? null, contact_role ?? null)
    .run();

  const created = await db.prepare("SELECT * FROM project_contacts WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

app.delete("/:id/contacts/:contactId", requireRole("admin", "pm", "pf_ae"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  await db
    .prepare("DELETE FROM project_contacts WHERE id = ? AND project_id = ?")
    .bind(c.req.param("contactId"), projectId)
    .run();
  return c.json({ success: true });
});

// ── Project Staff ─────────────────────────────────────────────────────────────

app.get("/:id/staff", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db.prepare(`
    SELECT ps.id, ps.project_id, ps.user_id, ps.staff_role, ps.created_at,
           u.name, u.email, u.role, u.avatar_url
    FROM project_staff ps
    JOIN users u ON u.id = ps.user_id
    WHERE ps.project_id = ?
    ORDER BY ps.staff_role, u.name
  `).bind(projectId).all();
  return c.json(rows.results ?? []);
});

app.post("/:id/staff", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const { user_id, staff_role } = await c.req.json<{ user_id: string; staff_role: string }>();
  if (!user_id || !staff_role) throw new HTTPException(400, { message: "user_id and staff_role required" });

  const id = crypto.randomUUID();
  await db.prepare("INSERT OR IGNORE INTO project_staff (id, project_id, user_id, staff_role) VALUES (?, ?, ?, ?)")
    .bind(id, projectId, user_id, staff_role).run();

  const created = await db.prepare(`
    SELECT ps.id, ps.project_id, ps.user_id, ps.staff_role, ps.created_at,
           u.name, u.email, u.role, u.avatar_url
    FROM project_staff ps JOIN users u ON u.id = ps.user_id
    WHERE ps.project_id = ? AND ps.user_id = ? AND ps.staff_role = ? LIMIT 1
  `).bind(projectId, user_id, staff_role).first();
  return c.json(created, 201);
});

app.delete("/:id/staff/:staffId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  await db.prepare("DELETE FROM project_staff WHERE id = ? AND project_id = ?")
    .bind(c.req.param("staffId"), projectId).run();
  return c.json({ success: true });
});

export default app;
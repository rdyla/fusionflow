import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { canEditProject, canViewProject } from "../services/accessService";
import { getTeamUserIds, inPlaceholders } from "../lib/teamUtils";
import { sendEmail } from "../services/emailService";
import { projectAtRisk } from "../lib/emailTemplates";
import { computeProjectHealth } from "../lib/healthScore";
import { getAccountTeam } from "../services/dynamicsService";
import { findOrCreatePfUser } from "../lib/crmUsers";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;

  let sql = `
    SELECT id, name, customer_name, customer_id, vendor, solution_type, status, health,
           kickoff_date, target_go_live_date, actual_go_live_date,
           pm_user_id, pm_name, ae_user_id, ae_name, sa_name, csm_name, engineer_name,
           managed_in_asana, asana_project_id, solution_id, created_at, updated_at,
           CASE WHEN EXISTS(SELECT 1 FROM optimize_accounts oa WHERE oa.project_id = projects.id) THEN 1 ELSE 0 END AS has_optimization
    FROM projects
    WHERE (archived = 0 OR archived IS NULL)
  `;
  let bindings: string[] = [];

  if (auth.role === "pm") {
    sql += " AND pm_user_id = ?";
    bindings = [auth.user.id];
  } else if (auth.role === "pf_ae") {
    const teamIds = await getTeamUserIds(auth.user.id, db);
    sql += ` AND ae_user_id IN (${inPlaceholders(teamIds)})`;
    bindings = teamIds;
  } else if (auth.role === "partner_ae") {
    const teamIds = await getTeamUserIds(auth.user.id, db);
    const ph = inPlaceholders(teamIds);
    sql += ` AND id IN (
      SELECT project_id FROM project_access WHERE user_id IN (${ph})
      UNION
      SELECT project_id FROM project_staff WHERE staff_role = 'partner_ae' AND user_id IN (${ph})
    )`;
    bindings = [...teamIds, ...teamIds];
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
      SELECT p.id, p.name, p.customer_name, p.customer_id, p.vendor, p.solution_type, p.status, p.health,
             p.kickoff_date, p.target_go_live_date, p.actual_go_live_date,
             p.pm_user_id, p.pm_name, p.ae_user_id, p.ae_name, p.sa_name, p.csm_name, p.engineer_name,
             p.dynamics_account_id, p.asana_project_id, p.managed_in_asana, p.solution_id,
             p.created_at, p.updated_at,
             s.name AS linked_solution_name,
             s.customer_name AS linked_solution_customer,
             s.status AS linked_solution_status,
             s.solution_type AS linked_solution_type,
             c.name AS customer_display_name,
             cpu1.name AS customer_pf_ae_name, cpu1.email AS customer_pf_ae_email,
             cpu2.name AS customer_pf_sa_name, cpu2.email AS customer_pf_sa_email,
             cpu3.name AS customer_pf_csm_name, cpu3.email AS customer_pf_csm_email,
             c.sharepoint_url AS customer_sharepoint_url,
             CASE WHEN EXISTS(SELECT 1 FROM optimize_accounts oa WHERE oa.project_id = p.id) THEN 1 ELSE 0 END AS has_optimization
      FROM projects p
      LEFT JOIN solutions s ON s.id = p.solution_id
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN users cpu1 ON cpu1.id = c.pf_ae_user_id
      LEFT JOIN users cpu2 ON cpu2.id = c.pf_sa_user_id
      LEFT JOIN users cpu3 ON cpu3.id = c.pf_csm_user_id
      WHERE p.id = ?
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
  customer_id: z.string().nullable().optional(),
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
  solution_id: z.string().nullable().optional(),
});

app.post("/", requireRole("admin", "pm"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const rawBody = await c.req.json();
  const parsed = createProjectSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { name, customer_name, customer_id, vendor, solution_type, kickoff_date, target_go_live_date, pm_user_id: pmInput, pm_name, ae_user_id: aeInput, ae_name, sa_name, csm_name, engineer_name, dynamics_account_id, solution_id } = parsed.data;
  const projectId = crypto.randomUUID();
  const pm_user_id = pmInput ?? (auth.role === "pm" ? auth.user.id : null);
  const ae_user_id = aeInput ?? (auth.role === "pf_ae" ? auth.user.id : null);

  await db
    .prepare(
      `INSERT INTO projects (id, name, customer_name, customer_id, vendor, solution_type, status, health, kickoff_date, target_go_live_date, pm_user_id, pm_name, ae_user_id, ae_name, sa_name, csm_name, engineer_name, dynamics_account_id, solution_id)
       VALUES (?, ?, ?, ?, ?, ?, 'in_progress', 'on_track', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(projectId, name, customer_name ?? null, customer_id ?? null, vendor ?? null, solution_type ?? null, kickoff_date ?? null, target_go_live_date ?? null, pm_user_id, pm_name ?? null, ae_user_id, ae_name ?? null, sa_name ?? null, csm_name ?? null, engineer_name ?? null, dynamics_account_id ?? null, solution_id ?? null)
    .run();

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
  clear_health_override: z.boolean().optional(),
  target_go_live_date: z.string().optional(),
  actual_go_live_date: z.string().optional(),
  pm_user_id: z.string().nullable().optional(),
  pm_name: z.string().max(500).nullable().optional(),
  ae_user_id: z.string().nullable().optional(),
  ae_name: z.string().max(500).nullable().optional(),
  sa_name: z.string().max(500).nullable().optional(),
  csm_name: z.string().max(500).nullable().optional(),
  engineer_name: z.string().max(500).nullable().optional(),
  asana_project_id: z.string().nullable().optional(),
  managed_in_asana: z.number().int().min(0).max(1).optional(),
  solution_id: z.string().nullable().optional(),
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

  // Capture current health before update so we can detect at_risk transitions
  const before = await db
    .prepare("SELECT health, name, customer_name, pm_user_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ health: string | null; name: string; customer_name: string | null; pm_user_id: string | null }>();

  const { clear_health_override, ...updates } = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  // Handle "reset to auto" — clear override and compute health immediately
  if (clear_health_override) {
    const projectRow = await db
      .prepare("SELECT target_go_live_date, updated_at FROM projects WHERE id = ? LIMIT 1")
      .bind(projectId)
      .first<{ target_go_live_date: string | null; updated_at: string | null }>();
    const autoHealth = projectRow
      ? await computeProjectHealth(db, projectId, projectRow)
      : "on_track";
    await db
      .prepare("UPDATE projects SET health = ?, health_override = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(autoHealth, projectId)
      .run();
    const updated = await db.prepare("SELECT * FROM projects WHERE id = ? LIMIT 1").bind(projectId).first();
    return c.json(updated);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  // When health is explicitly set by a PM, record it as a manual override
  if (updates.health !== undefined) {
    fields.push("health_override = ?");
    values.push(updates.health);
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

  // Notify when health transitions to at_risk
  if (updates.health === "at_risk" && before?.health !== "at_risk" && before) {
    const appUrl = c.env.APP_URL ?? "";

    // Collect recipients: PM + partner AEs assigned via project_staff
    const partnerAes = await db
      .prepare(
        `SELECT u.id, u.email, u.name FROM project_staff ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.project_id = ? AND ps.staff_role = 'partner_ae' AND u.is_active = 1`
      )
      .bind(projectId)
      .all<{ id: string; email: string; name: string }>();

    const recipients: { email: string; name: string }[] = [];

    if (before.pm_user_id) {
      const pm = await db
        .prepare("SELECT email, name FROM users WHERE id = ? AND is_active = 1 LIMIT 1")
        .bind(before.pm_user_id)
        .first<{ email: string; name: string }>();
      if (pm) recipients.push(pm);
    }

    for (const ae of partnerAes.results ?? []) {
      if (!recipients.some((r) => r.email === ae.email)) recipients.push(ae);
    }

    for (const recipient of recipients) {
      const html = projectAtRisk({
        recipientName: recipient.name ?? recipient.email,
        projectName: before.name,
        customerName: before.customer_name,
        appUrl,
        projectId,
      });
      c.executionCtx.waitUntil(sendEmail(c.env, {
        to: recipient.email,
        subject: `Project at risk: ${before.name}`,
        html,
      }));
    }
  }

  return c.json(updated);
});

// ── Lifecycle chain ───────────────────────────────────────────────────────────

app.get("/:id/chain", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const project = await db
    .prepare("SELECT solution_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ solution_id: string | null }>();
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const [solution, optimizeAccount] = await Promise.all([
    project.solution_id
      ? db.prepare(
          "SELECT id, name, customer_name, status, solution_type, vendor FROM solutions WHERE id = ? LIMIT 1"
        ).bind(project.solution_id).first()
      : Promise.resolve(null),
    db.prepare(
      "SELECT project_id, optimize_status FROM optimize_accounts WHERE project_id = ? LIMIT 1"
    ).bind(projectId).first(),
  ]);

  return c.json({ solution, optimizeAccount });
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
           u.name, u.email, u.role, u.avatar_url, u.organization_name
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
           u.name, u.email, u.role, u.avatar_url, u.organization_name
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

// ── CRM team sync ─────────────────────────────────────────────────────────────

app.post("/:id/crm-sync", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const project = await db
    .prepare("SELECT dynamics_account_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ dynamics_account_id: string | null }>();

  if (!project?.dynamics_account_id) {
    throw new HTTPException(400, { message: "No CRM account linked to this project" });
  }

  const team = await getAccountTeam(c.env, project.dynamics_account_id);

  const [ae_user_id, sa_user_id, csm_user_id] = await Promise.all([
    findOrCreatePfUser(db, team.ae_email, team.ae_name, "pf_ae"),
    findOrCreatePfUser(db, team.sa_email, team.sa_name, "pf_sa"),
    findOrCreatePfUser(db, team.csm_email, team.csm_name, "pf_csm"),
  ]);

  // Upsert each role into project_staff — INSERT OR IGNORE handles duplicates
  const staffToSync = [
    { userId: ae_user_id,  role: "ae"  },
    { userId: sa_user_id,  role: "sa"  },
    { userId: csm_user_id, role: "csm" },
  ];

  for (const { userId, role } of staffToSync) {
    if (!userId) continue;
    // Remove any existing staff in this role first so we replace rather than duplicate
    await db.prepare("DELETE FROM project_staff WHERE project_id = ? AND staff_role = ?")
      .bind(projectId, role).run();
    await db.prepare("INSERT INTO project_staff (id, project_id, user_id, staff_role) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), projectId, userId, role).run();
  }

  // Return updated staff list
  const staff = await db.prepare(`
    SELECT ps.id, ps.project_id, ps.user_id, ps.staff_role, ps.created_at,
           u.name, u.email, u.role, u.avatar_url, u.organization_name
    FROM project_staff ps JOIN users u ON u.id = ps.user_id
    WHERE ps.project_id = ?
    ORDER BY ps.staff_role, u.name
  `).bind(projectId).all();

  return c.json({
    staff: staff.results ?? [],
    crm: { ae_name: team.ae_name, sa_name: team.sa_name, csm_name: team.csm_name },
  });
});

export default app;
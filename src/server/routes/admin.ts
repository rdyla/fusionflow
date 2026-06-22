import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { sendEmail } from "../services/emailService";
import { userInvite } from "../lib/emailTemplates";
import { computeProjectHealth } from "../lib/healthScore";
import { normalizeSolutionTypesField } from "../../shared/solutionTypes";
import { getDemoVendor, setDemoVendor } from "../lib/appSettings";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// PM-accessible read endpoints — must be registered BEFORE the admin-only catch-all below
app.get("/templates-list", requireRole("admin", "pm"), async (c) => {
  const db = c.env.DB;
  const templates = await db
    .prepare(
      `SELECT t.id, t.name, t.solution_type, t.description,
              COUNT(DISTINCT tp.id) AS stage_count,
              COUNT(DISTINCT tt.id) AS task_count
       FROM templates t
       LEFT JOIN template_stages tp ON tp.template_id = t.id
       LEFT JOIN template_tasks tt ON tt.template_id = t.id
       GROUP BY t.id
       ORDER BY t.name ASC`
    )
    .all();
  return c.json(templates.results ?? []);
});

// Admin routes are gated per-endpoint below. We do NOT use `app.use("*",
// requireRole("admin"))` here because adminRoutes is co-mounted with
// templateRoutes at `/api/admin` (see server/index.ts) and a wildcard
// gate on this sub-app leaks across to templateRoutes' paths, blocking
// PM access to `/api/admin/templates/:id`. Per-route gates keep scope
// limited to this file.

// ── Users ─────────────────────────────────────────────────────────────────────

app.get("/users", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT id, email, name, organization_name, role, is_active, is_support_supervisor, is_project_resource, is_pm_eligible, manager_id, zoom_user_id, cs_permission, created_at, updated_at
       FROM users
       ORDER BY name ASC`
    )
    .all();
  return c.json(rows.results ?? []);
});

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(500).optional(),
  organization_name: z.string().max(500).optional(),
  role: z.enum(["admin", "executive", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "partner_ae", "client"]),
  dynamics_account_id: z.string().optional(),
});

app.post("/users", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const rawBody = await c.req.json();
  const parsed = createUserSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { email, name, organization_name, role, dynamics_account_id } = parsed.data;

  const existing = await db
    .prepare("SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1")
    .bind(email)
    .first();

  if (existing) {
    throw new HTTPException(409, { message: "A user with that email already exists" });
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO users (id, email, name, organization_name, role, is_active, dynamics_account_id)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .bind(id, email.toLowerCase(), name ?? null, organization_name ?? null, role, dynamics_account_id ?? null)
    .run();

  const created = await db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(id).first<{ id: string; email: string; name: string | null; role: string }>();

  // Send invite email
  if (created) {
    const auth = c.get("auth");
    const appUrl = c.env.APP_URL ?? "";
    c.executionCtx.waitUntil(sendEmail(c.env, {
      to: created.email,
      subject: "You've been invited to CloudConnect",
      html: userInvite({ recipientName: created.name ?? created.email, invitedByName: auth.user.name ?? auth.user.email, role: created.role, appUrl }),
    }));
  }

  return c.json(created, 201);
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  email: z.string().email().optional(),
  organization_name: z.string().max(500).optional(),
  role: z.enum(["admin", "executive", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "partner_ae", "client"]).optional(),
  is_active: z.number().int().min(0).max(1).optional(),
  is_support_supervisor: z.number().int().min(0).max(1).optional(),
  is_project_resource: z.number().int().min(0).max(1).optional(),
  is_pm_eligible: z.number().int().min(0).max(1).optional(),
  dynamics_account_id: z.string().nullable().optional(),
  manager_id: z.string().nullable().optional(),
  zoom_user_id: z.string().nullable().optional(),
  cs_permission: z.enum(["none", "user", "power_user"]).optional(),
});

app.patch("/users/:id", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const userId = c.req.param("id");
  const rawBody = await c.req.json();
  const parsed = updateUserSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const existing = await db
    .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first();

  if (!existing) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const updates = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(key === "email" && typeof value === "string" ? value.toLowerCase() : value);
    }
  }

  if (!fields.length) {
    throw new HTTPException(400, { message: "No valid fields to update" });
  }

  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db
    .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, userId)
    .run();

  const updated = await db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(userId).first();
  return c.json(updated);
});

// Inspection: which entities currently reference this user. Used by the
// delete-confirmation modal so admins can see what's tied to the user before
// they hit Delete (and helps explain FK errors when a delete fails).
//
// Strategy: introspect every table's foreign keys (PRAGMA foreign_key_list)
// to find columns pointing at users(id), then count rows referencing this
// user in each. `blocking` is true when the FK has neither ON DELETE SET NULL
// nor CASCADE — those are the rows that'll fail the delete with a SQLITE FK
// constraint error until reassigned.
app.get("/users/:id/references", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const userId = c.req.param("id");
  const exists = await db.prepare("SELECT id FROM users WHERE id = ? LIMIT 1").bind(userId).first();
  if (!exists) throw new HTTPException(404, { message: "User not found" });

  // Friendly labels for the most common tables; everything else falls back to
  // the raw table name with column suffix.
  const FRIENDLY_TABLE: Record<string, string> = {
    project_staff: "Project staff",
    solution_staff: "Solution staff",
    prospecting_accounts: "Prospecting accounts",
    projects: "Projects",
    tasks: "Tasks",
    risks: "Blockers",
    solutions: "Solutions",
    customers: "Customers",
    project_access: "Project access grants",
    notifications: "Notifications",
    notes: "Notes",
    documents: "Documents",
    task_comments: "Task comments",
    optimize_accounts: "Optimize accounts",
    impact_assessments: "Impact assessments",
    feature_requests: "Feature requests",
    feature_request_votes: "Feature request votes",
    cs_proposals: "Cloud Support proposals",
    support_tickets: "Support tickets",
    users: "Users",
  };

  // Human-readable role label for each known FK column. Critical for tables
  // that reference users from multiple columns (e.g. solutions has PF SA + PF
  // CSM + partner AE) — without this an admin can't tell *why* the user is
  // tied to a row.
  const FRIENDLY_COLUMN: Record<string, string> = {
    created_by:            "Created by",
    created_by_id:         "Created by",
    creator_id:            "Created by",
    submitter_id:          "Submitted by",
    pm_user_id:            "PM",
    pf_ae_user_id:         "PF AE",
    pf_sa_user_id:         "PF SA",
    pf_csm_user_id:        "PF CSM",
    partner_ae_user_id:    "Partner AE",
    vendor_ae_user_id:     "Vendor AE",
    assignee_user_id:      "Assignee",
    owner_user_id:         "Owner",
    owner_id:              "Owner",
    author_user_id:        "Author",
    uploaded_by:           "Uploaded by",
    sa_user_id:            "SA",
    csm_user_id:           "CSM",
    ae_user_id:            "AE",
    graduated_by:          "Completed by",
    conducted_by_user_id:  "Conducted by",
    reviewed_by_user_id:   "Reviewed by",
    user_id:               "Linked user",
    manager_id:            "Manager of",
  };

  type Ref = { table: string; column: string; onDelete: string };
  const tableRows = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
    )
    .all<{ name: string }>();

  const refs: Ref[] = [];
  for (const row of tableRows.results ?? []) {
    // PRAGMA foreign_key_list doesn't accept binds; the table name comes from
    // sqlite_master (trusted), but we still validate it matches an identifier.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(row.name)) continue;
    try {
      const fkRes = await db.prepare(`PRAGMA foreign_key_list("${row.name}")`).all<{
        table: string;
        from: string;
        on_delete: string;
      }>();
      for (const fk of fkRes.results ?? []) {
        if (fk.table === "users") {
          refs.push({ table: row.name, column: fk.from, onDelete: (fk.on_delete ?? "").toUpperCase() });
        }
      }
    } catch {
      // Skip tables PRAGMA chokes on; we'll still surface every table we can introspect.
    }
  }

  type Bucket = { entity: string; count: number; blocking: boolean; samples: { id: string; label: string }[] };

  // For each FK ref: count rows where column = userId, fetch up to 5 samples.
  // Some tables don't have an `id` PK or a sensible label column — fall back
  // to the column name as the sample label in those cases.
  const buckets: Bucket[] = await Promise.all(refs.map(async (r) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(r.column)) {
      return { entity: r.table, count: 0, blocking: false, samples: [] };
    }
    const friendly = FRIENDLY_TABLE[r.table] ?? r.table;
    const role = FRIENDLY_COLUMN[r.column] ?? r.column;
    const entity = `${friendly} (${role})`;
    const onDel = r.onDelete;
    const blocking = onDel !== "SET NULL" && onDel !== "CASCADE" && onDel !== "SET DEFAULT";

    const cnt = await db
      .prepare(`SELECT COUNT(*) AS count FROM "${r.table}" WHERE "${r.column}" = ?`)
      .bind(userId)
      .first<{ count: number }>();
    const count = cnt?.count ?? 0;
    if (count === 0) return { entity, count: 0, blocking, samples: [] };

    // Build a sample SELECT using only columns that actually exist on this
    // table — pick the first available identifier and label columns from
    // priority lists. SQLite will throw "no such column" for any reference
    // to a missing column, so we *must* introspect first.
    let samples: { id: string; label: string }[] = [];
    try {
      const colsRes = await db.prepare(`PRAGMA table_info("${r.table}")`).all<{ name: string }>();
      const cols = new Set((colsRes.results ?? []).map((cc) => cc.name));
      const idCol = ["id"].find((cn) => cols.has(cn));
      const labelCol = ["name", "title", "subject", "type", "label"].find((cn) => cols.has(cn));
      const idExpr = idCol ? `"${idCol}"` : "''";
      const labelExpr = labelCol ? `COALESCE(NULLIF("${labelCol}", ''), ${idExpr})` : idExpr;
      const sampleRes = await db
        .prepare(`SELECT ${idExpr} AS id, ${labelExpr} AS label FROM "${r.table}" WHERE "${r.column}" = ? LIMIT 5`)
        .bind(userId)
        .all<{ id: string; label: string }>();
      samples = sampleRes.results ?? [];
    } catch {
      // Best-effort — leave samples empty if anything fails.
    }
    return { entity, count, blocking, samples };
  }));

  const visible = buckets.filter((b) => b.count > 0).sort((a, b) => Number(b.blocking) - Number(a.blocking));
  const blocked = visible.some((b) => b.blocking);
  return c.json({ blocked, buckets: visible });
});

app.delete("/users/:id", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const userId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM users WHERE id = ? LIMIT 1").bind(userId).first();
  if (!existing) throw new HTTPException(404, { message: "User not found" });

  await db.prepare("DELETE FROM project_access WHERE user_id = ?").bind(userId).run();
  try {
    await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/FOREIGN KEY|constraint/i.test(msg)) {
      throw new HTTPException(409, {
        message: "User is still referenced by other records. Open the delete dialog to see what's tied to them, reassign those, then try again.",
      });
    }
    throw err;
  }

  return c.json({ success: true });
});

// ── Project Management ─────────────────────────────────────────────────────────

app.get("/projects", requireRole("admin"), async (c) => {
  const rows = await c.env.DB
    .prepare(
      `SELECT p.id, p.name, p.customer_name, p.vendor, p.solution_types, p.status, p.health,
              p.kickoff_date, p.target_go_live_date, p.archived, p.created_at, p.updated_at,
              CASE WHEN oa.project_id IS NOT NULL THEN 1 ELSE 0 END AS in_optimize
       FROM projects p
       LEFT JOIN optimize_accounts oa ON oa.project_id = p.id
       ORDER BY p.updated_at DESC`
    )
    .all();
  return c.json((rows.results ?? []).map(normalizeSolutionTypesField));
});

app.patch("/projects/:id", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const { archived } = await c.req.json() as { archived?: number };

  if (archived === undefined || (archived !== 0 && archived !== 1)) {
    throw new HTTPException(400, { message: "archived must be 0 or 1" });
  }

  const existing = await db.prepare("SELECT id FROM projects WHERE id = ? LIMIT 1").bind(projectId).first();
  if (!existing) throw new HTTPException(404, { message: "Project not found" });

  await db
    .prepare("UPDATE projects SET archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(archived, projectId)
    .run();

  const updated = await db.prepare("SELECT * FROM projects WHERE id = ? LIMIT 1").bind(projectId).first();
  return c.json(updated);
});

app.delete("/projects/:id", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const existing = await db.prepare("SELECT id, name FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ id: string; name: string }>();
  if (!existing) throw new HTTPException(404, { message: "Project not found" });

  const optimizeLink = await db
    .prepare("SELECT id FROM optimize_accounts WHERE project_id = ? LIMIT 1")
    .bind(projectId)
    .first();
  if (optimizeLink) {
    throw new HTTPException(409, {
      message:
        `"${existing.name}" is in Optimize. Remove it from Optimize first ` +
        `(Admin → Optimize Accounts → Remove), then delete the project.`,
    });
  }

  // Cascade delete in dependency order
  await db.prepare("DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)").bind(projectId).run();
  await db.prepare("DELETE FROM documents WHERE project_id = ?").bind(projectId).run();
  await db.prepare("DELETE FROM project_access WHERE project_id = ?").bind(projectId).run();
  await db.prepare("DELETE FROM project_staff WHERE project_id = ?").bind(projectId).run();
  await db.prepare("DELETE FROM project_contacts WHERE project_id = ?").bind(projectId).run();
  await db.prepare("DELETE FROM utilization_snapshots WHERE project_id = ?").bind(projectId).run();
  await db.prepare("DELETE FROM notes WHERE project_id = ?").bind(projectId).run();
  await db.prepare("DELETE FROM risks WHERE project_id = ?").bind(projectId).run();
  await db.prepare("DELETE FROM tasks WHERE project_id = ?").bind(projectId).run();
  await db.prepare("DELETE FROM stages WHERE project_id = ?").bind(projectId).run();
  await db.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();

  return c.json({ success: true });
});

// ── Project Access ─────────────────────────────────────────────────────────────

app.get("/projects/:projectId/access", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const projectId = c.req.param("projectId");

  const project = await db
    .prepare("SELECT id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first();

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const rows = await db
    .prepare(
      `SELECT pa.id, pa.project_id, pa.user_id, pa.access_level,
              u.name, u.email, u.role, u.organization_name
       FROM project_access pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = ?
       ORDER BY u.name ASC`
    )
    .bind(projectId)
    .all();

  return c.json(rows.results ?? []);
});

const grantAccessSchema = z.object({
  user_id: z.string().min(1),
  access_level: z.string().optional(),
});

app.post("/projects/:projectId/access", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const projectId = c.req.param("projectId");
  const rawBody = await c.req.json();
  const parsed = grantAccessSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { user_id, access_level } = parsed.data;

  const project = await db
    .prepare("SELECT id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first();

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const user = await db
    .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .bind(user_id)
    .first();

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const alreadyExists = await db
    .prepare("SELECT id FROM project_access WHERE project_id = ? AND user_id = ? LIMIT 1")
    .bind(projectId, user_id)
    .first();

  if (alreadyExists) {
    throw new HTTPException(409, { message: "User already has access to this project" });
  }

  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO project_access (id, project_id, user_id, access_level) VALUES (?, ?, ?, ?)")
    .bind(id, projectId, user_id, access_level ?? "viewer")
    .run();

  const created = await db
    .prepare(
      `SELECT pa.id, pa.project_id, pa.user_id, pa.access_level,
              u.name, u.email, u.role, u.organization_name
       FROM project_access pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.id = ? LIMIT 1`
    )
    .bind(id)
    .first();

  return c.json(created, 201);
});

app.delete("/projects/:projectId/access/:userId", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const projectId = c.req.param("projectId");
  const userId = c.req.param("userId");

  const row = await db
    .prepare("SELECT id FROM project_access WHERE project_id = ? AND user_id = ? LIMIT 1")
    .bind(projectId, userId)
    .first();

  if (!row) {
    throw new HTTPException(404, { message: "Access record not found" });
  }

  await db
    .prepare("DELETE FROM project_access WHERE project_id = ? AND user_id = ?")
    .bind(projectId, userId)
    .run();

  return c.json({ success: true });
});

// ── Labor Config ─────────────────────────────────────────────────────────────

const LABOR_CONFIG_CATEGORIES = ["ucaas", "ccaas", "ci", "virtual_agent"] as const;
type LaborConfigCategory = typeof LABOR_CONFIG_CATEGORIES[number];

const LABOR_CONFIG_DEFAULT_HOURS: Record<LaborConfigCategory, Record<string, number>> = {
  ucaas: {
    discovery_requirements: 8, solution_design: 12, project_management: 10,
    implementation_configuration: 20, integration: 4, migration_data_porting: 12,
    testing_uat: 8, training_enablement: 6, documentation_handover: 4, hypercare: 6,
  },
  ccaas: {
    discovery_requirements: 12, solution_design: 18, project_management: 14,
    implementation_configuration: 32, integration: 8, migration_data_porting: 12,
    testing_uat: 12, training_enablement: 8, documentation_handover: 6, hypercare: 8,
  },
  ci: {
    discovery_requirements: 10, solution_design: 14, project_management: 10,
    implementation_configuration: 18, integration: 8, migration_data_porting: 2,
    testing_uat: 8, training_enablement: 6, documentation_handover: 4, hypercare: 6,
  },
  virtual_agent: {
    discovery_requirements: 12, solution_design: 16, project_management: 12,
    implementation_configuration: 24, integration: 10, migration_data_porting: 2,
    testing_uat: 10, training_enablement: 6, documentation_handover: 4, hypercare: 8,
  },
};

app.get("/labor-config", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const rows = await db.prepare("SELECT category, base_hours FROM labor_config").all<{ category: string; base_hours: string }>();
  const dbMap: Record<string, Record<string, number>> = {};
  for (const row of rows.results ?? []) {
    try { dbMap[row.category] = JSON.parse(row.base_hours); } catch { /* ignore */ }
  }
  const result: Record<string, Record<string, number>> = {};
  for (const cat of LABOR_CONFIG_CATEGORIES) {
    result[cat] = dbMap[cat] ?? LABOR_CONFIG_DEFAULT_HOURS[cat];
  }
  return c.json({ categories: result, defaults: LABOR_CONFIG_DEFAULT_HOURS });
});

const laborConfigSchema = z.object({
  category: z.enum(LABOR_CONFIG_CATEGORIES),
  base_hours: z.record(z.string(), z.number().min(0).max(9999)),
});

app.put("/labor-config", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const rawBody = await c.req.json();
  const parsed = laborConfigSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }
  const { category, base_hours } = parsed.data;
  await db.prepare(`
    INSERT INTO labor_config (category, base_hours, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(category) DO UPDATE SET base_hours = excluded.base_hours, updated_at = excluded.updated_at
  `).bind(category, JSON.stringify(base_hours)).run();
  return c.json({ ok: true });
});

app.delete("/labor-config/:category", requireRole("admin"), async (c) => {
  const db = c.env.DB;
  const category = c.req.param("category");
  if (!LABOR_CONFIG_CATEGORIES.includes(category as LaborConfigCategory)) {
    throw new HTTPException(400, { message: "Unknown category" });
  }
  await db.prepare("DELETE FROM labor_config WHERE category = ?").bind(category).run();
  return c.json({ ok: true });
});

// ── Health Scoring ────────────────────────────────────────────────────────────

app.post("/run-health-scoring", requireRole("admin"), async (c) => {
  const db = c.env.DB;

  const rows = await db
    .prepare(
      `SELECT id, target_go_live_date, updated_at FROM projects
       WHERE (archived = 0 OR archived IS NULL) AND health_override IS NULL`
    )
    .all<{ id: string; target_go_live_date: string | null; updated_at: string | null }>();

  let scored = 0;
  for (const project of rows.results ?? []) {
    try {
      const health = await computeProjectHealth(db, project.id, project);
      await db.prepare("UPDATE projects SET health = ? WHERE id = ?").bind(health, project.id).run();
      scored++;
    } catch {
      // skip
    }
  }

  return c.json({ scored });
});

// ── Settings: demo mode (vendor lens for partner demos) ──────────────────────

app.get("/settings/demo-mode", requireRole("admin"), async (c) => {
  const vendor = await getDemoVendor(c.env.DB);
  return c.json({ vendor });
});

const demoModeSchema = z.object({
  // "webex" backs the Cisco demo (Cisco Webex Calling).
  vendor: z.enum(["zoom", "ringcentral", "webex"]).nullable(),
});

app.put("/settings/demo-mode", requireRole("admin"), async (c) => {
  const auth = c.get("auth");
  const parsed = demoModeSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw new HTTPException(400, { message: "vendor must be 'zoom', 'ringcentral', 'webex', or null" });
  }
  await setDemoVendor(c.env.DB, parsed.data.vendor, auth.user.id);
  return c.json({ vendor: parsed.data.vendor });
});

export default app;

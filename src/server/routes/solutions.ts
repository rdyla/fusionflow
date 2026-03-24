import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { sendEmail } from "../services/emailService";
import { userInvite } from "../lib/emailTemplates";
import { getTeamUserIds, inPlaceholders } from "../lib/teamUtils";
import { getAccountTeam } from "../services/dynamicsService";
import { findOrCreatePfUser } from "../lib/crmUsers";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const SOLUTION_SELECT = `
  SELECT s.*,
    u1.name as pf_ae_name, u1.email as pf_ae_email_addr,
    u2.name as partner_ae_display_name,
    u3.name as pf_sa_name,
    u4.name as pf_csm_name,
    (SELECT COUNT(*) FROM projects p WHERE p.solution_id = s.id) AS linked_project_count
  FROM solutions s
  LEFT JOIN users u1 ON u1.id = s.pf_ae_user_id
  LEFT JOIN users u2 ON u2.id = s.partner_ae_user_id
  LEFT JOIN users u3 ON u3.id = s.pf_sa_user_id
  LEFT JOIN users u4 ON u4.id = s.pf_csm_user_id
`;

const SOLUTION_TYPE_LABELS: Record<string, string> = {
  ucaas: "UCaaS",
  ccaas: "CCaaS",
  ci: "Conversation Intelligence",
  va: "AI Virtual Agent",
};

function accessClause(role: string, teamIds: string[]): { where: string; bindings: string[] } {
  if (role === "admin" || role === "executive" || role === "pm" || role === "pf_sa" || role === "pf_csm") return { where: "1=1", bindings: [] };
  if (role === "pf_ae") {
    const ph = inPlaceholders(teamIds);
    return {
      where: `(s.pf_ae_user_id IN (${ph}) OR s.created_by IN (${ph}) OR s.id IN (SELECT solution_id FROM solution_staff WHERE user_id IN (${ph}) AND staff_role = 'pf_ae'))`,
      bindings: [...teamIds, ...teamIds, ...teamIds],
    };
  }
  // partner_ae
  const ph = inPlaceholders(teamIds);
  return { where: `s.partner_ae_user_id IN (${ph})`, bindings: [...teamIds] };
}

// ── List ──────────────────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const auth = c.get("auth");
  const teamIds = (auth.role === "pf_ae" || auth.role === "partner_ae")
    ? await getTeamUserIds(auth.user.id, c.env.DB)
    : [auth.user.id];
  const { where, bindings } = accessClause(auth.role, teamIds);
  const rows = await c.env.DB
    .prepare(`${SOLUTION_SELECT} WHERE ${where} ORDER BY s.updated_at DESC`)
    .bind(...bindings)
    .all();
  return c.json(rows.results ?? []);
});

// ── Create ────────────────────────────────────────────────────────────────────

const createSolutionSchema = z.object({
  customer_name: z.string().min(1).max(500),
  dynamics_account_id: z.string().optional(),
  vendor: z.enum(["zoom", "ringcentral", "tbd"]).optional(),
  solution_type: z.enum(["ucaas", "ccaas", "ci", "va"]),
  pf_ae_user_id: z.string().optional(),
  pf_sa_user_id: z.string().optional(),
  pf_csm_user_id: z.string().optional(),
  partner_ae_user_id: z.string().optional(),
  partner_ae_name: z.string().optional(),
  partner_ae_email: z.string().email().optional().or(z.literal("")),
});

app.post("/", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;

  const parsed = createSolutionSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const {
    customer_name, dynamics_account_id, solution_type,
    pf_ae_user_id, pf_sa_user_id, pf_csm_user_id,
    partner_ae_user_id, partner_ae_name, partner_ae_email,
  } = parsed.data;
  const vendor = parsed.data.vendor ?? "tbd";

  const name = `${customer_name} — ${SOLUTION_TYPE_LABELS[solution_type] ?? solution_type}`;
  const id = crypto.randomUUID();

  // Resolve partner AE: use existing user, find by email, or create + invite
  let resolvedPartnerAeUserId: string | null = partner_ae_user_id ?? null;
  if (!resolvedPartnerAeUserId && partner_ae_email) {
    const existing = await db
      .prepare("SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1")
      .bind(partner_ae_email)
      .first<{ id: string }>();

    if (existing) {
      resolvedPartnerAeUserId = existing.id;
    } else if (partner_ae_name) {
      const newUserId = crypto.randomUUID();
      await db
        .prepare("INSERT INTO users (id, email, name, role, is_active) VALUES (?, ?, ?, 'partner_ae', 1)")
        .bind(newUserId, partner_ae_email.toLowerCase(), partner_ae_name)
        .run();
      resolvedPartnerAeUserId = newUserId;

      const appUrl = c.env.APP_URL ?? "";
      c.executionCtx.waitUntil(sendEmail(c.env, {
        to: partner_ae_email,
        subject: "You've been invited to FusionFlow360",
        html: userInvite({
          recipientName: partner_ae_name,
          invitedByName: auth.user.name ?? auth.user.email,
          role: "partner_ae",
          appUrl,
        }),
      }));
    }
  }

  await db
    .prepare(
      `INSERT INTO solutions
         (id, name, customer_name, dynamics_account_id, vendor, solution_type,
          pf_ae_user_id, pf_sa_user_id, pf_csm_user_id,
          partner_ae_user_id, partner_ae_name, partner_ae_email, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id, name, customer_name, dynamics_account_id ?? null, vendor, solution_type,
      pf_ae_user_id ?? null, pf_sa_user_id ?? null, pf_csm_user_id ?? null,
      resolvedPartnerAeUserId, partner_ae_name ?? null, partner_ae_email ?? null, auth.user.id
    )
    .run();

  // Auto-populate solution_staff from CRM-resolved team members
  const staffEntries: [string, string][] = [
    ...(pf_ae_user_id  ? [[pf_ae_user_id,  "pf_ae"] as [string, string]]  : []),
    ...(pf_sa_user_id  ? [[pf_sa_user_id,  "pf_sa"] as [string, string]]  : []),
    ...(pf_csm_user_id ? [[pf_csm_user_id, "pf_csm"] as [string, string]] : []),
  ];
  for (const [userId, role] of staffEntries) {
    await db.prepare("INSERT OR IGNORE INTO solution_staff (id, solution_id, user_id, staff_role) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), id, userId, role).run();
  }

  const created = await db.prepare(`${SOLUTION_SELECT} WHERE s.id = ? LIMIT 1`).bind(id).first();
  return c.json(created, 201);
});

// ── Detail ────────────────────────────────────────────────────────────────────

app.get("/:id", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const teamIds = (auth.role === "pf_ae" || auth.role === "partner_ae")
    ? await getTeamUserIds(auth.user.id, db)
    : [auth.user.id];
  const { where, bindings } = accessClause(auth.role, teamIds);
  const solution = await db
    .prepare(`${SOLUTION_SELECT} WHERE s.id = ? AND (${where}) LIMIT 1`)
    .bind(c.req.param("id"), ...bindings)
    .first();
  if (!solution) throw new HTTPException(404, { message: "Solution not found" });
  return c.json(solution);
});

// ── Update ────────────────────────────────────────────────────────────────────

const updateSolutionSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  customer_name: z.string().min(1).max(500).optional(),
  dynamics_account_id: z.string().nullable().optional(),
  vendor: z.enum(["zoom", "ringcentral", "tbd"]).optional(),
  solution_type: z.enum(["ucaas", "ccaas", "ci", "va"]).optional(),
  status: z.enum(["draft", "assessment", "requirements", "scope", "handoff", "won", "lost"]).optional(),
  pf_ae_user_id: z.string().nullable().optional(),
  pf_sa_user_id: z.string().nullable().optional(),
  pf_csm_user_id: z.string().nullable().optional(),
  partner_ae_user_id: z.string().nullable().optional(),
  partner_ae_name: z.string().nullable().optional(),
  partner_ae_email: z.string().nullable().optional(),
  needs_assessment: z.string().nullable().optional(),
  requirements: z.string().nullable().optional(),
  scope_of_work: z.string().nullable().optional(),
  handoff_notes: z.string().nullable().optional(),
  gap_analysis: z.string().nullable().optional(),
  linked_project_id: z.string().nullable().optional(),
});

app.patch("/:id", async (c) => {
  const db = c.env.DB;
  const solutionId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM solutions WHERE id = ? LIMIT 1").bind(solutionId).first();
  if (!existing) throw new HTTPException(404, { message: "Solution not found" });

  const parsed = updateSolutionSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const updates = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (!fields.length) throw new HTTPException(400, { message: "No valid fields to update" });
  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db
    .prepare(`UPDATE solutions SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, solutionId)
    .run();

  const updated = await db.prepare(`${SOLUTION_SELECT} WHERE s.id = ? LIMIT 1`).bind(solutionId).first();
  return c.json(updated);
});

// ── Delete ────────────────────────────────────────────────────────────────────

app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin") throw new HTTPException(403, { message: "Admin only" });

  const db = c.env.DB;
  const solutionId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM solutions WHERE id = ? LIMIT 1").bind(solutionId).first();
  if (!existing) throw new HTTPException(404, { message: "Solution not found" });

  await db.prepare("DELETE FROM solutions WHERE id = ?").bind(solutionId).run();
  return c.json({ success: true });
});

// ── Solution Contacts ─────────────────────────────────────────────────────────

app.get("/:id/contacts", async (c) => {
  const db = c.env.DB;
  const solutionId = c.req.param("id");
  const rows = await db
    .prepare("SELECT * FROM solution_contacts WHERE solution_id = ? ORDER BY added_at ASC")
    .bind(solutionId)
    .all();
  return c.json(rows.results ?? []);
});

const contactSchema = z.object({
  dynamics_contact_id: z.string().optional(),
  name: z.string().min(1).max(200),
  email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  contact_role: z.string().nullable().optional(),
});

app.post("/:id/contacts", async (c) => {
  const db = c.env.DB;
  const solutionId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM solutions WHERE id = ? LIMIT 1").bind(solutionId).first();
  if (!existing) throw new HTTPException(404, { message: "Solution not found" });

  const parsed = contactSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid contact data" });

  const { dynamics_contact_id, name, email, phone, job_title, contact_role } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO solution_contacts (id, solution_id, dynamics_contact_id, name, email, phone, job_title, contact_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, solutionId, dynamics_contact_id ?? null, name, email || null, phone ?? null, job_title ?? null, contact_role ?? null)
    .run();

  const contact = await db.prepare("SELECT * FROM solution_contacts WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(contact, 201);
});

app.delete("/:id/contacts/:contactId", async (c) => {
  const db = c.env.DB;
  const solutionId = c.req.param("id");
  const contactId = c.req.param("contactId");

  const contact = await db
    .prepare("SELECT id FROM solution_contacts WHERE id = ? AND solution_id = ? LIMIT 1")
    .bind(contactId, solutionId)
    .first();
  if (!contact) throw new HTTPException(404, { message: "Contact not found" });

  await db.prepare("DELETE FROM solution_contacts WHERE id = ?").bind(contactId).run();
  return c.json({ success: true });
});

// ── Linked projects list ──────────────────────────────────────────────────────

app.get("/:id/projects", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const solutionId = c.req.param("id");

  const teamIds = (auth.role === "pf_ae" || auth.role === "partner_ae")
    ? await getTeamUserIds(auth.user.id, db)
    : [auth.user.id];
  const { where, bindings } = accessClause(auth.role, teamIds);
  const solution = await db
    .prepare(`SELECT s.id FROM solutions s WHERE s.id = ? AND (${where}) LIMIT 1`)
    .bind(solutionId, ...bindings)
    .first();
  if (!solution) throw new HTTPException(404, { message: "Solution not found" });

  const rows = await db.prepare(`
    SELECT id, name, customer_name, vendor, solution_type, status, health,
           kickoff_date, target_go_live_date, actual_go_live_date,
           pm_user_id, pm_name, ae_user_id, ae_name, sa_name, csm_name,
           solution_id, created_at, updated_at,
           CASE WHEN EXISTS(SELECT 1 FROM optimize_accounts oa WHERE oa.project_id = projects.id) THEN 1 ELSE 0 END AS has_optimization
    FROM projects
    WHERE solution_id = ? AND (archived = 0 OR archived IS NULL)
    ORDER BY created_at DESC
  `).bind(solutionId).all();

  return c.json(rows.results ?? []);
});

// ── Link / unlink existing project ────────────────────────────────────────────

app.post("/:id/link-project", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin" && auth.role !== "pm") throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const solutionId = c.req.param("id");

  const solution = await db.prepare("SELECT id FROM solutions WHERE id = ? LIMIT 1").bind(solutionId).first();
  if (!solution) throw new HTTPException(404, { message: "Solution not found" });

  const { project_id } = await c.req.json<{ project_id: string }>();
  if (!project_id) throw new HTTPException(400, { message: "project_id required" });

  const project = await db.prepare("SELECT id FROM projects WHERE id = ? LIMIT 1").bind(project_id).first();
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  await db.prepare("UPDATE projects SET solution_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(solutionId, project_id).run();

  return c.json({ success: true });
});

app.delete("/:id/link-project/:projectId", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin" && auth.role !== "pm") throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const solutionId = c.req.param("id");
  const projectId = c.req.param("projectId");

  await db.prepare("UPDATE projects SET solution_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND solution_id = ?")
    .bind(projectId, solutionId).run();

  return c.json({ success: true });
});

// ── Handoff: Create Project ───────────────────────────────────────────────────

app.post("/:id/create-project", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin" && auth.role !== "pm") {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const db = c.env.DB;
  const solutionId = c.req.param("id");

  const solution = await db
    .prepare("SELECT * FROM solutions WHERE id = ? LIMIT 1")
    .bind(solutionId)
    .first<{
      id: string; name: string; customer_name: string; vendor: string; solution_type: string;
      pf_ae_user_id: string | null; partner_ae_user_id: string | null;
      dynamics_account_id: string | null;
    }>();

  if (!solution) throw new HTTPException(404, { message: "Solution not found" });

  const VENDOR_LABELS: Record<string, string> = { zoom: "Zoom", ringcentral: "RingCentral" };

  const projectId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO projects (id, name, customer_name, vendor, solution_type, status, ae_user_id, solution_id, dynamics_account_id)
       VALUES (?, ?, ?, ?, ?, 'planning', ?, ?, ?)`
    )
    .bind(
      projectId,
      solution.name,
      solution.customer_name,
      VENDOR_LABELS[solution.vendor] ?? solution.vendor,
      solution.solution_type,
      solution.pf_ae_user_id ?? null,
      solutionId,
      solution.dynamics_account_id ?? null,
    )
    .run();

  // Copy solution_staff (pf_ae/pf_sa/pf_csm) into project_staff (ae/sa/csm)
  const solutionStaff = await db
    .prepare("SELECT user_id, staff_role FROM solution_staff WHERE solution_id = ? AND staff_role IN ('pf_ae', 'pf_sa', 'pf_csm')")
    .bind(solutionId)
    .all<{ user_id: string; staff_role: string }>();

  const roleMap: Record<string, string> = { pf_ae: "ae", pf_sa: "sa", pf_csm: "csm" };
  for (const ss of solutionStaff.results ?? []) {
    const projectRole = roleMap[ss.staff_role];
    if (projectRole) {
      await db.prepare("INSERT OR IGNORE INTO project_staff (id, project_id, user_id, staff_role) VALUES (?, ?, ?, ?)")
        .bind(crypto.randomUUID(), projectId, ss.user_id, projectRole).run();
    }
  }

  // Grant partner AE viewer access on the new project
  if (solution.partner_ae_user_id) {
    const accessId = crypto.randomUUID();
    await db
      .prepare("INSERT INTO project_access (id, project_id, user_id, access_level) VALUES (?, ?, ?, 'viewer')")
      .bind(accessId, projectId, solution.partner_ae_user_id)
      .run();
  }

  await db
    .prepare("UPDATE solutions SET linked_project_id = ?, status = 'won', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(projectId, solutionId)
    .run();

  // Copy solution contacts to project contacts
  const solContacts = await db
    .prepare("SELECT * FROM solution_contacts WHERE solution_id = ?")
    .bind(solutionId)
    .all<{ id: string; dynamics_contact_id: string | null; name: string; email: string | null; phone: string | null; job_title: string | null; contact_role: string | null }>();

  for (const sc of solContacts.results ?? []) {
    const pcId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO project_contacts (id, project_id, dynamics_contact_id, name, email, phone, job_title, contact_role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(pcId, projectId, sc.dynamics_contact_id, sc.name, sc.email, sc.phone, sc.job_title, sc.contact_role)
      .run();
  }

  const project = await db.prepare("SELECT * FROM projects WHERE id = ? LIMIT 1").bind(projectId).first();
  return c.json(project, 201);
});

// ── Solution Staff ────────────────────────────────────────────────────────────

app.get("/:id/staff", async (c) => {
  const auth = c.get("auth");
  const { role } = auth;
  if (!["admin", "pm", "pf_ae", "pf_sa", "pf_csm"].includes(role)) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await c.env.DB.prepare(`
    SELECT ss.id, ss.solution_id, ss.user_id, ss.staff_role, ss.created_at,
           u.name, u.email, u.role, u.avatar_url
    FROM solution_staff ss
    JOIN users u ON u.id = ss.user_id
    WHERE ss.solution_id = ?
    ORDER BY ss.staff_role, u.name
  `).bind(c.req.param("id")).all();
  return c.json(rows.results ?? []);
});

app.post("/:id/staff", async (c) => {
  const auth = c.get("auth");
  const { role } = auth;
  if (!["admin", "pm", "pf_ae", "pf_sa"].includes(role)) throw new HTTPException(403, { message: "Forbidden" });

  const { user_id, staff_role } = await c.req.json<{ user_id: string; staff_role: string }>();
  if (!user_id || !staff_role) throw new HTTPException(400, { message: "user_id and staff_role required" });

  const solutionId = c.req.param("id");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT OR IGNORE INTO solution_staff (id, solution_id, user_id, staff_role) VALUES (?, ?, ?, ?)")
    .bind(id, solutionId, user_id, staff_role).run();

  const created = await c.env.DB.prepare(`
    SELECT ss.id, ss.solution_id, ss.user_id, ss.staff_role, ss.created_at,
           u.name, u.email, u.role, u.avatar_url
    FROM solution_staff ss JOIN users u ON u.id = ss.user_id
    WHERE ss.solution_id = ? AND ss.user_id = ? AND ss.staff_role = ? LIMIT 1
  `).bind(solutionId, user_id, staff_role).first();
  return c.json(created, 201);
});

app.delete("/:id/staff/:staffId", async (c) => {
  const auth = c.get("auth");
  const { role } = auth;
  if (!["admin", "pm", "pf_ae", "pf_sa"].includes(role)) throw new HTTPException(403, { message: "Forbidden" });

  await c.env.DB.prepare("DELETE FROM solution_staff WHERE id = ? AND solution_id = ?")
    .bind(c.req.param("staffId"), c.req.param("id")).run();
  return c.json({ success: true });
});

// ── CRM team sync ─────────────────────────────────────────────────────────────

app.post("/:id/crm-sync", async (c) => {
  const auth = c.get("auth");
  const { role } = auth;
  if (!["admin", "pm", "pf_ae", "pf_sa"].includes(role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const solutionId = c.req.param("id");

  const solution = await db
    .prepare("SELECT dynamics_account_id FROM solutions WHERE id = ? LIMIT 1")
    .bind(solutionId)
    .first<{ dynamics_account_id: string | null }>();

  if (!solution?.dynamics_account_id) {
    throw new HTTPException(400, { message: "No CRM account linked to this solution" });
  }

  const team = await getAccountTeam(c.env, solution.dynamics_account_id);

  const [ae_user_id, sa_user_id, csm_user_id] = await Promise.all([
    findOrCreatePfUser(db, team.ae_email, team.ae_name, "pf_ae"),
    findOrCreatePfUser(db, team.sa_email, team.sa_name, "pf_sa"),
    findOrCreatePfUser(db, team.csm_email, team.csm_name, "pf_csm"),
  ]);

  const staffToSync = [
    { userId: ae_user_id,  role: "pf_ae"  },
    { userId: sa_user_id,  role: "pf_sa"  },
    { userId: csm_user_id, role: "pf_csm" },
  ];

  for (const { userId, role: staffRole } of staffToSync) {
    if (!userId) continue;
    await db.prepare("DELETE FROM solution_staff WHERE solution_id = ? AND staff_role = ?")
      .bind(solutionId, staffRole).run();
    await db.prepare("INSERT INTO solution_staff (id, solution_id, user_id, staff_role) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), solutionId, userId, staffRole).run();
  }

  const staff = await db.prepare(`
    SELECT ss.id, ss.solution_id, ss.user_id, ss.staff_role, ss.created_at,
           u.name, u.email, u.role, u.avatar_url
    FROM solution_staff ss JOIN users u ON u.id = ss.user_id
    WHERE ss.solution_id = ?
  `).bind(solutionId).all();

  return c.json({
    staff: staff.results ?? [],
    crm: { ae_name: team.ae_name, sa_name: team.sa_name, csm_name: team.csm_name },
  });
});

export default app;

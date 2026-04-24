import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { getAccountTeam } from "../services/dynamicsService";
import { findOrCreatePfUser } from "../lib/crmUsers";
import { normalizeSolutionTypesField, normalizeSolutionRow } from "../../shared/solutionTypes";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Access helpers ─────────────────────────────────────────────────────────────

function canViewCustomers(role: string): boolean {
  return ["admin", "executive", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "partner_ae", "client"].includes(role);
}

function canEditCustomer(role: string): boolean {
  return ["admin", "pm", "pf_ae", "pf_sa", "pf_csm"].includes(role);
}

// ── Select fragment ────────────────────────────────────────────────────────────

const CUSTOMER_SELECT = `
  SELECT c.*,
    ae.name  AS pf_ae_name,  ae.email  AS pf_ae_email,
    sa.name  AS pf_sa_name,  sa.email  AS pf_sa_email,
    csm.name AS pf_csm_name, csm.email AS pf_csm_email
  FROM customers c
  LEFT JOIN users ae  ON ae.id  = c.pf_ae_user_id
  LEFT JOIN users sa  ON sa.id  = c.pf_sa_user_id
  LEFT JOIN users csm ON csm.id = c.pf_csm_user_id
`;

// ── Data migration (must come before /:id to avoid 405 shadowing) ─────────────
// Admin-only. Idempotent — safe to call multiple times.

app.post("/migrate", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin") throw new HTTPException(403, { message: "Admin only" });

  const db = c.env.DB;
  let created = 0;
  let linked = 0;

  // Create customers from solutions (preferred — they carry team data)
  const solutionAccounts = await db
    .prepare(`
      SELECT dynamics_account_id, customer_name, pf_ae_user_id, pf_sa_user_id, pf_csm_user_id
      FROM solutions
      WHERE dynamics_account_id IS NOT NULL AND dynamics_account_id != ''
      GROUP BY dynamics_account_id
    `)
    .all<{
      dynamics_account_id: string;
      customer_name: string;
      pf_ae_user_id: string | null;
      pf_sa_user_id: string | null;
      pf_csm_user_id: string | null;
    }>();

  for (const row of solutionAccounts.results ?? []) {
    const existing = await db
      .prepare("SELECT id FROM customers WHERE crm_account_id = ? LIMIT 1")
      .bind(row.dynamics_account_id)
      .first<{ id: string }>();

    let customerId = existing?.id;

    if (!customerId) {
      customerId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO customers (id, name, crm_account_id, pf_ae_user_id, pf_sa_user_id, pf_csm_user_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(customerId, row.customer_name, row.dynamics_account_id, row.pf_ae_user_id ?? null, row.pf_sa_user_id ?? null, row.pf_csm_user_id ?? null).run();
      created++;
    }

    const r = await db
      .prepare("UPDATE solutions SET customer_id = ? WHERE dynamics_account_id = ? AND (customer_id IS NULL OR customer_id != ?)")
      .bind(customerId, row.dynamics_account_id, customerId)
      .run();
    linked += r.meta.changes ?? 0;
  }

  // Create customers from projects whose CRM account isn't already covered
  const projectAccounts = await db
    .prepare(`
      SELECT dynamics_account_id, customer_name
      FROM projects
      WHERE dynamics_account_id IS NOT NULL AND dynamics_account_id != ''
        AND dynamics_account_id NOT IN (SELECT crm_account_id FROM customers WHERE crm_account_id IS NOT NULL)
      GROUP BY dynamics_account_id
    `)
    .all<{ dynamics_account_id: string; customer_name: string }>();

  for (const row of projectAccounts.results ?? []) {
    const customerId = crypto.randomUUID();
    await db.prepare(
      "INSERT INTO customers (id, name, crm_account_id) VALUES (?, ?, ?)"
    ).bind(customerId, row.customer_name, row.dynamics_account_id).run();
    created++;

    const r = await db
      .prepare("UPDATE projects SET customer_id = ? WHERE dynamics_account_id = ?")
      .bind(customerId, row.dynamics_account_id)
      .run();
    linked += r.meta.changes ?? 0;
  }

  // Link any remaining projects via crm_account_id match
  const rp = await db.prepare(`
    UPDATE projects
    SET customer_id = (SELECT id FROM customers WHERE crm_account_id = projects.dynamics_account_id LIMIT 1)
    WHERE dynamics_account_id IS NOT NULL AND customer_id IS NULL
      AND EXISTS (SELECT 1 FROM customers WHERE crm_account_id = projects.dynamics_account_id)
  `).run();
  linked += rp.meta.changes ?? 0;

  // Link optimize_accounts via their project's customer_id
  const ro = await db.prepare(`
    UPDATE optimize_accounts
    SET customer_id = (SELECT customer_id FROM projects WHERE projects.id = optimize_accounts.project_id LIMIT 1)
    WHERE customer_id IS NULL
      AND EXISTS (SELECT 1 FROM projects WHERE projects.id = optimize_accounts.project_id AND projects.customer_id IS NOT NULL)
  `).run();
  linked += ro.meta.changes ?? 0;

  return c.json({ created, linked });
});

// ── List ───────────────────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  let sql = `${CUSTOMER_SELECT} WHERE 1=1`;
  const bindings: string[] = [];

  if (auth.role === "client" && auth.user.dynamics_account_id) {
    sql += " AND c.crm_account_id = ?";
    bindings.push(auth.user.dynamics_account_id);
  }

  sql += " ORDER BY c.name ASC";
  const rows = await db.prepare(sql).bind(...bindings).all();
  return c.json(rows.results ?? []);
});

// ── Create ─────────────────────────────────────────────────────────────────────

const createCustomerSchema = z.object({
  name: z.string().min(1).max(500),
  crm_account_id: z.string().min(1),
  sharepoint_url: z.string().nullable().optional(),
  pf_ae_user_id: z.string().nullable().optional(),
  pf_sa_user_id: z.string().nullable().optional(),
  pf_csm_user_id: z.string().nullable().optional(),
});

app.post("/", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = createCustomerSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { name, crm_account_id, sharepoint_url, pf_ae_user_id, pf_sa_user_id, pf_csm_user_id } = parsed.data;
  const db = c.env.DB;

  const existing = await db
    .prepare("SELECT id FROM customers WHERE crm_account_id = ? LIMIT 1")
    .bind(crm_account_id)
    .first<{ id: string }>();
  if (existing) throw new HTTPException(409, { message: "A customer with this CRM account already exists" });

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO customers (id, name, crm_account_id, sharepoint_url, pf_ae_user_id, pf_sa_user_id, pf_csm_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, name, crm_account_id, sharepoint_url ?? null, pf_ae_user_id ?? null, pf_sa_user_id ?? null, pf_csm_user_id ?? null)
    .run();

  const created = await db.prepare(`${CUSTOMER_SELECT} WHERE c.id = ? LIMIT 1`).bind(id).first();
  return c.json(created, 201);
});

// ── Detail ─────────────────────────────────────────────────────────────────────

app.get("/:id", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const customer = await c.env.DB
    .prepare(`${CUSTOMER_SELECT} WHERE c.id = ? LIMIT 1`)
    .bind(c.req.param("id"))
    .first();
  if (!customer) throw new HTTPException(404, { message: "Customer not found" });
  return c.json(customer);
});

// ── Update ─────────────────────────────────────────────────────────────────────

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  sharepoint_url: z.string().nullable().optional(),
  pf_ae_user_id: z.string().nullable().optional(),
  pf_sa_user_id: z.string().nullable().optional(),
  pf_csm_user_id: z.string().nullable().optional(),
});

app.patch("/:id", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const customerId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!existing) throw new HTTPException(404, { message: "Customer not found" });

  const parsed = updateCustomerSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) { fields.push(`${key} = ?`); values.push(value); }
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });
  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db.prepare(`UPDATE customers SET ${fields.join(", ")} WHERE id = ?`).bind(...values, customerId).run();

  return c.json(await db.prepare(`${CUSTOMER_SELECT} WHERE c.id = ? LIMIT 1`).bind(customerId).first());
});

// ── Delete ─────────────────────────────────────────────────────────────────────

app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin") throw new HTTPException(403, { message: "Admin only" });

  const db = c.env.DB;
  const customerId = c.req.param("id");
  const existing = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!existing) throw new HTTPException(404, { message: "Customer not found" });

  await db.prepare("DELETE FROM customers WHERE id = ?").bind(customerId).run();
  return c.json({ success: true });
});

// ── CRM sync: pull PF team from Dynamics ──────────────────────────────────────

app.post("/:id/crm-sync", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const customerId = c.req.param("id");

  const customer = await db
    .prepare("SELECT crm_account_id FROM customers WHERE id = ? LIMIT 1")
    .bind(customerId)
    .first<{ crm_account_id: string }>();
  if (!customer) throw new HTTPException(404, { message: "Customer not found" });

  const team = await getAccountTeam(c.env, customer.crm_account_id);

  const [ae_user_id, sa_user_id, csm_user_id] = await Promise.all([
    findOrCreatePfUser(db, team.ae_email, team.ae_name, "pf_ae"),
    findOrCreatePfUser(db, team.sa_email, team.sa_name, "pf_sa"),
    findOrCreatePfUser(db, team.csm_email, team.csm_name, "pf_csm"),
  ]);

  await db.prepare(`
    UPDATE customers
    SET pf_ae_user_id  = COALESCE(?, pf_ae_user_id),
        pf_sa_user_id  = COALESCE(?, pf_sa_user_id),
        pf_csm_user_id = COALESCE(?, pf_csm_user_id),
        address_city   = COALESCE(?, address_city),
        address_state  = COALESCE(?, address_state),
        updated_at     = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(ae_user_id, sa_user_id, csm_user_id, team.address_city, team.address_state, customerId).run();

  const updated = await db.prepare(`${CUSTOMER_SELECT} WHERE c.id = ? LIMIT 1`).bind(customerId).first();
  return c.json({ customer: updated, crm: { ae_name: team.ae_name, sa_name: team.sa_name, csm_name: team.csm_name } });
});

// ── Contacts ───────────────────────────────────────────────────────────────────

app.get("/:id/contacts", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await c.env.DB
    .prepare("SELECT * FROM customer_contacts WHERE customer_id = ? ORDER BY name ASC")
    .bind(c.req.param("id"))
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
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const customerId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!existing) throw new HTTPException(404, { message: "Customer not found" });

  const parsed = contactSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid contact data" });

  const { dynamics_contact_id, name, email, phone, job_title, contact_role } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO customer_contacts (id, customer_id, dynamics_contact_id, name, email, phone, job_title, contact_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, customerId, dynamics_contact_id ?? null, name, email || null, phone ?? null, job_title ?? null, contact_role ?? null)
    .run();

  return c.json(await db.prepare("SELECT * FROM customer_contacts WHERE id = ? LIMIT 1").bind(id).first(), 201);
});

app.delete("/:id/contacts/:contactId", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const { id: customerId, contactId } = c.req.param();
  const contact = await c.env.DB
    .prepare("SELECT id FROM customer_contacts WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(contactId, customerId)
    .first();
  if (!contact) throw new HTTPException(404, { message: "Contact not found" });

  await c.env.DB.prepare("DELETE FROM customer_contacts WHERE id = ?").bind(contactId).run();
  return c.json({ success: true });
});

// ── Provider AEs ───────────────────────────────────────────────────────────────

app.get("/:id/provider-aes", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await c.env.DB
    .prepare("SELECT * FROM customer_provider_aes WHERE customer_id = ? ORDER BY company ASC, name ASC")
    .bind(c.req.param("id"))
    .all();
  return c.json(rows.results ?? []);
});

const providerAeSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().nullable().optional(),
});

app.post("/:id/provider-aes", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const customerId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!existing) throw new HTTPException(404, { message: "Customer not found" });

  const parsed = providerAeSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid provider AE data" });

  const { name, company, email, phone } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare("INSERT INTO customer_provider_aes (id, customer_id, name, company, email, phone) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, customerId, name, company ?? null, email || null, phone ?? null)
    .run();

  return c.json(await db.prepare("SELECT * FROM customer_provider_aes WHERE id = ? LIMIT 1").bind(id).first(), 201);
});

app.patch("/:id/provider-aes/:aeId", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const { id: customerId, aeId } = c.req.param();

  const existing = await db
    .prepare("SELECT id FROM customer_provider_aes WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(aeId, customerId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Provider AE not found" });

  const parsed = providerAeSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid provider AE data" });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) { fields.push(`${key} = ?`); values.push(value); }
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });

  await db.prepare(`UPDATE customer_provider_aes SET ${fields.join(", ")} WHERE id = ?`).bind(...values, aeId).run();

  return c.json(await db.prepare("SELECT * FROM customer_provider_aes WHERE id = ? LIMIT 1").bind(aeId).first());
});

app.delete("/:id/provider-aes/:aeId", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const { id: customerId, aeId } = c.req.param();
  const existing = await c.env.DB
    .prepare("SELECT id FROM customer_provider_aes WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(aeId, customerId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Provider AE not found" });

  await c.env.DB.prepare("DELETE FROM customer_provider_aes WHERE id = ?").bind(aeId).run();
  return c.json({ success: true });
});

// ── Journey tabs ───────────────────────────────────────────────────────────────

app.get("/:id/solutions", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await c.env.DB
    .prepare(`
      SELECT s.id, s.name, s.vendor, s.solution_types, s.other_technologies, s.status,
             s.created_at, s.updated_at, s.linked_project_id, s.dynamics_account_id, s.journeys
      FROM solutions s
      WHERE s.customer_id = ?
      ORDER BY s.updated_at DESC
    `)
    .bind(c.req.param("id"))
    .all();
  return c.json((rows.results ?? []).map(normalizeSolutionRow));
});

app.get("/:id/projects", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await c.env.DB
    .prepare(`
      SELECT p.id, p.name, p.vendor, p.solution_types, p.status, p.health,
             p.kickoff_date, p.target_go_live_date, p.actual_go_live_date,
             p.pm_user_id, p.created_at, p.updated_at,
             CASE WHEN EXISTS(SELECT 1 FROM optimize_accounts oa WHERE oa.project_id = p.id) THEN 1 ELSE 0 END AS has_optimization
      FROM projects p
      WHERE p.customer_id = ? AND (p.archived = 0 OR p.archived IS NULL)
      ORDER BY p.updated_at DESC
    `)
    .bind(c.req.param("id"))
    .all();
  return c.json((rows.results ?? []).map(normalizeSolutionTypesField));
});

app.get("/:id/optimizations", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await c.env.DB
    .prepare(`
      SELECT oa.id, oa.project_id, oa.optimize_status, oa.graduated_at, oa.next_review_date,
             p.name AS project_name, p.vendor, p.solution_types, p.actual_go_live_date
      FROM optimize_accounts oa
      JOIN projects p ON p.id = oa.project_id
      WHERE oa.customer_id = ?
      ORDER BY oa.graduated_at DESC
    `)
    .bind(c.req.param("id"))
    .all();
  return c.json((rows.results ?? []).map(normalizeSolutionTypesField));
});

export default app;

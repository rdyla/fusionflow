import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { sendEmail } from "../services/emailService";
import { userInvite } from "../lib/emailTemplates";
import { getTeamUserIds, inPlaceholders } from "../lib/teamUtils";
import { getAccountTeam } from "../services/dynamicsService";
import { findOrCreatePfUser } from "../lib/crmUsers";
import { notifyZoomChat } from "../lib/notifications";
import {
  parseSolutionTypes,
  serializeSolutionTypes,
  serializeOtherTechnologies,
  joinSolutionTypeLabels,
  normalizeSolutionRow,
  isOtherTechnology,
  SOLUTION_TYPES,
  OTHER_TECHNOLOGIES,
  type SolutionType,
  type OtherTechnology,
} from "../../shared/solutionTypes";
import { ADD_ON_KINDS, serializeAddOns } from "../../shared/sowAddOns";
import { recomputeSowTotal } from "../lib/sowTotal";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const SOLUTION_SELECT = `
  SELECT s.*,
    u2.name as partner_ae_display_name,
    cu1.name as customer_pf_ae_name, cu1.email as customer_pf_ae_email,
    cu2.name as customer_pf_sa_name, cu2.email as customer_pf_sa_email,
    cu3.name as customer_pf_csm_name, cu3.email as customer_pf_csm_email,
    cust.sharepoint_url as customer_sharepoint_url
  FROM solutions s
  LEFT JOIN users u2 ON u2.id = s.partner_ae_user_id
  LEFT JOIN customers cust ON cust.id = s.customer_id
  LEFT JOIN users cu1 ON cu1.id = cust.pf_ae_user_id
  LEFT JOIN users cu2 ON cu2.id = cust.pf_sa_user_id
  LEFT JOIN users cu3 ON cu3.id = cust.pf_csm_user_id
`;

const JOURNEY_LABELS: Record<string, string> = {
  zoom_ucaas: "UCaaS", zoom_ccaas: "CCaaS", zoom_rooms: "Zoom Rooms",
  zoom_zva: "ZVA", zoom_zra: "ZRA", zoom_qm: "QM", zoom_wfm: "WFM",
  zoom_ai_expert_assist: "AI Expert Assist", zoom_workvivo: "Workvivo",
  zoom_integrations: "Integrations / API",
  rc_ucaas: "UCaaS", rc_ccaas: "CCaaS", rc_air: "AIR", rc_ava: "AVA", rc_ace: "ACE",
  agnostic_ucaas: "UCaaS", agnostic_ccaas: "CCaaS",
  bdr: "Backup & Disaster Recovery", connectivity: "Connectivity",
  colocation: "Colocation", cyber_security: "Cyber Security",
  daas: "Desktop as a Service", help_desk: "Help Desk",
  iaas: "Infrastructure as a Service", mobility: "Mobility (Corporate Cellular)",
  managed_services: "Managed Services", managed_cloud: "Managed Public Cloud",
  sdwan: "SD-WAN / SASE / Aggregation", tem: "Technology Expense Management (TEM)",
  other: "Other Technology Discovery",
};

function deriveVendorFromJourneys(journeys: string[]): "zoom" | "ringcentral" | "tbd" {
  if (journeys.some(j => j.startsWith("zoom_"))) return "zoom";
  if (journeys.some(j => j.startsWith("rc_"))) return "ringcentral";
  return "tbd";
}

/**
 * Returns every canonical SolutionType implied by the selected journeys,
 * preserving the order from the SOLUTION_TYPES enum. A journey bundle like
 * ["zoom_ucaas","zoom_zra"] yields ["ucaas","ci"]. Non-canonical journeys
 * (bdr, sdwan, etc.) are handled separately by deriveOtherTechnologiesFromJourneys.
 *
 * zoom_wfm and zoom_qm intentionally still map to "ci" rather than "wfm"/"qm"
 * to preserve existing NA routing — a user who wants WFM/QM as a standalone
 * type can pick it explicitly from the multi-select.
 */
function deriveSolutionTypesFromJourneys(journeys: string[]): SolutionType[] {
  const types = new Set<SolutionType>();
  for (const j of journeys) {
    if (["zoom_ccaas", "rc_ccaas", "agnostic_ccaas"].includes(j)) types.add("ccaas");
    else if (["zoom_ucaas", "rc_ucaas", "agnostic_ucaas"].includes(j)) types.add("ucaas");
    else if (["zoom_zra", "zoom_qm", "zoom_wfm", "zoom_ai_expert_assist", "rc_ace", "rc_ava"].includes(j)) types.add("ci");
    else if (["zoom_zva", "rc_air"].includes(j)) types.add("va");
  }
  return SOLUTION_TYPES.filter((t) => types.has(t));
}

function deriveOtherTechnologiesFromJourneys(journeys: string[]): OtherTechnology[] {
  const techs = new Set<OtherTechnology>();
  for (const j of journeys) if (isOtherTechnology(j)) techs.add(j);
  return OTHER_TECHNOLOGIES.filter((t) => techs.has(t));
}

function nameFromJourneys(customerName: string, journeys: string[], vendor: string): string {
  if (!journeys.length) return customerName;
  const vendorPrefix = vendor === "zoom" ? "Zoom" : vendor === "ringcentral" ? "RingCentral" : null;
  const labels = journeys.map(j => JOURNEY_LABELS[j] ?? j);
  const suffix = vendorPrefix ? `${vendorPrefix} ${labels.join(" · ")}` : labels.join(" · ");
  return `${customerName} — ${suffix}`;
}

function accessClause(role: string, teamIds: string[], accountId?: string | null): { where: string; bindings: string[] } {
  if (role === "admin" || role === "executive" || role === "pm" || role === "pf_sa" || role === "pf_csm") return { where: "1=1", bindings: [] };
  if (role === "pf_ae") {
    const ph = inPlaceholders(teamIds);
    return {
      where: `(s.customer_id IN (SELECT id FROM customers WHERE pf_ae_user_id IN (${ph})) OR s.created_by IN (${ph}))`,
      bindings: [...teamIds, ...teamIds],
    };
  }
  if (role === "client") {
    if (!accountId) return { where: "1=0", bindings: [] };
    return { where: "s.dynamics_account_id = ?", bindings: [accountId] };
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
  const { where, bindings } = accessClause(auth.role, teamIds, auth.user.dynamics_account_id);
  const rows = await c.env.DB
    .prepare(`${SOLUTION_SELECT} WHERE ${where} ORDER BY s.updated_at DESC`)
    .bind(...bindings)
    .all();
  return c.json((rows.results ?? []).map(normalizeSolutionRow));
});

// ── Create ────────────────────────────────────────────────────────────────────

const createSolutionSchema = z.object({
  customer_name: z.string().min(1).max(500),
  customer_id: z.string().optional(),
  dynamics_account_id: z.string().optional(),
  vendor: z.enum(["zoom", "ringcentral", "tbd"]).optional(),
  solution_types: z.array(z.enum(SOLUTION_TYPES)).optional(),
  other_technologies: z.array(z.enum(OTHER_TECHNOLOGIES)).optional(),
  journeys: z.array(z.string()).optional(),
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
    customer_name, customer_id, dynamics_account_id,
    partner_ae_user_id, partner_ae_name, partner_ae_email,
  } = parsed.data;

  const journeys = parsed.data.journeys ?? [];
  const journeysJson = journeys.length > 0 ? JSON.stringify(journeys) : null;
  const vendor = journeys.length > 0
    ? deriveVendorFromJourneys(journeys)
    : (parsed.data.vendor ?? "tbd");

  // Explicit types on the payload win; otherwise derive from journeys. Default
  // to ["ucaas"] only if nothing was supplied, preserving the legacy fallback.
  const explicitTypes = parsed.data.solution_types ?? [];
  const explicitOtherTechs = parsed.data.other_technologies ?? [];
  const solution_types: SolutionType[] = explicitTypes.length > 0
    ? explicitTypes
    : (journeys.length > 0 ? deriveSolutionTypesFromJourneys(journeys) : ["ucaas"]);
  const other_technologies: OtherTechnology[] = explicitOtherTechs.length > 0
    ? explicitOtherTechs
    : deriveOtherTechnologiesFromJourneys(journeys);

  const name = journeys.length > 0
    ? nameFromJourneys(customer_name, journeys, vendor)
    : `${customer_name} — ${joinSolutionTypeLabels(solution_types)}`;
  const id = crypto.randomUUID();

  // Find or create customer record when a CRM account is selected
  let resolvedCustomerId: string | null = customer_id ?? null;
  if (dynamics_account_id && !resolvedCustomerId) {
    const existingCustomer = await db
      .prepare("SELECT id FROM customers WHERE crm_account_id = ? LIMIT 1")
      .bind(dynamics_account_id)
      .first<{ id: string }>();
    if (existingCustomer) {
      resolvedCustomerId = existingCustomer.id;
    } else {
      const newCustomerId = crypto.randomUUID();
      await db
        .prepare("INSERT INTO customers (id, name, crm_account_id) VALUES (?, ?, ?)")
        .bind(newCustomerId, customer_name ?? "Unknown", dynamics_account_id)
        .run();
      resolvedCustomerId = newCustomerId;
      try {
        const team = await getAccountTeam(c.env, dynamics_account_id);
        const [aeId, saId, csmId] = await Promise.all([
          findOrCreatePfUser(db, team.ae_email, team.ae_name, "pf_ae"),
          findOrCreatePfUser(db, team.sa_email, team.sa_name, "pf_sa"),
          findOrCreatePfUser(db, team.csm_email, team.csm_name, "pf_csm"),
        ]);
        if (aeId || saId || csmId) {
          await db
            .prepare("UPDATE customers SET pf_ae_user_id = ?, pf_sa_user_id = ?, pf_csm_user_id = ? WHERE id = ?")
            .bind(aeId ?? null, saId ?? null, csmId ?? null, newCustomerId)
            .run();
        }
      } catch { /* sync is best-effort */ }
    }
  }

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
        subject: "You've been invited to CloudConnect",
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
         (id, name, customer_name, customer_id, dynamics_account_id, vendor, solution_types, other_technologies, journeys,
          partner_ae_user_id, partner_ae_name, partner_ae_email, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id, name, customer_name, resolvedCustomerId, dynamics_account_id ?? null, vendor,
      serializeSolutionTypes(solution_types), serializeOtherTechnologies(other_technologies), journeysJson,
      resolvedPartnerAeUserId, partner_ae_name ?? null, partner_ae_email ?? null, auth.user.id
    )
    .run();

  const created = await db.prepare(`${SOLUTION_SELECT} WHERE s.id = ? LIMIT 1`).bind(id).first();

  if (c.env.ZOOM_CHAT_WEBHOOK_URL) {
    c.executionCtx.waitUntil(notifyZoomChat(c.env.ZOOM_CHAT_WEBHOOK_URL, c.env.APP_URL ?? "", {
      event: "solution_created",
      solutionId: id,
      solutionName: name,
      actorName: auth.user.name ?? auth.user.email,
    }));
  }

  return c.json(created ? normalizeSolutionRow(created) : null, 201);
});

// ── Detail ────────────────────────────────────────────────────────────────────

app.get("/:id", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const teamIds = (auth.role === "pf_ae" || auth.role === "partner_ae")
    ? await getTeamUserIds(auth.user.id, db)
    : [auth.user.id];
  const { where, bindings } = accessClause(auth.role, teamIds, auth.user.dynamics_account_id);
  const solution = await db
    .prepare(`${SOLUTION_SELECT} WHERE s.id = ? AND (${where}) LIMIT 1`)
    .bind(c.req.param("id"), ...bindings)
    .first();
  if (!solution) throw new HTTPException(404, { message: "Solution not found" });
  return c.json(normalizeSolutionRow(solution));
});

// ── Update ────────────────────────────────────────────────────────────────────

const addOnSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  kind: z.enum(ADD_ON_KINDS),
  value: z.number().finite(),
  note: z.string().optional(),
});

const updateSolutionSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  customer_name: z.string().min(1).max(500).optional(),
  dynamics_account_id: z.string().nullable().optional(),
  vendor: z.string().optional(),
  solution_types: z.array(z.enum(SOLUTION_TYPES)).optional(),
  other_technologies: z.array(z.enum(OTHER_TECHNOLOGIES)).optional(),
  journeys: z.array(z.string()).nullable().optional(),
  status: z.enum(["draft", "assessment", "requirements", "scope", "handoff", "won", "lost"]).optional(),
  partner_ae_user_id: z.string().nullable().optional(),
  partner_ae_name: z.string().nullable().optional(),
  partner_ae_email: z.string().nullable().optional(),
  needs_assessment: z.string().nullable().optional(),
  requirements: z.string().nullable().optional(),
  scope_of_work: z.string().nullable().optional(),
  handoff_notes: z.string().nullable().optional(),
  phd_data: z.string().nullable().optional(),
  sow_data: z.string().nullable().optional(),
  gap_analysis: z.string().nullable().optional(),
  linked_project_id: z.string().nullable().optional(),
  add_ons: z.array(addOnSchema).optional(),
  blended_rate: z.number().positive().finite().optional(),
  pricing_mode: z.enum(["basic", "advanced"]).optional(),
  basic_seat_count: z.number().int().positive().nullable().optional(),
  basic_inputs: z.object({
    users:             z.number().int().min(0),
    sites:             z.number().int().min(1),
    go_lives:          z.number().int().min(1),
    training_sessions: z.number().int().min(0),
    onsite_sites:      z.number().int().min(0),
    onsite_devices:    z.number().int().min(0),
  }).nullable().optional(),
});

app.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const solutionId = c.req.param("id");

  const existing = await db
    .prepare("SELECT id, name FROM solutions WHERE id = ? LIMIT 1")
    .bind(solutionId)
    .first<{ id: string; name: string }>();
  if (!existing) throw new HTTPException(404, { message: "Solution not found" });

  const parsed = updateSolutionSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const updates = parsed.data;

  const fields: string[] = [];
  const values: unknown[] = [];
  let pricingTouched = false;

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (key === "journeys") {
      fields.push("journeys = ?");
      values.push(value === null ? null : JSON.stringify(value));
    } else if (key === "solution_types" && Array.isArray(value)) {
      fields.push("solution_types = ?");
      values.push(serializeSolutionTypes(value as SolutionType[]));
    } else if (key === "other_technologies" && Array.isArray(value)) {
      fields.push("other_technologies = ?");
      values.push(serializeOtherTechnologies(value as OtherTechnology[]));
    } else if (key === "add_ons" && Array.isArray(value)) {
      fields.push("add_ons = ?");
      // Schema-validated upstream by addOnSchema; cast to drop the union
      // produced by Object.entries on the inferred Zod type.
      values.push(serializeAddOns(value as Parameters<typeof serializeAddOns>[0]));
      pricingTouched = true;
    } else if (key === "blended_rate") {
      fields.push("blended_rate = ?");
      values.push(value);
      pricingTouched = true;
    } else if (key === "pricing_mode" || key === "basic_seat_count") {
      fields.push(`${key} = ?`);
      values.push(value);
      pricingTouched = true;
    } else if (key === "basic_inputs") {
      fields.push("basic_inputs = ?");
      values.push(value === null ? null : JSON.stringify(value));
      pricingTouched = true;
    } else {
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

  if (pricingTouched) {
    await recomputeSowTotal(db, solutionId);
  }

  const updated = await db.prepare(`${SOLUTION_SELECT} WHERE s.id = ? LIMIT 1`).bind(solutionId).first();
  const normalizedUpdated = updated ? normalizeSolutionRow(updated) : null;

  if (c.env.ZOOM_CHAT_WEBHOOK_URL && updates.status) {
    c.executionCtx.waitUntil(notifyZoomChat(c.env.ZOOM_CHAT_WEBHOOK_URL, c.env.APP_URL ?? "", {
      event: "solution_status_changed",
      solutionId,
      solutionName: existing.name,
      actorName: auth.user.name ?? auth.user.email,
      newStatus: updates.status,
    }));
  }

  return c.json(normalizedUpdated);
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
      id: string; name: string; customer_name: string; vendor: string;
      solution_types: string; other_technologies: string;
      customer_id: string | null; partner_ae_user_id: string | null;
      dynamics_account_id: string | null;
    }>();

  if (!solution) throw new HTTPException(404, { message: "Solution not found" });

  const VENDOR_LABELS: Record<string, string> = { zoom: "Zoom", ringcentral: "RingCentral" };

  const projectId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO projects (id, name, customer_name, customer_id, vendor, solution_types, status, dynamics_account_id)
       VALUES (?, ?, ?, ?, ?, ?, 'planning', ?)`
    )
    .bind(
      projectId,
      solution.name,
      solution.customer_name,
      solution.customer_id ?? null,
      VENDOR_LABELS[solution.vendor] ?? solution.vendor,
      // Solution's solution_types JSON string is already shaped as the project column wants.
      // Round-trip through parse/serialize to filter out any drift and enforce canonical shape.
      serializeSolutionTypes(parseSolutionTypes(solution.solution_types)),
      solution.dynamics_account_id ?? null,
    )
    .run();

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
    .prepare("SELECT dynamics_account_id, customer_id FROM solutions WHERE id = ? LIMIT 1")
    .bind(solutionId)
    .first<{ dynamics_account_id: string | null; customer_id: string | null }>();

  if (!solution?.dynamics_account_id) {
    throw new HTTPException(400, { message: "No CRM account linked to this solution" });
  }

  const team = await getAccountTeam(c.env, solution.dynamics_account_id);

  const [ae_user_id, sa_user_id, csm_user_id] = await Promise.all([
    findOrCreatePfUser(db, team.ae_email, team.ae_name, "pf_ae"),
    findOrCreatePfUser(db, team.sa_email, team.sa_name, "pf_sa"),
    findOrCreatePfUser(db, team.csm_email, team.csm_name, "pf_csm"),
  ]);

  // Account team lives on the customer — update or create it
  let customerId = solution.customer_id;
  if (customerId) {
    await db.prepare("UPDATE customers SET pf_ae_user_id = ?, pf_sa_user_id = ?, pf_csm_user_id = ? WHERE id = ?")
      .bind(ae_user_id ?? null, sa_user_id ?? null, csm_user_id ?? null, customerId).run();
  } else {
    const existingCust = await db.prepare("SELECT id FROM customers WHERE crm_account_id = ? LIMIT 1")
      .bind(solution.dynamics_account_id).first<{ id: string }>();
    if (existingCust) {
      customerId = existingCust.id;
      await db.prepare("UPDATE customers SET pf_ae_user_id = ?, pf_sa_user_id = ?, pf_csm_user_id = ? WHERE id = ?")
        .bind(ae_user_id ?? null, sa_user_id ?? null, csm_user_id ?? null, customerId).run();
      await db.prepare("UPDATE solutions SET customer_id = ? WHERE id = ?").bind(customerId, solutionId).run();
    }
  }

  const updated = await db.prepare(`${SOLUTION_SELECT} WHERE s.id = ? LIMIT 1`).bind(solutionId).first();
  return c.json({
    solution: updated,
    crm: { ae_name: team.ae_name, sa_name: team.sa_name, csm_name: team.csm_name },
  });
});

export default app;

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { sendEmail } from "../services/emailService";
import { userInvite } from "../lib/emailTemplates";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const SOLUTION_SELECT = `
  SELECT s.*,
    u1.name as pf_ae_name, u1.email as pf_ae_email_addr,
    u2.name as partner_ae_display_name
  FROM solutions s
  LEFT JOIN users u1 ON u1.id = s.pf_ae_user_id
  LEFT JOIN users u2 ON u2.id = s.partner_ae_user_id
`;

const SOLUTION_TYPE_LABELS: Record<string, string> = {
  ucaas: "UCaaS",
  ccaas: "CCaaS",
  zoom_ra: "Zoom Revenue Accelerator",
  rc_ace: "RingCentral ACE",
};

function accessClause(role: string, userId: string): { where: string; bindings: string[] } {
  if (role === "admin" || role === "pm") return { where: "1=1", bindings: [] };
  if (role === "pf_ae") return { where: "(s.pf_ae_user_id = ? OR s.created_by = ?)", bindings: [userId, userId] };
  return { where: "s.partner_ae_user_id = ?", bindings: [userId] };
}

// ── List ──────────────────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const auth = c.get("auth");
  const { where, bindings } = accessClause(auth.role, auth.user.id);
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
  vendor: z.enum(["zoom", "ringcentral"]),
  solution_type: z.enum(["ucaas", "ccaas", "zoom_ra", "rc_ace"]),
  pf_ae_user_id: z.string().optional(),
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
    customer_name, dynamics_account_id, vendor, solution_type,
    pf_ae_user_id, partner_ae_user_id, partner_ae_name, partner_ae_email,
  } = parsed.data;

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
      sendEmail(c.env, {
        to: partner_ae_email,
        subject: "You've been invited to FusionFlow",
        html: userInvite({
          recipientName: partner_ae_name,
          invitedByName: auth.user.name ?? auth.user.email,
          role: "partner_ae",
          appUrl,
        }),
      });
    }
  }

  await db
    .prepare(
      `INSERT INTO solutions
         (id, name, customer_name, dynamics_account_id, vendor, solution_type,
          pf_ae_user_id, partner_ae_user_id, partner_ae_name, partner_ae_email, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id, name, customer_name, dynamics_account_id ?? null, vendor, solution_type,
      pf_ae_user_id ?? null, resolvedPartnerAeUserId,
      partner_ae_name ?? null, partner_ae_email ?? null, auth.user.id
    )
    .run();

  const created = await db.prepare(`${SOLUTION_SELECT} WHERE s.id = ? LIMIT 1`).bind(id).first();
  return c.json(created, 201);
});

// ── Detail ────────────────────────────────────────────────────────────────────

app.get("/:id", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const { where, bindings } = accessClause(auth.role, auth.user.id);
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
  vendor: z.enum(["zoom", "ringcentral"]).optional(),
  solution_type: z.enum(["ucaas", "ccaas", "zoom_ra", "rc_ace"]).optional(),
  status: z.enum(["draft", "assessment", "requirements", "scope", "handoff", "won", "lost"]).optional(),
  pf_ae_user_id: z.string().nullable().optional(),
  partner_ae_user_id: z.string().nullable().optional(),
  partner_ae_name: z.string().nullable().optional(),
  partner_ae_email: z.string().nullable().optional(),
  needs_assessment: z.string().nullable().optional(),
  requirements: z.string().nullable().optional(),
  scope_of_work: z.string().nullable().optional(),
  handoff_notes: z.string().nullable().optional(),
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
      pf_ae_user_id: string | null; partner_ae_user_id: string | null; linked_project_id: string | null;
    }>();

  if (!solution) throw new HTTPException(404, { message: "Solution not found" });
  if (solution.linked_project_id) throw new HTTPException(409, { message: "A project has already been created for this solution" });

  const VENDOR_LABELS: Record<string, string> = { zoom: "Zoom", ringcentral: "RingCentral" };

  const projectId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO projects (id, name, customer_name, vendor, solution_type, status, ae_user_id)
       VALUES (?, ?, ?, ?, ?, 'planning', ?)`
    )
    .bind(
      projectId,
      solution.name,
      solution.customer_name,
      VENDOR_LABELS[solution.vendor] ?? solution.vendor,
      solution.solution_type,
      solution.pf_ae_user_id ?? null
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

  const project = await db.prepare("SELECT * FROM projects WHERE id = ? LIMIT 1").bind(projectId).first();
  return c.json(project, 201);
});

export default app;

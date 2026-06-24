import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppUser, AuthContext, Bindings, Variables } from "../types";
import { getPortalContact } from "../services/dynamicsService";

type AppMiddleware = MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }>;

async function findUserByEmail(db: D1Database, email: string): Promise<AppUser | null> {
  const result = await db
    .prepare(
      `
      SELECT id, email, name, organization_name, role, is_active, is_support_supervisor, dynamics_account_id, manager_id, cs_permission,
             avatar_url, title, phone, scheduler_url, email_notifications
      FROM users
      WHERE lower(email) = lower(?)
      LIMIT 1
      `
    )
    .bind(email)
    .first<AppUser>();

  return result ?? null;
}

const PARTNER_DOMAINS: Record<string, string> = {
  "zoom.com": "Zoom",
  "zoom.us": "Zoom",
  "ringcentral.com": "RingCentral",
  "cisco.com": "Cisco",
};

type ContactCompany = {
  accountId: string;
  organization: string | null;
  contactId: string;
  contactName: string | null;
};

/**
 * Resolves a customer contact added anywhere in CloudConnect — a project, a
 * solution, or their company record — to the company they belong to. This lets
 * ad-hoc contacts who aren't CRM portal users log in: they're scoped to their
 * company's CRM account (`dynamics_account_id`), which is how all client-side
 * scoping already works, so they see every item belonging to their company.
 *
 * Returns the most-recently-added match if the email appears in several places.
 * `email` is expected pre-lowercased (the login routes lowercase it).
 */
async function resolveContactCompany(db: D1Database, email: string): Promise<ContactCompany | null> {
  try {
    const row = await db
    .prepare(
      `
      SELECT account_id AS accountId, org AS organization, contact_id AS contactId, contact_name AS contactName
      FROM (
        SELECT COALESCE(p.dynamics_account_id, c.crm_account_id) AS account_id,
               COALESCE(c.name, p.customer_name)                 AS org,
               pc.id AS contact_id, pc.name AS contact_name, pc.added_at AS ts
        FROM project_contacts pc
        JOIN projects p       ON p.id = pc.project_id
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE pc.email IS NOT NULL AND lower(pc.email) = lower(?)

        UNION ALL
        SELECT COALESCE(s.dynamics_account_id, c.crm_account_id),
               COALESCE(c.name, s.customer_name),
               sc.id, sc.name, sc.added_at
        FROM solution_contacts sc
        JOIN solutions s      ON s.id = sc.solution_id
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE sc.email IS NOT NULL AND lower(sc.email) = lower(?)

        UNION ALL
        SELECT cu.crm_account_id, cu.name, cc.id, cc.name, cc.added_at
        FROM customer_contacts cc
        JOIN customers cu     ON cu.id = cc.customer_id
        WHERE cc.email IS NOT NULL AND lower(cc.email) = lower(?)
      )
      WHERE account_id IS NOT NULL AND account_id != ''
      ORDER BY ts DESC
      LIMIT 1
      `
    )
    .bind(email, email, email)
    .first<ContactCompany>();

    return row ?? null;
  } catch (err) {
    // Never let a contact-table issue break login — fall through to the CRM
    // portal lookup instead of 500ing the verify request.
    console.error(`[auth] resolveContactCompany failed for ${email}:`, err);
    return null;
  }
}

async function provisionUser(
  db: D1Database,
  email: string,
  organization: string,
  role: import("../types").AppRole,
  isActive = true
): Promise<AppUser> {
  const id = crypto.randomUUID();
  const namePart = email.split("@")[0];
  const activeFlag = isActive ? 1 : 0;

  await db
    .prepare(
      `INSERT INTO users (id, email, name, organization_name, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, email, namePart, organization, role, activeFlag)
    .run();

  return { id, email, name: namePart, organization_name: organization, role, is_active: activeFlag, dynamics_account_id: null, manager_id: null };
}

/**
 * Resolves a user by email: DB lookup → auto-provision → CRM fallback.
 * Returns null if the email has no access.
 * Exported so the OTP verify route can use it to build the session.
 */
export async function resolveUserByEmail(env: Bindings, email: string): Promise<AuthContext | "pending" | null> {
  let user = await findUserByEmail(env.DB, email);

  if (!user) {
    const domain = email.split("@")[1] ?? "";
    if (domain === "packetfusion.com") {
      user = await provisionUser(env.DB, email, "Packet Fusion", "pm");
    } else if (PARTNER_DOMAINS[domain]) {
      await provisionUser(env.DB, email, PARTNER_DOMAINS[domain], "partner_ae", false);
      return "pending";
    } else {
      // 1) Contact-based access: a customer contact added to a project,
      //    solution, or their company record can log in even if they aren't a
      //    CRM portal contact, scoped to everything belonging to their company.
      const company = await resolveContactCompany(env.DB, email);
      if (company) {
        // Case-opening is governed by CRM, not the contact tables: if this
        // person is also a portal user with case-opening enabled in D365, honor
        // it. Ad-hoc contacts not in CRM resolve to null here → view-only.
        const portal = await getPortalContact(env, email);
        const clientUser: AppUser = {
          id: company.contactId,
          email,
          name: company.contactName,
          organization_name: company.organization,
          role: "client",
          is_active: 1,
          dynamics_account_id: company.accountId,
          manager_id: null,
          can_open_cases: portal?.canOpenCases ?? false,
        };
        return { user: clientUser, role: "client", organization: company.organization };
      }

      // 2) Fall back to the CRM portal lookup (portal access defined in D365).
      const contact = await getPortalContact(env, email);
      if (contact) {
        const clientUser: AppUser = {
          id: contact.contactid,
          email: contact.email,
          name: contact.name || null,
          organization_name: contact.accountName,
          role: "client",
          is_active: 1,
          dynamics_account_id: contact.accountId,
          manager_id: null,
          can_open_cases: contact.canOpenCases,
        };
        return { user: clientUser, role: "client", organization: contact.accountName };
      }
      return null;
    }
  }

  if (!user.is_active) {
    const domain = email.split("@")[1] ?? "";
    return PARTNER_DOMAINS[domain] ? "pending" : null;
  }

  return { user, role: user.role, organization: user.organization_name };
}

export const authMiddleware: AppMiddleware = async (c, next) => {
  // Validate ff_session cookie → KV session lookup
  const cookieHeader = c.req.header("cookie") ?? "";
  const match = cookieHeader.split(";").map(s => s.trim()).find(s => s.startsWith("ff_session="));
  const sessionId = match ? match.slice("ff_session=".length) : null;

  if (!sessionId) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  const raw = await c.env.KV.get(`session:${sessionId}`);
  if (!raw) {
    throw new HTTPException(401, { message: "Unauthorized: session expired" });
  }

  const auth = JSON.parse(raw) as AuthContext;

  // Impersonation: admins may pass x-impersonate-email to view as another user
  if (auth.role === "admin") {
    const impersonateEmail = c.req.header("x-impersonate-email");
    if (impersonateEmail) {
      const target = await findUserByEmail(c.env.DB, impersonateEmail.trim().toLowerCase());
      if (target && target.is_active) {
        console.log(`[AUDIT] Impersonation: admin=${auth.user.email} target=${target.email} path=${c.req.path} at=${new Date().toISOString()}`);
        c.set("auth", { user: target, role: target.role, organization: target.organization_name });
        await next();
        return;
      }
    }
  }

  c.set("auth", auth);
  await next();
};

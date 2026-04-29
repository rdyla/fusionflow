import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppUser, AuthContext, Bindings, Variables } from "../types";
import { getPortalContact } from "../services/dynamicsService";

type AppMiddleware = MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }>;

async function findUserByEmail(db: D1Database, email: string): Promise<AppUser | null> {
  const result = await db
    .prepare(
      `
      SELECT id, email, name, organization_name, role, is_active, is_support_supervisor, dynamics_account_id, manager_id, cs_permission
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
};

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

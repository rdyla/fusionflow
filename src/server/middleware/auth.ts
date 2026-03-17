import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppRole, AppUser, Bindings, Variables } from "../types";

type AppMiddleware = MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }>;

async function findUserByEmail(db: D1Database, email: string): Promise<AppUser | null> {
  const result = await db
    .prepare(
      `
      SELECT id, email, name, organization_name, role, is_active, dynamics_account_id
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
  role: AppRole
): Promise<AppUser> {
  const id = crypto.randomUUID();
  const namePart = email.split("@")[0];

  await db
    .prepare(
      `INSERT INTO users (id, email, name, organization_name, role, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`
    )
    .bind(id, email, namePart, organization, role)
    .run();

  return { id, email, name: namePart, organization_name: organization, role, is_active: 1 };
}

function getRequestEmail(req: Request): string | null {
  const devEmail = req.headers.get("x-dev-user-email");
  if (devEmail) return devEmail.trim().toLowerCase();

  const cfAccessEmail = req.headers.get("cf-access-authenticated-user-email");
  if (cfAccessEmail) return cfAccessEmail.trim().toLowerCase();

  const forwardedEmail = req.headers.get("x-user-email");
  if (forwardedEmail) return forwardedEmail.trim().toLowerCase();

  return null;
}

export const authMiddleware: AppMiddleware = async (c, next) => {
  const email = getRequestEmail(c.req.raw);

  if (!email) {
    throw new HTTPException(401, {
      message: "Unauthorized: no authenticated user email found",
    });
  }

  let user = await findUserByEmail(c.env.DB, email);

  if (!user) {
    const domain = email.split("@")[1] ?? "";
    if (domain === "packetfusion.com") {
      user = await provisionUser(c.env.DB, email, "Packet Fusion", "pm");
    } else if (PARTNER_DOMAINS[domain]) {
      user = await provisionUser(c.env.DB, email, PARTNER_DOMAINS[domain], "partner_ae");
    } else {
      throw new HTTPException(403, {
        message: "Forbidden: user is not provisioned in FusionFlow360",
      });
    }
  }

  if (!user.is_active) {
    throw new HTTPException(403, {
      message: "Forbidden: user is inactive",
    });
  }

  // Impersonation: admins may pass x-impersonate-email to view as another user
  if (user.role === "admin") {
    const impersonateEmail = c.req.header("x-impersonate-email");
    if (impersonateEmail) {
      const target = await findUserByEmail(c.env.DB, impersonateEmail.trim().toLowerCase());
      if (target && target.is_active) {
        c.set("auth", { user: target, role: target.role, organization: target.organization_name });
        await next();
        return;
      }
    }
  }

  c.set("auth", {
    user,
    role: user.role,
    organization: user.organization_name,
  });

  await next();
};
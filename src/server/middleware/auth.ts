import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppUser, Bindings, Variables } from "../types";

type AppMiddleware = MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }>;

async function findUserByEmail(db: D1Database, email: string): Promise<AppUser | null> {
  const result = await db
    .prepare(
      `
      SELECT id, email, name, organization_name, role, is_active
      FROM users
      WHERE lower(email) = lower(?)
      LIMIT 1
      `
    )
    .bind(email)
    .first<AppUser>();

  return result ?? null;
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

  const user = await findUserByEmail(c.env.DB, email);

  if (!user) {
    throw new HTTPException(403, {
      message: "Forbidden: user is not provisioned in FusionFlow",
    });
  }

  if (!user.is_active) {
    throw new HTTPException(403, {
      message: "Forbidden: user is inactive",
    });
  }

  c.set("auth", {
    user,
    role: user.role,
    organization: user.organization_name,
  });

  await next();
};
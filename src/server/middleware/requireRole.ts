import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppRole, Bindings, Variables } from "../types";

type AppMiddleware = MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }>;

export function requireRole(...allowedRoles: AppRole[]): AppMiddleware {
  return async (c, next) => {
    const auth = c.get("auth");

    if (!auth) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    if (!allowedRoles.includes(auth.role)) {
      throw new HTTPException(403, { message: "Forbidden: insufficient role" });
    }

    await next();
  };
}
import type { MiddlewareHandler } from "hono";
import type { Bindings, Variables } from "../types";
import { actionForMethod, entityFromPath, shouldAudit, writeAuditLog } from "../lib/auditLog";

/**
 * Records every successful mutating API request in `audit_log`.
 *
 * Sits at the /api/* choke point rather than in each handler, so coverage is
 * complete across all route files and any endpoint added later is audited for
 * free — no per-route call to forget.
 *
 * Runs AFTER the handler so it can see the response status: only 2xx is
 * recorded, because a rejected request changed nothing and logging it would
 * turn the change history into a request log.
 *
 * Writing happens on waitUntil. An audit row must never delay a response or
 * fail a request that already succeeded, and writeAuditLog swallows its own
 * errors for the same reason.
 */
export const auditMiddleware: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  await next();

  const method = c.req.method;
  const path = c.req.path;
  const status = c.res?.status ?? 0;
  if (!shouldAudit(method, path, status)) return;

  const auth = c.get("auth");
  if (!auth?.user) return;

  const { type, id } = entityFromPath(path);

  c.executionCtx.waitUntil(
    writeAuditLog(c.env.DB, {
      entityType: type,
      entityId: id,
      action: actionForMethod(method),
      method,
      path,
      status,
      actor: { id: auth.user.id, name: auth.user.name, email: auth.user.email },
      onBehalfOfEmail: c.get("impersonatedBy") ?? null,
    })
  );
};

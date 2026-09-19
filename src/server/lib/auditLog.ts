import type { D1Database } from "@cloudflare/workers-types";

/** HTTP methods that change state. GETs are deliberately excluded — reads are
 *  not logged (see migration 0143). */
const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Paths whose mutations aren't worth a row: the login/OTP flow is its own
 *  security surface and would otherwise fill the table with unauthenticated
 *  noise. */
const SKIP_PREFIXES = ["/api/auth"];

export type AuditActor = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export function actionForMethod(method: string): string {
  switch (method.toUpperCase()) {
    case "POST":   return "create";
    case "DELETE": return "delete";
    default:       return "update";
  }
}

/** Should this request produce an audit row?
 *
 *  Only successful mutations: a 4xx/5xx changed nothing, and logging failures
 *  would turn the change history into a request log. */
export function shouldAudit(method: string, path: string, status: number): boolean {
  if (!MUTATING.has(method.toUpperCase())) return false;
  if (status < 200 || status >= 300) return false;
  return !SKIP_PREFIXES.some((p) => path.startsWith(p));
}

/** Pull the owning record out of an API path.
 *
 *  `/api/projects/:id/...` is the case that matters — it's what the project
 *  timeline reads back. Solutions are captured too so the table is useful
 *  later, but nothing surfaces them yet. Returns nulls when the path names no
 *  record; the row is still written, just unattributed. */
export function entityFromPath(path: string): { type: string | null; id: string | null } {
  const m = /^\/api\/(projects|solutions)\/([^/?]+)/.exec(path);
  if (!m) return { type: null, id: null };
  const type = m[1] === "projects" ? "project" : "solution";
  const id = decodeURIComponent(m[2]);
  // Collection-level routes like /api/projects/search aren't record ids. Ids
  // here are uuids; anything else is a sub-route name.
  if (!/^[0-9a-f-]{16,}$/i.test(id)) return { type: null, id: null };
  return { type, id };
}

/**
 * Write one audit row. Best-effort by contract: callers run this off the
 * response path, and a logging failure must never fail or delay the request
 * that succeeded.
 */
export async function writeAuditLog(
  db: D1Database,
  entry: {
    entityType: string | null;
    entityId: string | null;
    action: string;
    method?: string | null;
    path?: string | null;
    status?: number | null;
    actor: AuditActor;
    onBehalfOfEmail?: string | null;
  }
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_log
           (id, entity_type, entity_id, action, method, path, status,
            actor_user_id, actor_name, actor_email, on_behalf_of_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.action,
        entry.method ?? null,
        entry.path ?? null,
        entry.status ?? null,
        entry.actor.id ?? null,
        entry.actor.name ?? null,
        entry.actor.email ?? null,
        entry.onBehalfOfEmail ?? null
      )
      .run();
  } catch (err) {
    console.warn("[audit] write failed:", err instanceof Error ? err.message : err);
  }
}

/** Nightly retention sweep — keeps the table bounded at 365 days. */
export async function pruneAuditLog(db: D1Database, days = 365): Promise<void> {
  try {
    const res = await db
      .prepare(`DELETE FROM audit_log WHERE created_at < datetime('now', ?)`)
      .bind(`-${days} days`)
      .run();
    const removed = res.meta?.changes ?? 0;
    if (removed > 0) console.log(`[audit] pruned ${removed} rows older than ${days} days`);
  } catch (err) {
    console.warn("[audit] prune failed:", err instanceof Error ? err.message : err);
  }
}

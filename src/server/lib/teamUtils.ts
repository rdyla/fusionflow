/**
 * Returns the given userId plus the IDs of ALL active users anywhere in their
 * reporting tree (direct reports, their reports, etc.).  Uses a recursive CTE
 * so a top-level leader sees every AE beneath them regardless of depth.
 */
export async function getTeamUserIds(userId: string, db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(`
      WITH RECURSIVE subordinates(id) AS (
        SELECT id FROM users WHERE id = ?
        UNION ALL
        SELECT u.id FROM users u
        INNER JOIN subordinates s ON u.manager_id = s.id
        WHERE u.is_active = 1
      )
      SELECT id FROM subordinates
    `)
    .bind(userId)
    .all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

/** Build a SQL IN-list placeholder string for an array, e.g. "?, ?, ?" */
export function inPlaceholders(ids: string[]): string {
  return ids.map(() => "?").join(", ");
}

/**
 * Syncs project.status to "blocked" when any task is blocked or any open
 * blocker exists.  Reverts to "in_progress" when all blockers are resolved
 * and no tasks remain blocked (only if the project was previously auto-blocked).
 */
export async function syncProjectBlockedStatus(db: D1Database, projectId: string): Promise<void> {
  const project = await db
    .prepare("SELECT status FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ status: string | null }>();
  if (!project || project.status === "complete" || project.status === "not_started") return;

  const blockedTask = await db
    .prepare("SELECT id FROM tasks WHERE project_id = ? AND status = 'blocked' LIMIT 1")
    .bind(projectId)
    .first();

  const openBlocker = await db
    .prepare("SELECT id FROM risks WHERE project_id = ? AND status = 'open' LIMIT 1")
    .bind(projectId)
    .first();

  const shouldBeBlocked = !!(blockedTask || openBlocker);

  if (shouldBeBlocked && project.status !== "blocked") {
    await db.prepare("UPDATE projects SET status = 'blocked', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(projectId).run();
  } else if (!shouldBeBlocked && project.status === "blocked") {
    await db.prepare("UPDATE projects SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(projectId).run();
  }
}

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

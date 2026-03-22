/**
 * Returns the given userId plus the IDs of all active users who report directly
 * to that user (manager_id = userId).  Used to fan out AE/partner_ae queries so
 * a sales leader sees their own data AND their reps' data.
 */
export async function getTeamUserIds(userId: string, db: D1Database): Promise<string[]> {
  const reports = await db
    .prepare("SELECT id FROM users WHERE manager_id = ? AND is_active = 1")
    .bind(userId)
    .all<{ id: string }>();
  return [userId, ...reports.results.map((r) => r.id)];
}

/** Build a SQL IN-list placeholder string for an array, e.g. "?, ?, ?" */
export function inPlaceholders(ids: string[]): string {
  return ids.map(() => "?").join(", ");
}

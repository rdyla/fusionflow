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

/**
 * Auto-derive a stage's status from its tasks and persist it.
 *   - any task in_progress OR completed → 'in_progress'
 *   - all tasks completed (with ≥1 task) → 'completed'
 *   - else (empty stage, or all tasks not_started) → 'not_started'
 *
 * Stage status is no longer set manually by PMs (May-2026) — it's derived
 * here whenever a task on the stage changes. Call after task POST / PATCH
 * / DELETE in routes/tasks.ts. Returns the new status (mostly for tests /
 * debugging; routes don't need to read it).
 */
export async function syncStageStatus(db: D1Database, stageId: string | null): Promise<string | null> {
  if (!stageId) return null;
  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN status IN ('in_progress', 'completed') THEN 1 ELSE 0 END) AS started
       FROM tasks WHERE stage_id = ?`
    )
    .bind(stageId)
    .first<{ total: number; done: number; started: number }>();

  const total = counts?.total ?? 0;
  const done = counts?.done ?? 0;
  const started = counts?.started ?? 0;

  const derived = total === 0 ? "not_started"
    : done === total ? "completed"
    : started > 0 ? "in_progress"
    : "not_started";

  await db
    .prepare("UPDATE stages SET status = ? WHERE id = ?")
    .bind(derived, stageId)
    .run();

  return derived;
}

/**
 * If every stage on a project is now completed (and the project has stages),
 * ensure an optimize_accounts row exists. Idempotent — safe to call after
 * any task or stage update. Was previously inlined in routes/stages.ts when
 * stage status was manually set; moved here now that status is derived.
 */
export async function maybeGraduateProject(db: D1Database, projectId: string, graduatedByUserId: string): Promise<void> {
  const incomplete = await db
    .prepare("SELECT COUNT(*) AS cnt FROM stages WHERE project_id = ? AND status != 'completed'")
    .bind(projectId)
    .first<{ cnt: number }>();
  if ((incomplete?.cnt ?? 1) > 0) return;

  const anyStage = await db
    .prepare("SELECT id FROM stages WHERE project_id = ? LIMIT 1")
    .bind(projectId)
    .first();
  if (!anyStage) return;

  const existing = await db
    .prepare("SELECT id FROM optimize_accounts WHERE project_id = ? LIMIT 1")
    .bind(projectId)
    .first();
  if (existing) return;

  await db
    .prepare(
      `INSERT INTO optimize_accounts (id, project_id, graduated_by, graduation_method)
       VALUES (?, ?, ?, 'auto')`
    )
    .bind(crypto.randomUUID(), projectId, graduatedByUserId)
    .run();
}

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
 * Auto-derive project.status from stages + open blockers and persist it.
 * Precedence (top wins):
 *   1. any open risk OR any task in `blocked` status      → 'blocked'
 *   2. ≥ 1 stage AND every stage status = 'completed'     → 'complete'
 *   3. any stage status = 'in_progress'                   → 'in_progress'
 *   4. else (empty / all not_started)                     → 'not_started'
 *
 * Project status is no longer set manually by PMs (May-2026) — it's
 * derived here whenever a task changes (via syncStageStatus) or a
 * blocker is added / closed. Call from routes/tasks.ts and routes/risks.ts.
 *
 * Replaces the older syncProjectBlockedStatus which only handled the
 * blocked ⇄ in_progress transition.
 */
export async function syncProjectStatus(db: D1Database, projectId: string): Promise<string> {
  // Single round-trip to gather the counts we need.
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status = 'blocked') AS blocked_tasks,
         (SELECT COUNT(*) FROM risks WHERE project_id = ? AND status = 'open')    AS open_risks,
         (SELECT COUNT(*) FROM stages WHERE project_id = ?)                       AS total_stages,
         (SELECT COUNT(*) FROM stages WHERE project_id = ? AND status = 'completed')   AS done_stages,
         (SELECT COUNT(*) FROM stages WHERE project_id = ? AND status = 'in_progress') AS active_stages`
    )
    .bind(projectId, projectId, projectId, projectId, projectId)
    .first<{ blocked_tasks: number; open_risks: number; total_stages: number; done_stages: number; active_stages: number }>();

  const blockedTasks  = row?.blocked_tasks  ?? 0;
  const openRisks     = row?.open_risks     ?? 0;
  const totalStages   = row?.total_stages   ?? 0;
  const doneStages    = row?.done_stages    ?? 0;
  const activeStages  = row?.active_stages  ?? 0;

  const derived = (blockedTasks > 0 || openRisks > 0) ? "blocked"
    : (totalStages > 0 && doneStages === totalStages) ? "complete"
    : activeStages > 0 ? "in_progress"
    : "not_started";

  await db
    .prepare("UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (status IS NULL OR status != ?)")
    .bind(derived, projectId, derived)
    .run();

  return derived;
}

/** @deprecated kept for backward call sites — forwards to syncProjectStatus. */
export async function syncProjectBlockedStatus(db: D1Database, projectId: string): Promise<void> {
  await syncProjectStatus(db, projectId);
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

/**
 * Sync a project's target_go_live_date from the canonical go-live event
 * task(s) (tasks.is_go_live_event = 1). On multi-phase projects there can
 * be multiple flagged tasks (one per rollout phase); the project's target
 * is the MAX of their due_dates — i.e. the FINAL go-live across the project.
 *
 * If no flagged task exists, target_go_live_date is left untouched (allows
 * brand-new projects to keep whatever was set at create-time until a
 * template-applied task carries the flag forward).
 *
 * Call after task POST / PATCH / DELETE in routes/tasks.ts.
 */
export async function syncProjectGoLiveDate(db: D1Database, projectId: string): Promise<void> {
  const row = await db
    .prepare(
      `SELECT MAX(due_date) AS go_live FROM tasks
       WHERE project_id = ? AND is_go_live_event = 1 AND due_date IS NOT NULL`
    )
    .bind(projectId)
    .first<{ go_live: string | null }>();

  const goLive = row?.go_live ?? null;
  if (!goLive) return;

  await db
    .prepare("UPDATE projects SET target_go_live_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (target_go_live_date IS NULL OR target_go_live_date != ?)")
    .bind(goLive, projectId, goLive)
    .run();
}

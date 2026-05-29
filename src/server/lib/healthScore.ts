/**
 * Automated project health scoring.
 *
 * Returns "on_track" | "at_risk" | "off_track". The stakeholder Dashboard
 * relabels at_risk → "Monitor" at the UI layer; the underlying enum stays
 * 3-level so existing consumers (email digests, executive view) keep
 * working unchanged.
 *
 * Score = baseline 50 ± four weighted factors:
 *
 *   Factor                          Weight  Max ± pts
 *   ─────────────────────────────  ──────  ─────────
 *   Schedule (go-live date)          35%     ±25
 *   Open high/critical risks         30%     ±20
 *   Task completion rate             25%     ±15
 *   Recency (last update)            10%      ±5
 *
 *   Thresholds: ≥65 = on_track, ≥38 = at_risk, <38 = off_track.
 *
 * Critical risks weigh 2× as much as high (one critical alone is enough
 * to push the risk factor to its worst tier — matches PM intuition that
 * a critical blocker is a different beast from a high-severity concern).
 */

export type HealthValue = "on_track" | "at_risk" | "off_track";

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function scheduleDelta(targetIso: string | null, today: Date): number {
  if (!targetIso) return 0;
  const target = new Date(targetIso);
  const daysOut = daysBetween(today, target);
  if (daysOut > 30) return 25;
  if (daysOut > 14) return 15;
  if (daysOut > 7)  return 5;
  if (daysOut > 0)  return -10;
  return -25; // past target
}

function completionDelta(total: number, done: number): number {
  if (total === 0) return 0;
  const rate = done / total;
  if (rate >= 0.8)  return 15;
  if (rate >= 0.5)  return 5;
  if (rate >= 0.25) return -5;
  return -15;
}

function label(score: number): HealthValue {
  if (score >= 65) return "on_track";
  if (score >= 38) return "at_risk";
  return "off_track";
}

export async function computeProjectHealth(
  db: D1Database,
  projectId: string,
  project: { target_go_live_date: string | null; updated_at: string | null }
): Promise<HealthValue> {
  const today = new Date();
  let score = 50;

  // 1. Schedule (±25)
  score += scheduleDelta(project.target_go_live_date, today);

  // 2. Open risks — critical weighed 2× high (±20)
  const riskRow = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical_cnt,
         SUM(CASE WHEN severity = 'high'     THEN 1 ELSE 0 END) AS high_cnt
       FROM risks
       WHERE project_id = ? AND (status IS NULL OR status != 'resolved')`
    )
    .bind(projectId)
    .first<{ critical_cnt: number; high_cnt: number }>();
  const effective = (riskRow?.high_cnt ?? 0) + 2 * (riskRow?.critical_cnt ?? 0);
  if (effective === 0)      score += 20;
  else if (effective === 1) score -= 5;
  else                      score -= 20;

  // 3. Task completion (±15)
  const taskRow = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done
       FROM tasks WHERE project_id = ?`
    )
    .bind(projectId)
    .first<{ total: number; done: number }>();
  score += completionDelta(taskRow?.total ?? 0, taskRow?.done ?? 0);

  // 4. Recency (±5)
  if (project.updated_at) {
    const daysSince = daysBetween(new Date(project.updated_at), today);
    if (daysSince < 7)       score += 5;
    else if (daysSince > 30) score -= 5;
  }

  return label(score);
}

/**
 * Per-phase health for multi-phase projects (Libraries/Treatment/HQ-style).
 * Scores against the phase's own slice of tasks (via the stages joined to
 * this phase) and the phase's go-live date. Risks stay project-level and
 * are intentionally excluded — the project banner still surfaces them.
 */
export async function computePhaseHealth(
  db: D1Database,
  phase: { id: string; target_go_live_date: string | null }
): Promise<HealthValue> {
  const today = new Date();
  let score = 50;

  // Schedule against the phase's own go-live (±25)
  score += scheduleDelta(phase.target_go_live_date, today);

  // Task completion within the phase's stages (±15)
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS done
       FROM tasks t
       JOIN stages p ON p.id = t.stage_id
       WHERE p.phase_id = ?`
    )
    .bind(phase.id)
    .first<{ total: number; done: number }>();
  score += completionDelta(row?.total ?? 0, row?.done ?? 0);

  return label(score);
}


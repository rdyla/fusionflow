/**
 * Automated project health scoring.
 *
 * Returns "on_track" | "at_risk" | "off_track" based on five weighted factors:
 *
 *  Factor                  Weight  Max ± pts
 *  ──────────────────────  ──────  ─────────
 *  Schedule (go-live date)   35%     ±25
 *  Open high-severity risks  30%     ±20
 *  Task completion rate      25%     ±15
 *  Recency (last update)     10%      ±5
 *
 * Baseline score = 50.  Thresholds: ≥65 = on_track, ≥38 = at_risk, <38 = off_track.
 */

type HealthValue = "on_track" | "at_risk" | "off_track";

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export async function computeProjectHealth(
  db: D1Database,
  projectId: string,
  project: { target_go_live_date: string | null; updated_at: string | null }
): Promise<HealthValue> {
  const today = new Date();
  let score = 50;

  // ── 1. Schedule (±25) ────────────────────────────────────────────────────────
  if (project.target_go_live_date) {
    const goLive = new Date(project.target_go_live_date);
    const daysOut = daysBetween(today, goLive);
    if (daysOut > 30)      score += 25;
    else if (daysOut > 14) score += 15;
    else if (daysOut > 7)  score += 5;
    else if (daysOut > 0)  score -= 10;
    else                   score -= 25; // past go-live date
  }
  // No go-live date → neutral (no change)

  // ── 2. Open high-severity risks (±20) ────────────────────────────────────────
  const riskRow = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM risks
       WHERE project_id = ? AND severity = 'high' AND (status IS NULL OR status != 'resolved')`
    )
    .bind(projectId)
    .first<{ cnt: number }>();
  const highRisks = riskRow?.cnt ?? 0;
  if (highRisks === 0)     score += 20;
  else if (highRisks === 1) score -= 5;
  else                      score -= 20;

  // ── 3. Task completion rate (±15) ────────────────────────────────────────────
  const taskRow = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done
       FROM tasks WHERE project_id = ?`
    )
    .bind(projectId)
    .first<{ total: number; done: number }>();
  const totalTasks = taskRow?.total ?? 0;
  if (totalTasks > 0) {
    const rate = (taskRow?.done ?? 0) / totalTasks;
    if (rate >= 0.8)      score += 15;
    else if (rate >= 0.5) score += 5;
    else if (rate >= 0.25) score -= 5;
    else                   score -= 15;
  }
  // No tasks → neutral

  // ── 4. Recency (±5) ──────────────────────────────────────────────────────────
  if (project.updated_at) {
    const lastUpdate = new Date(project.updated_at);
    const daysSince = daysBetween(lastUpdate, today);
    if (daysSince < 7)      score += 5;
    else if (daysSince > 30) score -= 5;
  }

  // ── Map to health label ───────────────────────────────────────────────────────
  if (score >= 65)  return "on_track";
  if (score >= 38)  return "at_risk";
  return "off_track";
}

/**
 * Automated project health scoring.
 *
 * Returns "on_track" | "at_risk" | "off_track". The stakeholder Dashboard
 * relabels at_risk → "Monitor" at the UI layer; the underlying enum stays
 * 3-level so existing consumers (email digests, executive view) keep
 * working unchanged.
 *
 * Deliberately simple, by request: a project is "at_risk" if and only if
 * it has at least one active (non-closed) risk/blocker; otherwise
 * "on_track". The auto-computation never emits "off_track" — schedule
 * proximity, task-completion rate, and recency were dropped as scoring
 * inputs because the weighted version was too opaque for the org (a
 * project could read "at risk" with zero active blockers).
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
  projectId: string
): Promise<HealthValue> {
  const openRisk = await db
    .prepare(
      `SELECT 1 FROM risks WHERE project_id = ? AND (status IS NULL OR status != 'closed') LIMIT 1`
    )
    .bind(projectId)
    .first();
  return openRisk ? "at_risk" : "on_track";
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


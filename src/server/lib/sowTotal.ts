import type { D1Database } from "@cloudflare/workers-types";
import { calcSowTotal, parseAddOns, DEFAULT_BLENDED_RATE } from "../../shared/sowAddOns";

/**
 * Recomputes solutions.sow_total_amount from the current labor estimates
 * (sum of total_expected across types), the solution's add_ons, and its
 * blended_rate. Writes the new total back to the row.
 *
 * Called from:
 *   - solutions PATCH when add_ons or blended_rate is touched
 *   - labor-estimates PUT/DELETE so the saved total reflects current hours
 *
 * Idempotent. No-op if the solution doesn't exist (avoids races during
 * delete-cascade flows).
 */
export async function recomputeSowTotal(db: D1Database, solutionId: string): Promise<number | null> {
  const solution = await db
    .prepare("SELECT add_ons, blended_rate FROM solutions WHERE id = ? LIMIT 1")
    .bind(solutionId)
    .first<{ add_ons: string | null; blended_rate: number | null }>();
  if (!solution) return null;

  const estimates = await db
    .prepare("SELECT total_expected FROM labor_estimates WHERE solution_id = ?")
    .bind(solutionId)
    .all<{ total_expected: number | null }>();
  const laborHours = (estimates.results ?? []).reduce((sum, r) => sum + (Number(r.total_expected) || 0), 0);

  const addOns = parseAddOns(solution.add_ons);
  const rate = Number(solution.blended_rate) || DEFAULT_BLENDED_RATE;

  const { total } = calcSowTotal(laborHours, addOns, rate);

  await db
    .prepare("UPDATE solutions SET sow_total_amount = ? WHERE id = ?")
    .bind(total, solutionId)
    .run();

  return total;
}

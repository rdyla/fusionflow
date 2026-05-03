import type { D1Database } from "@cloudflare/workers-types";
import { calcSowTotal, calcBasicSowTotal, parseAddOns, DEFAULT_BLENDED_RATE } from "../../shared/sowAddOns";
import { calcUcaasBasicBreakdown, parseBasicInputs, getUcaasTieredTier } from "../../shared/ucaasBasicPricing";

/**
 * Recomputes solutions.sow_total_amount.
 *
 * Branches on pricing_mode:
 *   - 'tiered'   → fixed tier price by seat band (looked up from basic_seat_count) + add-ons
 *   - 'basic'    → formula-driven UCaaS price (from basic_inputs JSON) + add-ons
 *   - default    → (Σ labor_estimates.total_expected) × blended_rate + add-ons
 *
 * Called from:
 *   - solutions PATCH when add_ons / blended_rate / pricing_mode / basic_inputs / basic_seat_count touched
 *   - labor-estimates PUT/DELETE so the saved total reflects current hours (advanced only)
 *
 * Idempotent. No-op if the solution doesn't exist (avoids races during
 * delete-cascade flows). When tiered or basic mode is selected without the
 * relevant inputs (or out of range for tiered), sow_total_amount is set
 * to 0 to make the not-yet-priced state visible.
 */
export async function recomputeSowTotal(db: D1Database, solutionId: string): Promise<number | null> {
  const solution = await db
    .prepare("SELECT add_ons, blended_rate, pricing_mode, basic_seat_count, basic_inputs FROM solutions WHERE id = ? LIMIT 1")
    .bind(solutionId)
    .first<{
      add_ons: string | null;
      blended_rate: number | null;
      pricing_mode: string | null;
      basic_seat_count: number | null;
      basic_inputs: string | null;
    }>();
  if (!solution) return null;

  const addOns = parseAddOns(solution.add_ons);
  const rate = Number(solution.blended_rate) || DEFAULT_BLENDED_RATE;

  let total: number;
  if (solution.pricing_mode === "tiered") {
    const tier = getUcaasTieredTier(solution.basic_seat_count);
    total = tier ? calcBasicSowTotal(tier.price, addOns, rate).total : 0;
  } else if (solution.pricing_mode === "basic") {
    const inputs = parseBasicInputs(solution.basic_inputs);
    if (!inputs) {
      total = 0;
    } else {
      const breakdown = calcUcaasBasicBreakdown(inputs, rate);
      total = calcBasicSowTotal(breakdown.total, addOns, rate).total;
    }
  } else {
    const estimates = await db
      .prepare("SELECT total_expected FROM labor_estimates WHERE solution_id = ?")
      .bind(solutionId)
      .all<{ total_expected: number | null }>();
    const laborHours = (estimates.results ?? []).reduce((sum, r) => sum + (Number(r.total_expected) || 0), 0);
    total = calcSowTotal(laborHours, addOns, rate).total;
  }

  await db
    .prepare("UPDATE solutions SET sow_total_amount = ? WHERE id = ?")
    .bind(total, solutionId)
    .run();

  return total;
}

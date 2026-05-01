/**
 * UCaaS basic-mode pricing ladder.
 *
 * Mirrors the Excel formula sales currently uses:
 *   IF(seats<=25, 4500, IF(seats<=50, 5400, IF(seats<=100, 6250, n/a)))
 *
 * Beyond 100 seats, basic mode does not apply — solutions must use advanced
 * pricing (the workstream-driven labor estimate calc).
 */

export type UcaasBasicTier = {
  /** Inclusive upper bound on seat count for this tier. */
  maxSeats: number;
  /** Flat tier price in USD. */
  price: number;
  /** Customer-facing label, used in the SOW header. */
  label: string;
};

export const UCAAS_BASIC_TIERS: readonly UcaasBasicTier[] = [
  { maxSeats: 25,  price: 4500, label: "Up to 25 seats" },
  { maxSeats: 50,  price: 5400, label: "26–50 seats" },
  { maxSeats: 100, price: 6250, label: "51–100 seats" },
] as const;

export const UCAAS_BASIC_MAX_SEATS = 100;

/** Look up the tier that applies to a given seat count.
 *  Returns null for invalid (≤0, NaN) or out-of-range (>100) inputs. */
export function getUcaasBasicTier(seatCount: number | null | undefined): UcaasBasicTier | null {
  const n = Number(seatCount);
  if (!Number.isFinite(n) || n <= 0) return null;
  for (const tier of UCAAS_BASIC_TIERS) {
    if (n <= tier.maxSeats) return tier;
  }
  return null;
}

/** True iff the solution's type list is exactly UCaaS — basic mode is only
 *  available for pure-UCaaS solutions (combo solutions stay advanced). */
export function canUseBasicPricing(solutionTypes: readonly string[] | null | undefined): boolean {
  if (!solutionTypes) return false;
  return solutionTypes.length === 1 && solutionTypes[0] === "ucaas";
}

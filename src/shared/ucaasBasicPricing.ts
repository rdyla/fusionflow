/**
 * UCaaS basic-mode pricing formula.
 *
 * Replaces the original tier ladder ($4500/$5400/$6250 by seat band capped
 * at 100 seats) with a transparent formula that scales without bands:
 *
 *   hours = 20
 *         + 0.05 × users
 *         + 2 × max(0, sites − 1)
 *         + 6 × max(0, go_lives − 1)
 *         + 2 × onsite_sites               (travel time at blended rate)
 *
 *   labor          = hours × blended_rate
 *   training       = $290 × training_sessions
 *   device_install = $36.25 × onsite_devices
 *   pre_pm         = labor + training + device_install
 *   pm             = pre_pm × 0.15
 *   total          = pre_pm + pm
 *
 * 1 site and 1 go-live are baked into the 20-hour base. Add-ons (charges,
 * discounts) apply on top of `total` via the existing add-ons system.
 */

export type UcaasBasicInputs = {
  users: number;
  /** Total sites in scope. 1 is included in the 20h base. */
  sites: number;
  /** Total go-live events. 1 is included in the 20h base. */
  go_lives: number;
  /** Optional flat-cost add-ons (training_sessions × $290). */
  training_sessions: number;
  /** Sites where Packet Fusion travels on-site (+2h labor each, billed at blended rate). */
  onsite_sites: number;
  /** Devices physically installed on-site (× $36.25 each). */
  onsite_devices: number;
};

export const UCAAS_BASIC_DEFAULTS: UcaasBasicInputs = {
  users: 0,
  sites: 1,
  go_lives: 1,
  training_sessions: 0,
  onsite_sites: 0,
  onsite_devices: 0,
};

// ── Formula constants ──────────────────────────────────────────────────────
export const BASE_HOURS                  = 20;
export const HOURS_PER_USER              = 0.05;
export const HOURS_PER_ADDITIONAL_SITE   = 2;
export const HOURS_PER_ADDITIONAL_GOLIVE = 6;
export const HOURS_PER_ONSITE_SITE       = 2;
export const TRAINING_SESSION_COST       = 290;
export const ONSITE_DEVICE_COST          = 36.25;
export const PM_MULTIPLIER               = 0.15;
export const DEFAULT_BLENDED_RATE        = 165;

export type UcaasBasicBreakdown = {
  /** Each component of the hours total, surfaced for the calculator detail view. */
  components: {
    base: number;
    users: number;
    additionalSites: number;
    additionalGoLives: number;
    onsiteTravel: number;
  };
  /** Total billable hours from the formula. */
  hours: number;
  /** Hours × blended rate. */
  laborSubtotal: number;
  /** training_sessions × $290. */
  trainingTotal: number;
  /** onsite_devices × $36.25. */
  deviceInstallTotal: number;
  /** labor + training + device install (the 100% basis for PM). */
  prePmSubtotal: number;
  /** prePmSubtotal × 0.15. */
  pm: number;
  /** prePmSubtotal + pm. */
  total: number;
};

/** Coerce any number-shaped value to a non-negative integer. Rejects NaN, negatives, etc. */
function n(v: unknown, fallback = 0): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) && x >= 0 ? x : fallback;
}

export function calcUcaasBasicBreakdown(
  inputs: Partial<UcaasBasicInputs> | null | undefined,
  blendedRate: number,
): UcaasBasicBreakdown {
  const users           = n(inputs?.users);
  const sites           = Math.max(1, n(inputs?.sites, 1));
  const goLives         = Math.max(1, n(inputs?.go_lives, 1));
  const trainingCount   = n(inputs?.training_sessions);
  const onsiteSites     = n(inputs?.onsite_sites);
  const onsiteDevices   = n(inputs?.onsite_devices);
  const safeRate        = Number(blendedRate) || DEFAULT_BLENDED_RATE;

  const components = {
    base:              BASE_HOURS,
    users:             HOURS_PER_USER * users,
    additionalSites:   HOURS_PER_ADDITIONAL_SITE   * (sites - 1),
    additionalGoLives: HOURS_PER_ADDITIONAL_GOLIVE * (goLives - 1),
    onsiteTravel:      HOURS_PER_ONSITE_SITE       * onsiteSites,
  };

  const hours = components.base + components.users + components.additionalSites + components.additionalGoLives + components.onsiteTravel;
  const laborSubtotal = hours * safeRate;
  const trainingTotal = TRAINING_SESSION_COST * trainingCount;
  const deviceInstallTotal = ONSITE_DEVICE_COST * onsiteDevices;
  const prePmSubtotal = laborSubtotal + trainingTotal + deviceInstallTotal;
  const pm = prePmSubtotal * PM_MULTIPLIER;
  const total = prePmSubtotal + pm;

  return { components, hours, laborSubtotal, trainingTotal, deviceInstallTotal, prePmSubtotal, pm, total };
}

/** Tolerant reader for the basic_inputs JSON column (DB may give us a string or already-parsed object). */
export function parseBasicInputs(raw: unknown): UcaasBasicInputs | null {
  if (raw == null) return null;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    try { obj = JSON.parse(s); } catch { return null; }
  }
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;
  return {
    users:             n(r.users),
    sites:             Math.max(1, n(r.sites, 1)),
    go_lives:          Math.max(1, n(r.go_lives, 1)),
    training_sessions: n(r.training_sessions),
    onsite_sites:      n(r.onsite_sites),
    onsite_devices:    n(r.onsite_devices),
  };
}

/** True iff this solution can use basic pricing — pure UCaaS only (combos use Advanced). */
export function canUseBasicPricing(solutionTypes: readonly string[] | null | undefined): boolean {
  if (!solutionTypes) return false;
  return solutionTypes.length === 1 && solutionTypes[0] === "ucaas";
}

// ── Tiered mode ────────────────────────────────────────────────────────────
//
// Fixed-price ladder for sub-100-seat UCaaS deployments. Used when sales
// wants the fastest possible quote — no formula, just a band lookup.
// Pure UCaaS only AND capped at 100 seats. Larger deals must use Basic
// (formula) or Advanced (full calc).

export type UcaasTier = {
  /** Inclusive upper bound on seat count for this tier. */
  maxSeats: number;
  /** Flat tier price in USD. */
  price: number;
  /** Customer-facing label (used in the SOW). */
  label: string;
};

export const UCAAS_TIERED_TIERS: readonly UcaasTier[] = [
  { maxSeats: 25,  price: 4500, label: "Up to 25 seats" },
  { maxSeats: 50,  price: 5400, label: "26–50 seats" },
  { maxSeats: 100, price: 6250, label: "51–100 seats" },
] as const;

export const UCAAS_TIERED_MAX_SEATS = 100;

/** Look up the tier that applies to a given seat count.
 *  Returns null for invalid (≤0, NaN) or out-of-range (>100) inputs. */
export function getUcaasTieredTier(seatCount: number | null | undefined): UcaasTier | null {
  const n = Number(seatCount);
  if (!Number.isFinite(n) || n <= 0) return null;
  for (const tier of UCAAS_TIERED_TIERS) {
    if (n <= tier.maxSeats) return tier;
  }
  return null;
}

/** True iff this solution can use tiered pricing — pure UCaaS, sub-100. */
export function canUseTieredPricing(solutionTypes: readonly string[] | null | undefined): boolean {
  return canUseBasicPricing(solutionTypes);
}

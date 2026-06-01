/**
 * UCaaS + CCaaS Combo SOW Pricing Calculator.
 *
 * Implements the formulas from PacketFusion_SOW_Calculator_Reference.docx
 * (Jason Eggers' Excel v11). Lives alongside `ucaasBasicPricing.ts` —
 * fires only when a solution has CCaaS in scope. UCaaS-only solutions
 * continue to use calcUcaasBasicBreakdown().
 *
 * Activation: `isComboMode(solution.solution_types)` returns true when the
 * solution_types array includes 'ccaas'. UI + server SOW recompute branch
 * on that predicate when pricing_mode is 'basic'.
 *
 * Worked example from §6 of the doc (verified line by line in calcCcaasComboBreakdown):
 *   300 UCaaS users, 50 CCaaS agents (voice only), 2 sites, 1 go-live,
 *   5 trainings, 1 DID porting block, 3 apps (AI Expert Assist + QM + WFM),
 *   ZVA Voice 2 wf / 2 knowledge / 5 custom dev hrs,
 *   ZVA Chat 2 wf / 2 knowledge / 0 custom dev hrs.
 *   → finalSowPrice = $37,888.19
 */

import {
  BASE_HOURS,
  DEFAULT_BLENDED_RATE,
  HOURS_PER_GOLIVE,
  HOURS_PER_SITE,
  HOURS_PER_USER,
  PM_MULTIPLIER,
  TRAINING_SESSION_COST,
  type UcaasBasicInputs,
} from "./ucaasBasicPricing";

// ── Constants ────────────────────────────────────────────────────────────────

/** CCaaS base hours: voice-only deployment. */
export const CCAAS_BASE_HOURS_VOICE = 20;
/** CCaaS base hours when omnichannel (voice + chat/email/messaging) is in scope. */
export const CCAAS_BASE_HOURS_OMNI  = 40;
export const HOURS_PER_AGENT = 0.05;
export const HOURS_PER_INTEGRATION = 8;
export const ZVA_HOURS_PER_KNOWLEDGE_SOURCE = 10;

/** App tier price is determined by MAX(ucaas_users, ccaas_agents). */
export const APP_TIER_THRESHOLDS = {
  /** ≤500 users/agents lands in Foundation. */
  foundation_max: 500,
  /** 501–2500 → Enhanced. 2501+ → Elite. */
  enhanced_max:   2500,
} as const;
export const APP_TIER_PRICES = {
  foundation: 5_000,
  enhanced:   7_000,
  elite:      9_000,
} as const;

export const ZVA_TIER_THRESHOLDS = {
  /** 1–10 workflows → Small (10 hrs/workflow). */
  small_max:  10,
  /** 11–20 → Medium (20 hrs/workflow). 21+ → Large (40 hrs/workflow + override). */
  medium_max: 20,
} as const;
export const ZVA_TIER_HOURS = {
  small:  10,
  medium: 20,
  large:  40,
} as const;

/** Hours-per-unit for analog device labor. Each multiplied by $rate to produce
 *  the device's contribution to the analog total. */
export const ANALOG_HOURS_PER_UNIT = {
  did_porting_blocks:    0.25, // 0.25 hr per porting block
  analog_fax_devices:    1,    // 1 hr per ATA
  paging_systems:        4,    // 4 hr per paging system
  door_phones:           3,    // 3 hr per door phone
  gate_controllers:      3,    // 3 hr per gate controller
  other_analog_devices:  2,    // 2 hr per misc analog device
} as const;

/** The 6 apps that participate in the tier-priced bundle. ZVA Voice + ZVA Chat
 *  are NOT in this list — their cost folds into the bundle pre-discount pool
 *  but they don't count toward the discount-tier app count. */
export const APP_KEYS = [
  "ai_expert_assist",
  "quality_management",
  "workforce_management",
  "rc_air",
  "rc_ava",
  "rc_ace",
] as const;
export type AppKey = typeof APP_KEYS[number];

export const APP_LABELS: Record<AppKey, string> = {
  ai_expert_assist:    "AI Expert Assist",
  quality_management:  "Quality Management",
  workforce_management: "Workforce Management",
  rc_air:              "RC AIR",
  rc_ava:              "RC AVA",
  rc_ace:              "RC ACE",
};

export const ANALOG_LABELS: Record<keyof typeof ANALOG_HOURS_PER_UNIT, string> = {
  did_porting_blocks:    "DID porting blocks",
  analog_fax_devices:    "Analog fax (ATA)",
  paging_systems:        "Paging systems",
  door_phones:           "Door phones",
  gate_controllers:      "Gate controllers",
  other_analog_devices:  "Other analog devices",
};

// ── Inputs ───────────────────────────────────────────────────────────────────

export type AppInputs = {
  included: boolean;
  integrations: number;
  /** Manual entry: complexity not captured by the base tier price + integrations. */
  custom_dev_hours: number;
};

export type ZvaInputs = {
  workflows: number;
  /** Knowledge sources / sources-of-truth integrations. 10 hrs each. */
  knowledge_sources: number;
  /** Large-tier override (only applied when workflows ≥ 21). */
  large_override_hours: number;
  custom_dev_hours: number;
};

export type AnalogInputs = {
  did_porting_blocks:    number;
  analog_fax_devices:    number;
  paging_systems:        number;
  door_phones:           number;
  gate_controllers:      number;
  other_analog_devices:  number;
};

export type CcaasInputs = {
  agents: number;
  /** Voice-only vs full omnichannel (drives base hours: 20 vs 40). */
  omnichannel: boolean;
};

/** Combo input extends the existing UcaasBasicInputs shape with optional
 *  sub-blocks. Stored on the same `solutions.basic_inputs` JSON column so
 *  UCaaS-only rows remain a valid subset; combo rows just carry more keys. */
export type CcaasComboInputs = UcaasBasicInputs & {
  ccaas?:  CcaasInputs;
  apps?:   Partial<Record<AppKey, AppInputs>>;
  zva_voice?: ZvaInputs;
  zva_chat?:  ZvaInputs;
  analog?: AnalogInputs;
  /** 0–100. Optional final discount % on top of SOW Subtotal (post-PM). */
  final_discount_pct?: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function resolveAppTier(maxUsersOrAgents: number): "foundation" | "enhanced" | "elite" {
  if (maxUsersOrAgents <= APP_TIER_THRESHOLDS.foundation_max) return "foundation";
  if (maxUsersOrAgents <= APP_TIER_THRESHOLDS.enhanced_max)   return "enhanced";
  return "elite";
}

export type ZvaTier = "none" | "small" | "medium" | "large";

export function resolveZvaTier(workflows: number): ZvaTier {
  if (workflows <= 0) return "none";
  if (workflows <= ZVA_TIER_THRESHOLDS.small_max)  return "small";
  if (workflows <= ZVA_TIER_THRESHOLDS.medium_max) return "medium";
  return "large";
}

function zvaHoursPerWorkflow(tier: ZvaTier): number {
  if (tier === "small")  return ZVA_TIER_HOURS.small;
  if (tier === "medium") return ZVA_TIER_HOURS.medium;
  if (tier === "large")  return ZVA_TIER_HOURS.large;
  return 0;
}

/** Discount %, 0–1. 0 apps = 0, 1 = 0, 2 = 0.20, 3 = 0.30, 4 = 0.40, 5+ = 0.50. */
export function bundleDiscountForAppCount(appCount: number): number {
  if (appCount >= 5) return 0.50;
  if (appCount === 4) return 0.40;
  if (appCount === 3) return 0.30;
  if (appCount === 2) return 0.20;
  return 0;
}

function n(v: unknown, fallback = 0): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) && x >= 0 ? x : fallback;
}

/** Returns true when the solution should run through the combo calculator
 *  instead of the UCaaS-only basic calculator. Driven by solution_types
 *  containing 'ccaas' (the trigger the user chose during scoping). */
export function isComboMode(solutionTypes: readonly string[] | null | undefined): boolean {
  return Array.isArray(solutionTypes) && solutionTypes.includes("ccaas");
}

// ── Breakdown shape ──────────────────────────────────────────────────────────

export type ZvaBreakdown = {
  tier: ZvaTier;
  workflows: number;
  workflowHours: number;     // workflows × tier rate
  knowledgeHours: number;    // sources × 10
  overrideHours: number;     // Large-only
  customDevHours: number;
  totalHours: number;
  cost: number;              // totalHours × rate
};

export type AppBreakdownRow = {
  key: AppKey;
  label: string;
  included: boolean;
  integrations: number;
  customDevHours: number;
  baseCost: number;          // tier price when included, else 0
  integrationCost: number;   // integrations × 8 × rate (0 when !included)
  customDevCost: number;     // hours × rate (0 when !included)
};

export type AnalogBreakdownRow = {
  key: keyof typeof ANALOG_HOURS_PER_UNIT;
  label: string;
  quantity: number;
  hoursPerUnit: number;
  hours: number;
  cost: number;
};

export type CcaasComboBreakdown = {
  // Core services
  ucaasHours: number;
  ucaasCost: number;
  ccaasBaseHours: number;    // 0 / 20 / 40 depending on agents + omnichannel
  ccaasHours: number;
  ccaasCost: number;
  sitesHours: number;
  sitesCost: number;
  goLivesHours: number;
  goLivesCost: number;
  coreServicesTotal: number;

  // Analog devices
  analogRows: AnalogBreakdownRow[];
  analogTotal: number;

  // Advanced apps + ZVA bundle
  appTier: "foundation" | "enhanced" | "elite";
  appTierPrice: number;
  appCount: number;          // count of included apps (0–6)
  appRows: AppBreakdownRow[];
  appBaseSubtotal: number;
  appIntegrationCost: number;
  appCustomDevCost: number;
  zvaVoice: ZvaBreakdown;
  zvaChat: ZvaBreakdown;
  /** Pre-discount pool: app base + integrations + custom dev + ZVA voice + ZVA chat. */
  preDiscountTotal: number;
  bundleDiscountPct: number; // 0–1
  bundleDiscountedTotal: number;

  // Training (flat, not subject to PM markup-but-wait, actually IS in PM base per spec)
  trainingCost: number;

  // Rollup
  subtotalPrePm: number;
  pm: number;                // subtotalPrePm × 0.15
  sowSubtotal: number;
  /** 0–1. Optional final discount applied after PM. */
  finalDiscountPct: number;
  finalSowPrice: number;
};

// ── Math ─────────────────────────────────────────────────────────────────────

function calcZva(inputs: ZvaInputs | undefined, rate: number): ZvaBreakdown {
  const workflows        = n(inputs?.workflows);
  const knowledgeSources = n(inputs?.knowledge_sources);
  const largeOverride    = n(inputs?.large_override_hours);
  const customDev        = n(inputs?.custom_dev_hours);
  const tier = resolveZvaTier(workflows);
  const hoursPerWf = zvaHoursPerWorkflow(tier);
  const workflowHours  = workflows * hoursPerWf;
  const knowledgeHours = knowledgeSources * ZVA_HOURS_PER_KNOWLEDGE_SOURCE;
  // Large-override is gated on tier=Large per spec — Small/Medium ignore it.
  const overrideHours  = tier === "large" ? largeOverride : 0;
  const totalHours     = workflowHours + knowledgeHours + overrideHours + customDev;
  return {
    tier,
    workflows,
    workflowHours,
    knowledgeHours,
    overrideHours,
    customDevHours: customDev,
    totalHours,
    cost: totalHours * rate,
  };
}

function calcAnalogRow(
  key: keyof typeof ANALOG_HOURS_PER_UNIT,
  qty: unknown,
  rate: number,
): AnalogBreakdownRow {
  const quantity = n(qty);
  const hoursPerUnit = ANALOG_HOURS_PER_UNIT[key];
  const hours = quantity * hoursPerUnit;
  return {
    key,
    label: ANALOG_LABELS[key],
    quantity,
    hoursPerUnit,
    hours,
    cost: hours * rate,
  };
}

/**
 * Run the combo calculator for a given inputs blob + blended rate. Returns a
 * fully itemized breakdown — the UI consumes the per-row entries to render
 * the Pricing Summary, and `finalSowPrice` is what lands on
 * solutions.sow_total_amount.
 *
 * Zero-input guards mirror the spec:
 *   - users = 0  → UCaaS hours/cost are 0 (no flat 20-hr base when no UCaaS).
 *   - agents = 0 → CCaaS hours/cost are 0 (and ccaasBaseHours = 0).
 *   - sites = 0  → clamped to 1 (the spec assumes at least one site).
 *   - go_lives = 0 → clamped to 1.
 */
export function calcCcaasComboBreakdown(
  inputs: CcaasComboInputs | null | undefined,
  blendedRate: number,
): CcaasComboBreakdown {
  const rate = Number(blendedRate) || DEFAULT_BLENDED_RATE;

  const users   = n(inputs?.users);
  const agents  = n(inputs?.ccaas?.agents);
  const omnichannel = inputs?.ccaas?.omnichannel === true;
  const sites   = Math.max(1, n(inputs?.sites, 1));
  const goLives = Math.max(1, n(inputs?.go_lives, 1));
  const trainingSessions = n(inputs?.training_sessions);

  // Core services
  const ucaasHours = users === 0 ? 0 : BASE_HOURS + users * HOURS_PER_USER;
  const ucaasCost  = ucaasHours * rate;
  const ccaasBaseHours = agents === 0 ? 0 : (omnichannel ? CCAAS_BASE_HOURS_OMNI : CCAAS_BASE_HOURS_VOICE);
  const ccaasHours = agents === 0 ? 0 : ccaasBaseHours + agents * HOURS_PER_AGENT;
  const ccaasCost  = ccaasHours * rate;
  const sitesHours = sites * HOURS_PER_SITE;
  const sitesCost  = sitesHours * rate;
  const goLivesHours = goLives * HOURS_PER_GOLIVE;
  const goLivesCost  = goLivesHours * rate;
  const coreServicesTotal = ucaasCost + ccaasCost + sitesCost + goLivesCost;

  // Analog
  const analog = inputs?.analog;
  const analogRows: AnalogBreakdownRow[] = (Object.keys(ANALOG_HOURS_PER_UNIT) as (keyof typeof ANALOG_HOURS_PER_UNIT)[])
    .map((k) => calcAnalogRow(k, analog?.[k], rate));
  const analogTotal = analogRows.reduce((acc, r) => acc + r.cost, 0);

  // Apps
  const appTier = resolveAppTier(Math.max(users, agents));
  const appTierPrice = APP_TIER_PRICES[appTier];
  const apps = inputs?.apps ?? {};
  const appRows: AppBreakdownRow[] = APP_KEYS.map((key) => {
    const a = apps[key];
    const included = a?.included === true;
    const integrations = n(a?.integrations);
    const customDevHours = n(a?.custom_dev_hours);
    return {
      key,
      label: APP_LABELS[key],
      included,
      integrations,
      customDevHours,
      baseCost:         included ? appTierPrice                                   : 0,
      integrationCost:  included ? integrations * HOURS_PER_INTEGRATION * rate    : 0,
      customDevCost:    included ? customDevHours * rate                          : 0,
    };
  });
  const appCount = appRows.filter((r) => r.included).length;
  const appBaseSubtotal    = appRows.reduce((acc, r) => acc + r.baseCost, 0);
  const appIntegrationCost = appRows.reduce((acc, r) => acc + r.integrationCost, 0);
  const appCustomDevCost   = appRows.reduce((acc, r) => acc + r.customDevCost, 0);

  // ZVA
  const zvaVoice = calcZva(inputs?.zva_voice, rate);
  const zvaChat  = calcZva(inputs?.zva_chat,  rate);

  // Bundle discount: applied to (apps + ZVA) pool. App-count tier ignores ZVA.
  const preDiscountTotal = appBaseSubtotal + appIntegrationCost + appCustomDevCost + zvaVoice.cost + zvaChat.cost;
  const bundleDiscountPct = bundleDiscountForAppCount(appCount);
  const bundleDiscountedTotal = preDiscountTotal * (1 - bundleDiscountPct);

  // Training (flat — but IS rolled into pre-PM subtotal per spec §5.1)
  const trainingCost = trainingSessions * TRAINING_SESSION_COST;

  // Rollup → PM → final discount
  const subtotalPrePm = coreServicesTotal + analogTotal + trainingCost + bundleDiscountedTotal;
  const pm = subtotalPrePm * PM_MULTIPLIER;
  const sowSubtotal = subtotalPrePm + pm;
  const rawFinalDiscount = n(inputs?.final_discount_pct);
  const finalDiscountPct = Math.min(1, Math.max(0, rawFinalDiscount / 100));
  const finalSowPrice = sowSubtotal * (1 - finalDiscountPct);

  return {
    ucaasHours, ucaasCost,
    ccaasBaseHours, ccaasHours, ccaasCost,
    sitesHours, sitesCost,
    goLivesHours, goLivesCost,
    coreServicesTotal,
    analogRows, analogTotal,
    appTier, appTierPrice, appCount, appRows,
    appBaseSubtotal, appIntegrationCost, appCustomDevCost,
    zvaVoice, zvaChat,
    preDiscountTotal, bundleDiscountPct, bundleDiscountedTotal,
    trainingCost,
    subtotalPrePm, pm, sowSubtotal,
    finalDiscountPct, finalSowPrice,
  };
}

/** Parse the combo-extended basic_inputs blob off solutions.basic_inputs.
 *  Returns null if the JSON is missing/unparseable. Tolerant of partial
 *  data — every sub-block is optional. */
/**
 * Derive combo pricing inputs from the SOW Sizing form blob (`sow_data`).
 *
 * In Basic+combo mode the consolidated SOW form is the single source: it stores
 * the full combo input set under `sow_data.combo` (a CcaasComboInputs blob,
 * edited by the embedded combo editor). When present that wins; otherwise we
 * fall back to the solution's legacy `basic_inputs` so combo solutions priced
 * before this consolidation keep their price until re-saved.
 */
export function sowDataToComboInputs(sowData: unknown, fallback: CcaasComboInputs | null): CcaasComboInputs {
  const sd = sowData && typeof sowData === "object" ? (sowData as Record<string, unknown>) : null;
  const fromSow = sd ? parseCcaasComboInputs(sd.combo) : null;
  if (fromSow) return fromSow;
  return fallback ?? (parseCcaasComboInputs({}) as CcaasComboInputs);
}

export function parseCcaasComboInputs(raw: unknown): CcaasComboInputs | null {
  if (!raw) return null;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  return {
    users:             n(o.users),
    sites:             Math.max(1, n(o.sites, 1)),
    go_lives:          Math.max(1, n(o.go_lives, 1)),
    training_sessions: n(o.training_sessions),
    onsite_sites:      n(o.onsite_sites),
    onsite_devices:    n(o.onsite_devices),
    ccaas:     (o.ccaas as CcaasInputs | undefined),
    apps:      (o.apps as CcaasComboInputs["apps"] | undefined),
    zva_voice: (o.zva_voice as ZvaInputs | undefined),
    zva_chat:  (o.zva_chat as ZvaInputs | undefined),
    analog:    (o.analog as AnalogInputs | undefined),
    final_discount_pct: typeof o.final_discount_pct === "number" ? o.final_discount_pct : undefined,
  };
}

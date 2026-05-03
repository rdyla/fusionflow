import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { parseSolutionTypes } from "../../shared/solutionTypes";
import { recomputeSowTotal } from "../lib/sowTotal";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Model constants ─────────────────────────────────────────────────────────

const WORKSTREAMS = [
  "discovery_requirements",
  "solution_design",
  "project_management",
  "implementation_configuration",
  "integration",
  "migration_data_porting",
  "testing_uat",
  "training_enablement",
  "documentation_handover",
  "hypercare",
] as const;

type Workstream = typeof WORKSTREAMS[number];

const BASE_HOURS: Record<string, Record<Workstream, number>> = {
  ucaas: {
    discovery_requirements: 8, solution_design: 12, project_management: 10,
    implementation_configuration: 20, integration: 4, migration_data_porting: 12,
    testing_uat: 8, training_enablement: 6, documentation_handover: 4, hypercare: 6,
  },
  ccaas: {
    discovery_requirements: 12, solution_design: 18, project_management: 14,
    implementation_configuration: 32, integration: 8, migration_data_porting: 12,
    testing_uat: 12, training_enablement: 8, documentation_handover: 6, hypercare: 8,
  },
  ci: {
    discovery_requirements: 10, solution_design: 14, project_management: 10,
    implementation_configuration: 18, integration: 8, migration_data_porting: 2,
    testing_uat: 8, training_enablement: 6, documentation_handover: 4, hypercare: 6,
  },
  virtual_agent: {
    discovery_requirements: 12, solution_design: 16, project_management: 12,
    implementation_configuration: 24, integration: 10, migration_data_porting: 2,
    testing_uat: 10, training_enablement: 6, documentation_handover: 4, hypercare: 8,
  },
};

// Global drivers applied to all solution types
const GLOBAL_DRIVERS: DriverDef[] = [
  {
    id: "sandbox_testing", field: "sandbox_testing_required",
    workstreams: ["integration", "testing_uat"] as Workstream[],
    mapping: { yes: 8, maybe: 4, no: 0 },
  },
  {
    id: "security_review", field: "security_review_required",
    workstreams: ["project_management", "documentation_handover"] as Workstream[],
    mapping: { yes: 6, unknown: 4, no: 0 },
  },
  {
    id: "phased_scope", field: "future_phase_scope_summary",
    workstreams: ["solution_design", "project_management"] as Workstream[],
    nonEmptyAdds: 4,
  },
];

// Deployment type multiplier (applied before complexity)
const DEPLOYMENT_TYPE_MULTIPLIERS: Record<string, number> = {
  new_deployment: 1.0,
  migration: 1.2,
  expansion: 0.85,
  optimization_redesign: 1.1,
  replacement: 1.15,
};

// Solution-specific drivers
type DriverDef = {
  id: string;
  field: string;
  workstreams: Workstream[];
  mapping?: Record<string, number>;
  bands?: Record<string, number>;
  nonEmptyAdds?: number;
  repeaterPerItem?: number;
  repeaterMax?: number;
};

const SOLUTION_DRIVERS: Record<string, DriverDef[]> = {
  ucaas: [
    { id: "ucaas_user_count", field: "user_count_band", workstreams: ["implementation_configuration", "training_enablement", "testing_uat"], mapping: { "1_25": 2, "26_100": 6, "101_250": 12, "251_500": 20, "500_plus": 32 } },
    { id: "ucaas_common_area_devices", field: "common_area_or_shared_device_count_band", workstreams: ["implementation_configuration", "testing_uat"], mapping: { "0": 0, "1_10": 2, "11_50": 6, "51_plus": 12 } },
    { id: "ucaas_calling_capabilities", field: "user_calling_capabilities_required", workstreams: ["solution_design", "implementation_configuration", "testing_uat"], bands: { "0": 0, "1_3": 2, "4_6": 4, "7_9": 8, "10_plus": 12 } },
    { id: "ucaas_call_flow_components", field: "call_flow_components_required", workstreams: ["solution_design", "implementation_configuration", "testing_uat"], bands: { "0": 0, "1_2": 3, "3_5": 8, "6_7": 14, "8_plus": 20 } },
    { id: "ucaas_endpoint_mix", field: "endpoint_types_required", workstreams: ["implementation_configuration", "testing_uat", "training_enablement"], bands: { "0": 0, "1_2": 2, "3_4": 6, "5_6": 10, "7_plus": 14 } },
    { id: "ucaas_integrations", field: "integrations_required", workstreams: ["integration", "testing_uat", "solution_design"], bands: { "0": 0, "1_2": 4, "3_4": 10, "5_6": 16, "7_plus": 24 } },
    { id: "ucaas_number_porting", field: "number_porting_required", workstreams: ["migration_data_porting", "project_management", "testing_uat"], mapping: { yes: 16, partial: 8, no: 0 } },
    { id: "ucaas_fax_analog", field: "fax_or_analog_required", workstreams: ["solution_design", "implementation_configuration", "testing_uat"], mapping: { yes_phase_1: 12, yes_future_phase: 4, no: 0 } },
    { id: "ucaas_network_readiness", field: "network_readiness_known", workstreams: ["discovery_requirements", "solution_design"], mapping: { yes_validated: 0, partial: 4, unknown: 8 } },
  ],
  ccaas: [
    { id: "ccaas_agent_count", field: "agent_count_band", workstreams: ["implementation_configuration", "testing_uat", "training_enablement"], mapping: { "1_25": 4, "26_100": 10, "101_250": 18, "251_500": 30, "500_plus": 45 } },
    { id: "ccaas_channels", field: "channels_required_phase_1", workstreams: ["solution_design", "implementation_configuration", "testing_uat", "training_enablement"], bands: { "0": 0, "1": 4, "2": 10, "3": 18, "4": 26, "5_plus": 36 } },
    { id: "ccaas_routing", field: "routing_capabilities_required", workstreams: ["solution_design", "implementation_configuration", "testing_uat"], bands: { "0": 0, "1_2": 6, "3_4": 12, "5_6": 20, "7_plus": 28 } },
    { id: "ccaas_ivr", field: "ivr_or_self_service_required", workstreams: ["solution_design", "implementation_configuration", "testing_uat"], mapping: { yes_phase_1: 16, yes_future_phase: 4, no: 0 } },
    { id: "ccaas_wfm", field: "wfm_required", workstreams: ["solution_design", "implementation_configuration", "testing_uat", "training_enablement"], mapping: { yes_phase_1: 24, yes_future_phase: 6, no: 0 } },
    { id: "ccaas_qm", field: "qm_required", workstreams: ["solution_design", "implementation_configuration", "testing_uat", "training_enablement"], mapping: { yes_phase_1: 20, yes_future_phase: 5, no: 0 } },
    { id: "ccaas_migration", field: "migration_required", workstreams: ["migration_data_porting", "project_management", "testing_uat"], mapping: { yes: 20, partial: 10, no: 0 } },
    { id: "ccaas_crm", field: "crm_integration_required_phase_1", workstreams: ["integration", "testing_uat", "solution_design"], mapping: { yes: 18, future_phase: 4, no: 0 } },
  ],
  ci: [
    { id: "ci_user_count", field: "estimated_user_count", workstreams: ["implementation_configuration", "training_enablement"], mapping: { "1_25": 2, "26_100": 6, "101_250": 10, "251_500": 16, "500_plus": 24 } },
    { id: "ci_core_capabilities", field: "core_capabilities_required", workstreams: ["solution_design", "implementation_configuration", "testing_uat"], bands: { "0": 0, "1_3": 4, "4_6": 8, "7_8": 14, "9_plus": 20 } },
    { id: "ci_custom_trackers", field: "custom_trackers_required", workstreams: ["implementation_configuration", "testing_uat"], mapping: { yes_phase_1: 12, yes_future_phase: 3, no: 0 } },
    { id: "ci_custom_scorecards", field: "custom_scorecards_required", workstreams: ["implementation_configuration", "testing_uat", "training_enablement"], mapping: { yes_phase_1: 12, yes_future_phase: 3, no: 0 } },
    { id: "ci_methodology_tracking", field: "track_methodology_elements", workstreams: ["solution_design", "implementation_configuration", "testing_uat"], mapping: { yes_required: 14, nice_to_have: 4, not_required: 0 } },
    { id: "ci_auto_scoring", field: "auto_scoring_required", workstreams: ["solution_design", "implementation_configuration", "testing_uat"], mapping: { yes_required: 10, yes_if_reliable: 6, manual_only: 2, undecided: 4 } },
    { id: "ci_crm", field: "crm_integration_required_phase_1", workstreams: ["integration", "testing_uat", "solution_design"], mapping: { yes: 16, future_phase: 4, no: 0 } },
  ],
  virtual_agent: [
    { id: "va_channels", field: "channels_required_phase_1", workstreams: ["solution_design", "implementation_configuration", "testing_uat"], bands: { "0": 0, "1": 4, "2": 10, "3": 18, "4_plus": 26 } },
    { id: "va_use_cases", field: "primary_use_cases", workstreams: ["solution_design", "implementation_configuration", "testing_uat"], bands: { "0": 0, "1_2": 6, "3_4": 14, "5_6": 22, "7_plus": 30 } },
    { id: "va_intent_count", field: "estimated_intent_count", workstreams: ["implementation_configuration", "testing_uat"], mapping: { "1_10": 6, "1_5": 4, "6_15": 10, "11_25": 14, "16_30": 18, "26_50": 24, "31_60": 30, "51_plus": 36, "60_plus": 44 } },
    { id: "va_handoff", field: "handoff_to_agent_required", workstreams: ["solution_design", "integration", "testing_uat"], mapping: { yes: 12, yes_phase_1: 12, future_phase: 4, yes_future_phase: 4, no: 0 } },
    { id: "va_content_readiness", field: "content_quality_readiness", workstreams: ["discovery_requirements", "solution_design", "implementation_configuration"], mapping: { ready: 0, ready_now: 0, needs_review: 10, needs_cleanup: 10, needs_creation: 22, significant_gaps: 22, unknown: 6 } },
    { id: "va_integrations", field: "integration_use_cases_required", workstreams: ["integration", "testing_uat", "solution_design"], bands: { "0": 0, "1_2": 6, "3_4": 14, "5_6": 24, "7_plus": 34 } },
  ],
};

// ── Computation helpers ─────────────────────────────────────────────────────

/** Coerce a count-shaped answer to a number. Accepts arrays (uses .length,
 *  matching NA storage) or raw numbers (matching direct-input storage where
 *  the user just enters "how many integrations"). Anything else → 0. */
function asCount(val: unknown): number {
  if (Array.isArray(val)) return val.length;
  if (typeof val === "number" && Number.isFinite(val) && val >= 0) return Math.floor(val);
  return 0;
}

/** Bin a raw user count into the band string the calc engine expects.
 *  Lets the UI accept a direct number without changing the calc model. */
function userCountToBand(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 25)  return "1_25";
  if (n <= 100) return "26_100";
  if (n <= 250) return "101_250";
  if (n <= 500) return "251_500";
  return "500_plus";
}

/** Pre-process the answers map before drivers/complexity/confidence run.
 *  Currently: if `user_count` is a number and `user_count_band` is unset,
 *  derive the band so the existing band-keyed mapping driver finds it. */
function normalizeAnswers(answers: Record<string, unknown>): Record<string, unknown> {
  const out = { ...answers };
  if (out.user_count_band === undefined || out.user_count_band === null || out.user_count_band === "") {
    const n = Number(out.user_count);
    if (Number.isFinite(n) && n > 0) {
      const band = userCountToBand(n);
      if (band) out.user_count_band = band;
    }
  }
  return out;
}

function isNonEmpty(val: unknown): boolean {
  if (val === null || val === undefined || val === "") return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "object") return Object.keys(val as object).length > 0;
  return true;
}

function matchBand(count: number, bands: Record<string, number>): number {
  // Exact match
  if (bands[String(count)] !== undefined) return bands[String(count)];
  // Range / plus match
  for (const [key, val] of Object.entries(bands)) {
    if (key.includes("_plus")) {
      const min = parseInt(key.split("_")[0]);
      if (!isNaN(min) && count >= min) return val;
    } else if (key.includes("_")) {
      const parts = key.split("_").map(Number);
      if (!isNaN(parts[0]) && !isNaN(parts[1]) && count >= parts[0] && count <= parts[1]) return val;
    }
  }
  return 0;
}

function solutionTypeToCategory(solutionType: string): string {
  if (solutionType === "ucaas") return "ucaas";
  if (solutionType === "ccaas") return "ccaas";
  if (solutionType === "zoom_ra" || solutionType === "rc_ace") return "ci";
  if (solutionType === "zoom_va" || solutionType === "rc_air") return "virtual_agent";
  return "ucaas";
}

// ── Core estimation engine ──────────────────────────────────────────────────

interface DriverAdjustment {
  driverId: string;
  field: string;
  workstreams: string[];
  hoursAdded: number;
  reason: string;
}

interface LaborEstimateData {
  solutionTypeCategory: string;
  baseHours: Record<string, number>;
  driverAdjustments: DriverAdjustment[];
  complexity: { score: number; band: string; multiplier: number; factors: Array<{ label: string; points: number; detail?: string }> };
  preOverrideHours: Record<string, number>;
  finalHours: Record<string, number>;
  overrides: Record<string, number>;
  totals: { low: number; expected: number; high: number };
  confidence: { score: number; band: string };
  riskFlags: string[];
}

function computeEstimate(
  category: string,
  rawAnswers: Record<string, unknown>,
  overrides: Record<string, number>,
  baseHoursOverride?: Record<string, number>
): LaborEstimateData {
  // Translate direct-input numbers (e.g. user_count: 50) into the band-keyed
  // shape the driver mapping expects. NA answers come pre-banded so this is
  // a no-op for them.
  const answers = normalizeAnswers(rawAnswers);
  const base = { ...(baseHoursOverride ?? BASE_HOURS[category]) } as Record<string, number>;
  const adjustments: Record<string, number> = {};
  for (const ws of WORKSTREAMS) adjustments[ws] = 0;

  const driverAdjustments: DriverAdjustment[] = [];

  // Helper: add hours equally across workstreams
  function addToWorkstreams(workstreams: Workstream[], total: number, driverId: string, field: string, reason: string) {
    if (total === 0) return;
    const perWs = total / workstreams.length;
    for (const ws of workstreams) {
      adjustments[ws] = (adjustments[ws] || 0) + perWs;
    }
    driverAdjustments.push({ driverId, field, workstreams: [...workstreams], hoursAdded: total, reason });
  }

  // Apply global drivers
  for (const gd of GLOBAL_DRIVERS) {
    const val = answers[gd.field];
    if ("nonEmptyAdds" in gd && gd.nonEmptyAdds !== undefined) {
      if (isNonEmpty(val)) {
        addToWorkstreams(gd.workstreams, gd.nonEmptyAdds, gd.id, gd.field, "field populated");
      }
    } else if ("mapping" in gd && gd.mapping) {
      const hours = gd.mapping[val as string] ?? 0;
      addToWorkstreams(gd.workstreams, hours, gd.id, gd.field, String(val ?? "not set"));
    }
  }

  // Apply solution-specific drivers
  const solutionDrivers = SOLUTION_DRIVERS[category] ?? [];
  for (const driver of solutionDrivers) {
    const val = answers[driver.field];

    if (driver.bands) {
      // count_band_add
      const count = asCount(val);
      const hours = matchBand(count, driver.bands);
      addToWorkstreams(driver.workstreams, hours, driver.id, driver.field, `${count} items → band match`);
    } else if (driver.repeaterPerItem !== undefined) {
      // repeater_count_add
      const count = asCount(val);
      const hours = Math.min(count * driver.repeaterPerItem, driver.repeaterMax ?? Infinity);
      addToWorkstreams(driver.workstreams, hours, driver.id, driver.field, `${count} items × ${driver.repeaterPerItem}h`);
    } else if (driver.nonEmptyAdds !== undefined) {
      if (isNonEmpty(val)) {
        addToWorkstreams(driver.workstreams, driver.nonEmptyAdds, driver.id, driver.field, "field populated");
      }
    } else if (driver.mapping) {
      const hours = driver.mapping[val as string] ?? 0;
      addToWorkstreams(driver.workstreams, hours, driver.id, driver.field, String(val ?? "not set"));
    }
  }

  // Deployment type multiplier
  const deploymentMultiplier = DEPLOYMENT_TYPE_MULTIPLIERS[answers["deployment_type"] as string] ?? 1.0;

  // Pre-override hours = (base + adjustments) × deployment multiplier
  const preOverrideHours: Record<string, number> = {};
  for (const ws of WORKSTREAMS) {
    preOverrideHours[ws] = Math.round((base[ws] + (adjustments[ws] || 0)) * deploymentMultiplier);
  }

  // Complexity score
  const { score: complexityScore, factors: complexityFactors } = computeComplexityScore(category, answers);
  const complexityBand = complexityScore >= 70 ? "high" : complexityScore >= 35 ? "medium" : "low";
  const complexityMultiplier = complexityBand === "high" ? 1.2 : complexityBand === "medium" ? 1.0 : 0.9;

  // Final hours before user overrides
  const computedFinalHours: Record<string, number> = {};
  for (const ws of WORKSTREAMS) {
    computedFinalHours[ws] = Math.round(preOverrideHours[ws] * complexityMultiplier);
  }

  // Apply user overrides
  const finalHours: Record<string, number> = { ...computedFinalHours };
  for (const [ws, val] of Object.entries(overrides)) {
    if (WORKSTREAMS.includes(ws as Workstream) && val >= 0) {
      finalHours[ws] = val;
    }
  }

  // Totals
  const expectedTotal = Object.values(finalHours).reduce((a, b) => a + b, 0);

  // Confidence
  const { score: confScore, band: confBand } = computeConfidence(category, answers);

  // Range spreads based on confidence
  const spreads = confBand === "high"
    ? { low: 0.9, high: 1.1 }
    : confBand === "medium"
    ? { low: 0.85, high: 1.2 }
    : { low: 0.75, high: 1.35 };

  // Per-workstream spread: overridden hours are user-supplied, no spread
  // applied to them. If the user overrides every workstream, low === expected
  // === high (the "I priced this myself" case). Calculated workstreams still
  // get the confidence-driven spread.
  let lowTotal = 0;
  let highTotal = 0;
  for (const ws of WORKSTREAMS) {
    const fh = finalHours[ws] || 0;
    if (overrides[ws] !== undefined) {
      lowTotal += fh;
      highTotal += fh;
    } else {
      lowTotal += fh * spreads.low;
      highTotal += fh * spreads.high;
    }
  }

  const totals = {
    low: Math.round(lowTotal),
    expected: expectedTotal,
    high: Math.round(highTotal),
  };

  // Risk flags
  const riskFlags = computeRiskFlags(category, answers);

  return {
    solutionTypeCategory: category,
    baseHours: { ...base },
    driverAdjustments: driverAdjustments.filter((d) => d.hoursAdded > 0),
    complexity: { score: complexityScore, band: complexityBand, multiplier: complexityMultiplier, factors: complexityFactors },
    preOverrideHours,
    finalHours,
    overrides,
    totals,
    confidence: { score: confScore, band: confBand },
    riskFlags,
  };
}

type ComplexityFactor = { label: string; points: number; detail: string };

function computeComplexityScore(category: string, answers: Record<string, unknown>): { score: number; factors: ComplexityFactor[] } {
  let score = 0;
  const factors: ComplexityFactor[] = [];

  function add(pts: number, label: string, detail: string) {
    if (pts <= 0) return;
    score += pts;
    factors.push({ label, points: pts, detail });
  }

  if (category === "ucaas") {
    if (isNonEmpty(answers["geographic_or_country_scope"])) add(20, "Multi-country / geographic scope", String(answers["geographic_or_country_scope"]));
    const migPts = { yes: 30, partial: 15, no: 0 }[answers["migration_required"] as string] ?? 0;
    add(migPts, "Migration required", answers["migration_required"] === "partial" ? "Partial migration" : "Full migration");
    const portPts = { yes: 30, partial: 15, no: 0 }[answers["number_porting_required"] as string] ?? 0;
    add(portPts, "Number porting required", answers["number_porting_required"] === "partial" ? "Partial porting" : "Full porting");
    const epCount = asCount(answers["endpoint_types_required"]);
    add(Math.min(epCount * 5, 20), "Endpoint type variety", `${epCount} endpoint type${epCount !== 1 ? "s" : ""}`);
  } else if (category === "ccaas") {
    const chanCount = asCount(answers["channels_required_phase_1"]);
    add(Math.min(chanCount * 10, 40), "Channels in scope (phase 1)", `${chanCount} channel${chanCount !== 1 ? "s" : ""}`);
    const routeCount = asCount(answers["routing_capabilities_required"]);
    add(Math.min(routeCount * 8, 32), "Routing capabilities required", `${routeCount} capability type${routeCount !== 1 ? "s" : ""}`);
    if (answers["wfm_required"] === "yes_phase_1") add(15, "WFM included in phase 1", "In scope");
    if (answers["qm_required"] === "yes_phase_1") add(15, "QM included in phase 1", "In scope");
  } else if (category === "ci") {
    const methCount = asCount(answers["methodology_elements_to_track"]);
    add(Math.min(methCount * 5, 30), "Methodology elements tracked", `${methCount} element${methCount !== 1 ? "s" : ""}`);
    if (answers["custom_trackers_required"] === "yes_phase_1") add(15, "Custom trackers in phase 1", "In scope");
    if (answers["custom_scorecards_required"] === "yes_phase_1") add(15, "Custom scorecards in phase 1", "In scope");
    const crmPts = { yes: 25, future_phase: 10, no: 0 }[answers["crm_integration_required_phase_1"] as string] ?? 0;
    add(crmPts, "CRM integration", answers["crm_integration_required_phase_1"] === "future_phase" ? "Planned for future phase" : "Phase 1");
  } else if (category === "virtual_agent") {
    const intentPts = ({ "1_10": 5, "1_5": 5, "6_15": 15, "11_25": 20, "16_30": 30, "26_50": 40, "31_60": 45, "51_plus": 55, "60_plus": 60 } as Record<string, number>)[answers["estimated_intent_count"] as string] ?? 0;
    add(intentPts, "Intent count", String(answers["estimated_intent_count"] ?? "").replace(/_/g, "–"));
    const intCount = asCount(answers["integration_use_cases_required"]);
    add(Math.min(intCount * 8, 40), "Integration use cases", `${intCount} use case${intCount !== 1 ? "s" : ""}`);
    const contentPts = ({ ready: 0, ready_now: 0, needs_review: 20, needs_cleanup: 20, needs_creation: 35, significant_gaps: 35, unknown: 10 } as Record<string, number>)[answers["content_quality_readiness"] as string] ?? 0;
    const contentLabels: Record<string, string> = { needs_review: "Content needs review", needs_cleanup: "Content needs cleanup", needs_creation: "Content needs creation", significant_gaps: "Content has significant gaps", unknown: "Content readiness unknown" };
    add(contentPts, contentLabels[answers["content_quality_readiness"] as string] ?? "Content readiness", String(answers["content_quality_readiness"] ?? ""));
  }

  return { score: Math.min(score, 100), factors };
}

function computeConfidence(category: string, answers: Record<string, unknown>): { score: number; band: string } {
  const keyFieldsByCat: Record<string, string[]> = {
    ucaas: ["phase_1_scope_summary", "user_count_band", "user_calling_capabilities_required", "call_flow_components_required", "number_inventory_requirements", "endpoint_types_required", "integrations_required", "migration_required", "number_porting_required", "migration_scope_summary", "program_owner_function", "customer_prerequisites_before_design", "signoff_roles"],
    ccaas: ["phase_1_scope_summary", "channels_required_phase_1", "routing_capabilities_required", "crm_integration_required_phase_1", "wfm_required", "qm_required", "migration_required", "program_owner_function", "customer_prerequisites_before_design", "signoff_roles"],
    ci: ["phase_1_scope_summary", "estimated_user_count", "core_capabilities_required", "crm_integration_required_phase_1", "custom_trackers_required", "custom_scorecards_required", "track_methodology_elements", "customer_prerequisites_before_design", "signoff_roles"],
    virtual_agent: ["phase_1_scope_summary", "channels_required_phase_1", "primary_use_cases", "estimated_intent_count", "handoff_to_agent_required", "content_quality_readiness", "integration_use_cases_required", "named_content_owner_exists", "customer_prerequisites_before_design", "signoff_roles"],
  };

  const keyFields = keyFieldsByCat[category] ?? [];
  if (keyFields.length === 0) return { score: 50, band: "medium" };

  const filled = keyFields.filter((f) => isNonEmpty(answers[f])).length;
  const score = Math.round((filled / keyFields.length) * 100);
  const band = score >= 80 ? "high" : score >= 60 ? "medium" : "low";
  return { score, band };
}

function computeRiskFlags(category: string, answers: Record<string, unknown>): string[] {
  const flags: string[] = [];
  if (!isNonEmpty(answers["phase_1_scope_summary"])) {
    flags.push("Phase 1 scope is not clearly defined.");
  }
  if (!isNonEmpty(answers["customer_prerequisites_before_design"])) {
    flags.push("Customer prerequisites have not been identified.");
  }
  if (answers["migration_required"] === "yes" && !isNonEmpty(answers["migration_scope_summary"])) {
    flags.push("Migration is in scope but migration detail is incomplete.");
  }
  if (category === "virtual_agent" && (answers["content_quality_readiness"] === "significant_gaps" || answers["content_quality_readiness"] === "needs_creation")) {
    flags.push("Content readiness is poor and may materially increase labor.");
  }
  return flags;
}

// ── JSON helpers ────────────────────────────────────────────────────────────

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ── Routes ──────────────────────────────────────────────────────────────────

const EDIT_ROLES = ["admin", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "partner_ae"] as const;

// Helper: shape a labor_estimates row for the client (parse all JSON columns).
function shapeEstimateRow(row: Record<string, unknown>) {
  return {
    ...row,
    base_hours: parseJson(row.base_hours, {}),
    driver_adjustments: parseJson(row.driver_adjustments, []),
    complexity: parseJson(row.complexity, {}),
    pre_override_hours: parseJson(row.pre_override_hours, {}),
    final_hours: parseJson(row.final_hours, {}),
    overrides: parseJson(row.overrides, {}),
    risk_flags: parseJson(row.risk_flags, []),
    direct_inputs: row.direct_inputs ? parseJson(row.direct_inputs, null) : null,
  };
}

// GET /api/solutions/:id/labor-estimates — list all labor estimates for a solution.
app.get("/:id/labor-estimates", async (c) => {
  const auth = c.get("auth");
  if (!auth) throw new HTTPException(401, { message: "Unauthorized" });

  const solutionId = c.req.param("id");
  const rows = await c.env.DB.prepare(
    "SELECT * FROM labor_estimates WHERE solution_id = ? ORDER BY solution_type"
  ).bind(solutionId).all() as { results?: Record<string, unknown>[] };

  return c.json((rows.results ?? []).map(shapeEstimateRow));
});

// GET /api/solutions/:id/labor-estimates/:type — one labor estimate for a (solution, type).
app.get("/:id/labor-estimates/:type", async (c) => {
  const auth = c.get("auth");
  if (!auth) throw new HTTPException(401, { message: "Unauthorized" });

  const solutionId = c.req.param("id");
  const solutionType = c.req.param("type");
  const row = await c.env.DB.prepare(
    "SELECT * FROM labor_estimates WHERE solution_id = ? AND solution_type = ? LIMIT 1"
  ).bind(solutionId, solutionType).first() as Record<string, unknown> | null;

  if (!row) throw new HTTPException(404, { message: "Labor estimate not found" });

  return c.json(shapeEstimateRow(row));
});

// PUT /api/solutions/:id/labor-estimates/:type
const upsertSchema = z.object({
  overrides: z.record(z.string(), z.number()).optional().default({}),
  // When provided, direct_inputs is used in place of the per-type
  // needs_assessments answers. Same shape — keys match the field names
  // computeEstimate() reads. null clears any previously-stored direct
  // inputs and falls back to NA.
  direct_inputs: z.record(z.string(), z.unknown()).nullable().optional(),
});

app.put("/:id/labor-estimates/:type", async (c) => {
  const auth = c.get("auth");
  if (!auth) throw new HTTPException(401, { message: "Unauthorized" });
  if (!EDIT_ROLES.includes(auth.role as typeof EDIT_ROLES[number])) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const solutionId = c.req.param("id");
  const solutionType = c.req.param("type");

  const solution = await c.env.DB.prepare(
    "SELECT id, solution_types FROM solutions WHERE id = ? LIMIT 1"
  ).bind(solutionId).first() as { id: string; solution_types: string } | null;
  if (!solution) throw new HTTPException(404, { message: "Solution not found" });

  const applicableTypes = parseSolutionTypes(solution.solution_types);
  if (!applicableTypes.includes(solutionType as typeof applicableTypes[number])) {
    throw new HTTPException(400, { message: `Solution is not scoped to solution_type '${solutionType}'` });
  }

  const parsed = upsertSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { overrides, direct_inputs: directInputsBody } = parsed.data;

  // Resolve answers. If direct_inputs is in the request body, it wins
  // (and gets persisted). If null is sent explicitly, clear any stored
  // direct inputs and fall back to NA. If undefined (not in body), keep
  // whatever was previously stored.
  const existingRow = await c.env.DB.prepare(
    "SELECT direct_inputs FROM labor_estimates WHERE solution_id = ? AND solution_type = ? LIMIT 1"
  ).bind(solutionId, solutionType).first() as { direct_inputs: string | null } | null;

  let directInputsToPersist: Record<string, unknown> | null;
  if (directInputsBody !== undefined) {
    directInputsToPersist = directInputsBody;
  } else {
    directInputsToPersist = existingRow?.direct_inputs
      ? parseJson<Record<string, unknown> | null>(existingRow.direct_inputs, null)
      : null;
  }

  // direct_inputs (if non-empty) supersedes the NA. Empty / null falls back.
  const hasDirectInputs = directInputsToPersist !== null && Object.keys(directInputsToPersist).length > 0;
  let answers: Record<string, unknown>;
  if (hasDirectInputs) {
    answers = directInputsToPersist as Record<string, unknown>;
  } else {
    const naRow = await c.env.DB.prepare(
      "SELECT answers FROM needs_assessments WHERE solution_id = ? AND solution_type = ? LIMIT 1"
    ).bind(solutionId, solutionType).first() as { answers: string } | null;
    answers = parseJson<Record<string, unknown>>(naRow?.answers ?? null, {});
  }

  const category = solutionTypeToCategory(solutionType);

  // Load base hours config override from DB if present
  const configRow = await c.env.DB.prepare(
    "SELECT base_hours FROM labor_config WHERE category = ? LIMIT 1"
  ).bind(category).first() as { base_hours: string } | null;
  const baseHoursOverride = configRow ? parseJson<Record<string, number>>(configRow.base_hours, BASE_HOURS[category]) : undefined;

  const estimate = computeEstimate(category, answers, overrides, baseHoursOverride);

  const existing = await c.env.DB.prepare(
    "SELECT id FROM labor_estimates WHERE solution_id = ? AND solution_type = ? LIMIT 1"
  ).bind(solutionId, solutionType).first();

  const directInputsForDb = directInputsToPersist === null ? null : JSON.stringify(directInputsToPersist);

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE labor_estimates
      SET solution_type_category = ?, base_hours = ?, driver_adjustments = ?,
          complexity = ?, pre_override_hours = ?, final_hours = ?, overrides = ?,
          total_low = ?, total_expected = ?, total_high = ?,
          confidence_score = ?, confidence_band = ?, risk_flags = ?,
          direct_inputs = ?,
          updated_at = datetime('now')
      WHERE solution_id = ? AND solution_type = ?
    `).bind(
      estimate.solutionTypeCategory,
      JSON.stringify(estimate.baseHours),
      JSON.stringify(estimate.driverAdjustments),
      JSON.stringify(estimate.complexity),
      JSON.stringify(estimate.preOverrideHours),
      JSON.stringify(estimate.finalHours),
      JSON.stringify(estimate.overrides),
      estimate.totals.low, estimate.totals.expected, estimate.totals.high,
      estimate.confidence.score, estimate.confidence.band,
      JSON.stringify(estimate.riskFlags),
      directInputsForDb,
      solutionId, solutionType
    ).run();
  } else {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO labor_estimates
        (id, solution_id, solution_type, solution_type_category, base_hours, driver_adjustments, complexity,
         pre_override_hours, final_hours, overrides, total_low, total_expected, total_high,
         confidence_score, confidence_band, risk_flags, direct_inputs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, solutionId, solutionType, estimate.solutionTypeCategory,
      JSON.stringify(estimate.baseHours),
      JSON.stringify(estimate.driverAdjustments),
      JSON.stringify(estimate.complexity),
      JSON.stringify(estimate.preOverrideHours),
      JSON.stringify(estimate.finalHours),
      JSON.stringify(estimate.overrides),
      estimate.totals.low, estimate.totals.expected, estimate.totals.high,
      estimate.confidence.score, estimate.confidence.band,
      JSON.stringify(estimate.riskFlags),
      directInputsForDb
    ).run();
  }

  const row = await c.env.DB.prepare(
    "SELECT * FROM labor_estimates WHERE solution_id = ? AND solution_type = ? LIMIT 1"
  ).bind(solutionId, solutionType).first() as Record<string, unknown>;

  // Hours just changed → keep solutions.sow_total_amount in sync.
  await recomputeSowTotal(c.env.DB, solutionId);

  return c.json(shapeEstimateRow(row));
});

// DELETE /api/solutions/:id/labor-estimates/:type
app.delete("/:id/labor-estimates/:type", async (c) => {
  const auth = c.get("auth");
  if (!auth) throw new HTTPException(401, { message: "Unauthorized" });
  if (!EDIT_ROLES.includes(auth.role as typeof EDIT_ROLES[number])) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const solutionId = c.req.param("id");
  const solutionType = c.req.param("type");
  await c.env.DB.prepare("DELETE FROM labor_estimates WHERE solution_id = ? AND solution_type = ?")
    .bind(solutionId, solutionType)
    .run();

  await recomputeSowTotal(c.env.DB, solutionId);

  return c.json({ success: true });
});

export default app;

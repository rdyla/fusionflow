import { useEffect, useMemo, useState } from "react";
import { api, type LaborEstimate, type Solution } from "../../lib/api";
import {
  calcUcaasBasicBreakdown,
  canUseBasicPricing,
  canUseTieredPricing,
  getUcaasTieredTier,
  UCAAS_BASIC_DEFAULTS,
  UCAAS_TIERED_TIERS,
  UCAAS_TIERED_MAX_SEATS,
  TRAINING_SESSION_COST,
  ONSITE_DEVICE_COST,
  PM_MULTIPLIER,
  type UcaasBasicInputs,
} from "../../../shared/ucaasBasicPricing";
import { DEFAULT_BLENDED_RATE } from "../../../shared/sowAddOns";

const WORKSTREAM_LABELS: Record<string, string> = {
  discovery_requirements: "Discovery & Requirements",
  solution_design: "Solution Design",
  project_management: "Project Management",
  implementation_configuration: "Implementation & Configuration",
  integration: "Integration",
  migration_data_porting: "Migration & Data Porting",
  testing_uat: "Testing & UAT",
  training_enablement: "Training & Enablement",
  documentation_handover: "Documentation & Handover",
  hypercare: "Hypercare",
};

const WORKSTREAMS = Object.keys(WORKSTREAM_LABELS);

const COMPLEXITY_COLOR: Record<string, string> = {
  low: "#107c10",
  medium: "#ff8c00",
  high: "#d13438",
};

const CONFIDENCE_COLOR: Record<string, string> = {
  low: "#d13438",
  medium: "#ff8c00",
  high: "#107c10",
};

// ── Calculator Inputs (Phase 1: UCaaS only) ────────────────────────────────
//
// These are the small set of NA-equivalent fields the calc actually consumes
// when computing UCaaS hours. When set, the server uses these in place of the
// per-type needs_assessments answers — letting a user generate a SOW without
// ever filling out the NA. CCaaS / CI / Virtual Agent stay NA-driven for now.

type InputFieldDef =
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; help?: string }
  | { key: string; label: string; type: "count"; placeholder?: string; help?: string };

const UCAAS_INPUT_FIELDS: InputFieldDef[] = [
  // user_count is a direct numeric input. The server bins it into the
  // band-keyed driver mapping at calc time, so existing band-driven NA
  // solutions still work unchanged.
  { key: "user_count", label: "User count", type: "count", placeholder: "e.g. 50", help: "Total seats in scope" },
  {
    key: "deployment_type", label: "Deployment type", type: "select",
    options: [
      { value: "new_deployment",        label: "New deployment" },
      { value: "migration",             label: "Migration from existing platform" },
      { value: "expansion",             label: "Expansion of existing deployment" },
      { value: "optimization_redesign", label: "Optimization / redesign" },
      { value: "replacement",           label: "Like-for-like replacement" },
    ],
  },
  { key: "integrations_required",         label: "Integrations",          type: "count", placeholder: "0", help: "How many third-party systems integrate?" },
  // Per-device-type analog endpoint inputs (replaces the old endpoint_types
  // banded field). Each one is a fixed hours-per-unit rate.
  { key: "analog_fax_count",              label: "Analog Fax",            type: "count", placeholder: "0", help: "1h each" },
  { key: "paging_system_count",           label: "Paging System",         type: "count", placeholder: "0", help: "4h each" },
  { key: "door_phone_count",              label: "Door Phone",            type: "count", placeholder: "0", help: "3h each" },
  { key: "gate_controller_count",         label: "Gate Controller",       type: "count", placeholder: "0", help: "3h each" },
  { key: "other_analog_device_count",     label: "Other Analog Device",   type: "count", placeholder: "0", help: "2h each" },
  { key: "did_porting_blocks",            label: "DID Porting Blocks",    type: "count", placeholder: "0", help: "15m each" },
  { key: "call_flow_components_required", label: "Call flow components",  type: "count", placeholder: "0", help: "Queues, IVRs, hunt groups, etc." },
  {
    key: "number_porting_required", label: "Number porting", type: "select",
    options: [
      { value: "no",      label: "Not required" },
      { value: "partial", label: "Partial — some numbers" },
      { value: "yes",     label: "Required — most/all numbers" },
    ],
  },
  {
    key: "sandbox_testing_required", label: "Sandbox testing", type: "select",
    options: [
      { value: "no",    label: "Not required" },
      { value: "maybe", label: "Maybe / TBD" },
      { value: "yes",   label: "Required" },
    ],
  },
];

const INPUT_FIELDS_BY_TYPE: Record<string, InputFieldDef[]> = {
  ucaas: UCAAS_INPUT_FIELDS,
};

/** Midpoint seat count for each legacy band — used to pre-fill the new
 *  numeric user_count input from existing NA / direct-input data that
 *  only has the banded user_count_band string. */
const USER_COUNT_BAND_MIDPOINTS: Record<string, string> = {
  "1_25":     "13",
  "26_100":   "63",
  "101_250":  "175",
  "251_500":  "375",
  "500_plus": "500",
};

/** Pull the value for a calculator-input field out of an answer-shaped record.
 *  Handles the NA shape (arrays for count fields) by reducing to length. */
function readInputValue(field: InputFieldDef, source: Record<string, unknown> | null | undefined): string {
  if (!source) return "";
  const raw = source[field.key];
  if (raw == null) {
    // user_count: legacy fallback when only the banded value exists.
    if (field.key === "user_count" && typeof source["user_count_band"] === "string") {
      return USER_COUNT_BAND_MIDPOINTS[source["user_count_band"]] ?? "";
    }
    return "";
  }
  if (field.type === "count") {
    if (Array.isArray(raw)) return String(raw.length);
    if (typeof raw === "number") return String(raw);
    return "";
  }
  return typeof raw === "string" ? raw : "";
}

/** Serialize the form state back into the answer-shaped record the server
 *  persists. Empty fields are dropped (the server's calc treats missing
 *  keys as 0 / "not set"). */
function serializeInputs(fields: InputFieldDef[], state: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const v = state[field.key];
    if (v === undefined || v === "") continue;
    if (field.type === "count") {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0) out[field.key] = n;
    } else {
      out[field.key] = v;
    }
  }
  return out;
}

type PricingMode = "tiered" | "basic" | "advanced";

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  /** Full solution row — needed for pricing_mode, basic_seat_count, and
   *  solution_types (Basic mode is gated to pure-UCaaS). */
  solution: Solution;
  solutionType: string;
  estimate: LaborEstimate | null;
  hasAssessment: boolean;
  /** Per-type NA answers, used to seed the calculator-inputs form on first
   *  open when the estimate has no direct_inputs of its own. Independent
   *  thereafter — editing direct inputs doesn't touch the NA. */
  naAnswers?: Record<string, unknown> | null;
  canEdit: boolean;
  onEstimateChange: (estimate: LaborEstimate | null) => void;
  /** Notify the parent when pricing-mode-related fields on the solution
   *  change (so the Scope tab's SowAddOnsEditor sees the new state). */
  onSolutionChange: (next: Partial<Solution>) => void;
};

export default function LaborEstimateView({ solution, solutionType, estimate, hasAssessment, naAnswers, canEdit, onEstimateChange, onSolutionChange }: Props) {
  const solutionId = solution.id;
  const [overrides, setOverrides] = useState<Record<string, string>>(
    estimate ? Object.fromEntries(Object.entries(estimate.overrides).map(([k, v]) => [k, String(v)])) : {}
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDrivers, setShowDrivers] = useState(false);
  const [showComplexity, setShowComplexity] = useState(true);

  // Calculator Inputs state — initialize from estimate.direct_inputs if set,
  // else seed from NA answers (decision: pre-fill once, then independent),
  // else empty. Re-syncs only when the estimate row identity changes.
  const inputFields = INPUT_FIELDS_BY_TYPE[solutionType] ?? [];
  const supportsDirectInputs = inputFields.length > 0;
  const [directInputs, setDirectInputs] = useState<Record<string, string>>({});
  const [inputsSavedSnapshot, setInputsSavedSnapshot] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!supportsDirectInputs) return;
    const seed: Record<string, string> = {};
    const source = estimate?.direct_inputs ?? naAnswers ?? null;
    for (const field of inputFields) {
      seed[field.key] = readInputValue(field, source);
    }
    setDirectInputs(seed);
    setInputsSavedSnapshot(seed);
  }, [estimate?.id, estimate?.direct_inputs, supportsDirectInputs]);

  const inputsDirty = useMemo(() => {
    for (const field of inputFields) {
      if ((directInputs[field.key] ?? "") !== (inputsSavedSnapshot[field.key] ?? "")) return true;
    }
    return false;
  }, [directInputs, inputsSavedSnapshot, inputFields]);

  const inputSource: "direct" | "needs_assessment" | "none" = estimate?.direct_inputs
    ? "direct"
    : (hasAssessment ? "needs_assessment" : "none");

  // ── Pricing mode (consolidated onto the Labor tab) ─────────────────────────
  // Three modes:
  //   - tiered:   fixed-price ladder for sub-100-seat UCaaS (uses basic_seat_count)
  //   - basic:    formula-driven UCaaS, any size (uses basic_inputs)
  //   - advanced: full labor calculator, any solution type
  // Tiered + basic both require pure UCaaS solutions; combos force advanced.
  const tieredAvailable = canUseTieredPricing(solution.solution_types);
  const basicAvailable = canUseBasicPricing(solution.solution_types);
  const [pricingMode, setPricingMode] = useState<PricingMode>(solution.pricing_mode ?? "advanced");
  // Tiered mode reads/writes basic_seat_count.
  const [tieredSeatCount, setTieredSeatCount] = useState<number | null>(solution.basic_seat_count ?? null);
  // Basic mode reads/writes basic_inputs (with a back-fill from basic_seat_count for old rows).
  const initialInputs = (): UcaasBasicInputs => {
    if (solution.basic_inputs) return solution.basic_inputs;
    if (solution.basic_seat_count != null) return { ...UCAAS_BASIC_DEFAULTS, users: solution.basic_seat_count };
    return { ...UCAAS_BASIC_DEFAULTS };
  };
  const [basicInputs, setBasicInputs] = useState<UcaasBasicInputs>(initialInputs);
  const [savedPricingMode, setSavedPricingMode] = useState<PricingMode>(solution.pricing_mode ?? "advanced");
  const [savedTieredSeatCount, setSavedTieredSeatCount] = useState<number | null>(solution.basic_seat_count ?? null);
  const [savedBasicInputs, setSavedBasicInputs] = useState<UcaasBasicInputs>(initialInputs);
  const [savingPricing, setSavingPricing] = useState(false);

  // Re-sync local pricing state when the solution prop changes (e.g. after
  // a save on a different surface, or the parent reload finishes).
  useEffect(() => {
    const next = solution.basic_inputs
      ? solution.basic_inputs
      : (solution.basic_seat_count != null
          ? { ...UCAAS_BASIC_DEFAULTS, users: solution.basic_seat_count }
          : { ...UCAAS_BASIC_DEFAULTS });
    setPricingMode(solution.pricing_mode ?? "advanced");
    setTieredSeatCount(solution.basic_seat_count ?? null);
    setBasicInputs(next);
    setSavedPricingMode(solution.pricing_mode ?? "advanced");
    setSavedTieredSeatCount(solution.basic_seat_count ?? null);
    setSavedBasicInputs(next);
  }, [solution.pricing_mode, solution.basic_inputs, solution.basic_seat_count]);

  // Combo solutions force advanced.
  const effectiveMode: PricingMode = (() => {
    if (pricingMode === "tiered" && !tieredAvailable) return "advanced";
    if (pricingMode === "basic" && !basicAvailable) return "advanced";
    return pricingMode;
  })();
  const blendedRateForBasic = solution.blended_rate || DEFAULT_BLENDED_RATE;
  const basicBreakdown = useMemo(
    () => calcUcaasBasicBreakdown(basicInputs, blendedRateForBasic),
    [basicInputs, blendedRateForBasic],
  );
  const tieredTier = effectiveMode === "tiered" ? getUcaasTieredTier(tieredSeatCount) : null;
  const tieredOver = effectiveMode === "tiered" && tieredSeatCount !== null && tieredSeatCount > UCAAS_TIERED_MAX_SEATS;

  const inputsDirtyVsSaved =
    basicInputs.users             !== savedBasicInputs.users ||
    basicInputs.sites             !== savedBasicInputs.sites ||
    basicInputs.go_lives          !== savedBasicInputs.go_lives ||
    basicInputs.training_sessions !== savedBasicInputs.training_sessions ||
    basicInputs.onsite_sites      !== savedBasicInputs.onsite_sites ||
    basicInputs.onsite_devices    !== savedBasicInputs.onsite_devices;
  const pricingDirty =
    effectiveMode !== savedPricingMode ||
    (effectiveMode === "basic" && inputsDirtyVsSaved) ||
    (effectiveMode === "tiered" && (tieredSeatCount ?? null) !== (savedTieredSeatCount ?? null));

  function updateBasicInput<K extends keyof UcaasBasicInputs>(key: K, value: UcaasBasicInputs[K]) {
    setBasicInputs((prev) => ({ ...prev, [key]: value }));
  }

  async function savePricing() {
    setSavingPricing(true);
    try {
      const updated = await api.updateSolution(solution.id, {
        pricing_mode: effectiveMode,
        // Tiered mode persists basic_seat_count; clear it in other modes.
        basic_seat_count: effectiveMode === "tiered" ? (tieredSeatCount ?? null) : null,
        // Basic mode persists basic_inputs; clear it in other modes.
        basic_inputs: effectiveMode === "basic" ? basicInputs : null,
      });
      onSolutionChange(updated);
      setSavedPricingMode(effectiveMode);
      setSavedTieredSeatCount(effectiveMode === "tiered" ? (tieredSeatCount ?? null) : null);
      setSavedBasicInputs(effectiveMode === "basic" ? basicInputs : { ...UCAAS_BASIC_DEFAULTS });
    } finally {
      setSavingPricing(false);
    }
  }

  async function generate(keepOverrides = false) {
    setSaving(true);
    try {
      const parsed: Record<string, number> = {};
      if (keepOverrides) {
        for (const [ws, val] of Object.entries(overrides)) {
          const n = parseInt(val);
          if (!isNaN(n) && n >= 0) parsed[ws] = n;
        }
      }
      const result = await api.upsertLaborEstimate(solutionId, solutionType, { overrides: parsed });
      onEstimateChange(result);
      setOverrides(Object.fromEntries(Object.entries(result.overrides).map(([k, v]) => [k, String(v)])));
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function saveOverrides() {
    setSaving(true);
    try {
      const parsed: Record<string, number> = {};
      for (const [ws, val] of Object.entries(overrides)) {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 0) parsed[ws] = n;
      }
      const result = await api.upsertLaborEstimate(solutionId, solutionType, { overrides: parsed });
      onEstimateChange(result);
      setOverrides(Object.fromEntries(Object.entries(result.overrides).map(([k, v]) => [k, String(v)])));
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this labor estimate?")) return;
    setDeleting(true);
    try {
      await api.deleteLaborEstimate(solutionId, solutionType);
      onEstimateChange(null);
      setOverrides({});
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  /** Persist the current direct-inputs form to the estimate and recompute.
   *  If the estimate doesn't exist yet, this also creates it (mirroring
   *  generate()). Overrides are preserved. */
  async function saveDirectInputs() {
    setSaving(true);
    try {
      const payloadOverrides: Record<string, number> = {};
      for (const [ws, val] of Object.entries(overrides)) {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 0) payloadOverrides[ws] = n;
      }
      const direct = serializeInputs(inputFields, directInputs);
      const result = await api.upsertLaborEstimate(solutionId, solutionType, {
        overrides: payloadOverrides,
        direct_inputs: direct,
      });
      onEstimateChange(result);
      setOverrides(Object.fromEntries(Object.entries(result.overrides).map(([k, v]) => [k, String(v)])));
      setInputsSavedSnapshot({ ...directInputs });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  /** Clear direct inputs entirely — the next recompute will read from the
   *  needs assessment (if one exists) or default to base hours. */
  async function clearDirectInputs() {
    if (!confirm("Clear the calculator inputs and revert to needs-assessment-driven values?")) return;
    setSaving(true);
    try {
      const payloadOverrides: Record<string, number> = {};
      for (const [ws, val] of Object.entries(overrides)) {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 0) payloadOverrides[ws] = n;
      }
      const result = await api.upsertLaborEstimate(solutionId, solutionType, {
        overrides: payloadOverrides,
        direct_inputs: null,
      });
      onEstimateChange(result);
      // Reseed form from NA (if present) since the estimate now has no direct_inputs.
      const seed: Record<string, string> = {};
      for (const field of inputFields) seed[field.key] = readInputValue(field, naAnswers ?? null);
      setDirectInputs(seed);
      setInputsSavedSnapshot(seed);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  /** Re-seed the form from the NA without saving (so the user can review
   *  before clicking Save). No server round-trip. */
  function resetToAssessment() {
    if (!naAnswers) return;
    const seed: Record<string, string> = {};
    for (const field of inputFields) seed[field.key] = readInputValue(field, naAnswers);
    setDirectInputs(seed);
  }

  // ── Pricing Mode card (always at top of Labor tab) ────────────────────────
  const pricingAccent = "#003B5C";

  const pricingModeCard = (
    <div className="ms-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Pricing Mode
        </h3>
        <div style={{ display: "inline-flex", border: "1px solid #cbd5e1", borderRadius: 6, overflow: "hidden" }}>
          {(["tiered", "basic", "advanced"] as const).map((m, i, arr) => {
            const selected = effectiveMode === m;
            const disabled = (m === "tiered" && !tieredAvailable) || (m === "basic" && !basicAvailable);
            const title = disabled
              ? (m === "tiered"
                  ? "Tiered pricing is only available for pure UCaaS solutions (sub-100 seats)."
                  : "Basic pricing is only available for pure UCaaS solutions.")
              : undefined;
            return (
              <button
                key={m}
                type="button"
                disabled={!canEdit || disabled}
                onClick={() => setPricingMode(m)}
                style={{
                  padding: "6px 18px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: selected ? pricingAccent : "#fff",
                  color: selected ? "#fff" : disabled ? "#cbd5e1" : "#1e293b",
                  border: "none",
                  borderRight: i < arr.length - 1 ? "1px solid #cbd5e1" : "none",
                  cursor: !canEdit || disabled ? "not-allowed" : "pointer",
                  textTransform: "capitalize",
                }}
                title={title}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px", lineHeight: 1.5 }}>
        {effectiveMode === "tiered" && "Tiered pricing uses a fixed-price ladder by seat count for sub-100-seat UCaaS deployments. Fastest path to a quote — no formula, no estimate."}
        {effectiveMode === "basic" && "Basic pricing uses a formula: 20h base + 0.05h/user + 2h per site + 6h per go-live, plus optional training and on-site work, +15% PM."}
        {effectiveMode === "advanced" && "Advanced pricing uses the full labor calculator — workstream hours derived from inputs (direct or from the needs assessment), then priced at the blended rate."}
      </p>

      {effectiveMode === "tiered" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16, alignItems: "stretch", marginBottom: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Seat Count</span>
              <input
                className="ms-input"
                type="number"
                min={1}
                step={1}
                value={tieredSeatCount ?? ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setTieredSeatCount(Number.isFinite(n) && n > 0 ? n : null);
                }}
                disabled={!canEdit}
                placeholder="e.g. 50"
              />
            </label>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, fontSize: 12 }}>
              <div>
                <div style={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Tier</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: tieredTier ? pricingAccent : "#94a3b8" }}>
                  {tieredTier ? `${tieredTier.label} — ${fmtUsd(tieredTier.price)}` : tieredOver ? "Out of range" : "—"}
                </div>
              </div>
              <div>
                <div style={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Tier Price</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: tieredTier ? "#17C662" : "#94a3b8" }}>{tieredTier ? fmtUsd(tieredTier.price) : "—"}</div>
              </div>
            </div>
          </div>

          {tieredOver && (
            <div style={{ marginBottom: 14, padding: "10px 14px", background: "#fff7ed", border: "1px solid #fde68a", borderRadius: 6, fontSize: 13, color: "#92400e" }}>
              Tiered pricing covers up to {UCAAS_TIERED_MAX_SEATS} seats. For larger deployments, switch to Basic (formula) or Advanced.
            </div>
          )}

          <div style={{ marginBottom: 14, padding: "10px 12px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6, fontSize: 12, color: "#0369a1" }}>
            <strong>Tier ladder:</strong>{" "}
            {UCAAS_TIERED_TIERS.map((t, i) => (
              <span key={t.maxSeats}>
                {i > 0 && " · "}
                {t.label}: {fmtUsd(t.price)}
              </span>
            ))}
          </div>
        </>
      )}

      {effectiveMode === "basic" && (
        <>
          {/* 6-field input grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Users</span>
              <input
                className="ms-input"
                type="number"
                min={0}
                step={1}
                value={basicInputs.users || ""}
                onChange={(e) => updateBasicInput("users", parseInt(e.target.value, 10) || 0)}
                disabled={!canEdit}
                placeholder="e.g. 50"
              />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>0.05h each</span>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Sites</span>
              <input
                className="ms-input"
                type="number"
                min={1}
                step={1}
                value={basicInputs.sites || ""}
                onChange={(e) => updateBasicInput("sites", Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={!canEdit}
              />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>2h each</span>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Go-Lives</span>
              <input
                className="ms-input"
                type="number"
                min={1}
                step={1}
                value={basicInputs.go_lives || ""}
                onChange={(e) => updateBasicInput("go_lives", Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={!canEdit}
              />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>6h each</span>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Training Sessions</span>
              <input
                className="ms-input"
                type="number"
                min={0}
                step={1}
                value={basicInputs.training_sessions || ""}
                onChange={(e) => updateBasicInput("training_sessions", parseInt(e.target.value, 10) || 0)}
                disabled={!canEdit}
              />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>flat ${TRAINING_SESSION_COST} each</span>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>On-site Travel (sites)</span>
              <input
                className="ms-input"
                type="number"
                min={0}
                step={1}
                value={basicInputs.onsite_sites || ""}
                onChange={(e) => updateBasicInput("onsite_sites", parseInt(e.target.value, 10) || 0)}
                disabled={!canEdit}
              />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>+2h labor per site</span>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>On-site Devices</span>
              <input
                className="ms-input"
                type="number"
                min={0}
                step={1}
                value={basicInputs.onsite_devices || ""}
                onChange={(e) => updateBasicInput("onsite_devices", parseInt(e.target.value, 10) || 0)}
                disabled={!canEdit}
              />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>flat ${ONSITE_DEVICE_COST} each</span>
            </label>
          </div>

          {/* Detailed breakdown for the calculator user */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 16px", marginBottom: 14, fontSize: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Calculation</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 4, columnGap: 16, color: "#475569" }}>
              <div>Base</div><div style={{ textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{basicBreakdown.components.base}h</div>
              <div>Users ({basicInputs.users} × 0.05h)</div><div style={{ textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{basicBreakdown.components.users.toFixed(2)}h</div>
              <div>Sites ({basicInputs.sites} × 2h)</div><div style={{ textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{basicBreakdown.components.sites}h</div>
              <div>Go-lives ({basicInputs.go_lives} × 6h)</div><div style={{ textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{basicBreakdown.components.goLives}h</div>
              <div>On-site travel ({basicInputs.onsite_sites} × 2h)</div><div style={{ textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{basicBreakdown.components.onsiteTravel}h</div>
              <div style={{ paddingTop: 4, borderTop: "1px solid #e2e8f0", fontWeight: 600 }}>Total hours × ${blendedRateForBasic}/hr</div>
              <div style={{ textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, monospace", paddingTop: 4, borderTop: "1px solid #e2e8f0", fontWeight: 600 }}>{fmtUsd(basicBreakdown.laborSubtotal)}</div>
              {basicInputs.training_sessions > 0 && (<>
                <div>Training ({basicInputs.training_sessions} × ${TRAINING_SESSION_COST})</div>
                <div style={{ textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{fmtUsd(basicBreakdown.trainingTotal)}</div>
              </>)}
              {basicInputs.onsite_devices > 0 && (<>
                <div>On-site device install ({basicInputs.onsite_devices} × ${ONSITE_DEVICE_COST})</div>
                <div style={{ textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{fmtUsd(basicBreakdown.deviceInstallTotal)}</div>
              </>)}
              <div style={{ paddingTop: 4, borderTop: "1px solid #e2e8f0", fontWeight: 600 }}>Subtotal</div>
              <div style={{ textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, monospace", paddingTop: 4, borderTop: "1px solid #e2e8f0", fontWeight: 600 }}>{fmtUsd(basicBreakdown.prePmSubtotal)}</div>
              <div>Project Management ({(PM_MULTIPLIER * 100).toFixed(0)}%)</div>
              <div style={{ textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{fmtUsd(basicBreakdown.pm)}</div>
              <div style={{ paddingTop: 6, borderTop: "2px solid #17C662", fontWeight: 800, color: "#1e293b" }}>Total</div>
              <div style={{ textAlign: "right", fontFamily: "ui-monospace, SFMono-Regular, monospace", paddingTop: 6, borderTop: "2px solid #17C662", fontWeight: 800, color: "#17C662" }}>{fmtUsd(basicBreakdown.total)}</div>
            </div>
          </div>
        </>
      )}

      {canEdit && pricingDirty && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            className="ms-btn-primary"
            onClick={savePricing}
            disabled={savingPricing}
            style={{ background: pricingAccent }}
          >
            {savingPricing ? "Saving…" : "Save Pricing Mode"}
          </button>
          <span style={{ fontSize: 12, color: "#f59e0b" }}>Unsaved changes</span>
        </div>
      )}
    </div>
  );

  const calcInputsCard = supportsDirectInputs && canEdit ? (
    <div className="ms-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Calculator Inputs
        </h3>
        <div style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12, color: "#fff", background: inputSource === "direct" ? "#0891b2" : inputSource === "needs_assessment" ? "#7c3aed" : "#94a3b8" }}>
          Source: {inputSource === "direct" ? "Direct inputs" : inputSource === "needs_assessment" ? "Needs assessment" : "No inputs yet"}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px", lineHeight: 1.5 }}>
        Use these fields to drive the calculator without filling out the full needs assessment.
        {hasAssessment && inputSource !== "direct" && " The form is pre-filled from the assessment — saving it locks these values into the estimate, independent of the NA."}
        {!hasAssessment && " No needs assessment exists yet — fill these in to bypass the NA entirely."}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
        {inputFields.map((field) => (
          <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {field.label}
            </span>
            {field.type === "select" ? (
              <select
                className="ms-input"
                value={directInputs[field.key] ?? ""}
                onChange={(e) => setDirectInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                disabled={!canEdit}
              >
                <option value="">— Select —</option>
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                className="ms-input"
                type="number"
                min={0}
                step={1}
                placeholder={field.placeholder}
                value={directInputs[field.key] ?? ""}
                onChange={(e) => setDirectInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                disabled={!canEdit}
              />
            )}
            {field.help && <span style={{ fontSize: 11, color: "#94a3b8" }}>{field.help}</span>}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="ms-btn-primary"
          onClick={saveDirectInputs}
          disabled={saving || !inputsDirty}
          style={{ background: inputsDirty ? "#03395f" : "#94a3b8" }}
        >
          {saving ? "Saving…" : estimate ? "Save & Recalculate" : "Save & Generate Estimate"}
        </button>
        {hasAssessment && (
          <button
            type="button"
            className="ms-btn-secondary"
            onClick={resetToAssessment}
            disabled={saving}
            title="Re-pull values from the needs assessment (does not save)"
          >
            ↺ Reset to Assessment
          </button>
        )}
        {estimate?.direct_inputs && (
          <button
            type="button"
            className="ms-btn-secondary"
            onClick={clearDirectInputs}
            disabled={saving}
            style={{ color: "#d13438" }}
            title="Clear direct inputs and use the needs assessment instead"
          >
            Clear Direct Inputs
          </button>
        )}
        {inputsDirty && <span style={{ fontSize: 12, color: "#f59e0b" }}>Unsaved changes</span>}
      </div>
    </div>
  ) : null;

  // Tiered and Basic both replace the labor calc entirely — no workstreams,
  // no direct inputs, no NA. Just the pricing card.
  if (effectiveMode === "tiered" || effectiveMode === "basic") {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        {pricingModeCard}
      </div>
    );
  }

  // No estimate yet (Advanced mode)
  if (!estimate) {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        {pricingModeCard}
        {calcInputsCard}
        <div className="ms-card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>No Labor Estimate Yet</h3>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            {supportsDirectInputs
              ? "Fill in the calculator inputs above and save to generate an estimate, or generate a baseline from the needs assessment below."
              : (hasAssessment
                ? "Generate a labor estimate based on the completed needs assessment."
                : "Complete the needs assessment first to get a more accurate estimate, or generate a baseline estimate from scratch.")}
          </p>
          {canEdit && (
            <button className="ms-btn-primary" onClick={() => generate()} disabled={saving}>
              {saving ? "Generating…" : "Generate Baseline Estimate"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const complexityColor = COMPLEXITY_COLOR[estimate.complexity.band] ?? "#64748b";
  const confidenceColor = CONFIDENCE_COLOR[estimate.confidence_band] ?? "#64748b";

  // Compute driver adjustments per workstream (for display in table)
  const wsDriverTotal: Record<string, number> = {};
  for (const ws of WORKSTREAMS) wsDriverTotal[ws] = 0;
  for (const adj of estimate.driver_adjustments) {
    const perWs = adj.hoursAdded / adj.workstreams.length;
    for (const ws of adj.workstreams) {
      wsDriverTotal[ws] = (wsDriverTotal[ws] || 0) + perWs;
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>

      {pricingModeCard}
      {calcInputsCard}

      {/* ── Summary header ── */}
      <div className="ms-card" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f0f9ff 100%)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b", marginBottom: 8 }}>
              Estimated Professional Services Hours
            </div>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
              {(["low", "expected", "high"] as const).map((band) => {
                const val = band === "low" ? estimate.total_low : band === "expected" ? estimate.total_expected : estimate.total_high;
                return (
                  <div key={band}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{band}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: band === "expected" ? "#03395f" : "#475569", lineHeight: 1 }}>{val}h</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ padding: "8px 14px", borderRadius: 8, background: `${complexityColor}15`, border: `1px solid ${complexityColor}40` }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: complexityColor, marginBottom: 2 }}>Complexity</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: complexityColor, textTransform: "capitalize" }}>
                {estimate.complexity.band} <span style={{ fontSize: 11, fontWeight: 400 }}>({estimate.complexity.score}/100 · ×{estimate.complexity.multiplier})</span>
              </div>
            </div>
            <div style={{ padding: "8px 14px", borderRadius: 8, background: `${confidenceColor}15`, border: `1px solid ${confidenceColor}40` }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: confidenceColor, marginBottom: 2 }}>Confidence</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: confidenceColor, textTransform: "capitalize" }}>
                {estimate.confidence_band} <span style={{ fontSize: 11, fontWeight: 400 }}>({estimate.confidence_score}%)</span>
              </div>
            </div>
          </div>
        </div>

        {estimate.risk_flags.length > 0 && (
          <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 14, display: "grid", gap: 6 }}>
            {estimate.risk_flags.map((flag, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#92400e" }}>
                <span style={{ color: "#f59e0b", marginTop: 1, flexShrink: 0 }}>⚠</span>
                {flag}
              </div>
            ))}
          </div>
        )}

        {/* Total Investment — solution-wide ($), mirrors what the SOW shows.
            Tiered + Basic modes show their own totals up in pricingModeCard;
            Advanced needs the same prominence so the dollar isn't buried in
            the Scope tab. */}
        <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#64748b", marginBottom: 4 }}>
              Total Investment
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              Labor + add-ons − discounts at ${(solution.blended_rate || 165).toLocaleString()}/hr blended rate. Edit on the Scope tab.
            </div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#17C662", lineHeight: 1, fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
            {solution.sow_total_amount != null ? fmtUsd(solution.sow_total_amount) : "—"}
          </div>
        </div>
      </div>

      {/* ── Complexity factors ── */}
      {estimate.complexity.factors && estimate.complexity.factors.length > 0 && (
        <div className="ms-card">
          <button
            type="button"
            onClick={() => setShowComplexity((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: 0 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Complexity Factors
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: `${complexityColor}18`, color: complexityColor, textTransform: "capitalize" }}>
                {estimate.complexity.band} · {estimate.complexity.score}/100 · ×{estimate.complexity.multiplier}
              </span>
            </div>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{showComplexity ? "▲ Hide" : "▼ Show"}</span>
          </button>
          {showComplexity && (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                The complexity score is built from the following assessment inputs. A higher score means more moving parts and drives a larger hours multiplier.
              </p>
              <div style={{ display: "grid", gap: 6 }}>
                {estimate.complexity.factors.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9", fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: complexityColor, minWidth: 48, textAlign: "right" }}>+{f.points} pts</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, color: "#334155" }}>{f.label}</span>
                      {f.detail && <span style={{ color: "#94a3b8", marginLeft: 6 }}>· {f.detail}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, padding: "8px 14px", background: `${complexityColor}0d`, borderRadius: 8, border: `1px solid ${complexityColor}30`, fontSize: 12, color: "#475569", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600 }}>Total complexity score</span>
                <span style={{ fontWeight: 700, color: complexityColor }}>
                  {estimate.complexity.score}/100 → <span style={{ textTransform: "capitalize" }}>{estimate.complexity.band}</span> (×{estimate.complexity.multiplier} applied to all workstreams)
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Workstream table ── */}
      <div className="ms-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Workstream Breakdown</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: "10px 20px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>Workstream</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>Base</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>+Drivers</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>Computed</th>
                {canEdit && <th style={{ textAlign: "right", padding: "10px 20px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>Override</th>}
                <th style={{ textAlign: "right", padding: "10px 20px", fontWeight: 600, color: "#0b9aad", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9" }}>Final</th>
              </tr>
            </thead>
            <tbody>
              {WORKSTREAMS.map((ws, i) => {
                const base = estimate.base_hours[ws] ?? 0;
                const driverAdj = Math.round(wsDriverTotal[ws] ?? 0);
                const computed = Math.round((estimate.pre_override_hours[ws] ?? 0) * estimate.complexity.multiplier);
                const final = estimate.final_hours[ws] ?? 0;
                const hasOverride = estimate.overrides[ws] !== undefined;

                return (
                  <tr key={ws} style={{ borderBottom: i < WORKSTREAMS.length - 1 ? "1px solid #f8fafc" : "none" }}>
                    <td style={{ padding: "12px 20px", color: "#334155", fontWeight: 500 }}>{WORKSTREAM_LABELS[ws]}</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", color: "#94a3b8" }}>{base}h</td>
                    <td style={{ padding: "12px 12px", textAlign: "right", color: driverAdj > 0 ? "#0891b2" : "#94a3b8" }}>
                      {driverAdj > 0 ? `+${driverAdj}h` : "—"}
                    </td>
                    <td style={{ padding: "12px 12px", textAlign: "right", color: hasOverride ? "#94a3b8" : "#475569", textDecoration: hasOverride ? "line-through" : "none" }}>{computed}h</td>
                    {canEdit && (
                      <td style={{ padding: "8px 20px 8px 12px", textAlign: "right" }}>
                        <input
                          type="number"
                          min={0}
                          placeholder="—"
                          value={overrides[ws] ?? ""}
                          onChange={(e) => setOverrides((prev) => {
                            const next = { ...prev };
                            if (e.target.value === "") {
                              delete next[ws];
                            } else {
                              next[ws] = e.target.value;
                            }
                            return next;
                          })}
                          style={{ width: 64, textAlign: "right", padding: "4px 6px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, color: "#334155" }}
                        />
                      </td>
                    )}
                    <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, color: hasOverride ? "#0891b2" : "#1e293b" }}>{final}h</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                <td style={{ padding: "12px 20px", fontWeight: 700, color: "#1e293b" }}>Total</td>
                <td style={{ padding: "12px 12px", textAlign: "right", color: "#94a3b8", fontWeight: 600 }}>
                  {Object.values(estimate.base_hours).reduce((a, b) => a + b, 0)}h
                </td>
                <td style={{ padding: "12px 12px", textAlign: "right", color: "#0891b2", fontWeight: 600 }}>
                  {(() => { const t = Object.values(wsDriverTotal).reduce((a, b) => a + b, 0); return t > 0 ? `+${Math.round(t)}h` : "—"; })()}
                </td>
                <td style={{ padding: "12px 12px", textAlign: "right", color: "#475569", fontWeight: 600 }}>
                  {Math.round(Object.values(estimate.pre_override_hours).reduce((a, b) => a + b, 0) * estimate.complexity.multiplier)}h
                </td>
                {canEdit && <td />}
                <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 800, color: "#03395f", fontSize: 15 }}>
                  {estimate.total_expected}h
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Driver adjustments (collapsible) ── */}
      {estimate.driver_adjustments.length > 0 && (
        <div className="ms-card">
          <button
            type="button"
            onClick={() => setShowDrivers((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: 0 }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Driver Adjustments ({estimate.driver_adjustments.length})
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{showDrivers ? "▲ Hide" : "▼ Show"}</span>
          </button>
          {showDrivers && (
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              {estimate.driver_adjustments.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9", fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: "#0891b2", minWidth: 40 }}>+{d.hoursAdded}h</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "#334155", marginBottom: 2 }}>{d.driverId.replace(/_/g, " ")}</div>
                    <div style={{ color: "#94a3b8" }}>{d.field} · {d.reason} · affects: {d.workstreams.join(", ")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      {canEdit && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ms-btn-primary" onClick={() => generate(true)} disabled={saving}>
              {saving ? "Working…" : "↺ Recalculate from Assessment"}
            </button>
            {Object.keys(overrides).some((k) => overrides[k] !== "") && (
              <button className="ms-btn-secondary" onClick={saveOverrides} disabled={saving}>
                Save Overrides
              </button>
            )}
            <button
              type="button"
              className="ms-btn-secondary"
              onClick={() => { setOverrides({}); }}
              style={{ color: "#94a3b8" }}
              title="Clear all overrides"
            >
              Clear Overrides
            </button>
          </div>
          <button
            type="button"
            className="ms-btn-ghost"
            onClick={handleDelete}
            disabled={deleting}
            style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.3)" }}
          >
            {deleting ? "Deleting…" : "Delete Estimate"}
          </button>
        </div>
      )}
    </div>
  );
}

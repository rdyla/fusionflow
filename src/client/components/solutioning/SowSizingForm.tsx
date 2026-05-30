import { useState, useEffect, useCallback, useMemo } from "react";
import { api, type Solution, type NeedsAssessment } from "../../lib/api";
import { calcUcaasBasicBreakdown, sowDataToBasicInputs, TRAINING_SESSION_COST, ONSITE_DEVICE_COST, PM_MULTIPLIER } from "../../../shared/ucaasBasicPricing";
import { DEFAULT_BLENDED_RATE } from "../../../shared/sowAddOns";
import { isComboMode } from "../../../shared/ccaasComboPricing";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SowData {
  ucaas: {
    basic_users: string;
    advanced_users: string;
    common_area: string;
    conference_rooms: string;
    operators: string;
    ms_teams_type: string;
    additional_did: string;
    additional_toll_free: string;
    // Scoping inputs that drive advanced-mode hours. These use the exact key
    // names the labor engine reads (see src/server/routes/laborEstimates.ts),
    // so sowDataToEngineAnswers() can pass them through 1:1. Moved here from the
    // old "Calculator Inputs" block on the Labor Estimate tab so SOW sizing has
    // a single home.
    deployment_type: string;
    integrations_required: string;
    call_flow_components_required: string;
    number_porting_required: string;
    sandbox_testing_required: string;
    analog_fax_count: string;
    paging_system_count: string;
    door_phone_count: string;
    gate_controller_count: string;
    other_analog_device_count: string;
    did_porting_blocks: string;
    // Basic-mode pricing inputs (flat-cost add-ons). Used only when the
    // solution is in Basic pricing mode (non-combo) — the consolidated form is
    // the single source for Basic sizing + price. Sites / go-lives come from
    // the shared section; users from the breakdown above.
    training_sessions: string;
    onsite_sites: string;
    onsite_devices: string;
  };
  ccaas: {
    agents: string;
    supervisors: string;
    admin_only: string;
    voice: boolean | null;
    email: boolean | null;
    chat: boolean | null;
    sms: boolean | null;
    fax: boolean | null;
    byoc_carrier: string;
    byoc_sbc: string;
  };
  ci: {
    licensed_seats: string;
    recording_channels: string;
    crm_integration: boolean | null;
    crm_name: string;
    retention_months: string;
  };
  va: {
    voice: boolean | null;
    chat: boolean | null;
    sms: boolean | null;
    intent_count: string;
    monthly_session_volume: string;
    crm_integration: boolean | null;
    crm_name: string;
    live_agent_escalation: boolean | null;
  };
  shared: {
    sites_count: string;
    phases_count: string;
    porting_required: boolean | null;
    porting_carrier: string;
    porting_did_count: string;
    fax_count: string;
    ata_count: string;
    overhead_paging_count: string;
    ip_paging_count: string;
    implementation_strategy: string;
    sow_cost_before: string;
    sow_cost_after: string;
  };
  additional_notes: string;
}

const DEFAULT_SOW: SowData = {
  ucaas: {
    basic_users: "", advanced_users: "", common_area: "", conference_rooms: "",
    operators: "", ms_teams_type: "", additional_did: "", additional_toll_free: "",
    deployment_type: "", integrations_required: "", call_flow_components_required: "",
    number_porting_required: "", sandbox_testing_required: "",
    analog_fax_count: "", paging_system_count: "", door_phone_count: "",
    gate_controller_count: "", other_analog_device_count: "", did_porting_blocks: "",
    training_sessions: "", onsite_sites: "", onsite_devices: "",
  },
  ccaas: {
    agents: "", supervisors: "", admin_only: "",
    voice: null, email: null, chat: null, sms: null, fax: null,
    byoc_carrier: "", byoc_sbc: "",
  },
  ci: {
    licensed_seats: "", recording_channels: "", crm_integration: null,
    crm_name: "", retention_months: "",
  },
  va: {
    voice: null, chat: null, sms: null,
    intent_count: "", monthly_session_volume: "",
    crm_integration: null, crm_name: "", live_agent_escalation: null,
  },
  shared: {
    sites_count: "", phases_count: "",
    porting_required: null, porting_carrier: "", porting_did_count: "",
    fax_count: "", ata_count: "", overhead_paging_count: "", ip_paging_count: "",
    implementation_strategy: "", sow_cost_before: "", sow_cost_after: "",
  },
  additional_notes: "",
};

// ── Seed from assessment answers ──────────────────────────────────────────────

export function seedSowFromAssessment(base: SowData, answers: Record<string, unknown>, solutionType: string): SowData {
  const d = JSON.parse(JSON.stringify(base)) as SowData;
  const a = answers;

  if (solutionType === "ucaas") {
    const userBand = a["user_count_band"] as string | undefined;
    if (userBand && !d.ucaas.basic_users) {
      const map: Record<string, string> = { "1_25": "25", "26_100": "100", "101_250": "250", "251_500": "500", "500_plus": "500" };
      d.ucaas.basic_users = map[userBand] ?? "";
    }
    const caBand = a["common_area_or_shared_device_count_band"] as string | undefined;
    if (caBand && !d.ucaas.common_area) {
      const map: Record<string, string> = { "0": "0", "1_10": "10", "11_50": "50", "51_plus": "51" };
      d.ucaas.common_area = map[caBand] ?? "";
    }
    const integrations = a["integrations_required"] as string[] | undefined;
    if (integrations?.includes("teams_or_collaboration") && !d.ucaas.ms_teams_type) {
      d.ucaas.ms_teams_type = "OC";
    }
    const portingReq = a["number_porting_required"] as string | undefined;
    if (portingReq && portingReq !== "no" && d.shared.porting_required === null) {
      d.shared.porting_required = true;
    }
    const carrierDeps = a["carrier_or_number_dependencies"] as string | undefined;
    if (carrierDeps && !d.shared.porting_carrier) d.shared.porting_carrier = carrierDeps;
    const sites = a["sites_or_business_units_in_scope"] as string | undefined;
    if (sites && !d.shared.sites_count) {
      const match = sites.match(/\d+/);
      if (match) d.shared.sites_count = match[0];
    }
    // Scoping selects that drive hours — passthrough from the NA when present.
    const dep = a["deployment_type"] as string | undefined;
    if (dep && !d.ucaas.deployment_type) d.ucaas.deployment_type = dep;
    if (portingReq && !d.ucaas.number_porting_required) d.ucaas.number_porting_required = portingReq;
    const sandbox = a["sandbox_testing_required"] as string | undefined;
    if (sandbox && !d.ucaas.sandbox_testing_required) d.ucaas.sandbox_testing_required = sandbox;
  }

  if (solutionType === "ccaas") {
    const channels = a["channels_in_scope"] as string[] | undefined;
    if (channels) {
      if (channels.includes("voice") && d.ccaas.voice === null) d.ccaas.voice = true;
      if (channels.includes("email") && d.ccaas.email === null) d.ccaas.email = true;
      if (channels.includes("chat") && d.ccaas.chat === null) d.ccaas.chat = true;
      if (channels.includes("sms") && d.ccaas.sms === null) d.ccaas.sms = true;
      if (channels.includes("fax") && d.ccaas.fax === null) d.ccaas.fax = true;
    }
    const agentBand = a["agent_count_band"] as string | undefined;
    if (agentBand && !d.ccaas.agents) {
      const map: Record<string, string> = { "1_10": "10", "11_25": "25", "26_50": "50", "51_100": "100", "101_250": "250", "251_plus": "250" };
      d.ccaas.agents = map[agentBand] ?? "";
    }
    const supBand = a["supervisor_count_band"] as string | undefined;
    if (supBand && !d.ccaas.supervisors) {
      const map: Record<string, string> = { "1_5": "5", "6_20": "20", "21_plus": "21" };
      d.ccaas.supervisors = map[supBand] ?? "";
    }
    const sites = a["sites_or_business_units_in_scope"] as string | undefined;
    if (sites && !d.shared.sites_count) {
      const match = sites.match(/\d+/);
      if (match) d.shared.sites_count = match[0];
    }
  }

  if (solutionType === "ci") {
    const userCount = a["estimated_user_count"] as string | undefined;
    if (userCount && !d.ci.licensed_seats) d.ci.licensed_seats = userCount;
    const crm = a["crm_integration_required_phase_1"] as string | undefined;
    if (crm && d.ci.crm_integration === null) d.ci.crm_integration = crm === "yes";
  }

  if (solutionType === "va") {
    const channels = a["channels_required_phase_1"] as string[] | undefined;
    if (channels) {
      if (channels.includes("voice") && d.va.voice === null) d.va.voice = true;
      if (channels.includes("chat") && d.va.chat === null) d.va.chat = true;
      if (channels.includes("sms") && d.va.sms === null) d.va.sms = true;
    }
    const intents = a["estimated_intent_count"] as string | undefined;
    if (intents && !d.va.intent_count) d.va.intent_count = intents;
  }

  return d;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}>{hint}</span>}
    </div>
  );
}

function Num({ value, onChange, canEdit, placeholder }: { value: string; onChange: (v: string) => void; canEdit: boolean; placeholder?: string }) {
  if (!canEdit) return <span style={{ fontSize: 13, color: value ? "#e2e8f0" : "#475569" }}>{value || "—"}</span>;
  return (
    <input
      className="ms-input"
      type="text"
      inputMode="numeric"
      style={{ fontSize: 12, padding: "5px 8px" }}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, ""))}
      placeholder={placeholder ?? "0"}
    />
  );
}

function Txt({ value, onChange, canEdit, placeholder }: { value: string; onChange: (v: string) => void; canEdit: boolean; placeholder?: string }) {
  if (!canEdit) return <span style={{ fontSize: 13, color: value ? "#e2e8f0" : "#475569" }}>{value || "—"}</span>;
  return (
    <input
      className="ms-input"
      style={{ fontSize: 12, padding: "5px 8px" }}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder ?? ""}
    />
  );
}

function Sel({ value, onChange, canEdit, options }: { value: string; onChange: (v: string) => void; canEdit: boolean; options: { value: string; label: string }[] }) {
  if (!canEdit) {
    const opt = options.find(o => o.value === value);
    return <span style={{ fontSize: 13, color: value ? "#e2e8f0" : "#475569" }}>{opt?.label || "—"}</span>;
  }
  return (
    <select className="ms-input" style={{ fontSize: 12, padding: "5px 8px" }} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">—</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function YN({ value, onChange, canEdit }: { value: boolean | null; onChange: (v: boolean | null) => void; canEdit: boolean }) {
  const label = value === true ? "Yes" : value === false ? "No" : "—";
  if (!canEdit) return <span style={{ fontSize: 13, fontWeight: 600, color: value === true ? "#4ade80" : value === false ? "#f87171" : "#475569" }}>{label}</span>;
  return (
    <select className="ms-input" style={{ fontSize: 12, padding: "5px 8px", width: 80 }}
      value={value === true ? "yes" : value === false ? "no" : ""}
      onChange={e => onChange(e.target.value === "yes" ? true : e.target.value === "no" ? false : null)}>
      <option value="">—</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

const SECTION_HEADER: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: "#63c1ea",
  textTransform: "uppercase", letterSpacing: "0.08em",
  margin: "0 0 16px",
};

const GRID3: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 };
const GRID4: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 };
const GRID2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  solution: Solution;
  /**
   * Per-type needs assessments keyed by solution_type. Each applicable type seeds
   * its own section of the SOW data (UCaaS answers fill the UCaaS section, CCaaS
   * answers fill the CCaaS section, etc.). Single-type solutions behave identically
   * to pre-refactor — just one NA, one section seeded.
   */
  needsAssessments: Record<string, NeedsAssessment>;
  canEdit: boolean;
  onSaved?: (sow: SowData) => void;
}

export default function SowSizingForm({ solution, needsAssessments, canEdit, onSaved }: Props) {
  const [sow, setSow] = useState<SowData>(DEFAULT_SOW);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let base: SowData;
    try {
      base = solution.sow_data ? { ...DEFAULT_SOW, ...JSON.parse(solution.sow_data) } as SowData : JSON.parse(JSON.stringify(DEFAULT_SOW)) as SowData;
    } catch {
      base = JSON.parse(JSON.stringify(DEFAULT_SOW)) as SowData;
    }
    // Seed each applicable type's section from its own NA. Order matters — later
    // calls can override earlier ones for shared fields, so iterate in the solution's
    // declared type order to give the user's first pick precedence on ties.
    for (const t of solution.solution_types) {
      const na = needsAssessments[t];
      if (na?.answers) {
        base = seedSowFromAssessment(base, na.answers as Record<string, unknown>, t);
      }
    }
    // Basic mode (non-combo): seed the sizing from the legacy basic_inputs so a
    // solution priced before the consolidation shows its existing values in the
    // form (and persists them to sow_data on the next save). Fills blanks only.
    if (solution.pricing_mode === "basic" && !isComboMode(solution.solution_types) && solution.basic_inputs) {
      const bi = solution.basic_inputs;
      const toN = (v: string) => Number(v) || 0;
      const userSum = toN(base.ucaas.basic_users) + toN(base.ucaas.advanced_users) + toN(base.ucaas.common_area) + toN(base.ucaas.conference_rooms);
      if (userSum === 0 && bi.users) base.ucaas.basic_users = String(bi.users);
      if (!base.shared.sites_count && bi.sites) base.shared.sites_count = String(bi.sites);
      if (!base.shared.phases_count && bi.go_lives) base.shared.phases_count = String(bi.go_lives);
      if (!base.ucaas.training_sessions && bi.training_sessions) base.ucaas.training_sessions = String(bi.training_sessions);
      if (!base.ucaas.onsite_sites && bi.onsite_sites) base.ucaas.onsite_sites = String(bi.onsite_sites);
      if (!base.ucaas.onsite_devices && bi.onsite_devices) base.ucaas.onsite_devices = String(bi.onsite_devices);
    }
    setSow(base);
    setDirty(false);
  }, [solution.sow_data, needsAssessments, solution.solution_types, solution.pricing_mode, solution.basic_inputs]);

  const upd = useCallback(<K extends keyof SowData>(key: K, val: SowData[K]) => {
    setSow(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateSolution(solution.id, { sow_data: JSON.stringify(sow) });
      setDirty(false);
      onSaved?.(sow);
    } finally {
      setSaving(false);
    }
  };

  const types = solution.solution_types;
  // Mode flags. The form only renders in advanced or basic-non-combo (the SOW
  // tab hides it for tiered + combo). In advanced the UCaaS card shows the
  // hours-driving scoping; in basic it shows the flat-price inputs + breakdown.
  const isBasicNonCombo = solution.pricing_mode === "basic" && !isComboMode(types);
  const isAdvancedMode = solution.pricing_mode !== "basic" && solution.pricing_mode !== "tiered";
  const blendedRate = solution.blended_rate || DEFAULT_BLENDED_RATE;
  const basicBreakdown = useMemo(
    () => calcUcaasBasicBreakdown(sowDataToBasicInputs(sow, solution.basic_inputs), blendedRate),
    [sow, solution.basic_inputs, blendedRate],
  );
  const fmtUsd = (x: number) => "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const journeys: string[] = (() => { try { return solution.journeys ? JSON.parse(solution.journeys) : []; } catch { return []; } })();
  const showUcaas = types.includes("ucaas") || journeys.some(j => j.includes("ucaas"));
  const showCcaas = types.includes("ccaas") || journeys.some(j => j.includes("ccaas"));
  const showCi    = types.includes("ci")    || journeys.some(j => ["zoom_zra", "rc_ace", "zoom_qm", "zoom_wfm", "zoom_ai_expert_assist"].includes(j));
  const showVa    = types.includes("va")    || journeys.some(j => ["zoom_zva", "rc_air"].includes(j));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Save bar */}
      {canEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
          {dirty && <span style={{ fontSize: 12, color: "#fbbf24" }}>Unsaved changes</span>}
          <button className="ms-btn-primary" disabled={saving || !dirty} onClick={save}>
            {saving ? "Saving…" : "Save Sizing"}
          </button>
        </div>
      )}

      {/* ── UCaaS ── */}
      {showUcaas && (
        <div className="ms-card">
          <h3 style={SECTION_HEADER}>UCaaS Sizing</h3>

          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>Licenses</p>
          <div style={{ ...GRID4, marginBottom: 20 }}>
            <Field label="Basic Users"><Num value={sow.ucaas.basic_users} onChange={v => upd("ucaas", { ...sow.ucaas, basic_users: v })} canEdit={canEdit} /></Field>
            <Field label="Advanced Users"><Num value={sow.ucaas.advanced_users} onChange={v => upd("ucaas", { ...sow.ucaas, advanced_users: v })} canEdit={canEdit} /></Field>
            <Field label="Conference Rooms"><Num value={sow.ucaas.conference_rooms} onChange={v => upd("ucaas", { ...sow.ucaas, conference_rooms: v })} canEdit={canEdit} /></Field>
            <Field label="Additional DIDs"><Num value={sow.ucaas.additional_did} onChange={v => upd("ucaas", { ...sow.ucaas, additional_did: v })} canEdit={canEdit} /></Field>
            <Field label="Toll Free Numbers"><Num value={sow.ucaas.additional_toll_free} onChange={v => upd("ucaas", { ...sow.ucaas, additional_toll_free: v })} canEdit={canEdit} /></Field>
            <Field label="MS Teams Type">
              <Sel value={sow.ucaas.ms_teams_type} onChange={v => upd("ucaas", { ...sow.ucaas, ms_teams_type: v })} canEdit={canEdit} options={[
                { value: "OC", label: "Operator Connect (OC)" },
                { value: "draas", label: "Direct Routing (DRaaS)" },
                { value: "embedded", label: "Embedded App" },
                { value: "none", label: "Not Required" },
              ]} />
            </Field>
          </div>

          {/* Advanced mode: hours-driving scoping (feeds the labor engine). */}
          {isAdvancedMode && (<>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>Scoping (drives hours)</p>
          <div style={{ ...GRID3, marginBottom: 12 }}>
            <Field label="Deployment Type">
              <Sel value={sow.ucaas.deployment_type} onChange={v => upd("ucaas", { ...sow.ucaas, deployment_type: v })} canEdit={canEdit} options={[
                { value: "new_deployment",        label: "New deployment" },
                { value: "migration",             label: "Migration from existing platform" },
                { value: "expansion",             label: "Expansion of existing deployment" },
                { value: "optimization_redesign", label: "Optimization / redesign" },
                { value: "replacement",           label: "Like-for-like replacement" },
              ]} />
            </Field>
            <Field label="Number Porting">
              <Sel value={sow.ucaas.number_porting_required} onChange={v => upd("ucaas", { ...sow.ucaas, number_porting_required: v })} canEdit={canEdit} options={[
                { value: "no",      label: "Not required" },
                { value: "partial", label: "Partial — some numbers" },
                { value: "yes",     label: "Required — most/all numbers" },
              ]} />
            </Field>
            <Field label="Sandbox Testing">
              <Sel value={sow.ucaas.sandbox_testing_required} onChange={v => upd("ucaas", { ...sow.ucaas, sandbox_testing_required: v })} canEdit={canEdit} options={[
                { value: "no",    label: "Not required" },
                { value: "maybe", label: "Maybe / TBD" },
                { value: "yes",   label: "Required" },
              ]} />
            </Field>
            <Field label="Integrations" hint="# third-party systems"><Num value={sow.ucaas.integrations_required} onChange={v => upd("ucaas", { ...sow.ucaas, integrations_required: v })} canEdit={canEdit} /></Field>
            <Field label="Call Flow Components" hint="Queues, IVRs, hunt groups"><Num value={sow.ucaas.call_flow_components_required} onChange={v => upd("ucaas", { ...sow.ucaas, call_flow_components_required: v })} canEdit={canEdit} /></Field>
            <Field label="DID Porting Blocks"><Num value={sow.ucaas.did_porting_blocks} onChange={v => upd("ucaas", { ...sow.ucaas, did_porting_blocks: v })} canEdit={canEdit} /></Field>
          </div>

          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>Analog endpoints</p>
          <div style={{ ...GRID3 }}>
            <Field label="Analog Fax"><Num value={sow.ucaas.analog_fax_count} onChange={v => upd("ucaas", { ...sow.ucaas, analog_fax_count: v })} canEdit={canEdit} /></Field>
            <Field label="Paging Systems"><Num value={sow.ucaas.paging_system_count} onChange={v => upd("ucaas", { ...sow.ucaas, paging_system_count: v })} canEdit={canEdit} /></Field>
            <Field label="Door Phones"><Num value={sow.ucaas.door_phone_count} onChange={v => upd("ucaas", { ...sow.ucaas, door_phone_count: v })} canEdit={canEdit} /></Field>
            <Field label="Gate Controllers"><Num value={sow.ucaas.gate_controller_count} onChange={v => upd("ucaas", { ...sow.ucaas, gate_controller_count: v })} canEdit={canEdit} /></Field>
            <Field label="Other Analog Devices"><Num value={sow.ucaas.other_analog_device_count} onChange={v => upd("ucaas", { ...sow.ucaas, other_analog_device_count: v })} canEdit={canEdit} /></Field>
          </div>
          </>)}

          {/* Basic mode (non-combo): flat-price inputs + live breakdown. Users
              come from the breakdown above; sites / go-lives from the shared
              card below. */}
          {isBasicNonCombo && (<>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>Basic Pricing</p>
          <div style={{ ...GRID3, marginBottom: 16 }}>
            <Field label="Training Sessions" hint={`flat $${TRAINING_SESSION_COST} each`}><Num value={sow.ucaas.training_sessions} onChange={v => upd("ucaas", { ...sow.ucaas, training_sessions: v })} canEdit={canEdit} /></Field>
            <Field label="On-site Travel (sites)" hint="+2h labor per site"><Num value={sow.ucaas.onsite_sites} onChange={v => upd("ucaas", { ...sow.ucaas, onsite_sites: v })} canEdit={canEdit} /></Field>
            <Field label="On-site Devices" hint={`flat $${ONSITE_DEVICE_COST} each`}><Num value={sow.ucaas.onsite_devices} onChange={v => upd("ucaas", { ...sow.ucaas, onsite_devices: v })} canEdit={canEdit} /></Field>
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 16px", fontSize: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Basic Price ({fmtUsd(blendedRate)}/hr)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 4, columnGap: 16, color: "#475569" }}>
              <div>Labor ({basicBreakdown.hours.toFixed(2)}h)</div><div style={{ textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{fmtUsd(basicBreakdown.laborSubtotal)}</div>
              {basicBreakdown.trainingTotal > 0 && (<><div>Training</div><div style={{ textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{fmtUsd(basicBreakdown.trainingTotal)}</div></>)}
              {basicBreakdown.deviceInstallTotal > 0 && (<><div>On-site device install</div><div style={{ textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{fmtUsd(basicBreakdown.deviceInstallTotal)}</div></>)}
              <div>Project Management ({(PM_MULTIPLIER * 100).toFixed(0)}%)</div><div style={{ textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{fmtUsd(basicBreakdown.pm)}</div>
              <div style={{ paddingTop: 6, borderTop: "2px solid #17C662", fontWeight: 800, color: "#1e293b" }}>Total (before add-ons)</div>
              <div style={{ textAlign: "right", fontFamily: "ui-monospace, monospace", paddingTop: 6, borderTop: "2px solid #17C662", fontWeight: 800, color: "#17C662" }}>{fmtUsd(basicBreakdown.total)}</div>
            </div>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "10px 0 0" }}>Users from the breakdown above; Sites &amp; Go-Lives from Deployment &amp; Infrastructure below. Add-ons apply in the SOW Total section.</p>
          </div>
          </>)}
        </div>
      )}

      {/* ── CCaaS ── */}
      {showCcaas && (
        <div className="ms-card">
          <h3 style={SECTION_HEADER}>CCaaS Sizing</h3>

          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>Licenses</p>
          <div style={{ ...GRID3, marginBottom: 20 }}>
            <Field label="Agents"><Num value={sow.ccaas.agents} onChange={v => upd("ccaas", { ...sow.ccaas, agents: v })} canEdit={canEdit} /></Field>
            <Field label="Supervisors"><Num value={sow.ccaas.supervisors} onChange={v => upd("ccaas", { ...sow.ccaas, supervisors: v })} canEdit={canEdit} /></Field>
            <Field label="Admin Only"><Num value={sow.ccaas.admin_only} onChange={v => upd("ccaas", { ...sow.ccaas, admin_only: v })} canEdit={canEdit} /></Field>
          </div>

          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>Channels (Phase 1)</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
            {(["voice", "email", "chat", "sms", "fax"] as const).map(ch => (
              <Field key={ch} label={ch.toUpperCase()}>
                <YN value={sow.ccaas[ch]} onChange={v => upd("ccaas", { ...sow.ccaas, [ch]: v })} canEdit={canEdit} />
              </Field>
            ))}
          </div>

          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>BYOC</p>
          <div style={{ ...GRID2 }}>
            <Field label="Carrier"><Txt value={sow.ccaas.byoc_carrier} onChange={v => upd("ccaas", { ...sow.ccaas, byoc_carrier: v })} canEdit={canEdit} placeholder="Carrier name or N/A" /></Field>
            <Field label="SBC Model"><Txt value={sow.ccaas.byoc_sbc} onChange={v => upd("ccaas", { ...sow.ccaas, byoc_sbc: v })} canEdit={canEdit} placeholder="SBC model or N/A" /></Field>
          </div>
        </div>
      )}

      {/* ── Conversation Intelligence ── */}
      {showCi && (
        <div className="ms-card">
          <h3 style={SECTION_HEADER}>Conversation Intelligence Sizing</h3>
          <div style={{ ...GRID3, marginBottom: 20 }}>
            <Field label="Licensed Seats" hint="Users / reps in scope">
              <Num value={sow.ci.licensed_seats} onChange={v => upd("ci", { ...sow.ci, licensed_seats: v })} canEdit={canEdit} />
            </Field>
            <Field label="Recording Channels">
              <Sel value={sow.ci.recording_channels} onChange={v => upd("ci", { ...sow.ci, recording_channels: v })} canEdit={canEdit} options={[
                { value: "voice", label: "Voice only" },
                { value: "video", label: "Video only" },
                { value: "both", label: "Voice & Video" },
              ]} />
            </Field>
            <Field label="Retention (months)">
              <Num value={sow.ci.retention_months} onChange={v => upd("ci", { ...sow.ci, retention_months: v })} canEdit={canEdit} placeholder="12" />
            </Field>
            <Field label="CRM Integration">
              <YN value={sow.ci.crm_integration} onChange={v => upd("ci", { ...sow.ci, crm_integration: v })} canEdit={canEdit} />
            </Field>
            {sow.ci.crm_integration && (
              <Field label="CRM Name">
                <Txt value={sow.ci.crm_name} onChange={v => upd("ci", { ...sow.ci, crm_name: v })} canEdit={canEdit} placeholder="e.g. Salesforce" />
              </Field>
            )}
          </div>
        </div>
      )}

      {/* ── Virtual Agent ── */}
      {showVa && (
        <div className="ms-card">
          <h3 style={SECTION_HEADER}>Virtual Agent Sizing</h3>

          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>Channels (Phase 1)</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {(["voice", "chat", "sms"] as const).map(ch => (
              <Field key={ch} label={ch.toUpperCase()}>
                <YN value={sow.va[ch]} onChange={v => upd("va", { ...sow.va, [ch]: v })} canEdit={canEdit} />
              </Field>
            ))}
          </div>

          <div style={{ ...GRID4 }}>
            <Field label="Intents (Phase 1)" hint="Distinct topics / flows">
              <Num value={sow.va.intent_count} onChange={v => upd("va", { ...sow.va, intent_count: v })} canEdit={canEdit} />
            </Field>
            <Field label="Monthly Sessions" hint="Estimated volume">
              <Txt value={sow.va.monthly_session_volume} onChange={v => upd("va", { ...sow.va, monthly_session_volume: v })} canEdit={canEdit} placeholder="e.g. 5,000" />
            </Field>
            <Field label="CRM Integration">
              <YN value={sow.va.crm_integration} onChange={v => upd("va", { ...sow.va, crm_integration: v })} canEdit={canEdit} />
            </Field>
            {sow.va.crm_integration && (
              <Field label="CRM Name">
                <Txt value={sow.va.crm_name} onChange={v => upd("va", { ...sow.va, crm_name: v })} canEdit={canEdit} placeholder="e.g. Salesforce" />
              </Field>
            )}
            <Field label="Live Agent Escalation">
              <YN value={sow.va.live_agent_escalation} onChange={v => upd("va", { ...sow.va, live_agent_escalation: v })} canEdit={canEdit} />
            </Field>
          </div>
        </div>
      )}

      {/* ── Shared / Infrastructure ── */}
      <div className="ms-card">
        <h3 style={SECTION_HEADER}>Deployment & Infrastructure</h3>

        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>Deployment</p>
        <div style={{ ...GRID4, marginBottom: 20 }}>
          <Field label="Sites"><Num value={sow.shared.sites_count} onChange={v => upd("shared", { ...sow.shared, sites_count: v })} canEdit={canEdit} /></Field>
          <Field label="Phases / Go-Lives"><Num value={sow.shared.phases_count} onChange={v => upd("shared", { ...sow.shared, phases_count: v })} canEdit={canEdit} /></Field>
          <Field label="Implementation Strategy">
            <Sel value={sow.shared.implementation_strategy} onChange={v => upd("shared", { ...sow.shared, implementation_strategy: v })} canEdit={canEdit} options={[
              { value: "cloudpro", label: "CloudPro" },
              { value: "advocacy", label: "Advocacy" },
              { value: "cloudcare", label: "CloudCare" },
            ]} />
          </Field>
        </div>

        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 14px" }}>Additional Notes</p>
        {canEdit ? (
          <textarea
            className="ms-input"
            rows={4}
            style={{ width: "100%", fontSize: 12, resize: "vertical" }}
            value={sow.additional_notes}
            onChange={e => { upd("additional_notes", e.target.value); }}
            placeholder="Exclusions, assumptions, special terms…"
          />
        ) : (
          <span style={{ fontSize: 13, color: sow.additional_notes ? "#e2e8f0" : "#475569", whiteSpace: "pre-wrap" }}>
            {sow.additional_notes || "—"}
          </span>
        )}
      </div>
    </div>
  );
}

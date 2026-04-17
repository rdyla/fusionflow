import { useState, useEffect, useCallback } from "react";
import { api, type Solution, type NeedsAssessment, type LaborEstimate, type SolutionContact } from "../../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PhdData {
  ucaas_enabled: boolean | null;
  ccaas_enabled: boolean | null;

  ucaas_provider: string;
  ucaas_licenses: {
    common_area: string; common_area_notes: string;
    conference: string; conference_notes: string;
    operator: string; operator_notes: string;
    basic_user: string; basic_user_notes: string;
    advanced_user: string; advanced_user_notes: string;
    ms_teams_type: string; ms_teams_notes: string;
    additional_did: string; additional_did_notes: string;
  };
  analog_devices: {
    fax_machines: { device_type: string; qty: string; notes: string };
    analog_overhead_paging: { device_type: string; qty: string; notes: string };
    ip_overhead_paging: { device_type: string; qty: string; notes: string };
    gate_controllers: { device_type: string; qty: string; notes: string };
    door_access: { device_type: string; qty: string; notes: string };
    bell_ringer: { device_type: string; qty: string; notes: string };
  };

  ccaas_provider: string;
  ccaas_channels: {
    voice: boolean | null; voice_notes: string;
    email: boolean | null; email_notes: string;
    chat: boolean | null; chat_notes: string;
    sms: boolean | null; sms_notes: string;
    fax: boolean | null; fax_notes: string;
  };
  ccaas_licenses: {
    agents: string; agents_notes: string;
    supervisors: string; supervisors_notes: string;
    admin_only: string; admin_only_notes: string;
  };
  ccaas_integrations_notes: string;
  byoc: { carrier: string; sbc_model: string; notes: string };
  crm_integrations: {
    salesforce: boolean | null; salesforce_notes: string;
    zendesk: boolean | null; zendesk_notes: string;
    servicenow: boolean | null; servicenow_notes: string;
    ms_dynamics: boolean | null; ms_dynamics_notes: string;
    hubspot: boolean | null; hubspot_notes: string;
    other_name: string; other: boolean | null; other_notes: string;
    custom_api: boolean | null; custom_api_notes: string;
  };
  other_integrations: {
    wfm: boolean | null; wfm_notes: string;
    qm: boolean | null; qm_notes: string;
    ai_expert_assist: boolean | null; ai_expert_assist_notes: string;
    zra: boolean | null; zra_notes: string;
    zva: boolean | null; zva_notes: string;
    workvio: boolean | null; workvio_notes: string;
    other: boolean | null; other_notes: string;
  };

  implementation_strategy: {
    cloudpro: boolean | null; cloudpro_notes: string;
    advocacy: boolean | null; advocacy_notes: string;
    cloudcare: boolean | null; cloudcare_notes: string;
  };
  deployment: {
    sites_count: string; sites_notes: string;
    phases_count: string; phases_notes: string;
  };
  hardware: Array<{ label: string; count: string; seller: string; notes: string }>;
  onsite: {
    phone_placement: boolean | null; phone_placement_notes: string;
    ata_placement: boolean | null; ata_placement_notes: string;
  };
  porting: { carrier: string; num_dids: string };
  sow: { cost_before: string; cost_after: string; notes: string };
  additional_notes: string;
}

const DEFAULT_PHD: PhdData = {
  ucaas_enabled: null,
  ccaas_enabled: null,
  ucaas_provider: "",
  ucaas_licenses: {
    common_area: "", common_area_notes: "",
    conference: "", conference_notes: "",
    operator: "", operator_notes: "",
    basic_user: "", basic_user_notes: "",
    advanced_user: "", advanced_user_notes: "",
    ms_teams_type: "", ms_teams_notes: "",
    additional_did: "", additional_did_notes: "",
  },
  analog_devices: {
    fax_machines: { device_type: "", qty: "", notes: "" },
    analog_overhead_paging: { device_type: "", qty: "", notes: "" },
    ip_overhead_paging: { device_type: "", qty: "", notes: "" },
    gate_controllers: { device_type: "", qty: "", notes: "" },
    door_access: { device_type: "", qty: "", notes: "" },
    bell_ringer: { device_type: "", qty: "", notes: "" },
  },
  ccaas_provider: "",
  ccaas_channels: {
    voice: null, voice_notes: "",
    email: null, email_notes: "",
    chat: null, chat_notes: "",
    sms: null, sms_notes: "",
    fax: null, fax_notes: "",
  },
  ccaas_licenses: {
    agents: "", agents_notes: "",
    supervisors: "", supervisors_notes: "",
    admin_only: "", admin_only_notes: "",
  },
  ccaas_integrations_notes: "",
  byoc: { carrier: "", sbc_model: "", notes: "" },
  crm_integrations: {
    salesforce: null, salesforce_notes: "",
    zendesk: null, zendesk_notes: "",
    servicenow: null, servicenow_notes: "",
    ms_dynamics: null, ms_dynamics_notes: "",
    hubspot: null, hubspot_notes: "",
    other_name: "", other: null, other_notes: "",
    custom_api: null, custom_api_notes: "",
  },
  other_integrations: {
    wfm: null, wfm_notes: "",
    qm: null, qm_notes: "",
    ai_expert_assist: null, ai_expert_assist_notes: "",
    zra: null, zra_notes: "",
    zva: null, zva_notes: "",
    workvio: null, workvio_notes: "",
    other: null, other_notes: "",
  },
  implementation_strategy: {
    cloudpro: null, cloudpro_notes: "",
    advocacy: null, advocacy_notes: "",
    cloudcare: null, cloudcare_notes: "",
  },
  deployment: { sites_count: "", sites_notes: "", phases_count: "", phases_notes: "" },
  hardware: [
    { label: "Phone Model", count: "", seller: "", notes: "" },
    { label: "Phone Model", count: "", seller: "", notes: "" },
    { label: "Phone Model", count: "", seller: "", notes: "" },
    { label: "Phone Model", count: "", seller: "", notes: "" },
    { label: "ATA", count: "", seller: "", notes: "" },
    { label: "Paging Adapter", count: "", seller: "", notes: "" },
    { label: "IP Paging Speakers", count: "", seller: "", notes: "" },
  ],
  onsite: {
    phone_placement: null, phone_placement_notes: "",
    ata_placement: null, ata_placement_notes: "",
  },
  porting: { carrier: "", num_dids: "" },
  sow: { cost_before: "", cost_after: "", notes: "" },
  additional_notes: "",
};

// ── Seed from assessment answers ──────────────────────────────────────────────

function seedFromAssessment(base: PhdData, answers: Record<string, unknown>, solutionType: string): PhdData {
  const d = JSON.parse(JSON.stringify(base)) as PhdData;
  const a = answers;

  if (solutionType === "ucaas") {
    d.ucaas_enabled = d.ucaas_enabled ?? true;

    const userBand = a["user_count_band"] as string | undefined;
    if (userBand && !d.ucaas_licenses.basic_user_notes) {
      d.ucaas_licenses.basic_user_notes = `~${userBand.replace(/_/g, "–")} users (from assessment)`;
    }
    const caBand = a["common_area_or_shared_device_count_band"] as string | undefined;
    if (caBand && !d.ucaas_licenses.common_area_notes) {
      d.ucaas_licenses.common_area_notes = `~${caBand.replace(/_/g, "–")} devices (from assessment)`;
    }
    const faxRequired = a["fax_or_analog_required"] as string | undefined;
    const faxUseCases = a["analog_or_fax_use_cases"] as string | undefined;
    if (faxRequired && faxRequired !== "no" && !d.analog_devices.fax_machines.notes) {
      d.analog_devices.fax_machines.notes = faxUseCases ?? faxRequired;
    }
    const integrations = a["integrations_required"] as string[] | undefined;
    if (integrations?.includes("teams_or_collaboration") && !d.ucaas_licenses.ms_teams_type) {
      d.ucaas_licenses.ms_teams_type = "OC, DRaaS, Embedded App";
    }
    const portingReq = a["number_porting_required"] as string | undefined;
    const carrierDeps = a["carrier_or_number_dependencies"] as string | undefined;
    if (portingReq && portingReq !== "no" && !d.porting.carrier && carrierDeps) {
      d.porting.carrier = carrierDeps;
    }
    const numberInventory = a["number_inventory_requirements"] as string | undefined;
    if (numberInventory && !d.porting.num_dids) {
      d.porting.num_dids = numberInventory;
    }
    const sites = a["sites_or_business_units_in_scope"] as string | undefined;
    if (sites && !d.deployment.sites_notes) {
      d.deployment.sites_notes = sites;
    }
  }

  if (solutionType === "ccaas") {
    d.ccaas_enabled = d.ccaas_enabled ?? true;

    const channels = a["channels_in_scope"] as string[] | undefined;
    if (channels) {
      if (channels.includes("voice") && d.ccaas_channels.voice === null) d.ccaas_channels.voice = true;
      if (channels.includes("email") && d.ccaas_channels.email === null) d.ccaas_channels.email = true;
      if (channels.includes("chat") && d.ccaas_channels.chat === null) d.ccaas_channels.chat = true;
      if (channels.includes("sms") && d.ccaas_channels.sms === null) d.ccaas_channels.sms = true;
      if (channels.includes("fax") && d.ccaas_channels.fax === null) d.ccaas_channels.fax = true;
    }

    const agentBand = a["agent_count_band"] as string | undefined;
    if (agentBand && !d.ccaas_licenses.agents_notes) {
      d.ccaas_licenses.agents_notes = `~${agentBand.replace(/_/g, "–")} agents (from assessment)`;
    }
    const supBand = a["supervisor_count_band"] as string | undefined;
    if (supBand && !d.ccaas_licenses.supervisors_notes) {
      d.ccaas_licenses.supervisors_notes = `~${supBand.replace(/_/g, "–")} supervisors (from assessment)`;
    }

    const crm = a["crm_in_use"] as string | undefined;
    if (crm) {
      const crmLower = crm.toLowerCase();
      if (crmLower.includes("salesforce") && d.crm_integrations.salesforce === null) d.crm_integrations.salesforce = true;
      if (crmLower.includes("zendesk") && d.crm_integrations.zendesk === null) d.crm_integrations.zendesk = true;
      if (crmLower.includes("servicenow") && d.crm_integrations.servicenow === null) d.crm_integrations.servicenow = true;
      if ((crmLower.includes("dynamics") || crmLower.includes("microsoft")) && d.crm_integrations.ms_dynamics === null) d.crm_integrations.ms_dynamics = true;
      if (crmLower.includes("hubspot") && d.crm_integrations.hubspot === null) d.crm_integrations.hubspot = true;
    }

    const sites = a["sites_or_business_units_in_scope"] as string | undefined;
    if (sites && !d.deployment.sites_notes) {
      d.deployment.sites_notes = sites;
    }
  }

  return d;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const TH_STYLE: React.CSSProperties = {
  background: "#1e7e56",
  color: "#fff",
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 700,
  textAlign: "left",
  whiteSpace: "nowrap",
};

const TD_LABEL: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  color: "#cbd5e1",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

const TD_INPUT: React.CSSProperties = {
  padding: "2px 6px",
  verticalAlign: "middle",
};

const SECTION_HEADER: React.CSSProperties = {
  background: "#0f3b5c",
  color: "#63c1ea",
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
};

function Cell({ value, onChange, canEdit, placeholder, wide }: {
  value: string;
  onChange: (v: string) => void;
  canEdit: boolean;
  placeholder?: string;
  wide?: boolean;
}) {
  if (!canEdit) {
    return <span style={{ fontSize: 12, color: value ? "#e2e8f0" : "#475569" }}>{value || "—"}</span>;
  }
  return (
    <input
      className="ms-input"
      style={{ fontSize: 11, padding: "3px 6px", width: wide ? "100%" : "90px", minWidth: 60 }}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder ?? ""}
    />
  );
}

type YesNo = boolean | null;

function YesNoCell({ value, onChange, canEdit }: { value: YesNo; onChange: (v: YesNo) => void; canEdit: boolean }) {
  const label = value === true ? "Yes" : value === false ? "No" : "";
  if (!canEdit) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 600,
        color: value === true ? "#4ade80" : value === false ? "#f87171" : "#475569",
      }}>
        {label || "—"}
      </span>
    );
  }
  return (
    <select
      className="ms-input"
      style={{ fontSize: 11, padding: "3px 5px", width: 64 }}
      value={value === true ? "yes" : value === false ? "no" : ""}
      onChange={e => onChange(e.target.value === "yes" ? true : e.target.value === "no" ? false : null)}
    >
      <option value="">—</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  solution: Solution;
  needsAssessment: NeedsAssessment | null;
  laborEstimate: LaborEstimate | null;
  solutionContacts: SolutionContact[];
  canEdit: boolean;
  onSaved?: () => void;
}

export default function ProjectHandoffDocument({ solution, needsAssessment, laborEstimate, solutionContacts, canEdit, onSaved }: Props) {
  const [phd, setPhd] = useState<PhdData>(DEFAULT_PHD);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Initialize from stored phd_data, then seed from assessment for any un-set fields
  useEffect(() => {
    let base: PhdData;
    try {
      base = solution.phd_data ? { ...DEFAULT_PHD, ...JSON.parse(solution.phd_data) } as PhdData : JSON.parse(JSON.stringify(DEFAULT_PHD)) as PhdData;
    } catch {
      base = JSON.parse(JSON.stringify(DEFAULT_PHD)) as PhdData;
    }
    if (needsAssessment?.answers) {
      base = seedFromAssessment(base, needsAssessment.answers as Record<string, unknown>, solution.solution_type);
    }
    setPhd(base);
    setDirty(false);
  }, [solution.phd_data, needsAssessment, solution.solution_type]);

  const update = useCallback(<K extends keyof PhdData>(key: K, value: PhdData[K]) => {
    setPhd(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateSolution(solution.id, { phd_data: JSON.stringify(phd) });
      setDirty(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const primaryContact = solutionContacts[0];

  const vendorLabel = solution.vendor === "zoom" ? "Zoom" : solution.vendor === "ringcentral" ? "RingCentral" : solution.vendor ?? "";

  // Labor estimate total for SOW hint
  const laborHint = laborEstimate
    ? `Est. ${laborEstimate.total_low}–${laborEstimate.total_high} hrs`
    : "";

  // ── Render ───────────────────────────────────────────────────────────────────

  const tableStyle: React.CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: 12 };
  const tdBorder: React.CSSProperties = { border: "1px solid rgba(99,193,234,0.12)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Save bar */}
      {canEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
          {dirty && <span style={{ fontSize: 12, color: "#fbbf24" }}>Unsaved changes</span>}
          <button className="ms-btn-primary" disabled={saving || !dirty} onClick={save}>
            {saving ? "Saving…" : "Save Handoff Document"}
          </button>
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

        {/* ══ LEFT COLUMN ══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Account Header */}
          <div className="ms-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ ...SECTION_HEADER, background: "#0a2540", color: "#f0f6ff", fontSize: 13 }}>
              Account Information
            </div>
            <table style={tableStyle}>
              <tbody>
                {[
                  ["Account Name", solution.customer_name],
                  ["Primary Contact Name", primaryContact?.name ?? ""],
                  ["Primary Contact Phone", primaryContact?.phone ?? ""],
                  ["Primary Contact Email", primaryContact?.email ?? ""],
                  ["Provider Account Executive", solution.partner_ae_name ?? ""],
                  ["Provider AE Email", solution.partner_ae_email ?? ""],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ ...TD_LABEL, ...tdBorder, width: 220, fontWeight: 600 }}>{label}</td>
                    <td style={{ ...TD_INPUT, ...tdBorder }}><span style={{ fontSize: 12, color: "#e2e8f0" }}>{value || "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── UCaaS ── */}
          <div className="ms-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...SECTION_HEADER }}>
              <span>UCaaS</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>Include?</span>
                <YesNoCell value={phd.ucaas_enabled} onChange={v => update("ucaas_enabled", v)} canEdit={canEdit} />
              </div>
            </div>
            {/* Provider */}
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder, width: 180 }}>Provider</td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell
                      value={phd.ucaas_provider || vendorLabel}
                      onChange={v => update("ucaas_provider", v)}
                      canEdit={canEdit}
                      placeholder={vendorLabel || "Vendor"}
                      wide
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* UCaaS Licenses */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 180 }}>UCaaS Licenses</th>
                  <th style={TH_STYLE}>License Count</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["common_area", "Common Area Profiles"],
                    ["conference", "Conference Profiles"],
                    ["operator", "Operators / Receptionists"],
                    ["basic_user", "Basic User Profiles"],
                    ["advanced_user", "Advanced User Profiles"],
                    ["ms_teams_type", "MS Teams Integration"],
                    ["additional_did", "Additional DID / Toll Free"],
                  ] as [keyof PhdData["ucaas_licenses"], string][]
                ).map(([key, label]) => {
                  const countKey = key as string;
                  const notesKey = `${countKey}_notes` as keyof PhdData["ucaas_licenses"];
                  const countVal = phd.ucaas_licenses[countKey as keyof PhdData["ucaas_licenses"]] as string;
                  const notesVal = phd.ucaas_licenses[notesKey] as string;
                  return (
                    <tr key={key}>
                      <td style={{ ...TD_LABEL, ...tdBorder }}>{label}</td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <Cell
                          value={countVal}
                          onChange={v => update("ucaas_licenses", { ...phd.ucaas_licenses, [countKey]: v })}
                          canEdit={canEdit}
                          placeholder="—"
                        />
                      </td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <Cell
                          value={notesVal}
                          onChange={v => update("ucaas_licenses", { ...phd.ucaas_licenses, [notesKey]: v })}
                          canEdit={canEdit}
                          placeholder="Notes"
                          wide
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* UCaaS Analog / ATAs */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 180 }}>Analog / ATA / Paging</th>
                  <th style={TH_STYLE}>Device Type</th>
                  <th style={TH_STYLE}>Qty</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["fax_machines", "Fax Machines"],
                    ["analog_overhead_paging", "Analog Over Head Paging"],
                    ["ip_overhead_paging", "IP Over Head Paging"],
                    ["gate_controllers", "Gate Controllers"],
                    ["door_access", "Door Access Controllers"],
                    ["bell_ringer", "Bell Ringer"],
                  ] as [keyof PhdData["analog_devices"], string][]
                ).map(([key, label]) => {
                  const row = phd.analog_devices[key];
                  return (
                    <tr key={key}>
                      <td style={{ ...TD_LABEL, ...tdBorder }}>{label}</td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <Cell value={row.device_type} onChange={v => update("analog_devices", { ...phd.analog_devices, [key]: { ...row, device_type: v } })} canEdit={canEdit} />
                      </td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <Cell value={row.qty} onChange={v => update("analog_devices", { ...phd.analog_devices, [key]: { ...row, qty: v } })} canEdit={canEdit} placeholder="0" />
                      </td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <Cell value={row.notes} onChange={v => update("analog_devices", { ...phd.analog_devices, [key]: { ...row, notes: v } })} canEdit={canEdit} placeholder="Notes" wide />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── CCaaS ── */}
          <div className="ms-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...SECTION_HEADER }}>
              <span>CCaaS</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>Include?</span>
                <YesNoCell value={phd.ccaas_enabled} onChange={v => update("ccaas_enabled", v)} canEdit={canEdit} />
              </div>
            </div>

            {/* Provider */}
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder, width: 180 }}>Provider</td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.ccaas_provider || vendorLabel} onChange={v => update("ccaas_provider", v)} canEdit={canEdit} placeholder={vendorLabel || "Vendor"} wide />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* CCaaS Channels */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 180 }}>CCaaS Channels</th>
                  <th style={TH_STYLE}>Yes / No</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {(["voice", "email", "chat", "sms", "fax"] as const).map(ch => {
                  const notesKey = `${ch}_notes` as keyof PhdData["ccaas_channels"];
                  return (
                    <tr key={ch}>
                      <td style={{ ...TD_LABEL, ...tdBorder, textTransform: "capitalize" }}>{ch}</td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <YesNoCell value={phd.ccaas_channels[ch]} onChange={v => update("ccaas_channels", { ...phd.ccaas_channels, [ch]: v })} canEdit={canEdit} />
                      </td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <Cell value={phd.ccaas_channels[notesKey] as string} onChange={v => update("ccaas_channels", { ...phd.ccaas_channels, [notesKey]: v })} canEdit={canEdit} placeholder="Notes" wide />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* CCaaS Licenses */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 180 }}>CCaaS Licenses</th>
                  <th style={TH_STYLE}>License Count</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {([["agents", "Agents"], ["supervisors", "Supervisors"], ["admin_only", "Admin Only"]] as const).map(([key, label]) => {
                  const notesKey = `${key}_notes` as keyof PhdData["ccaas_licenses"];
                  return (
                    <tr key={key}>
                      <td style={{ ...TD_LABEL, ...tdBorder }}>{label}</td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <Cell value={phd.ccaas_licenses[key]} onChange={v => update("ccaas_licenses", { ...phd.ccaas_licenses, [key]: v })} canEdit={canEdit} placeholder="—" />
                      </td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <Cell value={phd.ccaas_licenses[notesKey] as string} onChange={v => update("ccaas_licenses", { ...phd.ccaas_licenses, [notesKey]: v })} canEdit={canEdit} placeholder="Notes" wide />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Integrations free text */}
            <table style={tableStyle}>
              <thead>
                <tr><th style={TH_STYLE} colSpan={2}>Integrations</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={2} style={{ ...TD_INPUT, ...tdBorder, padding: "6px 10px" }}>
                    {canEdit ? (
                      <textarea
                        className="ms-input"
                        rows={2}
                        style={{ width: "100%", fontSize: 11, resize: "vertical" }}
                        value={phd.ccaas_integrations_notes}
                        onChange={e => update("ccaas_integrations_notes", e.target.value)}
                        placeholder="List custom / other integrations…"
                      />
                    ) : (
                      <span style={{ fontSize: 12, color: phd.ccaas_integrations_notes ? "#e2e8f0" : "#475569" }}>{phd.ccaas_integrations_notes || "—"}</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* BYOC */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 180 }}>BYOC</th>
                  <th style={TH_STYLE}>Carrier / SBC Info</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder }}>Carrier</td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.byoc.carrier} onChange={v => update("byoc", { ...phd.byoc, carrier: v })} canEdit={canEdit} placeholder="Carrier name" wide />
                  </td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.byoc.notes} onChange={v => update("byoc", { ...phd.byoc, notes: v })} canEdit={canEdit} placeholder="Notes" wide />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder }}>SBC Model</td>
                  <td colSpan={2} style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.byoc.sbc_model} onChange={v => update("byoc", { ...phd.byoc, sbc_model: v })} canEdit={canEdit} placeholder="SBC model" wide />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* SaaS / CRM Integrations */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 180 }}>SaaS / LOB / CRM</th>
                  <th style={TH_STYLE}>Yes / No</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ["salesforce", "Salesforce"],
                  ["zendesk", "Zendesk"],
                  ["servicenow", "ServiceNow"],
                  ["ms_dynamics", "MS Dynamics 365"],
                  ["hubspot", "Hubspot"],
                  ["custom_api", "Custom API"],
                ] as [keyof PhdData["crm_integrations"], string][]).map(([key, label]) => {
                  const notesKey = `${key}_notes` as keyof PhdData["crm_integrations"];
                  return (
                    <tr key={key}>
                      <td style={{ ...TD_LABEL, ...tdBorder }}>{label}</td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <YesNoCell value={phd.crm_integrations[key] as YesNo} onChange={v => update("crm_integrations", { ...phd.crm_integrations, [key]: v })} canEdit={canEdit} />
                      </td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <Cell value={phd.crm_integrations[notesKey] as string} onChange={v => update("crm_integrations", { ...phd.crm_integrations, [notesKey]: v })} canEdit={canEdit} placeholder="Notes" wide />
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ ...TD_INPUT, ...tdBorder, padding: "4px 10px" }}>
                    <Cell value={phd.crm_integrations.other_name} onChange={v => update("crm_integrations", { ...phd.crm_integrations, other_name: v })} canEdit={canEdit} placeholder="Other (name)" wide />
                  </td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <YesNoCell value={phd.crm_integrations.other} onChange={v => update("crm_integrations", { ...phd.crm_integrations, other: v })} canEdit={canEdit} />
                  </td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.crm_integrations.other_notes} onChange={v => update("crm_integrations", { ...phd.crm_integrations, other_notes: v })} canEdit={canEdit} placeholder="Notes" wide />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Other Integrations */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 180 }}>Other Integrations</th>
                  <th style={TH_STYLE}>Yes / No</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ["wfm", "Workforce Management"],
                  ["qm", "Quality Management"],
                  ["ai_expert_assist", "AI Expert Assist"],
                  ["zra", "ZRA"],
                  ["zva", "ZVA"],
                  ["workvio", "Workvio"],
                  ["other", "Other Integrations"],
                ] as [keyof PhdData["other_integrations"], string][]).map(([key, label]) => {
                  const notesKey = `${key}_notes` as keyof PhdData["other_integrations"];
                  return (
                    <tr key={key}>
                      <td style={{ ...TD_LABEL, ...tdBorder }}>{label}</td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <YesNoCell value={phd.other_integrations[key] as YesNo} onChange={v => update("other_integrations", { ...phd.other_integrations, [key]: v })} canEdit={canEdit} />
                      </td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <Cell value={phd.other_integrations[notesKey] as string} onChange={v => update("other_integrations", { ...phd.other_integrations, [notesKey]: v })} canEdit={canEdit} placeholder="Notes" wide />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ══ RIGHT COLUMN ══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Implementation Strategy */}
          <div className="ms-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={SECTION_HEADER}>Project Information</div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 200 }}>Implementation Strategy</th>
                  <th style={TH_STYLE}>Yes / No</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {([["cloudpro", "CloudPro"], ["advocacy", "Advocacy"], ["cloudcare", "CloudCare"]] as const).map(([key, label]) => {
                  const notesKey = `${key}_notes` as keyof PhdData["implementation_strategy"];
                  return (
                    <tr key={key}>
                      <td style={{ ...TD_LABEL, ...tdBorder }}>{label}</td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <YesNoCell value={phd.implementation_strategy[key]} onChange={v => update("implementation_strategy", { ...phd.implementation_strategy, [key]: v })} canEdit={canEdit} />
                      </td>
                      <td style={{ ...TD_INPUT, ...tdBorder }}>
                        <Cell value={phd.implementation_strategy[notesKey] as string} onChange={v => update("implementation_strategy", { ...phd.implementation_strategy, [notesKey]: v })} canEdit={canEdit} placeholder="Notes" wide />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Deployment Info */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 200 }}>Deployment Information</th>
                  <th style={TH_STYLE}>Count</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder }}>Sites</td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.deployment.sites_count} onChange={v => update("deployment", { ...phd.deployment, sites_count: v })} canEdit={canEdit} placeholder="0" />
                  </td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.deployment.sites_notes} onChange={v => update("deployment", { ...phd.deployment, sites_notes: v })} canEdit={canEdit} placeholder="Site names / details" wide />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder }}>Phases / Go-Lives</td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.deployment.phases_count} onChange={v => update("deployment", { ...phd.deployment, phases_count: v })} canEdit={canEdit} placeholder="0" />
                  </td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.deployment.phases_notes} onChange={v => update("deployment", { ...phd.deployment, phases_notes: v })} canEdit={canEdit} placeholder="Phase details" wide />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Sold Hardware */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 160 }}>Sold Hardware</th>
                  <th style={TH_STYLE}>Count</th>
                  <th style={TH_STYLE}>Seller</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {phd.hardware.map((hw, i) => (
                  <tr key={i}>
                    <td style={{ ...TD_INPUT, ...tdBorder, padding: "3px 10px" }}>
                      <Cell value={hw.label} onChange={v => update("hardware", phd.hardware.map((h, j) => j === i ? { ...h, label: v } : h))} canEdit={canEdit} placeholder="Phone Model" wide />
                    </td>
                    <td style={{ ...TD_INPUT, ...tdBorder }}>
                      <Cell value={hw.count} onChange={v => update("hardware", phd.hardware.map((h, j) => j === i ? { ...h, count: v } : h))} canEdit={canEdit} placeholder="0" />
                    </td>
                    <td style={{ ...TD_INPUT, ...tdBorder }}>
                      <Cell value={hw.seller} onChange={v => update("hardware", phd.hardware.map((h, j) => j === i ? { ...h, seller: v } : h))} canEdit={canEdit} placeholder="Seller" />
                    </td>
                    <td style={{ ...TD_INPUT, ...tdBorder }}>
                      <Cell value={hw.notes} onChange={v => update("hardware", phd.hardware.map((h, j) => j === i ? { ...h, notes: v } : h))} canEdit={canEdit} placeholder="Notes" wide />
                    </td>
                  </tr>
                ))}
                {canEdit && (
                  <tr>
                    <td colSpan={4} style={{ padding: "4px 10px", ...tdBorder }}>
                      <button
                        className="ms-btn"
                        style={{ fontSize: 11, padding: "2px 10px" }}
                        onClick={() => update("hardware", [...phd.hardware, { label: "Phone Model", count: "", seller: "", notes: "" }])}
                      >
                        + Add Row
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Onsite Services */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 200 }}>Onsite Services</th>
                  <th style={TH_STYLE}>Yes / No</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder }}>Phone Placement &amp; Programming</td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <YesNoCell value={phd.onsite.phone_placement} onChange={v => update("onsite", { ...phd.onsite, phone_placement: v })} canEdit={canEdit} />
                  </td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.onsite.phone_placement_notes} onChange={v => update("onsite", { ...phd.onsite, phone_placement_notes: v })} canEdit={canEdit} placeholder="Notes" wide />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder }}>ATA Placement &amp; Programming</td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <YesNoCell value={phd.onsite.ata_placement} onChange={v => update("onsite", { ...phd.onsite, ata_placement: v })} canEdit={canEdit} />
                  </td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.onsite.ata_placement_notes} onChange={v => update("onsite", { ...phd.onsite, ata_placement_notes: v })} canEdit={canEdit} placeholder="Notes" wide />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Porting Information */}
            <table style={tableStyle}>
              <thead>
                <tr><th style={TH_STYLE} colSpan={2}>Porting Information</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder, width: 200 }}>Carrier</td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.porting.carrier} onChange={v => update("porting", { ...phd.porting, carrier: v })} canEdit={canEdit} placeholder="Carrier name" wide />
                  </td>
                </tr>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder }}># of DID's</td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.porting.num_dids} onChange={v => update("porting", { ...phd.porting, num_dids: v })} canEdit={canEdit} placeholder="e.g. 250" wide />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* SOW Info */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, width: 200 }}>SOW Info</th>
                  <th style={TH_STYLE}>Cost</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder }}>SOW Cost Before Discounts</td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.sow.cost_before} onChange={v => update("sow", { ...phd.sow, cost_before: v })} canEdit={canEdit} placeholder="$" />
                  </td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    {laborHint && <span style={{ fontSize: 10, color: "#64748b" }}>{laborHint}</span>}
                  </td>
                </tr>
                <tr>
                  <td style={{ ...TD_LABEL, ...tdBorder }}>SOW Cost After Discounts</td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.sow.cost_after} onChange={v => update("sow", { ...phd.sow, cost_after: v })} canEdit={canEdit} placeholder="$" />
                  </td>
                  <td style={{ ...TD_INPUT, ...tdBorder }}>
                    <Cell value={phd.sow.notes} onChange={v => update("sow", { ...phd.sow, notes: v })} canEdit={canEdit} placeholder="Notes" wide />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Additional Information */}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={TH_STYLE}>Additional Information</th>
                  <th style={TH_STYLE}>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={2} style={{ ...TD_INPUT, ...tdBorder, padding: "8px 10px" }}>
                    {canEdit ? (
                      <textarea
                        className="ms-input"
                        rows={5}
                        style={{ width: "100%", fontSize: 11, resize: "vertical" }}
                        value={phd.additional_notes}
                        onChange={e => update("additional_notes", e.target.value)}
                        placeholder="Insert notes here…"
                      />
                    ) : (
                      <span style={{ fontSize: 12, color: phd.additional_notes ? "#e2e8f0" : "#475569", whiteSpace: "pre-wrap" }}>
                        {phd.additional_notes || "—"}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

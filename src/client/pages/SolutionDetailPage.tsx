import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, type Solution, type SolutionStatus, type SolutionType, type SolutionVendor, type User, type DynamicsContact, type SolutionContact, type NeedsAssessment, type LaborEstimate } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";
import NeedsAssessmentWizard from "../components/solutioning/NeedsAssessmentWizard";
import LaborEstimateView from "../components/solutioning/LaborEstimateView";
import NeedsAssessmentSOR from "../components/solutioning/NeedsAssessmentSOR";
import ScopeOfWorkDocument from "../components/solutioning/ScopeOfWorkDocument";
import SowSizingForm, { type SowData } from "../components/solutioning/SowSizingForm";
import ProjectHandoffDocument from "../components/solutioning/ProjectHandoffDocument";
import SharePointDocs from "../components/sharepoint/SharePointDocs";
import ciSurveyJson from "../assets/ci_needs_assessment_unified_v1.json";
import ccaasSurveyJson from "../assets/ccaas_needs_assessment_unified_v1.json";
import virtualAgentSurveyJson from "../assets/virtual_agent_needs_assessment_unified_v1.json";
import ucaasSurveyJson from "../assets/ucaas_needs_assessment_unified_v1.json";
import otherJourneysSurveyJson from "../assets/other_journeys_needs_assessment_v1.json";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SolutionStatus, string> = {
  draft: "Draft",
  assessment: "Needs Assessment",
  requirements: "Requirements",
  scope: "Scope of Work",
  handoff: "Handoff Ready",
  won: "Won",
  lost: "Lost",
};

const STATUS_COLOR: Record<SolutionStatus, string> = {
  draft: "#94a3b8",
  assessment: "#0891b2",
  requirements: "#8764b8",
  scope: "#ff8c00",
  handoff: "#63c1ea",
  won: "#107c10",
  lost: "#d13438",
};

const STATUS_FLOW: SolutionStatus[] = ["draft", "assessment", "scope", "handoff"];

const TYPE_LABELS: Record<SolutionType, string> = {
  ucaas: "UCaaS",
  ccaas: "CCaaS",
  ci: "Conversation Intelligence",
  va: "AI Virtual Agent",
};

// ── Main Component ────────────────────────────────────────────────────────────

type Tab = "overview" | "assessment" | "other_discovery" | "scope" | "handoff" | "labor" | "sharepoint";

const UC_CC_PREFIXES = ["zoom_", "rc_", "agnostic_"];

function parseSolutionJourneys(solution: Solution): string[] {
  if (!solution.journeys) return [];
  try { return JSON.parse(solution.journeys); } catch { return []; }
}

function buildOtherSurvey(journeys: string[]) {
  const nonUcKeys = journeys.filter(j => !UC_CC_PREFIXES.some(p => j.startsWith(p)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = (otherJourneysSurveyJson.sections as any[]).filter((s: any) => {
    if (s.appliesTo === "all") return true;
    if (Array.isArray(s.appliesTo)) return s.appliesTo.some((k: string) => nonUcKeys.includes(k));
    return false;
  });
  return { ...otherJourneysSurveyJson, sections: filtered };
}

export default function SolutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [solution, setSolution] = useState<Solution | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [currentRole, setCurrentRole] = useState("");

  // Contacts
  const [crmContacts, setCrmContacts] = useState<DynamicsContact[]>([]);
  const [solutionContacts, setSolutionContacts] = useState<SolutionContact[]>([]);
  const [savingContact, setSavingContact] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactModalTab, setContactModalTab] = useState<"crm" | "manual">("crm");
  const [contactRole, setContactRole] = useState("");
  const [manualContact, setManualContact] = useState({ name: "", email: "", phone: "", job_title: "" });

  // Tab-local state
  const [overview, setOverview] = useState({ name: "", customer_name: "", vendor: "tbd" as SolutionVendor, solution_type: "ucaas" as SolutionType, partner_ae_user_id: "", status: "" as SolutionStatus });
  const [scope, setScope] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");

  // Needs Assessment
  const [needsAssessment, setNeedsAssessment] = useState<NeedsAssessment | null>(null);
  const [naView, setNaView] = useState<"sor" | "wizard">("sor");
  const [odView, setOdView] = useState<"sor" | "wizard">("sor");

  // Labor Estimate
  const [laborEstimate, setLaborEstimate] = useState<LaborEstimate | null>(null);

  // SOW Sizing
  const [sowData, setSowData] = useState<SowData | null>(null);

  // Inline rename
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Vendor AE modal
  const [showVendorAeModal, setShowVendorAeModal] = useState(false);
  const [vendorAeMode, setVendorAeMode] = useState<"existing" | "new">("existing");
  const [vendorAeUserId, setVendorAeUserId] = useState("");
  const [vendorAeNewName, setVendorAeNewName] = useState("");
  const [vendorAeNewEmail, setVendorAeNewEmail] = useState("");
  const [savingVendorAe, setSavingVendorAe] = useState(false);

  // Solution staff (kept for modal state only)
  const [showSolutionStaffModal, setShowSolutionStaffModal] = useState(false);
  const [addSolutionStaffUser, setAddSolutionStaffUser] = useState("");
  const [addSolutionStaffRole, setAddSolutionStaffRole] = useState("");
  const [addingSolutionStaff, setAddingSolutionStaff] = useState(false);
  const [customerTeamPhotoMap, setCustomerTeamPhotoMap] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    if (!id) return;
    setNaView("sor"); // reset on every solution load so stale wizard state doesn't carry over
    const [s, u, me] = await Promise.all([api.solution(id), api.users(), api.me()]);
    setSolution(s);
    setUsers(u);
    setCurrentRole(me.role);
    setOverview({
      name: s.name,
      customer_name: s.customer_name,
      vendor: s.vendor as SolutionVendor,
      solution_type: s.solution_type as SolutionType,
      partner_ae_user_id: s.partner_ae_user_id ?? "",
      status: s.status,
    });
    setScope(s.scope_of_work ?? "");
    setHandoffNotes(s.handoff_notes ?? "");
    try { setSowData(s.sow_data ? JSON.parse(s.sow_data) as SowData : null); } catch { setSowData(null); }

    // Load needs assessment for all solution types
    api.needsAssessment(id).then(setNeedsAssessment).catch(() => {});

    // Load labor estimate (all solution types)
    api.laborEstimate(id).then(setLaborEstimate).catch(() => {});

    // Load CRM contacts and solution contacts in parallel
    if (s.dynamics_account_id) {
      api.getDynamicsContacts(s.dynamics_account_id).then(setCrmContacts).catch(() => {});
    }
    api.solutionContacts(id).then(setSolutionContacts).catch(() => {});
    // Fetch photos for customer PF team
    const customerEmails = [s.customer_pf_ae_email, s.customer_pf_sa_email, s.customer_pf_csm_email].filter(Boolean) as string[];
    if (customerEmails.length > 0) {
      api.staffPhotos(customerEmails).then(setCustomerTeamPhotoMap).catch(() => {});
    }
  }, [id]);

  useEffect(() => {
    load().catch(() => showToast("Failed to load solution", "error")).finally(() => setLoading(false));
  }, [load]);

  async function save(patch: Parameters<typeof api.updateSolution>[1]) {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await api.updateSolution(id, patch);
      setSolution(updated);
      showToast("Saved.", "success");
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function advanceStatus() {
    if (!solution) return;
    const idx = STATUS_FLOW.indexOf(solution.status);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    await save({ status: next });
  }

  async function markLost() {
    await save({ status: "lost" });
  }

  async function handleAddSolutionStaff() {
    if (!addSolutionStaffUser || !addSolutionStaffRole || !id) return;
    setAddingSolutionStaff(true);
    try {
      await api.addSolutionStaff(id, { user_id: addSolutionStaffUser, staff_role: addSolutionStaffRole });
      setAddSolutionStaffUser("");
      setAddSolutionStaffRole("");
      setShowSolutionStaffModal(false);
      showToast("Staff member added.", "success");
    } catch {
      showToast("Failed to add staff member", "error");
    } finally {
      setAddingSolutionStaff(false);
    }
  }

  async function handleCreateProject() {
    if (!id) return;
    setCreatingProject(true);
    try {
      const project = await api.createProjectFromSolution(id);
      showToast("Project created!", "success");
      navigate(`/projects/${project.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create project", "error");
    } finally {
      setCreatingProject(false);
    }
  }

  const isClient = currentRole === "client";
  const canEdit = currentRole === "admin" || currentRole === "pm" || currentRole === "pf_ae";
  const canEditNA = canEdit || isClient;

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading…</div>;
  if (!solution) return <div style={{ color: "#d13438", padding: 32 }}>Solution not found.</div>;

  const statusIdx = STATUS_FLOW.indexOf(solution.status);
  const canAdvance = canEdit && statusIdx >= 0 && statusIdx < STATUS_FLOW.length - 1;

  const solutionJourneys = parseSolutionJourneys(solution);
  const nonUcJourneys = solutionJourneys.filter(j => !UC_CC_PREFIXES.some(p => j.startsWith(p)));
  const hasUcCc = solutionJourneys.some(j => UC_CC_PREFIXES.some(p => j.startsWith(p)))
    || ["ucaas", "ccaas", "ci", "va"].includes(solution.solution_type);
  const hasOther = nonUcJourneys.length > 0;

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview",    label: "Overview"         },
    { key: "assessment",  label: hasOther && !hasUcCc ? "Discovery" : "Needs Assessment" },
    ...(hasOther && hasUcCc ? [{ key: "other_discovery" as const, label: "Other Discovery" }] : []),
    ...(!isClient ? [{ key: "labor" as const, label: "Labor Estimate" }] : []),
    { key: "scope",       label: "Scope of Work"    },
    ...(!isClient ? [{ key: "handoff" as const, label: "Handoff" }] : []),
    ...(solution?.dynamics_account_id ? [{ key: "sharepoint" as const, label: "SharePoint" }] : []),
  ];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Back */}
      <div style={{ marginBottom: 12 }}>
        <Link to="/solutions" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>
          ← Solutions
        </Link>
      </div>

      {/* Customer Metadata Section */}
      {solution.customer_id && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid rgba(0,0,0,0.07)", marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)", background: "rgba(11,154,173,0.03)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 4 }}>Customer</div>
              <Link to={`/customers/${solution.customer_id}`} style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", textDecoration: "none" }}>
                {solution.customer_name} <span style={{ fontSize: 13, color: "#0b9aad" }}>↗</span>
              </Link>
            </div>
            {solution.customer_sharepoint_url && (
              <a href={solution.customer_sharepoint_url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#0b9aad", textDecoration: "none", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                SharePoint ↗
              </a>
            )}
          </div>
          {(solution.customer_pf_ae_name || solution.customer_pf_sa_name || solution.customer_pf_csm_name) && (
            <div style={{ padding: "14px 20px", display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { role: "Account Executive", name: solution.customer_pf_ae_name, email: solution.customer_pf_ae_email },
                { role: "Solution Architect", name: solution.customer_pf_sa_name, email: solution.customer_pf_sa_email },
                { role: "Client Success Manager", name: solution.customer_pf_csm_name, email: solution.customer_pf_csm_email },
              ].filter(m => m.name).map((m) => {
                const photo = m.email ? customerTeamPhotoMap[m.email] : null;
                const abbr = m.name!.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
                return (
                  <div key={m.role} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
                    {photo
                      ? <img src={photo} alt={m.name!} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      : <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, rgba(0,120,212,0.3), rgba(99,193,234,0.2))", border: "1px solid rgba(99,193,234,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#63c1ea" }}>{abbr}</div>
                    }
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 2 }}>{m.role}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{m.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          {renamingTitle ? (
            <input
              className="ms-input"
              autoFocus
              value={titleDraft}
              style={{ fontSize: 20, fontWeight: 700, padding: "4px 8px", marginBottom: 0 }}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={async () => {
                if (titleDraft.trim() && titleDraft.trim() !== solution.name) {
                  await save({ name: titleDraft.trim() });
                }
                setRenamingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setRenamingTitle(false);
              }}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", margin: 0 }}>{solution.name}</h1>
              {canEdit && (
                <button
                  onClick={() => { setTitleDraft(solution.name); setRenamingTitle(true); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: "2px 4px", lineHeight: 1 }}
                  title="Rename solution"
                >
                  ✏
                </button>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span className="ms-badge" style={{ background: "rgba(99,193,234,0.12)", color: "#0891b2", border: "1px solid rgba(99,193,234,0.25)" }}>
              {TYPE_LABELS[solution.solution_type]}
            </span>
            <span className="ms-badge" style={{ background: `${STATUS_COLOR[solution.status]}18`, color: STATUS_COLOR[solution.status], border: `1px solid ${STATUS_COLOR[solution.status]}40` }}>
              {STATUS_LABELS[solution.status]}
            </span>
          </div>
        </div>

        {/* Status actions */}
        {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            {canAdvance && (
              <button className="ms-btn-primary" onClick={advanceStatus} disabled={saving}>
                Advance → {STATUS_LABELS[STATUS_FLOW[statusIdx + 1]]}
              </button>
            )}
            {solution.status !== "lost" && solution.status !== "won" && (
              <button
                className="ms-btn-ghost"
                onClick={markLost}
                style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}
              >
                Mark Lost
              </button>
            )}
            {solution.status === "lost" && (
              <button
                className="ms-btn-ghost"
                onClick={() => save({ status: "draft" })}
                disabled={saving}
              >
                Reopen (move to Draft)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Status progress bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28, background: "rgba(0,0,0,0.02)", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(0,0,0,0.07)" }}>
        {STATUS_FLOW.map((s, i) => {
          const isCurrent = solution.status === s;
          const isPast = statusIdx > i;
          return (
            <div
              key={s}
              style={{
                flex: 1, padding: "8px 4px", textAlign: "center", fontSize: 11, fontWeight: 600,
                color: isCurrent ? "#fff" : isPast ? "#475569" : "#cbd5e1",
                background: isCurrent ? STATUS_COLOR[s] : isPast ? `${STATUS_COLOR[s]}30` : "transparent",
                borderRight: i < STATUS_FLOW.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none",
                letterSpacing: "0.04em", textTransform: "uppercase",
              }}
            >
              {STATUS_LABELS[s]}
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(0,0,0,0.07)", marginBottom: 28 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 18px", background: "none", border: "none", borderBottom: `2px solid ${tab === t.key ? "#63c1ea" : "transparent"}`,
              color: tab === t.key ? "#63c1ea" : "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === "overview" && (
        <div style={{ display: "grid", gap: 24 }}>
          <div className="ms-card">
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Solution Details</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label className="ms-label">
                <span>Solution Name</span>
                {canEdit ? (
                  <input className="ms-input" value={overview.name} onChange={(e) => setOverview((o) => ({ ...o, name: e.target.value }))} />
                ) : (
                  <div style={{ fontSize: 14, color: "#334155", padding: "8px 0" }}>{solution.name}</div>
                )}
              </label>
              <label className="ms-label">
                <span>Vendor</span>
                {canEdit ? (
                  <select className="ms-input" value={overview.vendor ?? "tbd"} onChange={(e) => setOverview((o) => ({ ...o, vendor: e.target.value as typeof overview.vendor }))}>
                    <option value="tbd">— Not yet assigned —</option>
                    <optgroup label="UCaaS / CCaaS">
                      <option value="zoom">Zoom</option>
                      <option value="ringcentral">RingCentral</option>
                      <option value="microsoft_teams">Microsoft Teams</option>
                      <option value="webex">Webex (Cisco)</option>
                      <option value="8x8">8x8</option>
                      <option value="dialpad">Dialpad</option>
                      <option value="vonage">Vonage / Ericsson</option>
                    </optgroup>
                    <optgroup label="Connectivity / SD-WAN">
                      <option value="att">AT&amp;T</option>
                      <option value="comcast">Comcast Business</option>
                      <option value="verizon">Verizon</option>
                      <option value="lumen">Lumen / CenturyLink</option>
                      <option value="spectrum">Spectrum Business</option>
                      <option value="cox">Cox Business</option>
                      <option value="meraki">Cisco Meraki</option>
                      <option value="fortinet_sdwan">Fortinet SD-WAN</option>
                      <option value="cato">Cato Networks</option>
                    </optgroup>
                    <optgroup label="Cyber Security">
                      <option value="crowdstrike">CrowdStrike</option>
                      <option value="palo_alto">Palo Alto Networks</option>
                      <option value="sentinelone">SentinelOne</option>
                      <option value="fortinet_sec">Fortinet Security</option>
                      <option value="cisco_sec">Cisco Security</option>
                      <option value="ms_defender">Microsoft Defender</option>
                    </optgroup>
                    <optgroup label="Backup &amp; DR">
                      <option value="veeam">Veeam</option>
                      <option value="acronis">Acronis</option>
                      <option value="datto">Datto / Kaseya</option>
                      <option value="zerto">Zerto</option>
                      <option value="commvault">Commvault</option>
                      <option value="rubrik">Rubrik</option>
                    </optgroup>
                    <optgroup label="Cloud / IaaS">
                      <option value="aws">AWS</option>
                      <option value="azure">Microsoft Azure</option>
                      <option value="gcp">Google Cloud</option>
                      <option value="oracle_cloud">Oracle Cloud</option>
                    </optgroup>
                    <optgroup label="TEM">
                      <option value="tangoe">Tangoe</option>
                      <option value="brightfin">Brightfin</option>
                      <option value="calero">Calero</option>
                      <option value="genuity">Genuity</option>
                    </optgroup>
                    <optgroup label="Mobility">
                      <option value="att_mob">AT&amp;T Mobility</option>
                      <option value="verizon_mob">Verizon Wireless</option>
                      <option value="tmobile">T-Mobile</option>
                    </optgroup>
                    <option value="other">Other</option>
                  </select>
                ) : (
                  <div style={{ fontSize: 14, color: solution.vendor === "tbd" ? "#94a3b8" : "#334155", padding: "8px 0" }}>
                    {solution.vendor === "tbd" ? "— Not yet assigned —" : solution.vendor}
                  </div>
                )}
              </label>
              <label className="ms-label">
                <span>Technology</span>
                {canEdit ? (
                  <select className="ms-input" value={overview.solution_type ?? solution.solution_type} onChange={(e) => setOverview((o) => ({ ...o, solution_type: e.target.value as typeof overview.solution_type }))}>
                    <optgroup label="UCaaS / CCaaS">
                      <option value="ucaas">UCaaS</option>
                      <option value="ccaas">CCaaS</option>
                      <option value="ci">Conversation Intelligence</option>
                      <option value="va">AI Virtual Agent</option>
                    </optgroup>
                    <optgroup label="Other Technology">
                      <option value="bdr">Backup &amp; Disaster Recovery</option>
                      <option value="connectivity">Connectivity</option>
                      <option value="colocation">Colocation</option>
                      <option value="cyber_security">Cyber Security</option>
                      <option value="daas">Desktop as a Service</option>
                      <option value="help_desk">Help Desk</option>
                      <option value="iaas">Infrastructure as a Service</option>
                      <option value="mobility">Mobility (Corporate Cellular)</option>
                      <option value="managed_services">Managed Services</option>
                      <option value="managed_cloud">Managed Public Cloud</option>
                      <option value="sdwan">SD-WAN / SASE / Aggregation</option>
                      <option value="tem">Technology Expense Management</option>
                      <option value="other">Other Technology Discovery</option>
                    </optgroup>
                  </select>
                ) : (
                  <div style={{ fontSize: 14, color: "#334155", padding: "8px 0" }}>{TYPE_LABELS[solution.solution_type] ?? solution.solution_type}</div>
                )}
              </label>
            </div>
            {canEdit && (
              <button className="ms-btn-primary" style={{ marginTop: 16 }} disabled={saving}
                onClick={() => save({ name: overview.name, vendor: overview.vendor, solution_type: overview.solution_type })}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            )}
          </div>

          {/* ── Vendor AE ── */}
          {(() => {
            const vendorLabel =
              solution.vendor === "zoom" ? "Zoom AE" :
              solution.vendor === "ringcentral" ? "RingCentral AE" :
              solution.vendor === "microsoft_teams" ? "Microsoft Teams AE" :
              solution.vendor === "webex" ? "Webex AE" :
              "Vendor AE";
            const displayName = solution.partner_ae_display_name ?? solution.partner_ae_name;
            const displayEmail = solution.partner_ae_email;
            return (
              <div className="ms-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: displayName ? 14 : 0 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{vendorLabel}</h3>
                  {canEdit && (
                    <button className="ms-btn-secondary" onClick={() => {
                      setVendorAeMode("existing");
                      setVendorAeUserId(solution.partner_ae_user_id ?? "");
                      setVendorAeNewName("");
                      setVendorAeNewEmail("");
                      setShowVendorAeModal(true);
                    }}>
                      {displayName ? "Change" : `+ Assign ${vendorLabel}`}
                    </button>
                  )}
                </div>
                {displayName ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg, rgba(11,154,173,0.2), rgba(99,193,234,0.15))", border: "1px solid rgba(99,193,234,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14, fontWeight: 700, color: "#0b9aad" }}>
                      {displayName.trim()[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{displayName}</div>
                      {displayEmail && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{displayEmail}</div>}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", marginTop: canEdit ? 0 : 4 }}>No {vendorLabel} assigned.</div>
                )}
              </div>
            );
          })()}

          {/* ── Customer Contacts ── */}
          <div className="ms-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Customer Contacts</h3>
              {canEdit && (
                <button
                  className="ms-btn-secondary"
                  onClick={() => {
                    setShowContactModal(true);
                    setContactModalTab(solution.dynamics_account_id ? "crm" : "manual");
                    setContactRole("");
                    setManualContact({ name: "", email: "", phone: "", job_title: "" });
                    if (solution.dynamics_account_id && crmContacts.length === 0) {
                      api.getDynamicsContacts(solution.dynamics_account_id).then(setCrmContacts).catch(() => {});
                    }
                  }}
                >
                  + Add Contact
                </button>
              )}
            </div>

            {solutionContacts.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No customer contacts added yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {solutionContacts.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "#f8fafc", borderRadius: 6, border: "1px solid #f1f5f9" }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(99,193,234,0.12)", border: "1px solid rgba(99,193,234,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 15, fontWeight: 700, color: "#63c1ea" }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{c.name}</span>
                        {c.contact_role && (
                          <span className="ms-badge" style={{ background: "rgba(99,193,234,0.1)", color: "#63c1ea", border: "1px solid rgba(99,193,234,0.2)", fontSize: 11 }}>
                            {c.contact_role}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                        {[c.job_title, c.email, c.phone].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        className="ms-btn-ghost"
                        style={{ fontSize: 12, color: "#d13438", borderColor: "rgba(209,52,56,0.3)", flexShrink: 0 }}
                        onClick={async () => {
                          if (!id) return;
                          await api.removeSolutionContact(id, c.id);
                          setSolutionContacts((prev) => prev.filter((x) => x.id !== c.id));
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Vendor AE Modal ── */}
      {showVendorAeModal && (() => {
        const vendorLabel =
          solution.vendor === "zoom" ? "Zoom AE" :
          solution.vendor === "ringcentral" ? "RingCentral AE" :
          solution.vendor === "microsoft_teams" ? "Microsoft Teams AE" :
          solution.vendor === "webex" ? "Webex AE" :
          "Vendor AE";
        const partnerAeUsers = users.filter((u) => u.role === "partner_ae");
        async function saveVendorAe() {
          setSavingVendorAe(true);
          try {
            if (vendorAeMode === "existing") {
              await save({ partner_ae_user_id: vendorAeUserId || null, partner_ae_name: null, partner_ae_email: null });
            } else {
              await save({ partner_ae_name: vendorAeNewName.trim() || null, partner_ae_email: vendorAeNewEmail.trim() || null, partner_ae_user_id: null });
            }
            setShowVendorAeModal(false);
          } finally {
            setSavingVendorAe(false);
          }
        }
        return (
          <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowVendorAeModal(false); }}>
            <div className="ms-modal" style={{ maxWidth: 480, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Assign {vendorLabel}</h2>
                <button onClick={() => setShowVendorAeModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
              </div>
              <div style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["existing", "new"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setVendorAeMode(mode)}
                      style={{
                        flex: 1, padding: "6px 0", fontSize: 12, borderRadius: 4, cursor: "pointer",
                        border: `1px solid ${vendorAeMode === mode ? "#63c1ea" : "rgba(0,0,0,0.1)"}`,
                        background: vendorAeMode === mode ? "rgba(99,193,234,0.1)" : "transparent",
                        color: vendorAeMode === mode ? "#63c1ea" : "#94a3b8",
                      }}
                    >
                      {mode === "existing" ? "Existing User" : "Invite New"}
                    </button>
                  ))}
                </div>
                {vendorAeMode === "existing" ? (
                  <label className="ms-label">
                    <span>{vendorLabel}</span>
                    <select className="ms-input" value={vendorAeUserId} onChange={(e) => setVendorAeUserId(e.target.value)}>
                      <option value="">— None —</option>
                      {partnerAeUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.name ?? u.email}{u.organization_name ? ` (${u.organization_name})` : ""}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    <label className="ms-label">
                      <span>Name</span>
                      <input className="ms-input" placeholder="Full name" value={vendorAeNewName} onChange={(e) => setVendorAeNewName(e.target.value)} />
                    </label>
                    <label className="ms-label">
                      <span>Email (sends invite)</span>
                      <input className="ms-input" type="email" placeholder={`ae@${solution.vendor === "zoom" ? "zoom.us" : "vendor.com"}`} value={vendorAeNewEmail} onChange={(e) => setVendorAeNewEmail(e.target.value)} />
                    </label>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
                <button
                  className="ms-btn-primary"
                  disabled={savingVendorAe || (vendorAeMode === "new" && (!vendorAeNewName.trim() || !vendorAeNewEmail.trim()))}
                  onClick={saveVendorAe}
                >
                  {savingVendorAe ? "Saving…" : vendorAeMode === "new" ? "Invite & Assign" : "Assign"}
                </button>
                <button className="ms-btn-secondary" onClick={() => setShowVendorAeModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add Staff Modal ── */}
      {showSolutionStaffModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSolutionStaffModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 480, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Add PF Team Member</h2>
              <button onClick={() => setShowSolutionStaffModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
              <label className="ms-label">
                <span>Role on Solution</span>
                <select className="ms-input" value={addSolutionStaffRole} onChange={(e) => { setAddSolutionStaffRole(e.target.value); setAddSolutionStaffUser(""); }}>
                  <option value="">— Select role —</option>
                  <option value="pf_engineer">Implementation Engineer</option>
                  <option value="pm">Project Manager</option>
                </select>
              </label>
              <label className="ms-label">
                <span>Team Member</span>
                <select className="ms-input" value={addSolutionStaffUser} onChange={(e) => setAddSolutionStaffUser(e.target.value)}>
                  <option value="">— Select team member —</option>
                  {users.filter((u) => {
                    if (addSolutionStaffRole === "pm") return u.role === "pm";
                    if (addSolutionStaffRole === "pf_engineer") return u.role === "pf_engineer";
                    if (addSolutionStaffRole === "pf_ae")  return u.role === "pf_ae";
                    if (addSolutionStaffRole === "pf_sa")  return u.role === "pf_sa";
                    if (addSolutionStaffRole === "pf_csm") return u.role === "pf_csm";
                    return u.role !== "partner_ae" && u.role !== "client";
                  }).map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <button className="ms-btn-primary" disabled={!addSolutionStaffUser || !addSolutionStaffRole || addingSolutionStaff} onClick={handleAddSolutionStaff}>
                {addingSolutionStaff ? "Adding…" : "Add Team Member"}
              </button>
              <button className="ms-btn-secondary" onClick={() => setShowSolutionStaffModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contact Modal ── */}
      {showContactModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowContactModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 580, display: "flex", flexDirection: "column", maxHeight: "85vh" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Add Customer Contact</h2>
              <button onClick={() => setShowContactModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>

            <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
              <label className="ms-label">
                <span>Role on Project</span>
                <select className="ms-input" value={contactRole} onChange={(e) => setContactRole(e.target.value)}>
                  <option value="">— Select role —</option>
                  <option>Customer Project Manager</option>
                  <option>Technical Contact</option>
                  <option>Executive Sponsor</option>
                  <option>Billing Contact</option>
                  <option>End User Champion</option>
                  <option>Other</option>
                </select>
              </label>
            </div>

            {solution.dynamics_account_id && (
              <div style={{ display: "flex", gap: 0, padding: "12px 24px 0", flexShrink: 0 }}>
                {(["crm", "manual"] as const).map((t) => (
                  <button key={t} onClick={() => setContactModalTab(t)} style={{ flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", background: "none", border: "none", borderBottom: `2px solid ${contactModalTab === t ? "#63c1ea" : "transparent"}`, color: contactModalTab === t ? "#63c1ea" : "#94a3b8", marginBottom: -1 }}>
                    {t === "crm" ? "From CRM" : "Enter Manually"}
                  </button>
                ))}
              </div>
            )}

            <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
              {contactModalTab === "crm" && (
                <div style={{ display: "grid", gap: 6 }}>
                  {crmContacts.filter((c) => !solutionContacts.some((s) => s.dynamics_contact_id === c.contactid)).map((c) => {
                    const fullName = [c.firstname, c.lastname].filter(Boolean).join(" ");
                    return (
                      <div key={c.contactid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 6 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{fullName || "—"}</div>
                          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{[c.jobtitle, c.emailaddress1, c.telephone1].filter(Boolean).join(" · ")}</div>
                        </div>
                        <button className="ms-btn-secondary" style={{ fontSize: 12, flexShrink: 0 }} disabled={savingContact || !contactRole} title={!contactRole ? "Select a role first" : ""}
                          onClick={async () => {
                            if (!id) return;
                            setSavingContact(true);
                            try {
                              const added = await api.addSolutionContact(id, { dynamics_contact_id: c.contactid, name: fullName || "Unknown", email: c.emailaddress1, phone: c.telephone1, job_title: c.jobtitle, contact_role: contactRole || null });
                              setSolutionContacts((prev) => [...prev, added]);
                              setContactRole("");
                            } catch { showToast("Failed to add contact", "error"); }
                            finally { setSavingContact(false); }
                          }}>
                          + Add
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {(!solution.dynamics_account_id || contactModalTab === "manual") && (
                <div style={{ display: "grid", gap: 14 }}>
                  <label className="ms-label"><span>Name *</span><input className="ms-input" placeholder="Full name" value={manualContact.name} onChange={(e) => setManualContact((m) => ({ ...m, name: e.target.value }))} /></label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label className="ms-label"><span>Email</span><input className="ms-input" type="email" value={manualContact.email} onChange={(e) => setManualContact((m) => ({ ...m, email: e.target.value }))} /></label>
                    <label className="ms-label"><span>Phone</span><input className="ms-input" value={manualContact.phone} onChange={(e) => setManualContact((m) => ({ ...m, phone: e.target.value }))} /></label>
                  </div>
                  <label className="ms-label"><span>Job Title</span><input className="ms-input" value={manualContact.job_title} onChange={(e) => setManualContact((m) => ({ ...m, job_title: e.target.value }))} /></label>
                </div>
              )}
            </div>

            {(!solution.dynamics_account_id || contactModalTab === "manual") && (
              <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
                <button className="ms-btn-primary" disabled={savingContact || !manualContact.name.trim() || !contactRole}
                  onClick={async () => {
                    if (!id) return;
                    setSavingContact(true);
                    try {
                      const added = await api.addSolutionContact(id, { name: manualContact.name.trim(), email: manualContact.email || null, phone: manualContact.phone || null, job_title: manualContact.job_title || null, contact_role: contactRole || null });
                      setSolutionContacts((prev) => [...prev, added]);
                      setManualContact({ name: "", email: "", phone: "", job_title: "" });
                      setContactRole("");
                    } catch { showToast("Failed to add contact", "error"); }
                    finally { setSavingContact(false); }
                  }}>
                  {savingContact ? "Adding…" : "Add Contact"}
                </button>
                <button className="ms-btn-secondary" onClick={() => setShowContactModal(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Assessment Tab ── */}
      {tab === "assessment" && (
        <div>
          {(() => {
            // Non-UC/CC only → show other journeys survey
            if (hasOther && !hasUcCc) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const surveyJson = buildOtherSurvey(solutionJourneys) as any;
              const initialAnswers = {
                ...(needsAssessment?.answers as Record<string, unknown> | undefined ?? {}),
                doc_sharepoint_ref: solution.customer_sharepoint_url ?? "",
              };
              return (odView === "wizard" || needsAssessment === null) && odView !== "sor" ? (
                <NeedsAssessmentWizard
                  key={needsAssessment?.id ?? "new-other"}
                  solutionId={solution.id}
                  customerName={solution.customer_name}
                  surveyJson={surveyJson}
                  initialAnswers={initialAnswers}
                  onComplete={(na) => { setNeedsAssessment(na); setOdView("sor"); }}
                  onCancel={() => setOdView("sor")}
                />
              ) : needsAssessment !== null && odView === "sor" ? (
                <NeedsAssessmentSOR
                  assessment={needsAssessment}
                  customerName={solution.customer_name}
                  solutionType={solution.name}
                  surveyJson={surveyJson}
                  onBack={canEditNA ? () => setOdView("wizard") : () => {}}
                  canDelete={!isClient}
                  onDelete={async () => {
                    try {
                      await api.deleteNeedsAssessment(solution.id);
                      setNeedsAssessment(null);
                      setOdView("sor");
                    } catch {
                      showToast("Failed to delete assessment", "error");
                    }
                  }}
                />
              ) : (
                <div className="ms-card" style={{ textAlign: "center", padding: 40 }}>
                  <p style={{ fontSize: 15, color: "#475569", marginBottom: 20 }}>
                    No discovery has been completed for this solution yet.
                  </p>
                  {canEditNA && (
                    <button className="ms-btn-primary" onClick={() => setOdView("wizard")}>
                      Start Discovery
                    </button>
                  )}
                </div>
              );
            }

            // UC/CC (or legacy) → existing survey
            const surveyJson =
              solution.solution_type === "ccaas" ? ccaasSurveyJson :
              solution.solution_type === "va" ? virtualAgentSurveyJson :
              solution.solution_type === "ucaas" ? ucaasSurveyJson :
              ciSurveyJson;
            const solutionTypeLabel = TYPE_LABELS[solution.solution_type as keyof typeof TYPE_LABELS] ?? solution.solution_type;
            return (naView === "wizard" || needsAssessment === null) && naView !== "sor" ? (
              <NeedsAssessmentWizard
                key={needsAssessment?.id ?? "new"}
                solutionId={solution.id}
                customerName={solution.customer_name}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                surveyJson={surveyJson as any}
                initialAnswers={needsAssessment?.answers as Record<string, unknown> | undefined}
                onComplete={(na) => { setNeedsAssessment(na); setNaView("sor"); }}
                onCancel={() => setNaView("sor")}
              />
            ) : needsAssessment !== null && naView === "sor" ? (
              <NeedsAssessmentSOR
                assessment={needsAssessment}
                customerName={solution.customer_name}
                solutionType={solutionTypeLabel}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                surveyJson={surveyJson as any}
                onBack={canEditNA ? () => setNaView("wizard") : () => {}}
                canDelete={!isClient}
                onDelete={async () => {
                  try {
                    await api.deleteNeedsAssessment(solution.id);
                    setNeedsAssessment(null);
                    setNaView("sor");
                  } catch {
                    showToast("Failed to delete assessment", "error");
                  }
                }}
              />
            ) : (
              <div className="ms-card" style={{ textAlign: "center", padding: 40 }}>
                <p style={{ fontSize: 15, color: "#475569", marginBottom: 20 }}>
                  No needs assessment has been completed for this solution yet.
                </p>
                {canEditNA && (
                  <button className="ms-btn-primary" onClick={() => setNaView("wizard")}>
                    Start Needs Assessment
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Other Discovery Tab (mixed UC/CC + other journeys) ── */}
      {tab === "other_discovery" && (
        <div>
          {(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const surveyJson = buildOtherSurvey(solutionJourneys) as any;
            const initialAnswers = {
              ...(needsAssessment?.answers as Record<string, unknown> | undefined ?? {}),
              doc_sharepoint_ref: solution.customer_sharepoint_url ?? "",
            };
            return (odView === "wizard" || needsAssessment === null) && odView !== "sor" ? (
              <NeedsAssessmentWizard
                key={(needsAssessment?.id ?? "new-other") + "-od"}
                solutionId={solution.id}
                customerName={solution.customer_name}
                surveyJson={surveyJson}
                initialAnswers={initialAnswers}
                onComplete={(na) => { setNeedsAssessment(na); setOdView("sor"); }}
                onCancel={() => setOdView("sor")}
              />
            ) : needsAssessment !== null && odView === "sor" ? (
              <NeedsAssessmentSOR
                assessment={needsAssessment}
                customerName={solution.customer_name}
                solutionType={solution.name}
                surveyJson={surveyJson}
                onBack={canEditNA ? () => setOdView("wizard") : () => {}}
                canDelete={false}
              />
            ) : (
              <div className="ms-card" style={{ textAlign: "center", padding: 40 }}>
                <p style={{ fontSize: 15, color: "#475569", marginBottom: 20 }}>
                  No other technology discovery has been completed yet.
                </p>
                {canEditNA && (
                  <button className="ms-btn-primary" onClick={() => setOdView("wizard")}>
                    Start Other Discovery
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Scope Tab ── */}
      {/* Always mounted (display:none when inactive) so unsaved sizing data isn't lost on tab switch */}
      <div style={{ display: tab === "scope" ? "grid" : "none", gap: 20 }}>
          {/* Sizing confirmation form */}
          <SowSizingForm
            solution={solution}
            needsAssessment={needsAssessment}
            canEdit={canEdit}
            onSaved={(saved) => {
              setSowData(saved);
              setSolution(prev => prev ? { ...prev, sow_data: JSON.stringify(saved) } : prev);
            }}
          />

          {/* SOW document generator */}
          <ScopeOfWorkDocument
            solution={solution}
            needsAssessment={needsAssessment}
            laborEstimate={laborEstimate}
            scopeText={scope}
            sowData={sowData}
          />

          {/* Scope notes textarea — feeds into the generated document */}
          <div className="ms-card">
            <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Additional Scope Notes
            </h3>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px" }}>
              Any additional context, exclusions, or special terms. This text is included in the generated SOW document.
            </p>
            <textarea
              className="ms-input"
              rows={8}
              style={{ resize: "vertical", fontFamily: "monospace", fontSize: 13, lineHeight: 1.6 }}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="Out of scope items, special terms, exclusions…"
              disabled={!canEdit}
            />
            {canEdit && (
              <button className="ms-btn-primary" disabled={saving} style={{ marginTop: 12 }} onClick={() => save({ scope_of_work: scope })}>
                {saving ? "Saving…" : "Save Notes"}
              </button>
            )}
          </div>
        </div>

      {/* ── Handoff Tab ── */}
      {tab === "handoff" && (
        <div style={{ display: "grid", gap: 20 }}>

          {/* Project Handoff Document */}
          <ProjectHandoffDocument
            solution={solution}
            needsAssessment={needsAssessment}
            laborEstimate={laborEstimate}
            solutionContacts={solutionContacts}
            canEdit={canEdit}
            onSaved={load}
          />

          {/* Internal Notes (implementation team only) */}
          <div className="ms-card">
            <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Internal Handoff Notes</h3>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px" }}>
              Internal context and special instructions for the project team — not included in the handoff document.
            </p>
            <textarea
              className="ms-input"
              rows={5}
              style={{ resize: "vertical", lineHeight: 1.6 }}
              value={handoffNotes}
              onChange={(e) => setHandoffNotes(e.target.value)}
              placeholder="Notes for the implementation team…"
              disabled={!canEdit}
            />
            {canEdit && (
              <button className="ms-btn-primary" disabled={saving} style={{ marginTop: 12 }} onClick={() => save({ handoff_notes: handoffNotes })}>
                {saving ? "Saving…" : "Save Notes"}
              </button>
            )}
          </div>

          {(currentRole === "admin" || currentRole === "pm") && (
            <div className="ms-card" style={{ border: "1px solid rgba(99,193,234,0.25)", background: "rgba(99,193,234,0.04)" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#63c1ea", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Create Project
              </h3>
              <p style={{ fontSize: 13, color: "rgba(240,246,255,0.55)", margin: "0 0 16px" }}>
                Create a new implementation project from this solution. It will be pre-populated with the solution data and the partner AE will automatically receive access.
              </p>
              <button
                className="ms-btn-primary"
                disabled={creatingProject}
                onClick={handleCreateProject}
                style={{ background: "#63c1ea", borderColor: "#63c1ea", color: "#021a2e" }}
              >
                {creatingProject ? "Creating Project…" : "Create Implementation Project →"}
              </button>
            </div>
          )}
        </div>
      )}


      {/* ── Labor Estimate Tab ── */}
      {tab === "labor" && (
        <LaborEstimateView
          solutionId={solution.id}
          estimate={laborEstimate}
          hasAssessment={needsAssessment !== null}
          canEdit={canEdit}
          onEstimateChange={setLaborEstimate}
        />
      )}

      {/* ── SharePoint Tab ── */}
      {tab === "sharepoint" && solution.dynamics_account_id && (
        <SharePointDocs recordId={solution.dynamics_account_id} />
      )}

    </div>
  );
}

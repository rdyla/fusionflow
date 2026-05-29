import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api, type Solution, type SolutionStatus, type User, type CrmAccountTeam,
  type DynamicsOpportunity, type DynamicsUser,
} from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";
import { useDemoMode } from "../lib/demoMode";

// ── Journey data ──────────────────────────────────────────────────────────────

const JOURNEY_LABELS: Record<string, string> = {
  zoom_ucaas: "UCaaS", zoom_ccaas: "CCaaS", zoom_rooms: "Zoom Rooms",
  zoom_zva: "ZVA", zoom_zra: "ZRA", zoom_qm: "QM", zoom_wfm: "WFM",
  zoom_ai_expert_assist: "AI Expert Assist", zoom_workvivo: "Workvivo",
  zoom_integrations: "Integrations / API",
  rc_ucaas: "UCaaS", rc_ccaas: "CCaaS", rc_air: "AIR", rc_ava: "AVA", rc_ace: "ACE",
  agnostic_ucaas: "UCaaS", agnostic_ccaas: "CCaaS",
  bdr: "Backup & Disaster Recovery", connectivity: "Connectivity",
  colocation: "Colocation", cyber_security: "Cyber Security",
  daas: "Desktop as a Service", help_desk: "Help Desk",
  iaas: "Infrastructure as a Service", mobility: "Mobility (Corporate Cellular)",
  managed_services: "Managed Services", managed_cloud: "Managed Public Cloud",
  sdwan: "SD-WAN / SASE / Aggregation", tem: "Technology Expense Management (TEM)",
  other: "Other Technology Discovery",
};

// Maps each journey key to a filter category value
const JOURNEY_FILTER_CATEGORY: Record<string, string> = {
  zoom_ucaas: "ucaas_ccaas", zoom_ccaas: "ucaas_ccaas", zoom_rooms: "ucaas_ccaas",
  zoom_workvivo: "ucaas_ccaas", zoom_integrations: "ucaas_ccaas",
  zoom_zra: "ci", zoom_qm: "ci", zoom_wfm: "ci", zoom_ai_expert_assist: "ci",
  zoom_zva: "va",
  rc_ucaas: "ucaas_ccaas", rc_ccaas: "ucaas_ccaas",
  rc_ace: "ci", rc_ava: "ci",
  rc_air: "va",
  agnostic_ucaas: "ucaas_ccaas", agnostic_ccaas: "ucaas_ccaas",
  bdr: "bdr", connectivity: "connectivity", colocation: "colocation",
  cyber_security: "cyber_security", daas: "daas", help_desk: "help_desk",
  iaas: "iaas", mobility: "mobility", managed_services: "managed_services",
  managed_cloud: "managed_cloud", sdwan: "sdwan", tem: "tem", other: "other",
};

const FILTER_CATEGORIES = [
  { value: "all", label: "All Technology Types" },
  { value: "ucaas_ccaas", label: "UCaaS / CCaaS" },
  { value: "ci", label: "Conversation Intelligence" },
  { value: "va", label: "AI Virtual Agent" },
  { value: "bdr", label: "Backup & Disaster Recovery" },
  { value: "connectivity", label: "Connectivity" },
  { value: "colocation", label: "Colocation" },
  { value: "cyber_security", label: "Cyber Security" },
  { value: "daas", label: "Desktop as a Service" },
  { value: "help_desk", label: "Help Desk" },
  { value: "iaas", label: "Infrastructure as a Service" },
  { value: "mobility", label: "Mobility" },
  { value: "managed_services", label: "Managed Services" },
  { value: "managed_cloud", label: "Managed Public Cloud" },
  { value: "sdwan", label: "SD-WAN / SASE / Aggregation" },
  { value: "tem", label: "Technology Expense Management" },
  { value: "other", label: "Other Technology" },
];

// UCaaS/CCaaS vendor sub-types
const VENDOR_JOURNEYS: Record<string, string[]> = {
  zoom: ["zoom_ucaas", "zoom_ccaas", "zoom_rooms", "zoom_zva", "zoom_zra", "zoom_qm", "zoom_wfm", "zoom_ai_expert_assist", "zoom_workvivo", "zoom_integrations"],
  ringcentral: ["rc_ucaas", "rc_ccaas", "rc_air", "rc_ava", "rc_ace"],
  agnostic: ["agnostic_ucaas", "agnostic_ccaas"],
};

const STANDALONE_JOURNEYS = [
  "bdr", "connectivity", "colocation", "cyber_security", "daas",
  "help_desk", "iaas", "mobility", "managed_services", "managed_cloud",
  "sdwan", "tem", "other",
];

function parseJourneys(s: Solution): string[] {
  if (!s.journeys) return [];
  try { return JSON.parse(s.journeys); } catch { return []; }
}

function journeyFilterMatch(s: Solution, category: string): boolean {
  if (category === "all") return true;
  const journeys = parseJourneys(s);
  if (journeys.length > 0) {
    return journeys.some(j => (JOURNEY_FILTER_CATEGORY[j] ?? j) === category);
  }
  // Fallback for solutions without journeys — test every selected solution type against the category.
  const legacyMap: Record<string, string> = { ucaas: "ucaas_ccaas", ccaas: "ucaas_ccaas", ci: "ci", va: "va" };
  return s.solution_types.some((t) => (legacyMap[t] ?? t) === category);
}

function journeyBadgeText(s: Solution): string {
  const journeys = parseJourneys(s);
  if (!journeys.length) {
    const fallback: Record<string, string> = { ucaas: "UCaaS", ccaas: "CCaaS", ci: "Conversation Intelligence", va: "AI Virtual Agent", wfm: "Workforce Management", qm: "Quality Management" };
    const labels = s.solution_types.map((t) => fallback[t] ?? t);
    return labels.length ? labels.join(" · ") : "";
  }
  const labels = journeys.slice(0, 3).map(j => JOURNEY_LABELS[j] ?? j);
  return labels.join(" · ") + (journeys.length > 3 ? ` +${journeys.length - 3}` : "");
}

// ── Status data ───────────────────────────────────────────────────────────────

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

const EMPTY_FORM = {
  customer_name: "",
  dynamics_account_id: "",
  crm_opportunity_id: "",
  journeys: [] as string[],
  ucaas_vendor: "" as "" | "zoom" | "ringcentral" | "agnostic",
  pf_ae_user_id: "",
  pf_sa_user_id: "",
  pf_csm_user_id: "",
  partner_ae_user_id: "",
  partner_ae_name: "",
  partner_ae_email: "",
  partner_ae_mode: "existing" as "existing" | "new",
};

export default function SolutionsPage() {
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [crmSearch, setCrmSearch] = useState("");
  const [crmResults, setCrmResults] = useState<{ id: string; name: string }[]>([]);
  const [crmSearching, setCrmSearching] = useState(false);
  const [crmTeam, setCrmTeam] = useState<CrmAccountTeam | null>(null);
  const [crmTeamLoading, setCrmTeamLoading] = useState(false);
  // Open opportunities (statecode=0) for the selected account. Loaded lazily
  // when an account is picked; cleared when the user re-edits the customer
  // field. Empty list after a load means D365 returned no matches and the
  // user needs the "Create new opportunity" affordance (added in PR 3).
  const [opportunities, setOpportunities] = useState<DynamicsOpportunity[]>([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false);
  // "+ Create new account in CRM" inline form. Used when the SA can't find
  // an existing account in D365 — they fill name + email (+ optional site)
  // and we POST to D365, then immediately bind the returned account into
  // the picker so the rest of the New Solution flow proceeds normally.
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState({ name: "", emailaddress1: "", websiteurl: "", owner_systemuserid: "" });
  // D365-sourced AE list for the create-account owner dropdown. Loaded the
  // first time the SA opens the inline form and cached after that — the
  // list rarely changes within a session and re-fetching on every reopen
  // would add a noticeable delay to a flow that's already CRM-bound.
  const [dynamicsAes, setDynamicsAes] = useState<DynamicsUser[]>([]);
  const [dynamicsAesLoading, setDynamicsAesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { demoVendor } = useDemoMode();

  useEffect(() => {
    api.me().then((me) => setCurrentRole(me.role)).catch(() => {});
    Promise.all([api.solutions(), api.users()])
      .then(([s, u]) => {
        setSolutions(s);
        setUsers(u);
      })
      .catch(() => showToast("Failed to load data", "error"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCrmSearch(q: string) {
    setCrmSearch(q);
    if (q.length < 2) { setCrmResults([]); return; }
    setCrmSearching(true);
    try {
      const results = await api.searchDynamicsAccounts(q);
      setCrmResults(results.map((r) => ({ id: r.accountid, name: r.name })));
    } catch {
      setCrmResults([]);
    } finally {
      setCrmSearching(false);
    }
  }

  function selectCrmAccount(account: { id: string; name: string }) {
    // Reset crm_opportunity_id on every account pick — last-selected opp from
    // a different account has nothing to do with the new account's pipeline.
    setForm((f) => ({ ...f, customer_name: account.name, dynamics_account_id: account.id, crm_opportunity_id: "" }));
    setCrmSearch(account.name);
    setCrmResults([]);
    setCrmTeam(null);
    setCrmTeamLoading(true);
    setOpportunities([]);
    setOpportunitiesLoading(true);
    api.optimizeCrmAccountTeam(account.id)
      .then((team) => {
        setCrmTeam(team);
        setForm((f) => ({
          ...f,
          pf_ae_user_id: team.ae_user_id ?? "",
          pf_sa_user_id: team.sa_user_id ?? "",
          pf_csm_user_id: team.csm_user_id ?? "",
        }));
      })
      .catch(() => setCrmTeam(null))
      .finally(() => setCrmTeamLoading(false));
    api.getDynamicsOpportunities(account.id, "open_or_won")
      .then(setOpportunities)
      .catch(() => setOpportunities([]))
      .finally(() => setOpportunitiesLoading(false));
  }

  // Open the inline "Create new account" form. We seed the name from
  // whatever the SA was searching for so they don't have to retype it,
  // and kick off a one-time fetch of the D365 AE list for the owner picker.
  function openCreateAccountForm() {
    setNewAccountForm({ name: crmSearch.trim(), emailaddress1: "", websiteurl: "", owner_systemuserid: "" });
    setShowCreateAccount(true);
    setCrmResults([]);
    if (dynamicsAes.length === 0 && !dynamicsAesLoading) {
      setDynamicsAesLoading(true);
      api.getDynamicsAEs()
        .then(setDynamicsAes)
        .catch(() => setDynamicsAes([]))
        .finally(() => setDynamicsAesLoading(false));
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccountForm.name.trim() || !newAccountForm.emailaddress1.trim()) return;
    if (!newAccountForm.owner_systemuserid) {
      showToast("Pick the PF AE who will own this account.", "error");
      return;
    }
    // Auto-prepend https:// when the SA enters a bare hostname so the URL
    // lands in D365 as a clickable link. We only touch the value if it's
    // non-empty AND missing a scheme — leaves `http://` and `https://`
    // inputs untouched.
    const rawWebsite = newAccountForm.websiteurl.trim();
    const websiteurl = rawWebsite && !/^https?:\/\//i.test(rawWebsite)
      ? `https://${rawWebsite}`
      : rawWebsite;
    setCreatingAccount(true);
    try {
      const created = await api.createDynamicsAccount({
        name: newAccountForm.name.trim(),
        emailaddress1: newAccountForm.emailaddress1.trim(),
        websiteurl: websiteurl || undefined,
        owner_systemuserid: newAccountForm.owner_systemuserid,
      });
      // Drop the new account straight into the picker as if it had been
      // selected from search — kicks off the same team + opportunities
      // fetches so the SA continues with the normal flow.
      selectCrmAccount({ id: created.accountid, name: created.name });
      setShowCreateAccount(false);
      setNewAccountForm({ name: "", emailaddress1: "", websiteurl: "", owner_systemuserid: "" });
      showToast(`Created ${created.name} in CRM.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create account in CRM", "error");
    } finally {
      setCreatingAccount(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_name.trim()) return;
    if (!form.dynamics_account_id) { showToast("Pick a CRM account.", "error"); return; }
    if (!form.crm_opportunity_id) { showToast("Pick an opportunity from CRM.", "error"); return; }
    if (!form.journeys.length) { showToast("Select at least one journey.", "error"); return; }
    setSaving(true);
    try {
      const payload: Parameters<typeof api.createSolution>[0] = {
        customer_name: form.customer_name.trim(),
        dynamics_account_id: form.dynamics_account_id,
        crm_opportunity_id: form.crm_opportunity_id,
        journeys: form.journeys,
      };
      if (form.pf_ae_user_id) payload.pf_ae_user_id = form.pf_ae_user_id;
      if (form.pf_sa_user_id) payload.pf_sa_user_id = form.pf_sa_user_id;
      if (form.pf_csm_user_id) payload.pf_csm_user_id = form.pf_csm_user_id;
      if (form.partner_ae_mode === "existing" && form.partner_ae_user_id) {
        payload.partner_ae_user_id = form.partner_ae_user_id;
      } else if (form.partner_ae_mode === "new" && form.partner_ae_email) {
        payload.partner_ae_name = form.partner_ae_name;
        payload.partner_ae_email = form.partner_ae_email;
      }

      const created = await api.createSolution(payload);
      setSolutions((prev) => [created, ...prev]);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setCrmSearch("");
      setCrmResults([]);
      showToast("Solution created.", "success");
      navigate(`/solutions/${created.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create solution", "error");
    } finally {
      setSaving(false);
    }
  }

  const pfAes = users.filter((u) => u.role === "pf_ae");
  const pfSas = users.filter((u) => u.role === "pf_sa");
  const pfCsms = users.filter((u) => u.role === "pf_csm");
  const partnerAes = users.filter((u) => u.role === "partner_ae");

  const filtered = solutions.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (!journeyFilterMatch(s, typeFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const journeyText = parseJourneys(s).map(j => JOURNEY_LABELS[j] ?? j).join(" ").toLowerCase();
      if (!s.customer_name.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q) && !journeyText.includes(q)) return false;
    }
    return true;
  });

  function fmt(d: string) {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T00:00:00" : d;
    return new Date(normalized).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Solutions</h1>
          {currentRole !== "client" && (
            <div style={{ display: "flex", gap: 0, marginTop: 8, borderBottom: "1px solid #e2e8f0" }}>
              <span style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, color: "#03395f", borderBottom: "2px solid #03395f", cursor: "default" }}>
                Implementation
              </span>
              <button
                type="button"
                onClick={() => navigate("/solutions/cloudsupport")}
                style={{ padding: "8px 18px", fontSize: 13, fontWeight: 400, color: "#64748b", background: "none", border: "none", borderBottom: "2px solid transparent", cursor: "pointer" }}
              >
                Cloud Support
              </button>
            </div>
          )}
        </div>
        {currentRole !== "client" && (
          <button className="ms-btn-primary" onClick={() => {
            setForm({ ...EMPTY_FORM, ucaas_vendor: demoVendor ?? "" });
            setShowCreate(true);
          }}>+ New Solution</button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          className="ms-input"
          placeholder="Search customer or solution…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
        <select className="ms-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 180 }}>
          <option value="all">All Statuses</option>
          {(Object.keys(STATUS_LABELS) as SolutionStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select className="ms-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 220 }}>
          {FILTER_CATEGORIES.map((fc) => (
            <option key={fc.value} value={fc.value}>{fc.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="ms-card" style={{ overflow: "hidden" }}>
        <table className="ms-table">
          <thead>
            <tr>
              <th>Customer / Solution</th>
              <th>Technology</th>
              <th>Stage</th>
              <th>PF AE</th>
              <th>Partner AE</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "#94a3b8", padding: "28px 16px" }}>
                  {solutions.length === 0 ? "No solutions yet — create one to get started." : "No solutions match your filters."}
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/solutions/${s.id}`)}
                >
                  <td>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>{s.customer_name}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{s.name}</div>
                  </td>
                  <td>
                    <span className="ms-badge" style={{ background: "rgba(99,193,234,0.12)", color: "#0891b2", border: "1px solid rgba(99,193,234,0.25)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", textTransform: "none" }}>
                      {journeyBadgeText(s)}
                    </span>
                  </td>
                  <td>
                    <span className="ms-badge" style={{ background: `${STATUS_COLOR[s.status]}1a`, color: STATUS_COLOR[s.status], border: `1px solid ${STATUS_COLOR[s.status]}40`, textTransform: "none" }}>
                      {STATUS_LABELS[s.status]}
                    </span>
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>
                    {s.customer_pf_ae_name ?? <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>
                    {s.partner_ae_display_name ?? s.partner_ae_name ?? <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ color: "#94a3b8", fontSize: 12 }}>{fmt(s.updated_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setForm(EMPTY_FORM); setCrmSearch(""); setCrmResults([]); setCrmTeam(null); setOpportunities([]); setShowCreateAccount(false); setNewAccountForm({ name: "", emailaddress1: "", websiteurl: "", owner_systemuserid: "" }); } }}>
          <div className="ms-modal" style={{ maxWidth: 680 }}>
            <h2>New Solution</h2>
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 16, marginTop: 16 }}>

              {/* ── Customer (CRM-bound) ── */}
              {/* Customer field is on top because PR 2 will add a "Create new account"
                  affordance here — if the SA can't find the account they often need
                  to start the create flow before anything else gets filled in. */}
              <label className="ms-label">
                <span>Customer *</span>
                <div style={{ position: "relative" }}>
                  <input
                    autoFocus
                    className="ms-input"
                    placeholder="Search CRM…"
                    value={crmSearch || form.customer_name}
                    onChange={(e) => {
                      setCrmSearch(e.target.value);
                      // Editing the customer field invalidates the current CRM
                      // bindings (account, opportunity, team) — clear them all
                      // so the SA can't accidentally submit with stale ids
                      // attached to a different customer's name.
                      setForm((f) => ({ ...f, customer_name: e.target.value, dynamics_account_id: "", crm_opportunity_id: "" }));
                      setOpportunities([]);
                      setCrmTeam(null);
                      handleCrmSearch(e.target.value);
                    }}
                    required
                  />
                  {(crmSearching || crmResults.length > 0) && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "#1a2f4a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, maxHeight: 180, overflowY: "auto", marginTop: 2 }}>
                      {crmSearching && <div style={{ padding: "10px 14px", color: "#94a3b8", fontSize: 13 }}>Searching…</div>}
                      {crmResults.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 13, cursor: "pointer" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(99,193,234,0.1)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                          onClick={() => selectCrmAccount(r)}
                        >
                          {r.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {form.dynamics_account_id && (
                  <div style={{ fontSize: 11, color: "#63c1ea", marginTop: 4 }}>✓ Linked to CRM</div>
                )}
                {/* "Create new account" affordance — only when no account is
                    bound yet AND the inline form isn't already showing. We
                    hide it once a customer is picked so the UI doesn't tempt
                    the SA into creating a duplicate. */}
                {!form.dynamics_account_id && !showCreateAccount && (
                  <button
                    type="button"
                    onClick={openCreateAccountForm}
                    style={{ marginTop: 6, background: "none", border: "none", color: "#63c1ea", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, alignSelf: "flex-start" }}
                  >
                    + Can't find them? Create a new account in CRM
                  </button>
                )}
              </label>

              {/* ── Inline "Create new account in CRM" form ── */}
              {showCreateAccount && (
                <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid rgba(99,193,234,0.3)", display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#0b9aad" }}>Create new account in CRM</div>
                  <label className="ms-label">
                    <span>Account name *</span>
                    <input
                      className="ms-input"
                      placeholder="e.g. Acme Health Systems"
                      value={newAccountForm.name}
                      onChange={(e) => setNewAccountForm((f) => ({ ...f, name: e.target.value }))}
                      disabled={creatingAccount}
                    />
                  </label>
                  <label className="ms-label">
                    <span>Primary contact email *</span>
                    <input
                      className="ms-input"
                      type="email"
                      placeholder="contact@acmehealth.com"
                      value={newAccountForm.emailaddress1}
                      onChange={(e) => setNewAccountForm((f) => ({ ...f, emailaddress1: e.target.value }))}
                      disabled={creatingAccount}
                    />
                  </label>
                  <label className="ms-label">
                    <span>Website</span>
                    <input
                      className="ms-input"
                      // type="text" not "url" — the browser's url validator
                      // is over-aggressive about scheme; we auto-prepend
                      // https:// on submit and let bare hostnames through.
                      type="text"
                      placeholder="acmehealth.com"
                      value={newAccountForm.websiteurl}
                      onChange={(e) => setNewAccountForm((f) => ({ ...f, websiteurl: e.target.value }))}
                      disabled={creatingAccount}
                    />
                  </label>
                  <label className="ms-label">
                    <span>Owner (PF AE) *</span>
                    {dynamicsAesLoading ? (
                      <div style={{ fontSize: 12, color: "#64748b", padding: "8px 0" }}>Loading AEs…</div>
                    ) : (
                      <select
                        className="ms-input"
                        value={newAccountForm.owner_systemuserid}
                        onChange={(e) => setNewAccountForm((f) => ({ ...f, owner_systemuserid: e.target.value }))}
                        disabled={creatingAccount}
                      >
                        <option value="">— Select AE —</option>
                        {dynamicsAes.map((u) => {
                          const fullName = [u.firstname, u.lastname].filter(Boolean).join(" ") || u.internalemailaddress || "(unnamed AE)";
                          return (
                            <option key={u.systemuserid} value={u.systemuserid}>{fullName}</option>
                          );
                        })}
                      </select>
                    )}
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="ms-btn-primary"
                      onClick={handleCreateAccount}
                      disabled={creatingAccount || !newAccountForm.name.trim() || !newAccountForm.emailaddress1.trim() || !newAccountForm.owner_systemuserid}
                    >
                      {creatingAccount ? "Creating…" : "Create account"}
                    </button>
                    <button
                      type="button"
                      className="ms-btn-ghost"
                      onClick={() => { setShowCreateAccount(false); setNewAccountForm({ name: "", emailaddress1: "", websiteurl: "", owner_systemuserid: "" }); }}
                      disabled={creatingAccount}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* ── Opportunity (scoped to the picked account) ── */}
              {/* Only meaningful once an account is bound. D365 statecode=0
                  (Open) only — won/lost opps have nowhere to attach new
                  pre-sales work. PR 3 will add a "Create new opportunity"
                  affordance here for accounts with no open opportunities. */}
              {form.dynamics_account_id && (
                <label className="ms-label">
                  <span>Opportunity *</span>
                  {opportunitiesLoading ? (
                    <div style={{ fontSize: 12, color: "#64748b", padding: "8px 0" }}>Loading opportunities…</div>
                  ) : opportunities.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#b45309", padding: "8px 12px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6 }}>
                      No open or recently-won opportunities found on this account. Create one in CRM, then re-select the account.
                    </div>
                  ) : (
                    <select
                      className="ms-input"
                      value={form.crm_opportunity_id}
                      onChange={(e) => setForm((f) => ({ ...f, crm_opportunity_id: e.target.value }))}
                      required
                    >
                      <option value="">— Select an opportunity —</option>
                      {opportunities.map((o) => (
                        <option key={o.opportunityid} value={o.opportunityid}>
                          {o.name}
                          {o.statecode === 1 ? " · Won" : ""}
                          {o.estimatedclosedate ? ` · est. close ${o.estimatedclosedate.slice(0, 10)}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              )}

              {/* ── CRM team suggestion ── */}
              {(crmTeamLoading || crmTeam) && (
                <div style={{ padding: "10px 14px", background: "rgba(11,154,173,0.06)", border: "1px solid rgba(11,154,173,0.2)", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#0b9aad", marginBottom: 8 }}>From CRM</div>
                  {crmTeamLoading ? (
                    <div style={{ fontSize: 12, color: "#64748b" }}>Loading team…</div>
                  ) : crmTeam && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      {[
                        { label: "AE", name: crmTeam.ae_name, email: crmTeam.ae_email },
                        { label: "SA", name: crmTeam.sa_name, email: crmTeam.sa_email },
                        { label: "CSM", name: crmTeam.csm_name, email: crmTeam.csm_email },
                      ].map(({ label, name, email }) => (
                        <div key={label}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                          {name ? (
                            <>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>{name}</div>
                              {email && <div style={{ fontSize: 11, color: "#64748b" }}>{email}</div>}
                            </>
                          ) : (
                            <div style={{ fontSize: 12, color: "#94a3b8" }}>—</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Journey Picker ── */}
              <div className="ms-label">
                <span>Core Journey *</span>

                {/* UCaaS / CCaaS section */}
                <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "12px 14px", marginBottom: 8, background: "#f8fafc" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#03395f", marginBottom: 10 }}>UCaaS / CCaaS</div>

                  {/* Vendor tabs */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                    {(["zoom", "ringcentral", "agnostic"] as const)
                      .filter((v) => !demoVendor || v === demoVendor)
                      .map((v) => {
                      const labels: Record<string, string> = { zoom: "Zoom", ringcentral: "RingCentral", agnostic: "Agnostic" };
                      const active = form.ucaas_vendor === v;
                      return (
                        <button key={v} type="button"
                          onClick={() => {
                            const prevKeys = form.ucaas_vendor ? VENDOR_JOURNEYS[form.ucaas_vendor] ?? [] : [];
                            setForm((f) => ({
                              ...f,
                              ucaas_vendor: active ? "" : v,
                              journeys: active
                                ? f.journeys.filter(j => !prevKeys.includes(j))
                                : f.journeys.filter(j => !prevKeys.includes(j)),
                            }));
                          }}
                          style={{ padding: "4px 12px", fontSize: 12, borderRadius: 4, border: `1px solid ${active ? "#03395f" : "rgba(0,0,0,0.12)"}`, background: active ? "#03395f" : "transparent", color: active ? "#fff" : "#64748b", cursor: "pointer", fontWeight: active ? 600 : 400 }}>
                          {labels[v]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Sub-type checkboxes */}
                  {form.ucaas_vendor ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
                      {(VENDOR_JOURNEYS[form.ucaas_vendor] ?? []).map((key) => {
                        const checked = form.journeys.includes(key);
                        return (
                          <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer", userSelect: "none" }}>
                            <input type="checkbox" checked={checked}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                journeys: e.target.checked ? [...f.journeys, key] : f.journeys.filter(j => j !== key),
                              }))}
                              style={{ accentColor: "#03395f" }}
                            />
                            {JOURNEY_LABELS[key]}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Select a vendor above to choose sub-technologies.</div>
                  )}
                </div>

                {/* Standalone categories */}
                <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "12px 14px", background: "#f8fafc" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#03395f", marginBottom: 10 }}>Other Technology</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
                    {STANDALONE_JOURNEYS.map((key) => {
                      const checked = form.journeys.includes(key);
                      return (
                        <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer", userSelect: "none" }}>
                          <input type="checkbox" checked={checked}
                            onChange={(e) => setForm((f) => ({
                              ...f,
                              journeys: e.target.checked ? [...f.journeys, key] : f.journeys.filter(j => j !== key),
                            }))}
                            style={{ accentColor: "#03395f" }}
                          />
                          {JOURNEY_LABELS[key]}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Selected summary */}
                {form.journeys.length > 0 && (
                  <div style={{ fontSize: 11, color: "#63c1ea", marginTop: 6 }}>
                    {form.journeys.length} journey{form.journeys.length > 1 ? "s" : ""} selected: {form.journeys.map(j => JOURNEY_LABELS[j] ?? j).join(", ")}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
                {/* PF AE — hidden when CRM team is loaded */}
                {!crmTeam && (
                  <label className="ms-label">
                    <span>PF Account Executive</span>
                    <select className="ms-input" value={form.pf_ae_user_id} onChange={(e) => setForm((f) => ({ ...f, pf_ae_user_id: e.target.value }))}>
                      <option value="">— Unassigned —</option>
                      {pfAes.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                    </select>
                  </label>
                )}

                {/* Vendor AE mode toggle — always shown */}
                <label className="ms-label" style={crmTeam ? { gridColumn: "1 / -1" } : {}}>
                  <span>Vendor AE</span>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {(["existing", "new"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, partner_ae_mode: mode }))}
                        style={{
                          flex: 1, padding: "5px 0", fontSize: 12, borderRadius: 4,
                          border: `1px solid ${form.partner_ae_mode === mode ? "#63c1ea" : "rgba(0,0,0,0.1)"}`,
                          background: form.partner_ae_mode === mode ? "rgba(99,193,234,0.1)" : "transparent",
                          color: form.partner_ae_mode === mode ? "#63c1ea" : "#94a3b8",
                          cursor: "pointer",
                        }}
                      >
                        {mode === "existing" ? "Select Existing" : "Invite New"}
                      </button>
                    ))}
                  </div>
                  {form.partner_ae_mode === "existing" ? (
                    <select className="ms-input" value={form.partner_ae_user_id} onChange={(e) => setForm((f) => ({ ...f, partner_ae_user_id: e.target.value }))}>
                      <option value="">— None —</option>
                      {partnerAes.map((u) => (
                        <option key={u.id} value={u.id}>{u.name ?? u.email}{u.organization_name ? ` (${u.organization_name})` : ""}</option>
                      ))}
                    </select>
                  ) : null}
                </label>

                {/* SA — hidden when CRM team is loaded */}
                {!crmTeam && (
                  <label className="ms-label">
                    <span>Solution Architect</span>
                    <select className="ms-input" value={form.pf_sa_user_id} onChange={(e) => setForm((f) => ({ ...f, pf_sa_user_id: e.target.value }))}>
                      <option value="">— Unassigned —</option>
                      {pfSas.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                    </select>
                  </label>
                )}

                {/* CSM — hidden when CRM team is loaded */}
                {!crmTeam && (
                  <label className="ms-label">
                    <span>Customer Success Manager</span>
                    <select className="ms-input" value={form.pf_csm_user_id} onChange={(e) => setForm((f) => ({ ...f, pf_csm_user_id: e.target.value }))}>
                      <option value="">— Unassigned —</option>
                      {pfCsms.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                    </select>
                  </label>
                )}
              </div>

              {/* New Partner AE fields */}
              {form.partner_ae_mode === "new" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, background: "#f8fafc", borderRadius: 6, padding: "12px 14px", border: "1px solid rgba(0,0,0,0.07)" }}>
                  <label className="ms-label">
                    <span>Name</span>
                    <input className="ms-input" placeholder="Full name" value={form.partner_ae_name} onChange={(e) => setForm((f) => ({ ...f, partner_ae_name: e.target.value }))} />
                  </label>
                  <label className="ms-label">
                    <span>Email (sends invite)</span>
                    <input className="ms-input" type="email" placeholder="ae@partner.com" value={form.partner_ae_email} onChange={(e) => setForm((f) => ({ ...f, partner_ae_email: e.target.value }))} />
                  </label>
                </div>
              )}


              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button
                  type="submit"
                  className="ms-btn-primary"
                  disabled={
                    saving ||
                    !form.customer_name.trim() ||
                    !form.dynamics_account_id ||
                    !form.crm_opportunity_id ||
                    form.journeys.length === 0
                  }
                  title={
                    !form.dynamics_account_id ? "Pick a CRM account first" :
                    !form.crm_opportunity_id ? "Pick an opportunity from CRM" :
                    form.journeys.length === 0 ? "Select at least one journey" :
                    undefined
                  }
                >
                  {saving ? "Creating…" : "Create Solution"}
                </button>
                <button type="button" className="ms-btn-secondary" onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); setCrmSearch(""); setCrmResults([]); setCrmTeam(null); setOpportunities([]); setShowCreateAccount(false); setNewAccountForm({ name: "", emailaddress1: "", websiteurl: "", owner_systemuserid: "" }); }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api, type Solution, type SolutionStatus, type User, type CrmAccountTeam,
} from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

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
  // Fallback for legacy solutions without journeys
  const legacyMap: Record<string, string> = { ucaas: "ucaas_ccaas", ccaas: "ucaas_ccaas", ci: "ci", va: "va" };
  return (legacyMap[s.solution_type] ?? s.solution_type) === category;
}

function journeyBadgeText(s: Solution): string {
  const journeys = parseJourneys(s);
  if (!journeys.length) {
    const fallback: Record<string, string> = { ucaas: "UCaaS", ccaas: "CCaaS", ci: "Conversation Intelligence", va: "AI Virtual Agent" };
    return fallback[s.solution_type] ?? s.solution_type;
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const { showToast } = useToast();
  const navigate = useNavigate();

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
    setForm((f) => ({ ...f, customer_name: account.name, dynamics_account_id: account.id }));
    setCrmSearch(account.name);
    setCrmResults([]);
    setCrmTeam(null);
    setCrmTeamLoading(true);
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
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_name.trim()) return;
    if (!form.journeys.length) { showToast("Select at least one journey.", "error"); return; }
    setSaving(true);
    try {
      const payload: Parameters<typeof api.createSolution>[0] = {
        customer_name: form.customer_name.trim(),
        journeys: form.journeys,
      };
      if (form.dynamics_account_id) payload.dynamics_account_id = form.dynamics_account_id;
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
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Solutions</h1>
        {currentRole !== "client" && (
          <button className="ms-btn-primary" onClick={() => setShowCreate(true)}>+ New Solution</button>
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
              <th>Projects</th>
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
                    <span className="ms-badge" style={{ background: "rgba(99,193,234,0.12)", color: "#0891b2", border: "1px solid rgba(99,193,234,0.25)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}>
                      {journeyBadgeText(s)}
                    </span>
                  </td>
                  <td>
                    <span className="ms-badge" style={{ background: `${STATUS_COLOR[s.status]}1a`, color: STATUS_COLOR[s.status], border: `1px solid ${STATUS_COLOR[s.status]}40` }}>
                      {STATUS_LABELS[s.status]}
                    </span>
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>
                    {s.customer_pf_ae_name ?? <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>
                    {s.partner_ae_display_name ?? s.partner_ae_name ?? <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td>
                    {(s.linked_project_count ?? 0) > 0 ? (
                      <span className="ms-badge" style={{ background: "rgba(16,124,16,0.1)", color: "#107c10", border: "1px solid rgba(16,124,16,0.3)" }}>
                        {s.linked_project_count} project{(s.linked_project_count ?? 0) > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                    )}
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
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setForm(EMPTY_FORM); setCrmSearch(""); setCrmResults([]); setCrmTeam(null); } }}>
          <div className="ms-modal" style={{ maxWidth: 560 }}>
            <h2>New Solution</h2>
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 16, marginTop: 16 }}>

              {/* ── Journey Picker ── */}
              <div className="ms-label">
                <span>Core Journey *</span>

                {/* UCaaS / CCaaS section */}
                <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "12px 14px", marginBottom: 8, background: "#f8fafc" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#03395f", marginBottom: 10 }}>UCaaS / CCaaS</div>

                  {/* Vendor tabs */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                    {(["zoom", "ringcentral", "agnostic"] as const).map((v) => {
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

              {/* Customer — CRM lookup or manual */}
              <label className="ms-label">
                <span>Customer *</span>
                <div style={{ position: "relative" }}>
                  <input
                    autoFocus
                    className="ms-input"
                    placeholder="Search CRM or enter name…"
                    value={crmSearch || form.customer_name}
                    onChange={(e) => {
                      setCrmSearch(e.target.value);
                      setForm((f) => ({ ...f, customer_name: e.target.value, dynamics_account_id: "" }));
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
              </label>

              {/* CRM team suggestion */}
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

                {/* Partner AE mode toggle — always shown */}
                <label className="ms-label" style={crmTeam ? { gridColumn: "1 / -1" } : {}}>
                  <span>Partner AE</span>
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
                <button type="submit" className="ms-btn-primary" disabled={saving || !form.customer_name.trim()}>
                  {saving ? "Creating…" : "Create Solution"}
                </button>
                <button type="button" className="ms-btn-secondary" onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); setCrmSearch(""); setCrmResults([]); setCrmTeam(null); }}>
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

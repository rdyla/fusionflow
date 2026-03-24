import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api, type Solution, type SolutionType, type SolutionStatus, type User, type CrmAccountTeam,
} from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const SOLUTION_TYPE_LABELS: Record<SolutionType, string> = {
  ucaas: "UCaaS",
  ccaas: "CCaaS",
  ci: "Conversation Intelligence",
  va: "AI Virtual Agent",
};

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
  solution_type: "ucaas" as SolutionType,
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
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
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
    setSaving(true);
    try {
      const payload: Parameters<typeof api.createSolution>[0] = {
        customer_name: form.customer_name.trim(),
        solution_type: form.solution_type,
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
    if (typeFilter !== "all" && s.solution_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.customer_name.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
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
        <button className="ms-btn-primary" onClick={() => setShowCreate(true)}>+ New Solution</button>
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
        <select className="ms-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 200 }}>
          <option value="all">All Technology Types</option>
          {(Object.keys(SOLUTION_TYPE_LABELS) as SolutionType[]).map((t) => (
            <option key={t} value={t}>{SOLUTION_TYPE_LABELS[t]}</option>
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
                <td colSpan={6} style={{ textAlign: "center", color: "#94a3b8", padding: "28px 16px" }}>
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
                    <span className="ms-badge" style={{ background: "rgba(99,193,234,0.12)", color: "#0891b2", border: "1px solid rgba(99,193,234,0.25)" }}>
                      {SOLUTION_TYPE_LABELS[s.solution_type] ?? s.solution_type}
                    </span>
                  </td>
                  <td>
                    <span className="ms-badge" style={{ background: `${STATUS_COLOR[s.status]}1a`, color: STATUS_COLOR[s.status], border: `1px solid ${STATUS_COLOR[s.status]}40` }}>
                      {STATUS_LABELS[s.status]}
                    </span>
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>
                    {s.pf_ae_name ?? <span style={{ color: "#94a3b8" }}>—</span>}
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
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setForm(EMPTY_FORM); setCrmSearch(""); setCrmResults([]); } }}>
          <div className="ms-modal" style={{ maxWidth: 560 }}>
            <h2>New Solution</h2>
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 16, marginTop: 16 }}>

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

              {/* Technology Category */}
              <label className="ms-label">
                <span>Technology *</span>
                <select className="ms-input" value={form.solution_type} onChange={(e) => setForm((f) => ({ ...f, solution_type: e.target.value as SolutionType }))}>
                  {(Object.keys(SOLUTION_TYPE_LABELS) as SolutionType[]).map((t) => (
                    <option key={t} value={t}>{SOLUTION_TYPE_LABELS[t]}</option>
                  ))}
                </select>
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

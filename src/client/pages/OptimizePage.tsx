import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type OptimizeAccount, type OptimizeEligible, type User, type DynamicsAccount, type CrmAccountTeam, type Project } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e",
  paused: "#f59e0b",
  churned: "#d13438",
};

const METHOD_COLOR: Record<string, { color: string; bg: string; border: string }> = {
  auto:   { color: "#0b9aad", bg: "rgba(11,154,173,0.1)",   border: "rgba(11,154,173,0.3)"   },
  manual: { color: "#8764b8", bg: "rgba(135,100,184,0.1)", border: "rgba(135,100,184,0.3)" },
  direct: { color: "#059669", bg: "rgba(5,150,105,0.1)",   border: "rgba(5,150,105,0.3)"   },
};

const EMPTY_DIRECT = {
  customer_name: "",
  dynamics_account_id: "",
  vendor: "",
  solution_type: "",
  actual_go_live_date: "",
  ae_user_id: "",
  sa_user_id: "",
  csm_user_id: "",
  next_review_date: "",
  notes: "",
  project_id: "",
};

export default function OptimizePage() {
  const [accounts, setAccounts] = useState<OptimizeAccount[]>([]);
  const [eligible, setEligible] = useState<OptimizeEligible[]>([]);
  const [loading, setLoading] = useState(true);
  const [graduating, setGraduating] = useState<string | null>(null);
  const [showGraduateModal, setShowGraduateModal] = useState(false);
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [directForm, setDirectForm] = useState(EMPTY_DIRECT);
  const [directSaving, setDirectSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [crmQuery, setCrmQuery] = useState("");
  const [crmResults, setCrmResults] = useState<DynamicsAccount[] | null>(null);
  const [crmSearching, setCrmSearching] = useState(false);
  const [selectedCrm, setSelectedCrm] = useState<DynamicsAccount | null>(null);
  const [crmMode, setCrmMode] = useState<"search" | "manual">("search");
  const [crmTeam, setCrmTeam] = useState<CrmAccountTeam | null>(null);
  const [crmTeamLoading, setCrmTeamLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    load();
    api.users().then(setUsers).catch(() => {});
    api.projects().then(setProjects).catch(() => {});
  }, []);

  async function load() {
    try {
      setLoading(true);
      const [accs, elig] = await Promise.all([api.optimizeAccounts(), api.optimizeEligible()]);
      setAccounts(accs);
      setEligible(elig);
    } catch {
      showToast("Failed to load Optimize accounts", "error");
    } finally {
      setLoading(false);
    }
  }

  function resetDirectModal() {
    setShowDirectModal(false);
    setDirectForm(EMPTY_DIRECT);
    setCrmQuery("");
    setCrmResults(null);
    setSelectedCrm(null);
    setCrmMode("search");
    setCrmTeam(null);
  }

  async function handleCrmSearch() {
    if (!crmQuery.trim()) return;
    setCrmSearching(true);
    try {
      const results = await api.optimizeCrmSearch(crmQuery.trim());
      setCrmResults(results);
    } catch {
      setCrmResults([]);
    } finally {
      setCrmSearching(false);
    }
  }

  function selectCrmAccount(account: DynamicsAccount) {
    setSelectedCrm(account);
    setDirectForm((f) => ({ ...f, customer_name: account.name, dynamics_account_id: account.accountid }));
    setCrmResults(null);
    setCrmQuery("");
    setCrmTeam(null);
    setCrmTeamLoading(true);
    api.optimizeCrmAccountTeam(account.accountid)
      .then((team) => {
        setCrmTeam(team);
        setDirectForm((f) => ({
          ...f,
          ae_user_id: team.ae_user_id ?? "",
          sa_user_id: team.sa_user_id ?? "",
          csm_user_id: team.csm_user_id ?? "",
        }));
      })
      .catch(() => setCrmTeam(null))
      .finally(() => setCrmTeamLoading(false));
  }

  function clearCrmSelection() {
    setSelectedCrm(null);
    setDirectForm((f) => ({ ...f, customer_name: "", dynamics_account_id: "", ae_user_id: "", sa_user_id: "", csm_user_id: "" }));
    setCrmTeam(null);
  }

  async function handleDirectEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!directForm.customer_name.trim()) return;
    setDirectSaving(true);
    try {
      const created = await api.optimizeDirectEnroll({
        customer_name: directForm.customer_name.trim(),
        vendor: directForm.vendor.trim() || null,
        solution_type: directForm.solution_type.trim() || null,
        actual_go_live_date: directForm.actual_go_live_date || null,
        ae_user_id: directForm.ae_user_id || null,
        sa_user_id: directForm.sa_user_id || null,
        csm_user_id: directForm.csm_user_id || null,
        next_review_date: directForm.next_review_date || null,
        notes: directForm.notes.trim() || null,
        dynamics_account_id: directForm.dynamics_account_id || null,
        project_id: directForm.project_id || null,
      });
      setAccounts((prev) => [created, ...prev]);
      resetDirectModal();
      showToast("Optimize account created.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create account", "error");
    } finally {
      setDirectSaving(false);
    }
  }

  async function handleGraduate(projectId: string) {
    setGraduating(projectId);
    try {
      await api.optimizeGraduate(projectId);
      showToast("Project graduated to Optimize.", "success");
      await load();
      setShowGraduateModal(false);
    } catch {
      showToast("Failed to graduate project", "error");
    } finally {
      setGraduating(null);
    }
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Optimize</h1>
          <p style={{ color: "#94a3b8", fontSize: 13, margin: "4px 0 0" }}>
            Post-implementation accounts — assessments, utilization &amp; roadmap
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {eligible.length > 0 && (
            <button className="ms-btn-secondary" onClick={() => setShowGraduateModal(true)}>
              Graduate Project ({eligible.length})
            </button>
          )}
          <button className="ms-btn-primary" onClick={() => setShowDirectModal(true)}>
            + New Account
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="ms-card" style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#475569", marginBottom: 8 }}>No Optimize accounts yet</div>
          <div style={{ fontSize: 13 }}>
            Projects automatically graduate here when all implementation phases are complete.
            {eligible.length > 0 && (
              <span> Or manually graduate an eligible project above.</span>
            )}
          </div>
        </div>
      ) : (
        <div className="ms-card" style={{ overflow: "hidden" }}>
          <table className="ms-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Graduated</th>
                <th>Status</th>
                <th>AE</th>
                <th>SA</th>
                <th>CSM</th>
                <th>Next Review</th>
                <th>Last Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/optimize/${a.project_id}`)}>
                  <td>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>{a.project_name}</div>
                    {a.customer_name && (
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{a.customer_name}</div>
                    )}
                  </td>
                  <td style={{ color: "#64748b", fontSize: 12 }}>
                    {a.graduated_at ? a.graduated_at.slice(0, 10) : "—"}
                    {(() => { const m = METHOD_COLOR[a.graduation_method] ?? METHOD_COLOR.manual; return (
                      <span style={{ marginLeft: 6, fontSize: 10, color: m.color, background: m.bg, padding: "1px 5px", borderRadius: 4, border: `1px solid ${m.border}` }}>
                        {a.graduation_method}
                      </span>
                    ); })()}
                  </td>
                  <td>
                    <span className="ms-badge" style={{ background: (STATUS_COLOR[a.optimize_status] ?? "#94a3b8") + "1a", color: STATUS_COLOR[a.optimize_status] ?? "#94a3b8", border: `1px solid ${(STATUS_COLOR[a.optimize_status] ?? "#94a3b8")}40` }}>
                      {a.optimize_status}
                    </span>
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{a.ae_name ?? "—"}</td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{a.sa_name ?? "—"}</td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{a.csm_name ?? "—"}</td>
                  <td style={{ color: "#64748b", fontSize: 12 }}>{a.next_review_date ?? "—"}</td>
                  <td>
                    {a.last_assessment_score != null ? (
                      <span style={{ fontWeight: 700, fontSize: 16, color: a.last_assessment_score >= 7 ? "#22c55e" : a.last_assessment_score >= 4 ? "#f59e0b" : "#d13438" }}>
                        {a.last_assessment_score}<span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8" }}>/10</span>
                      </span>
                    ) : "—"}
                  </td>
                  <td>
                    <button
                      className="ms-btn-ghost"
                      onClick={(e) => { e.stopPropagation(); navigate(`/optimize/${a.project_id}`); }}
                    >
                      Open →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Direct Enroll Modal */}
      {showDirectModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) resetDirectModal(); }}>
          <div className="ms-modal" style={{ maxWidth: 560 }}>
            <h2>New Optimize Account</h2>
            <p style={{ color: "#64748b", fontSize: 13, margin: "6px 0 16px" }}>
              Enroll a customer directly into Optimize without an existing implementation project.
            </p>
            <form onSubmit={handleDirectEnroll} style={{ display: "grid", gap: 14 }}>

              {/* CRM search / selected / manual */}
              <div className="ms-label">
                <span>Customer *</span>

                {/* CRM search mode — no account selected yet */}
                {crmMode === "search" && !selectedCrm && (
                  <>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        autoFocus
                        className="ms-input"
                        value={crmQuery}
                        onChange={(e) => setCrmQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCrmSearch(); } }}
                        placeholder="Search CRM by account name…"
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="ms-btn-secondary" onClick={handleCrmSearch} disabled={crmSearching || !crmQuery.trim()} style={{ whiteSpace: "nowrap" }}>
                        {crmSearching ? "Searching…" : "Search"}
                      </button>
                    </div>

                    {/* Results list */}
                    {crmResults !== null && (
                      <div style={{ marginTop: 4, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, overflow: "hidden", background: "#021a2e" }}>
                        {crmResults.length === 0 ? (
                          <div style={{ padding: "10px 14px", fontSize: 13, color: "#94a3b8" }}>No accounts found in CRM.</div>
                        ) : (
                          crmResults.map((a) => (
                            <button
                              type="button"
                              key={a.accountid}
                              onClick={() => selectCrmAccount(a)}
                              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", color: "rgba(255,255,255,0.85)" }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(99,193,234,0.1)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                            >
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
                              {(a.address1_city || a.address1_stateorprovince) && (
                                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                  {[a.address1_city, a.address1_stateorprovince].filter(Boolean).join(", ")}
                                </div>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    <button type="button" onClick={() => { setCrmMode("manual"); setCrmResults(null); }} style={{ marginTop: 6, fontSize: 12, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                      Can't find it? Enter manually →
                    </button>
                  </>
                )}

                {/* CRM account selected */}
                {crmMode === "search" && selectedCrm && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(99,193,234,0.06)", border: "1px solid rgba(99,193,234,0.2)", borderRadius: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>{selectedCrm.name}</div>
                      {(selectedCrm.address1_city || selectedCrm.address1_stateorprovince) && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          {[selectedCrm.address1_city, selectedCrm.address1_stateorprovince].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={clearCrmSelection} style={{ fontSize: 12, color: "#94a3b8", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>
                      Change
                    </button>
                  </div>
                )}

                {/* Manual mode */}
                {crmMode === "manual" && (
                  <>
                    <input
                      autoFocus
                      required
                      className="ms-input"
                      value={directForm.customer_name}
                      onChange={(e) => setDirectForm({ ...directForm, customer_name: e.target.value })}
                      placeholder="Acme Corp"
                    />
                    <button type="button" onClick={() => { setCrmMode("search"); setDirectForm((f) => ({ ...f, customer_name: "", dynamics_account_id: "" })); }} style={{ marginTop: 6, fontSize: 12, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                      ← Search CRM instead
                    </button>
                  </>
                )}
              </div>

              {/* CRM team suggestion */}
              {(crmTeamLoading || crmTeam) && (
                <div style={{ padding: "10px 14px", background: "rgba(11,154,173,0.06)", border: "1px solid rgba(11,154,173,0.2)", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#0b9aad", marginBottom: 8 }}>
                    From CRM
                  </div>
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label className="ms-label">
                  <span>Vendor</span>
                  <select className="ms-input" value={directForm.vendor} onChange={(e) => setDirectForm({ ...directForm, vendor: e.target.value })}>
                    <option value="">— Select —</option>
                    <option value="zoom">Zoom</option>
                    <option value="ringcentral">RingCentral</option>
                  </select>
                </label>
                <label className="ms-label">
                  <span>Solution Type</span>
                  <input className="ms-input" value={directForm.solution_type}
                    onChange={(e) => setDirectForm({ ...directForm, solution_type: e.target.value })}
                    placeholder="e.g. UCaaS, CCaaS" />
                </label>
                <label className="ms-label">
                  <span>Go-Live Date</span>
                  <input type="date" className="ms-input" value={directForm.actual_go_live_date}
                    onChange={(e) => setDirectForm({ ...directForm, actual_go_live_date: e.target.value })} />
                </label>
                <label className="ms-label">
                  <span>Next Review Date</span>
                  <input type="date" className="ms-input" value={directForm.next_review_date}
                    onChange={(e) => setDirectForm({ ...directForm, next_review_date: e.target.value })} />
                </label>
                {!crmTeam && (
                  <label className="ms-label">
                    <span>Account Executive</span>
                    <select className="ms-input" value={directForm.ae_user_id} onChange={(e) => setDirectForm({ ...directForm, ae_user_id: e.target.value })}>
                      <option value="">— None —</option>
                      {users.filter((u) => u.role !== "client").map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                    </select>
                  </label>
                )}
                {!crmTeam && (
                  <label className="ms-label">
                    <span>Solution Architect</span>
                    <select className="ms-input" value={directForm.sa_user_id} onChange={(e) => setDirectForm({ ...directForm, sa_user_id: e.target.value })}>
                      <option value="">— None —</option>
                      {users.filter((u) => u.role !== "client").map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                    </select>
                  </label>
                )}
                {!crmTeam && (
                  <label className="ms-label">
                    <span>Customer Success Manager</span>
                    <select className="ms-input" value={directForm.csm_user_id} onChange={(e) => setDirectForm({ ...directForm, csm_user_id: e.target.value })}>
                      <option value="">— None —</option>
                      {users.filter((u) => u.role !== "client").map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {projects.length > 0 && (
                <label className="ms-label">
                  <span>Link to Project (optional)</span>
                  <select
                    className="ms-input"
                    value={directForm.project_id}
                    onChange={(e) => setDirectForm({ ...directForm, project_id: e.target.value })}
                  >
                    <option value="">— None —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.customer_name ? ` — ${p.customer_name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="ms-label">
                <span>Notes</span>
                <textarea className="ms-input" rows={3} value={directForm.notes}
                  onChange={(e) => setDirectForm({ ...directForm, notes: e.target.value })}
                  placeholder="Optional context about this account…" style={{ resize: "vertical" }} />
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={directSaving || !directForm.customer_name.trim()}>
                  {directSaving ? "Creating…" : "Create Account"}
                </button>
                <button type="button" className="ms-btn-secondary" onClick={resetDirectModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Graduate Modal */}
      {showGraduateModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowGraduateModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 520 }}>
            <h2>Graduate to Optimize</h2>
            <p style={{ color: "#475569", fontSize: 13, margin: "8px 0 16px" }}>
              These projects have all implementation phases completed and are eligible for the Optimize lifecycle.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {eligible.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(99,193,234,0.04)", border: "1px solid rgba(99,193,234,0.12)", borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>{p.name}</div>
                    {p.customer_name && <div style={{ fontSize: 12, color: "#94a3b8" }}>{p.customer_name}</div>}
                  </div>
                  <button
                    className="ms-btn-primary"
                    disabled={graduating === p.id}
                    onClick={() => handleGraduate(p.id)}
                    style={{ minWidth: 100 }}
                  >
                    {graduating === p.id ? "Graduating..." : "Graduate"}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="ms-btn-secondary" onClick={() => setShowGraduateModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

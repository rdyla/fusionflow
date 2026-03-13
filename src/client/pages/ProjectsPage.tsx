import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type DynamicsAccount, type DynamicsUser, type Project, type Phase } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const PHASE_STATUS_COLOR: Record<string, string> = {
  completed: "#107c10",
  in_progress: "#0078d4",
  not_started: "#e1dfdd",
  blocked: "#d13438",
};

function PhaseFlowIndicator({ phases }: { phases: Phase[] | undefined }) {
  if (!phases || phases.length === 0) {
    return <span style={{ color: "#c8c6c4", fontSize: 11 }}>—</span>;
  }
  const sorted = [...phases].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {sorted.map((phase, i) => {
        const status = phase.status || "not_started";
        const color = PHASE_STATUS_COLOR[status] ?? "#e1dfdd";
        const isActive = status === "in_progress";
        const prevDone = i > 0 && sorted[i - 1].status === "completed";
        return (
          <div key={phase.id} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && (
              <div style={{ width: 5, height: 2, background: prevDone ? "#107c10" : "#e1dfdd", flexShrink: 0 }} />
            )}
            <div
              title={`${phase.name} — ${status.replace(/_/g, " ")}`}
              style={{
                width: isActive ? 13 : 10,
                height: isActive ? 13 : 10,
                borderRadius: "50%",
                background: status === "not_started" ? "#e1dfdd" : color,
                border: `1.5px solid ${status === "not_started" ? "#c8c6c4" : color}`,
                boxShadow: isActive ? `0 0 0 2.5px ${color}55` : "none",
                flexShrink: 0,
                cursor: "default",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  completed: "#107c10",
  in_progress: "#0078d4",
  not_started: "#605e5c",
  blocked: "#d13438",
};
const HEALTH_COLOR: Record<string, string> = {
  on_track: "#107c10",
  at_risk: "#ff8c00",
  off_track: "#d13438",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="ms-badge" style={{ background: color + "1a", color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}

const EMPTY_FORM = {
  name: "",
  customer_name: "",
  vendor: "",
  solution_type: "",
  kickoff_date: "",
  target_go_live_date: "",
  pm_name: "",
  ae_name: "",
  sa_name: "",
  csm_name: "",
  engineer_name: "",
  dynamics_account_id: "",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectPhases, setProjectPhases] = useState<Record<string, Phase[]>>({});
  const [dynamicsPMs, setDynamicsPMs] = useState<DynamicsUser[]>([]);
  const [dynamicsAEs, setDynamicsAEs] = useState<DynamicsUser[]>([]);
  const [dynamicsSAs, setDynamicsSAs] = useState<DynamicsUser[]>([]);
  const [dynamicsCSMs, setDynamicsCSMs] = useState<DynamicsUser[]>([]);
  const [dynamicsEngineers, setDynamicsEngineers] = useState<DynamicsUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Dynamics account search state
  const [dynQuery, setDynQuery] = useState("");
  const [dynResults, setDynResults] = useState<DynamicsAccount[]>([]);
  const [dynLoading, setDynLoading] = useState(false);
  const [dynOpen, setDynOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<DynamicsAccount | null>(null);
  const dynTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dynRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([api.projects(), api.getDynamicsPMs(), api.getDynamicsAEs(), api.getDynamicsSAs(), api.getDynamicsCSMs(), api.getDynamicsEngineers()])
      .then(([p, pms, aes, sas, csms, engineers]) => {
        setProjects(p); setDynamicsPMs(pms); setDynamicsAEs(aes);
        setDynamicsSAs(sas); setDynamicsCSMs(csms); setDynamicsEngineers(engineers);
      })
      .catch((err) => setError(err.message || "Failed to load projects"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (projects.length === 0) return;
    Promise.allSettled(projects.map((p) => api.phases(p.id).then((phases) => ({ id: p.id, phases }))))
      .then((results) => {
        const map: Record<string, Phase[]> = {};
        results.forEach((r) => { if (r.status === "fulfilled") map[r.value.id] = r.value.phases; });
        setProjectPhases(map);
      });
  }, [projects]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (dynRef.current && !dynRef.current.contains(e.target as Node)) {
        setDynOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleDynQueryChange(q: string) {
    setDynQuery(q);
    setSelectedAccount(null);
    setForm((f) => ({ ...f, dynamics_account_id: "", customer_name: q }));
    if (dynTimer.current) clearTimeout(dynTimer.current);
    if (q.trim().length < 2) { setDynResults([]); setDynOpen(false); return; }
    dynTimer.current = setTimeout(async () => {
      setDynLoading(true);
      try {
        const results = await api.searchDynamicsAccounts(q.trim());
        setDynResults(results);
        setDynOpen(results.length > 0);
      } catch {
        setDynResults([]);
      } finally {
        setDynLoading(false);
      }
    }, 350);
  }

  function handleSelectAccount(acct: DynamicsAccount) {
    setSelectedAccount(acct);
    setDynQuery(acct.name);
    setDynOpen(false);
    setForm((f) => ({ ...f, dynamics_account_id: acct.accountid, customer_name: acct.name }));
  }

  function clearAccount() {
    setSelectedAccount(null);
    setDynQuery("");
    setDynResults([]);
    setForm((f) => ({ ...f, dynamics_account_id: "", customer_name: "" }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const created = await api.createProject({
        name: form.name.trim(),
        customer_name: form.customer_name.trim() || undefined,
        vendor: form.vendor.trim() || undefined,
        solution_type: form.solution_type.trim() || undefined,
        kickoff_date: form.kickoff_date || undefined,
        target_go_live_date: form.target_go_live_date || undefined,
        pm_name: form.pm_name || null,
        ae_name: form.ae_name || null,
        sa_name: form.sa_name || null,
        csm_name: form.csm_name || null,
        engineer_name: form.engineer_name || null,
        dynamics_account_id: form.dynamics_account_id || null,
      });
      showToast("Project created.", "success");
      navigate(`/projects/${created.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create project", "error");
      setSaving(false);
    }
  }

  function handleClose() {
    setShowModal(false);
    setForm(EMPTY_FORM);
    setDynQuery("");
    setDynResults([]);
    setSelectedAccount(null);
    setDynOpen(false);
  }

  if (loading) return <div style={{ color: "#605e5c", padding: 32 }}>Loading projects...</div>;
  if (error) return <div style={{ color: "#d13438", padding: 32 }}>Error: {error}</div>;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Projects</h1>
        <button className="ms-btn-primary" onClick={() => setShowModal(true)}>
          + New Project
        </button>
      </div>

      <div className="ms-card" style={{ overflow: "hidden" }}>
        <table className="ms-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Customer</th>
              <th>Vendor</th>
              <th>Status</th>
              <th>Health</th>
              <th>Go-Live</th>
              <th>Phase Flow</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "#605e5c", padding: "28px 16px" }}>
                  No projects yet.
                </td>
              </tr>
            ) : (
              projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link
                      to={`/projects/${project.id}`}
                      style={{ color: "#0078d4", textDecoration: "none", fontWeight: 600 }}
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td style={{ color: "#605e5c" }}>{project.customer_name ?? "—"}</td>
                  <td style={{ color: "#605e5c" }}>{project.vendor ?? "—"}</td>
                  <td>
                    {project.status ? (
                      <Badge
                        label={project.status.replace("_", " ")}
                        color={STATUS_COLOR[project.status] ?? "#605e5c"}
                      />
                    ) : "—"}
                  </td>
                  <td>
                    {project.health ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: HEALTH_COLOR[project.health] ?? "#605e5c", flexShrink: 0 }} />
                        <span style={{ fontSize: 13 }}>{project.health.replace("_", " ")}</span>
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ color: "#605e5c" }}>{project.target_go_live_date ?? "—"}</td>
                  <td><PhaseFlowIndicator phases={projectPhases[project.id]} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* New Project Modal */}
      {showModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
          <div className="ms-modal">
            <h2>New Project</h2>
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
              <label className="ms-label">
                <span>Project Name *</span>
                <input
                  autoFocus
                  required
                  className="ms-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Acme Corp – Webex Calling"
                />
              </label>

              {/* Dynamics account search — full width above the 2-col grid */}
              <div ref={dynRef} style={{ position: "relative" }}>
                <label className="ms-label">
                  <span>
                    Customer Account
                    {selectedAccount && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: "#107c10", fontWeight: 500 }}>
                        ✓ Linked to Dynamics
                      </span>
                    )}
                  </span>
                  <div style={{ position: "relative" }}>
                    <input
                      className="ms-input"
                      value={dynQuery}
                      onChange={(e) => handleDynQueryChange(e.target.value)}
                      placeholder="Search Dynamics CE accounts…"
                      autoComplete="off"
                    />
                    {dynLoading && (
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#605e5c" }}>
                        Searching…
                      </span>
                    )}
                    {selectedAccount && !dynLoading && (
                      <button
                        type="button"
                        onClick={clearAccount}
                        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#605e5c", fontSize: 16, lineHeight: 1 }}
                        title="Clear selection"
                      >×</button>
                    )}
                  </div>
                </label>
                {dynOpen && dynResults.length > 0 && (
                  <div style={{
                    position: "absolute", zIndex: 100, left: 0, right: 0,
                    background: "#fff", border: "1px solid #edebe9", borderRadius: 4,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)", maxHeight: 220, overflowY: "auto",
                  }}>
                    {dynResults.map((acct) => (
                      <button
                        key={acct.accountid}
                        type="button"
                        onClick={() => handleSelectAccount(acct)}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "8px 14px", background: "none", border: "none",
                          cursor: "pointer", borderBottom: "1px solid #f3f2f1",
                          fontSize: 13, color: "#323130",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f2f1")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <div style={{ fontWeight: 600 }}>{acct.name}</div>
                        {(acct.address1_city || acct.address1_stateorprovince) && (
                          <div style={{ fontSize: 11, color: "#605e5c" }}>
                            {[acct.address1_city, acct.address1_stateorprovince].filter(Boolean).join(", ")}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label className="ms-label">
                  <span>Vendor</span>
                  <input className="ms-input" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="e.g. Cisco, Zoom" />
                </label>
                <label className="ms-label">
                  <span>Solution Type</span>
                  <input className="ms-input" value={form.solution_type} onChange={(e) => setForm({ ...form, solution_type: e.target.value })} placeholder="e.g. UCaaS, CCaaS" />
                </label>
                <label className="ms-label">
                  <span>Kickoff Date</span>
                  <input type="date" className="ms-input" value={form.kickoff_date} onChange={(e) => setForm({ ...form, kickoff_date: e.target.value })} />
                </label>
                <label className="ms-label">
                  <span>Target Go-Live</span>
                  <input type="date" className="ms-input" value={form.target_go_live_date} onChange={(e) => setForm({ ...form, target_go_live_date: e.target.value })} />
                </label>
                <label className="ms-label">
                  <span>Project Manager</span>
                  <select className="ms-input" value={form.pm_name} onChange={(e) => setForm({ ...form, pm_name: e.target.value })}>
                    <option value="">Unassigned</option>
                    {dynamicsPMs.map((u) => {
                      const fullName = [u.firstname, u.lastname].filter(Boolean).join(" ");
                      return <option key={u.systemuserid} value={fullName}>{fullName}</option>;
                    })}
                  </select>
                </label>
                <label className="ms-label">
                  <span>Account Executive</span>
                  <select className="ms-input" value={form.ae_name} onChange={(e) => setForm({ ...form, ae_name: e.target.value })}>
                    <option value="">Unassigned</option>
                    {dynamicsAEs.map((u) => {
                      const fullName = [u.firstname, u.lastname].filter(Boolean).join(" ");
                      return <option key={u.systemuserid} value={fullName}>{fullName}</option>;
                    })}
                  </select>
                </label>
                <label className="ms-label">
                  <span>Solution Architect</span>
                  <select className="ms-input" value={form.sa_name} onChange={(e) => setForm({ ...form, sa_name: e.target.value })}>
                    <option value="">Unassigned</option>
                    {dynamicsSAs.map((u) => {
                      const fullName = [u.firstname, u.lastname].filter(Boolean).join(" ");
                      return <option key={u.systemuserid} value={fullName}>{fullName}</option>;
                    })}
                  </select>
                </label>
                <label className="ms-label">
                  <span>Client Success Manager</span>
                  <select className="ms-input" value={form.csm_name} onChange={(e) => setForm({ ...form, csm_name: e.target.value })}>
                    <option value="">Unassigned</option>
                    {dynamicsCSMs.map((u) => {
                      const fullName = [u.firstname, u.lastname].filter(Boolean).join(" ");
                      return <option key={u.systemuserid} value={fullName}>{fullName}</option>;
                    })}
                  </select>
                </label>
                <label className="ms-label">
                  <span>Implementation Engineer</span>
                  <select className="ms-input" value={form.engineer_name} onChange={(e) => setForm({ ...form, engineer_name: e.target.value })}>
                    <option value="">Unassigned</option>
                    {dynamicsEngineers.map((u) => {
                      const fullName = [u.firstname, u.lastname].filter(Boolean).join(" ");
                      return <option key={u.systemuserid} value={fullName}>{fullName}</option>;
                    })}
                  </select>
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={saving || !form.name.trim()}>
                  {saving ? "Creating..." : "Create Project"}
                </button>
                <button type="button" className="ms-btn-secondary" onClick={handleClose}>
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

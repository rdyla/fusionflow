import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  api,
  type OptimizeAccount,
  type Assessment,
  type TechStackItem,
  type RoadmapItem,
  type UtilizationSnapshot,
} from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

type Tab = "assessments" | "tech-stack" | "roadmap" | "utilization";

const TIME_COLORS: Record<string, string> = {
  invest: "#22c55e",
  tolerate: "#f59e0b",
  migrate: "#60a5fa",
  eliminate: "#d13438",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "#d13438",
  medium: "#f59e0b",
  low: "#22c55e",
};

const STATUS_COLORS: Record<string, string> = {
  identified: "#94a3b8",
  evaluating: "#60a5fa",
  approved: "#22c55e",
  in_progress: "#0b9aad",
  completed: "#8764b8",
  deferred: "#f59e0b",
};

export default function OptimizeAccountPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [account, setAccount] = useState<OptimizeAccount | null>(null);
  const [tab, setTab] = useState<Tab>("assessments");
  const [loading, setLoading] = useState(true);

  // Assessments
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [assessmentForm, setAssessmentForm] = useState({ assessment_type: "impact", conducted_date: new Date().toISOString().slice(0, 10), overall_score: "", adoption_score: "", satisfaction_score: "", notes: "", action_items: "", next_review_date: "" });
  const [savingAssessment, setSavingAssessment] = useState(false);

  // Tech Stack
  const [techStack, setTechStack] = useState<TechStackItem[]>([]);
  const [showTechForm, setShowTechForm] = useState(false);
  const [techForm, setTechForm] = useState({ tech_area: "uc", tech_area_label: "", current_vendor: "", current_solution: "", time_rating: "", notes: "" });
  const [savingTech, setSavingTech] = useState(false);

  // Roadmap
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [showRoadmapForm, setShowRoadmapForm] = useState(false);
  const [roadmapForm, setRoadmapForm] = useState({ title: "", description: "", category: "enhancement", priority: "medium", time_rating: "", status: "identified", target_date: "" });
  const [savingRoadmap, setSavingRoadmap] = useState(false);

  // Utilization
  const [utilization, setUtilization] = useState<UtilizationSnapshot[]>([]);
  const [zoomConfigured, setZoomConfigured] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (projectId) loadAll(projectId);
  }, [projectId]);

  async function loadAll(pid: string) {
    try {
      setLoading(true);
      const [acc, ass, tech, road, util, zoomCfg] = await Promise.all([
        api.optimizeAccount(pid),
        api.optimizeAssessments(pid),
        api.optimizeTechStack(pid),
        api.optimizeRoadmap(pid),
        api.optimizeUtilization(pid),
        api.zoomConfigured(pid).catch(() => ({ configured: false })),
      ]);
      setAccount(acc);
      setAssessments(ass);
      setTechStack(tech);
      setRoadmap(road);
      setUtilization(util);
      setZoomConfigured(zoomCfg.configured);
    } catch {
      showToast("Failed to load account data", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncUtilization() {
    if (!projectId) return;
    setSyncing(true);
    try {
      const snapshot = await api.optimizeUtilizationSync(projectId);
      setUtilization((prev) => [snapshot, ...prev]);
      showToast("Utilization snapshot captured.", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      showToast(msg, "error");
    } finally {
      setSyncing(false);
    }
  }

  async function handleCreateAssessment(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSavingAssessment(true);
    try {
      const created = await api.optimizeCreateAssessment({
        project_id: projectId,
        assessment_type: assessmentForm.assessment_type,
        conducted_date: assessmentForm.conducted_date,
        overall_score: assessmentForm.overall_score ? parseInt(assessmentForm.overall_score) : null,
        adoption_score: assessmentForm.adoption_score ? parseInt(assessmentForm.adoption_score) : null,
        satisfaction_score: assessmentForm.satisfaction_score ? parseInt(assessmentForm.satisfaction_score) : null,
        notes: assessmentForm.notes || null,
        action_items: assessmentForm.action_items || null,
        next_review_date: assessmentForm.next_review_date || null,
      });
      setAssessments((prev) => [created, ...prev]);
      setShowAssessmentForm(false);
      setAssessmentForm({ assessment_type: "impact", conducted_date: new Date().toISOString().slice(0, 10), overall_score: "", adoption_score: "", satisfaction_score: "", notes: "", action_items: "", next_review_date: "" });
      showToast("Assessment saved.", "success");
    } catch {
      showToast("Failed to save assessment", "error");
    } finally {
      setSavingAssessment(false);
    }
  }

  async function handleDeleteAssessment(id: string) {
    try {
      await api.optimizeDeleteAssessment(projectId!, id);
      setAssessments((prev) => prev.filter((a) => a.id !== id));
      showToast("Assessment deleted.", "success");
    } catch {
      showToast("Failed to delete assessment", "error");
    }
  }

  async function handleCreateTech(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSavingTech(true);
    try {
      const created = await api.optimizeCreateTechStack({
        project_id: projectId,
        tech_area: techForm.tech_area,
        tech_area_label: techForm.tech_area_label || null,
        current_vendor: techForm.current_vendor || null,
        current_solution: techForm.current_solution || null,
        time_rating: techForm.time_rating || null,
        notes: techForm.notes || null,
      });
      setTechStack((prev) => [...prev, created]);
      setShowTechForm(false);
      setTechForm({ tech_area: "uc", tech_area_label: "", current_vendor: "", current_solution: "", time_rating: "", notes: "" });
      showToast("Tech area saved.", "success");
    } catch {
      showToast("Failed to save tech area", "error");
    } finally {
      setSavingTech(false);
    }
  }

  async function handleDeleteTech(id: string) {
    try {
      await api.optimizeDeleteTechStack(projectId!, id);
      setTechStack((prev) => prev.filter((t) => t.id !== id));
      showToast("Tech area deleted.", "success");
    } catch {
      showToast("Failed to delete tech area", "error");
    }
  }

  async function handleCreateRoadmap(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSavingRoadmap(true);
    try {
      const created = await api.optimizeCreateRoadmapItem({
        project_id: projectId,
        title: roadmapForm.title,
        description: roadmapForm.description || null,
        category: roadmapForm.category,
        priority: roadmapForm.priority,
        time_rating: roadmapForm.time_rating || null,
        status: roadmapForm.status,
        target_date: roadmapForm.target_date || null,
      });
      setRoadmap((prev) => [...prev, created]);
      setShowRoadmapForm(false);
      setRoadmapForm({ title: "", description: "", category: "enhancement", priority: "medium", time_rating: "", status: "identified", target_date: "" });
      showToast("Roadmap item added.", "success");
    } catch {
      showToast("Failed to add roadmap item", "error");
    } finally {
      setSavingRoadmap(false);
    }
  }

  async function handleDeleteRoadmap(id: string) {
    try {
      await api.optimizeDeleteRoadmapItem(projectId!, id);
      setRoadmap((prev) => prev.filter((r) => r.id !== id));
      showToast("Roadmap item deleted.", "success");
    } catch {
      showToast("Failed to delete roadmap item", "error");
    }
  }

  if (loading) return <div style={{ color: "rgba(240,246,255,0.5)", padding: 32 }}>Loading...</div>;
  if (!account) return <div style={{ color: "#d13438", padding: 32 }}>Account not found.</div>;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => navigate("/optimize")}
          style={{ background: "none", border: "none", color: "rgba(240,246,255,0.4)", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 12 }}
        >
          ← Optimize
        </button>
        <div className="ms-page-header" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ms-page-title">{account.project_name}</h1>
            {account.customer_name && (
              <div style={{ color: "rgba(240,246,255,0.45)", fontSize: 13, marginTop: 2 }}>{account.customer_name}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="ms-badge" style={{ background: account.optimize_status === "active" ? "#22c55e1a" : "#f59e0b1a", color: account.optimize_status === "active" ? "#22c55e" : "#f59e0b", border: `1px solid ${account.optimize_status === "active" ? "#22c55e40" : "#f59e0b40"}` }}>
              {account.optimize_status}
            </span>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", gap: 24, marginTop: 12, flexWrap: "wrap" }}>
          {[
            { label: "SA", value: account.sa_name ?? "—" },
            { label: "CSM", value: account.csm_name ?? "—" },
            { label: "Graduated", value: account.graduated_at ? account.graduated_at.slice(0, 10) : "—" },
            { label: "Next Review", value: account.next_review_date ?? "—" },
            { label: "Last Score", value: account.last_assessment_score != null ? `${account.last_assessment_score}/10` : "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: "rgba(240,246,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 13, color: "rgba(240,246,255,0.8)", fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.07)", paddingBottom: 0 }}>
        {(["assessments", "tech-stack", "roadmap", "utilization"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid #63c1ea" : "2px solid transparent",
              color: tab === t ? "#63c1ea" : "rgba(240,246,255,0.45)",
              fontWeight: tab === t ? 700 : 400,
              fontSize: 13,
              padding: "10px 18px",
              cursor: "pointer",
              textTransform: "capitalize",
              letterSpacing: "0.02em",
              transition: "color 0.15s",
            }}
          >
            {t === "tech-stack" ? "Tech Stack" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Assessments Tab */}
      {tab === "assessments" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button className="ms-btn-primary" onClick={() => setShowAssessmentForm(true)}>+ New Assessment</button>
          </div>

          {assessments.length === 0 ? (
            <div className="ms-card" style={{ textAlign: "center", padding: "40px 24px", color: "rgba(240,246,255,0.4)" }}>
              No assessments yet. Record your first impact or adoption review.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {assessments.map((a) => (
                <div key={a.id} className="ms-card" style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                        <span className="ms-badge" style={{ background: "rgba(99,193,234,0.1)", color: "#63c1ea", border: "1px solid rgba(99,193,234,0.25)", textTransform: "capitalize" }}>
                          {a.assessment_type}
                        </span>
                        <span style={{ fontSize: 12, color: "rgba(240,246,255,0.4)" }}>{a.conducted_date}</span>
                        {a.conducted_by_name && (
                          <span style={{ fontSize: 12, color: "rgba(240,246,255,0.35)" }}>by {a.conducted_by_name}</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 20 }}>
                        {a.overall_score != null && <ScoreChip label="Overall" score={a.overall_score} />}
                        {a.adoption_score != null && <ScoreChip label="Adoption" score={a.adoption_score} />}
                        {a.satisfaction_score != null && <ScoreChip label="Satisfaction" score={a.satisfaction_score} />}
                      </div>
                      {a.notes && <p style={{ fontSize: 13, color: "rgba(240,246,255,0.6)", margin: "10px 0 0", lineHeight: 1.5 }}>{a.notes}</p>}
                      {a.action_items && (
                        <p style={{ fontSize: 12, color: "rgba(240,246,255,0.4)", margin: "8px 0 0", fontStyle: "italic" }}>Action items: {a.action_items}</p>
                      )}
                    </div>
                    <button
                      className="ms-btn-ghost"
                      onClick={() => handleDeleteAssessment(a.id)}
                      style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)", flexShrink: 0 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showAssessmentForm && (
            <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAssessmentForm(false); }}>
              <div className="ms-modal" style={{ maxWidth: 560 }}>
                <h2>New Assessment</h2>
                <form onSubmit={handleCreateAssessment} style={{ display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <label className="ms-label">
                      <span>Type</span>
                      <select className="ms-input" value={assessmentForm.assessment_type} onChange={(e) => setAssessmentForm({ ...assessmentForm, assessment_type: e.target.value })}>
                        <option value="impact">Impact</option>
                        <option value="adoption">Adoption</option>
                        <option value="qbr">QBR</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label className="ms-label">
                      <span>Conducted Date</span>
                      <input type="date" className="ms-input" value={assessmentForm.conducted_date} onChange={(e) => setAssessmentForm({ ...assessmentForm, conducted_date: e.target.value })} />
                    </label>
                    <label className="ms-label">
                      <span>Overall Score (1–10)</span>
                      <input type="number" min={1} max={10} className="ms-input" value={assessmentForm.overall_score} onChange={(e) => setAssessmentForm({ ...assessmentForm, overall_score: e.target.value })} placeholder="—" />
                    </label>
                    <label className="ms-label">
                      <span>Adoption Score (1–10)</span>
                      <input type="number" min={1} max={10} className="ms-input" value={assessmentForm.adoption_score} onChange={(e) => setAssessmentForm({ ...assessmentForm, adoption_score: e.target.value })} placeholder="—" />
                    </label>
                    <label className="ms-label">
                      <span>Satisfaction Score (1–10)</span>
                      <input type="number" min={1} max={10} className="ms-input" value={assessmentForm.satisfaction_score} onChange={(e) => setAssessmentForm({ ...assessmentForm, satisfaction_score: e.target.value })} placeholder="—" />
                    </label>
                    <label className="ms-label">
                      <span>Next Review Date</span>
                      <input type="date" className="ms-input" value={assessmentForm.next_review_date} onChange={(e) => setAssessmentForm({ ...assessmentForm, next_review_date: e.target.value })} />
                    </label>
                  </div>
                  <label className="ms-label">
                    <span>Notes</span>
                    <textarea className="ms-input" rows={3} value={assessmentForm.notes} onChange={(e) => setAssessmentForm({ ...assessmentForm, notes: e.target.value })} placeholder="Assessment summary..." style={{ resize: "vertical" }} />
                  </label>
                  <label className="ms-label">
                    <span>Action Items</span>
                    <textarea className="ms-input" rows={2} value={assessmentForm.action_items} onChange={(e) => setAssessmentForm({ ...assessmentForm, action_items: e.target.value })} placeholder="Follow-up tasks..." style={{ resize: "vertical" }} />
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" className="ms-btn-primary" disabled={savingAssessment}>{savingAssessment ? "Saving..." : "Save Assessment"}</button>
                    <button type="button" className="ms-btn-secondary" onClick={() => setShowAssessmentForm(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tech Stack Tab */}
      {tab === "tech-stack" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "rgba(240,246,255,0.4)" }}>
              Gartner TIME framework — rate each technology area for strategic direction.
            </div>
            <button className="ms-btn-primary" onClick={() => setShowTechForm(true)}>+ Add Area</button>
          </div>

          {techStack.length === 0 ? (
            <div className="ms-card" style={{ textAlign: "center", padding: "40px 24px", color: "rgba(240,246,255,0.4)" }}>
              No tech stack areas mapped yet. Add the customer's current technology areas.
            </div>
          ) : (
            <div className="ms-card" style={{ overflow: "hidden" }}>
              <table className="ms-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Vendor</th>
                    <th>Solution</th>
                    <th>TIME Rating</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {techStack.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.tech_area_label ?? TECH_AREA_LABELS[t.tech_area] ?? t.tech_area}</td>
                      <td style={{ color: "rgba(240,246,255,0.6)" }}>{t.current_vendor ?? "—"}</td>
                      <td style={{ color: "rgba(240,246,255,0.6)" }}>{t.current_solution ?? "—"}</td>
                      <td>
                        {t.time_rating ? (
                          <span className="ms-badge" style={{ background: (TIME_COLORS[t.time_rating] ?? "#94a3b8") + "1a", color: TIME_COLORS[t.time_rating] ?? "#94a3b8", border: `1px solid ${(TIME_COLORS[t.time_rating] ?? "#94a3b8")}40`, textTransform: "capitalize" }}>
                            {t.time_rating}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ color: "rgba(240,246,255,0.45)", fontSize: 12, maxWidth: 200 }}>{t.notes ?? "—"}</td>
                      <td>
                        <button className="ms-btn-ghost" onClick={() => handleDeleteTech(t.id)} style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showTechForm && (
            <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowTechForm(false); }}>
              <div className="ms-modal" style={{ maxWidth: 520 }}>
                <h2>Add Tech Area</h2>
                <form onSubmit={handleCreateTech} style={{ display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <label className="ms-label">
                      <span>Area</span>
                      <select className="ms-input" value={techForm.tech_area} onChange={(e) => setTechForm({ ...techForm, tech_area: e.target.value })}>
                        {Object.entries(TECH_AREA_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="ms-label">
                      <span>TIME Rating</span>
                      <select className="ms-input" value={techForm.time_rating} onChange={(e) => setTechForm({ ...techForm, time_rating: e.target.value })}>
                        <option value="">— None —</option>
                        <option value="tolerate">Tolerate</option>
                        <option value="invest">Invest</option>
                        <option value="migrate">Migrate</option>
                        <option value="eliminate">Eliminate</option>
                      </select>
                    </label>
                    <label className="ms-label">
                      <span>Current Vendor</span>
                      <input className="ms-input" value={techForm.current_vendor} onChange={(e) => setTechForm({ ...techForm, current_vendor: e.target.value })} placeholder="e.g. Cisco" />
                    </label>
                    <label className="ms-label">
                      <span>Current Solution</span>
                      <input className="ms-input" value={techForm.current_solution} onChange={(e) => setTechForm({ ...techForm, current_solution: e.target.value })} placeholder="e.g. CUCM" />
                    </label>
                    {techForm.tech_area === "other" && (
                      <label className="ms-label" style={{ gridColumn: "1 / -1" }}>
                        <span>Custom Label</span>
                        <input className="ms-input" value={techForm.tech_area_label} onChange={(e) => setTechForm({ ...techForm, tech_area_label: e.target.value })} placeholder="e.g. SD-WAN" />
                      </label>
                    )}
                  </div>
                  <label className="ms-label">
                    <span>Notes</span>
                    <textarea className="ms-input" rows={2} value={techForm.notes} onChange={(e) => setTechForm({ ...techForm, notes: e.target.value })} style={{ resize: "vertical" }} />
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" className="ms-btn-primary" disabled={savingTech}>{savingTech ? "Saving..." : "Add Area"}</button>
                    <button type="button" className="ms-btn-secondary" onClick={() => setShowTechForm(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Roadmap Tab */}
      {tab === "roadmap" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button className="ms-btn-primary" onClick={() => setShowRoadmapForm(true)}>+ Add Item</button>
          </div>

          {roadmap.length === 0 ? (
            <div className="ms-card" style={{ textAlign: "center", padding: "40px 24px", color: "rgba(240,246,255,0.4)" }}>
              No roadmap items yet. Add enhancements, new projects, or optimization opportunities.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {roadmap.map((r) => (
                <div key={r.id} className="ms-card" style={{ padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, color: "rgba(240,246,255,0.9)", fontSize: 14 }}>{r.title}</span>
                        <span className="ms-badge" style={{ background: (PRIORITY_COLORS[r.priority] ?? "#94a3b8") + "1a", color: PRIORITY_COLORS[r.priority] ?? "#94a3b8", border: `1px solid ${(PRIORITY_COLORS[r.priority] ?? "#94a3b8")}40`, textTransform: "capitalize" }}>
                          {r.priority}
                        </span>
                        <span className="ms-badge" style={{ background: (STATUS_COLORS[r.status] ?? "#94a3b8") + "1a", color: STATUS_COLORS[r.status] ?? "#94a3b8", border: `1px solid ${(STATUS_COLORS[r.status] ?? "#94a3b8")}40`, textTransform: "capitalize" }}>
                          {r.status.replace("_", " ")}
                        </span>
                        {r.time_rating && (
                          <span className="ms-badge" style={{ background: (TIME_COLORS[r.time_rating] ?? "#94a3b8") + "1a", color: TIME_COLORS[r.time_rating] ?? "#94a3b8", border: `1px solid ${(TIME_COLORS[r.time_rating] ?? "#94a3b8")}40`, textTransform: "capitalize" }}>
                            {r.time_rating}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: "rgba(240,246,255,0.3)", textTransform: "capitalize" }}>{r.category.replace("_", " ")}</span>
                      </div>
                      {r.description && <p style={{ fontSize: 13, color: "rgba(240,246,255,0.55)", margin: 0, lineHeight: 1.5 }}>{r.description}</p>}
                      {r.target_date && <div style={{ fontSize: 11, color: "rgba(240,246,255,0.3)", marginTop: 6 }}>Target: {r.target_date}</div>}
                    </div>
                    <button className="ms-btn-ghost" onClick={() => handleDeleteRoadmap(r.id)} style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)", flexShrink: 0 }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showRoadmapForm && (
            <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowRoadmapForm(false); }}>
              <div className="ms-modal" style={{ maxWidth: 560 }}>
                <h2>Add Roadmap Item</h2>
                <form onSubmit={handleCreateRoadmap} style={{ display: "grid", gap: 14 }}>
                  <label className="ms-label">
                    <span>Title *</span>
                    <input autoFocus required className="ms-input" value={roadmapForm.title} onChange={(e) => setRoadmapForm({ ...roadmapForm, title: e.target.value })} placeholder="e.g. Migrate to Zoom Phone" />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <label className="ms-label">
                      <span>Category</span>
                      <select className="ms-input" value={roadmapForm.category} onChange={(e) => setRoadmapForm({ ...roadmapForm, category: e.target.value })}>
                        <option value="enhancement">Enhancement</option>
                        <option value="new_project">New Project</option>
                        <option value="optimization">Optimization</option>
                        <option value="replacement">Replacement</option>
                      </select>
                    </label>
                    <label className="ms-label">
                      <span>Priority</span>
                      <select className="ms-input" value={roadmapForm.priority} onChange={(e) => setRoadmapForm({ ...roadmapForm, priority: e.target.value })}>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </label>
                    <label className="ms-label">
                      <span>TIME Rating</span>
                      <select className="ms-input" value={roadmapForm.time_rating} onChange={(e) => setRoadmapForm({ ...roadmapForm, time_rating: e.target.value })}>
                        <option value="">— None —</option>
                        <option value="tolerate">Tolerate</option>
                        <option value="invest">Invest</option>
                        <option value="migrate">Migrate</option>
                        <option value="eliminate">Eliminate</option>
                      </select>
                    </label>
                    <label className="ms-label">
                      <span>Status</span>
                      <select className="ms-input" value={roadmapForm.status} onChange={(e) => setRoadmapForm({ ...roadmapForm, status: e.target.value })}>
                        <option value="identified">Identified</option>
                        <option value="evaluating">Evaluating</option>
                        <option value="approved">Approved</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="deferred">Deferred</option>
                      </select>
                    </label>
                    <label className="ms-label">
                      <span>Target Date</span>
                      <input type="date" className="ms-input" value={roadmapForm.target_date} onChange={(e) => setRoadmapForm({ ...roadmapForm, target_date: e.target.value })} />
                    </label>
                  </div>
                  <label className="ms-label">
                    <span>Description</span>
                    <textarea className="ms-input" rows={3} value={roadmapForm.description} onChange={(e) => setRoadmapForm({ ...roadmapForm, description: e.target.value })} style={{ resize: "vertical" }} />
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" className="ms-btn-primary" disabled={savingRoadmap || !roadmapForm.title.trim()}>{savingRoadmap ? "Saving..." : "Add Item"}</button>
                    <button type="button" className="ms-btn-secondary" onClick={() => setShowRoadmapForm(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Utilization Tab */}
      {tab === "utilization" && (
        <div>
          <div className="ms-card" style={{ padding: "20px 24px", marginBottom: 16, borderLeft: `3px solid ${zoomConfigured ? "#22c55e" : "#0b9aad"}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: "rgba(240,246,255,0.8)", marginBottom: 4 }}>Zoom Utilization</div>
              {zoomConfigured ? (
                <p style={{ color: "rgba(240,246,255,0.5)", fontSize: 13, margin: 0 }}>
                  {utilization.length > 0
                    ? <>Last synced: <strong style={{ color: "rgba(240,246,255,0.7)" }}>{utilization[0].snapshot_date}</strong></>
                    : "Credentials connected — click Sync Now to pull the first snapshot."}
                </p>
              ) : (
                <p style={{ color: "rgba(240,246,255,0.5)", fontSize: 13, margin: 0 }}>
                  No Zoom credentials found for this project. Add them on the project's Zoom tab to enable utilization tracking.
                </p>
              )}
            </div>
            {zoomConfigured && (
              <button className="ms-btn-primary" onClick={handleSyncUtilization} disabled={syncing} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                {syncing ? "Syncing…" : "↻ Sync Now"}
              </button>
            )}
          </div>

          {utilization.length === 0 && (
            <div className="ms-card" style={{ textAlign: "center", padding: "40px 24px", color: "rgba(240,246,255,0.4)" }}>
              No utilization data yet.{zoomConfigured ? " Click 'Sync Now' to capture the first snapshot." : ""}
            </div>
          )}

          {/* Zoom Phone panel — shown when latest snapshot has phone data */}
          {utilization.length > 0 && (() => {
            type PhoneData = { users_total?: number | null; total_calls_30d?: number | null; active_users_30d?: number | null; call_minutes_30d?: number | null };
            const latest = utilization[0];
            let phone: PhoneData | null = null;
            try { phone = (JSON.parse(latest.raw_data ?? "{}") as { phone?: PhoneData }).phone ?? null; } catch { /* ignore */ }
            if (!phone || (phone.users_total == null && phone.active_users_30d == null && phone.call_minutes_30d == null)) return null;
            return (
              <div className="ms-card" style={{ marginTop: 12, padding: "16px 20px", borderLeft: "3px solid #2563eb" }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(240,246,255,0.4)", marginBottom: 12 }}>
                  Zoom Phone
                </div>
                <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                  {[
                    { label: "Assigned Users",     value: phone.users_total },
                    { label: "Total Calls (30d)",   value: phone.total_calls_30d?.toLocaleString() ?? null },
                    { label: "Active Callers (30d)", value: phone.active_users_30d },
                    { label: "Call Minutes (30d)",  value: phone.call_minutes_30d != null ? phone.call_minutes_30d.toLocaleString() : null },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: value != null ? "rgba(240,246,255,0.9)" : "rgba(240,246,255,0.25)" }}>
                        {value ?? "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(240,246,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Adoption dashboard — top users + key rates */}
          {utilization.length > 0 && (() => {
            type MeetingUser = { name: string; email: string | null; meetings: number; meeting_minutes: number };
            type PhoneCaller  = { name: string; calls: number; minutes: number };
            type RawData = {
              top_meeting_users?: MeetingUser[];
              top_phone_callers?: PhoneCaller[];
              meeting_minutes_30d?: number | null;
            };
            const latest = utilization[0];
            let raw: RawData = {};
            try { raw = JSON.parse(latest.raw_data ?? "{}") as RawData; } catch { /* ignore */ }
            const meetingUsers = raw.top_meeting_users ?? [];
            const phoneCallers = raw.top_phone_callers ?? [];
            if (meetingUsers.length === 0 && phoneCallers.length === 0) return null;

            // Derived adoption rates
            const adoptionRate = (latest.active_users_30d != null && latest.licenses_assigned != null && latest.licenses_assigned > 0)
              ? Math.round((latest.active_users_30d / latest.licenses_assigned) * 100)
              : null;
            const inactiveUsers = (latest.licenses_assigned != null && latest.active_users_30d != null)
              ? latest.licenses_assigned - latest.active_users_30d
              : null;
            const avgMtgMins = (latest.active_users_30d != null && latest.active_users_30d > 0 && raw.meeting_minutes_30d != null)
              ? Math.round(raw.meeting_minutes_30d / latest.active_users_30d)
              : null;

            return (
              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                {/* Adoption rate summary */}
                <div className="ms-card" style={{ padding: "16px 20px", borderLeft: "3px solid #8764b8" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(240,246,255,0.4)", marginBottom: 12 }}>
                    Adoption Rates
                  </div>
                  <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                    {[
                      { label: "Adoption Rate",           value: adoptionRate != null ? `${adoptionRate}%` : null, color: adoptionRate != null ? (adoptionRate >= 80 ? "#22c55e" : adoptionRate >= 60 ? "#f59e0b" : "#d13438") : undefined },
                      { label: "Inactive Licensed Users",  value: inactiveUsers, color: inactiveUsers != null && inactiveUsers > 0 ? "#f59e0b" : "#22c55e" },
                      { label: "Avg Mtg Min / Active User", value: avgMtgMins != null ? `${avgMtgMins} min` : null, color: undefined },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: value != null ? (color ?? "rgba(240,246,255,0.9)") : "rgba(240,246,255,0.25)" }}>
                          {value ?? "—"}
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(240,246,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top meeting users + top phone callers side by side */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {meetingUsers.length > 0 && (
                    <div className="ms-card" style={{ padding: "16px 20px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(240,246,255,0.4)", marginBottom: 10 }}>
                        Top Meeting Users (30d)
                      </div>
                      <table className="ms-table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ width: "55%" }}>User</th>
                            <th>Meetings</th>
                            <th>Minutes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meetingUsers.map((u, i) => (
                            <tr key={i}>
                              <td style={{ color: "rgba(240,246,255,0.8)", maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.email ?? u.name}>{u.name}</td>
                              <td style={{ color: "#60a5fa" }}>{u.meetings.toLocaleString()}</td>
                              <td style={{ color: "rgba(240,246,255,0.5)" }}>{u.meeting_minutes.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {phoneCallers.length > 0 && (
                    <div className="ms-card" style={{ padding: "16px 20px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(240,246,255,0.4)", marginBottom: 10 }}>
                        Top Phone Callers (30d)
                      </div>
                      <table className="ms-table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th style={{ width: "55%" }}>User</th>
                            <th>Calls</th>
                            <th>Minutes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {phoneCallers.map((c, i) => (
                            <tr key={i}>
                              <td style={{ color: "rgba(240,246,255,0.8)", maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.name}>{c.name}</td>
                              <td style={{ color: "#60a5fa" }}>{c.calls.toLocaleString()}</td>
                              <td style={{ color: "rgba(240,246,255,0.5)" }}>{c.minutes.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* API call diagnostics from most recent snapshot */}
          {utilization.length > 0 && (() => {
            const latest = utilization[0];
            let apiCalls: Array<{ name: string; path: string; ok: boolean; error: string | null }> = [];
            try { apiCalls = (JSON.parse(latest.raw_data ?? "{}") as { api_calls?: typeof apiCalls }).api_calls ?? []; } catch { /* ignore */ }
            if (apiCalls.length === 0) return null;
            const hasFailed = apiCalls.some((c) => !c.ok);
            return (
              <div className="ms-card" style={{ marginTop: 12, padding: "16px 20px", borderLeft: `3px solid ${hasFailed ? "#f59e0b" : "#22c55e"}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(240,246,255,0.4)", marginBottom: 10 }}>
                  API Call Diagnostics
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {apiCalls.map((c) => (
                    <div key={c.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: c.ok ? "#22c55e" : "#f59e0b", flexShrink: 0, minWidth: 36 }}>{c.ok ? "✓ OK" : "✗ ERR"}</span>
                      <code style={{ color: "rgba(240,246,255,0.7)", fontSize: 12, background: "rgba(255,255,255,0.04)", padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>{c.path}</code>
                      {c.error && <span style={{ color: "#fbbf24", fontSize: 12, wordBreak: "break-word" }}>{c.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function ScoreChip({ label, score }: { label: string; score: number }) {
  const color = score >= 7 ? "#22c55e" : score >= 4 ? "#f59e0b" : "#d13438";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{score}</div>
      <div style={{ fontSize: 10, color: "rgba(240,246,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

const TECH_AREA_LABELS: Record<string, string> = {
  uc: "Unified Communications",
  security: "Security",
  network: "Network",
  datacenter: "Datacenter / IaaS",
  backup_dr: "Backup & DR",
  tem: "TEM",
  other: "Other",
};

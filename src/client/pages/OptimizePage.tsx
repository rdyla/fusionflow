import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type OptimizeAccount, type OptimizeEligible } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e",
  paused: "#f59e0b",
  churned: "#d13438",
};

export default function OptimizePage() {
  const [accounts, setAccounts] = useState<OptimizeAccount[]>([]);
  const [eligible, setEligible] = useState<OptimizeEligible[]>([]);
  const [loading, setLoading] = useState(true);
  const [graduating, setGraduating] = useState<string | null>(null);
  const [showGraduateModal, setShowGraduateModal] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    load();
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

  if (loading) return <div style={{ color: "rgba(240,246,255,0.5)", padding: 32 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Optimize</h1>
          <p style={{ color: "rgba(240,246,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>
            Post-implementation accounts — assessments, utilization &amp; roadmap
          </p>
        </div>
        {eligible.length > 0 && (
          <button className="ms-btn-primary" onClick={() => setShowGraduateModal(true)}>
            Graduate Project ({eligible.length})
          </button>
        )}
      </div>

      {accounts.length === 0 ? (
        <div className="ms-card" style={{ textAlign: "center", padding: "48px 24px", color: "rgba(240,246,255,0.4)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(240,246,255,0.7)", marginBottom: 8 }}>No Optimize accounts yet</div>
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
                    <div style={{ fontWeight: 600, color: "rgba(240,246,255,0.9)" }}>{a.project_name}</div>
                    {a.customer_name && (
                      <div style={{ fontSize: 11, color: "rgba(240,246,255,0.4)", marginTop: 2 }}>{a.customer_name}</div>
                    )}
                  </td>
                  <td style={{ color: "rgba(240,246,255,0.5)", fontSize: 12 }}>
                    {a.graduated_at ? a.graduated_at.slice(0, 10) : "—"}
                    <span style={{ marginLeft: 6, fontSize: 10, color: a.graduation_method === "auto" ? "#0b9aad" : "#8764b8", background: a.graduation_method === "auto" ? "rgba(11,154,173,0.1)" : "rgba(135,100,184,0.1)", padding: "1px 5px", borderRadius: 4, border: `1px solid ${a.graduation_method === "auto" ? "rgba(11,154,173,0.3)" : "rgba(135,100,184,0.3)"}` }}>
                      {a.graduation_method}
                    </span>
                  </td>
                  <td>
                    <span className="ms-badge" style={{ background: (STATUS_COLOR[a.optimize_status] ?? "#94a3b8") + "1a", color: STATUS_COLOR[a.optimize_status] ?? "#94a3b8", border: `1px solid ${(STATUS_COLOR[a.optimize_status] ?? "#94a3b8")}40` }}>
                      {a.optimize_status}
                    </span>
                  </td>
                  <td style={{ color: "rgba(240,246,255,0.6)", fontSize: 13 }}>{a.sa_name ?? "—"}</td>
                  <td style={{ color: "rgba(240,246,255,0.6)", fontSize: 13 }}>{a.csm_name ?? "—"}</td>
                  <td style={{ color: "rgba(240,246,255,0.5)", fontSize: 12 }}>{a.next_review_date ?? "—"}</td>
                  <td>
                    {a.last_assessment_score != null ? (
                      <span style={{ fontWeight: 700, fontSize: 16, color: a.last_assessment_score >= 7 ? "#22c55e" : a.last_assessment_score >= 4 ? "#f59e0b" : "#d13438" }}>
                        {a.last_assessment_score}<span style={{ fontSize: 11, fontWeight: 400, color: "rgba(240,246,255,0.35)" }}>/10</span>
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

      {/* Graduate Modal */}
      {showGraduateModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowGraduateModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 520 }}>
            <h2>Graduate to Optimize</h2>
            <p style={{ color: "rgba(240,246,255,0.6)", fontSize: 13, margin: "8px 0 16px" }}>
              These projects have all implementation phases completed and are eligible for the Optimize lifecycle.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {eligible.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(0,200,224,0.04)", border: "1px solid rgba(0,200,224,0.12)", borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "rgba(240,246,255,0.9)" }}>{p.name}</div>
                    {p.customer_name && <div style={{ fontSize: 12, color: "rgba(240,246,255,0.4)" }}>{p.customer_name}</div>}
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

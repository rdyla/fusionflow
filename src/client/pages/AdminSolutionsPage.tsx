import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Solution } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", assessment: "Needs Assessment", requirements: "Requirements",
  scope: "Scope of Work", handoff: "Handoff Ready", won: "Won", lost: "Lost",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "#94a3b8", assessment: "#0891b2", requirements: "#8764b8",
  scope: "#ff8c00", handoff: "#63c1ea", won: "#107c10", lost: "#d13438",
};

export default function AdminSolutionsPage() {
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api.solutions()
      .then(setSolutions)
      .catch(() => showToast("Failed to load solutions", "error"))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(s: Solution) {
    if (!window.confirm(`Permanently delete "${s.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteSolution(s.id);
      setSolutions((prev) => prev.filter((x) => x.id !== s.id));
      showToast("Solution deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete solution", "error");
    }
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading solutions...</div>;

  const active = solutions.filter((s) => s.status !== "won" && s.status !== "lost");
  const closed = solutions.filter((s) => s.status === "won" || s.status === "lost");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Solutions</h1>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          {active.length} active · {closed.length} closed
        </span>
      </div>

      <SolutionTable solutions={active} onDelete={handleDelete} onNavigate={(id) => navigate(`/solutions/${id}`)} />

      {closed.length > 0 && (
        <>
          <div style={{ margin: "28px 0 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8" }}>
            Won / Lost
          </div>
          <SolutionTable solutions={closed} onDelete={handleDelete} onNavigate={(id) => navigate(`/solutions/${id}`)} dimmed />
        </>
      )}
    </div>
  );
}

function SolutionTable({
  solutions, onDelete, onNavigate, dimmed,
}: {
  solutions: Solution[];
  onDelete: (s: Solution) => void;
  onNavigate: (id: string) => void;
  dimmed?: boolean;
}) {
  return (
    <div className="ms-card" style={{ overflow: "hidden", opacity: dimmed ? 0.65 : 1 }}>
      <table className="ms-table">
        <thead>
          <tr>
            <th>Customer / Solution</th>
            <th>Type</th>
            <th>Status</th>
            <th>PF AE</th>
            <th>Partner AE</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {solutions.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", color: "#64748b", padding: "28px 16px" }}>
                No solutions.
              </td>
            </tr>
          ) : (
            solutions.map((s) => (
              <tr key={s.id}>
                <td>
                  <div style={{ fontWeight: 500, color: "#1e293b" }}>{s.customer_name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.name}</div>
                </td>
                <td style={{ color: "#64748b", fontSize: 13 }}>{s.solution_type.toUpperCase()}</td>
                <td>
                  <span className="ms-badge" style={{ background: `${STATUS_COLOR[s.status]}1a`, color: STATUS_COLOR[s.status], border: `1px solid ${STATUS_COLOR[s.status]}40` }}>
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
                </td>
                <td style={{ color: "#64748b", fontSize: 13 }}>{s.pf_ae_name ?? "—"}</td>
                <td style={{ color: "#64748b", fontSize: 13 }}>{s.partner_ae_display_name ?? s.partner_ae_name ?? "—"}</td>
                <td style={{ color: "#94a3b8", fontSize: 12 }}>{s.updated_at?.slice(0, 10) ?? "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ms-btn-ghost" onClick={() => onNavigate(s.id)}>
                      View
                    </button>
                    <button
                      className="ms-btn-ghost"
                      onClick={() => onDelete(s)}
                      style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { csApi } from "../lib/cloudSupportApi";
import { fmt } from "../lib/calcSupport";
import type { CsProposal } from "../lib/calcSupport";
import { useToast } from "../components/ui/ToastProvider";

export default function CloudSupportPage() {
  const [proposals, setProposals] = useState<CsProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    csApi.list()
      .then(setProposals)
      .catch(() => showToast("Failed to load proposals", "error"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await csApi.create(newName.trim());
      setShowCreate(false);
      setNewName("");
      navigate(`/solutions/cloudsupport/${created.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create proposal", "error");
    } finally {
      setCreating(false);
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Solutions</h1>
          <div style={{ display: "flex", gap: 0, marginTop: 8, borderBottom: "1px solid #e2e8f0" }}>
            <Link
              to="/solutions"
              style={{ padding: "8px 18px", fontSize: 13, fontWeight: 400, color: "#64748b", borderBottom: "2px solid transparent", textDecoration: "none" }}
            >
              Implementation
            </Link>
            <span style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, color: "#03395f", borderBottom: "2px solid #03395f", cursor: "default" }}>
              Cloud Support
            </span>
          </div>
        </div>
        <button className="ms-btn-primary" onClick={() => setShowCreate(true)}>+ New Proposal</button>
      </div>

      {proposals.length === 0 ? (
        <div className="ms-card" style={{ padding: "48px 32px", textAlign: "center", color: "#94a3b8" }}>
          No proposals yet — create one to get started.
        </div>
      ) : (
        <div className="ms-card" style={{ overflow: "hidden" }}>
          <table className="ms-table">
            <thead>
              <tr>
                <th>Proposal Name</th>
                <th>Versions</th>
                <th>Annual Value</th>
                <th>TCV</th>
                <th>Created By</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/solutions/cloudsupport/${p.id}`)}>
                  <td>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>{p.name}</div>
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{p.versionCount}</td>
                  <td style={{ color: "#475569", fontSize: 13 }}>
                    {p.latestCalc ? fmt(p.latestCalc.annual) : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>
                    {p.latestCalc ? fmt(p.latestCalc.tcv) : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ color: "#94a3b8", fontSize: 12 }}>{p.creatorName}</td>
                  <td style={{ color: "#94a3b8", fontSize: 12 }}>{fmtDate(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setNewName(""); } }}>
          <div className="ms-modal" style={{ maxWidth: 420 }}>
            <h2>New Cloud Support Proposal</h2>
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 16, marginTop: 16 }}>
              <label className="ms-label">
                <span>Proposal Name *</span>
                <input
                  className="ms-input"
                  placeholder="e.g. Acme Corp MSO Proposal"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </label>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="ms-btn-ghost" onClick={() => { setShowCreate(false); setNewName(""); }}>Cancel</button>
                <button type="submit" className="ms-btn-primary" disabled={creating || !newName.trim()}>
                  {creating ? "Creating…" : "Create & Open"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

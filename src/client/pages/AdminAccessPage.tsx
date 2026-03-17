import { useEffect, useState } from "react";
import { api, type Project, type ProjectAccess, type User } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

export default function AdminAccessPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [accessList, setAccessList] = useState<ProjectAccess[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantForm, setGrantForm] = useState({ user_id: "", access_level: "viewer" });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    Promise.all([api.projects(), api.adminUsers()])
      .then(([p, u]) => {
        setProjects(p);
        setUsers(u);
        if (p.length > 0) setSelectedProjectId(p[0].id);
      })
      .catch(() => showToast("Failed to load data", "error"));
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setLoadingAccess(true);
    api.adminProjectAccess(selectedProjectId)
      .then(setAccessList)
      .catch(() => showToast("Failed to load access list", "error"))
      .finally(() => setLoadingAccess(false));
  }, [selectedProjectId]);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!grantForm.user_id || !selectedProjectId) return;
    setSaving(true);
    try {
      const entry = await api.adminGrantAccess(selectedProjectId, { user_id: grantForm.user_id, access_level: grantForm.access_level });
      setAccessList((prev) => [...prev, entry]);
      setShowGrantModal(false);
      setGrantForm({ user_id: "", access_level: "viewer" });
      showToast("Access granted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to grant access", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(userId: string, userName: string | null) {
    if (!selectedProjectId) return;
    if (!window.confirm(`Revoke access for ${userName ?? userId}?`)) return;
    try {
      await api.adminRevokeAccess(selectedProjectId, userId);
      setAccessList((prev) => prev.filter((a) => a.user_id !== userId));
      showToast("Access revoked.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to revoke access", "error");
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const grantableUsers = users.filter((u) => !accessList.some((a) => a.user_id === u.id));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Project Access</h1>
      </div>

      <div style={{ marginBottom: 20, maxWidth: 400 }}>
        <label className="ms-label">
          <span>Project</span>
          <select className="ms-input" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.customer_name ? ` — ${p.customer_name}` : ""}</option>
            ))}
          </select>
        </label>
      </div>

      {selectedProject && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: "rgba(240,246,255,0.5)" }}>
            Explicit access grants for <strong style={{ color: "rgba(240,246,255,0.9)" }}>{selectedProject.name}</strong>
          </span>
          <button className="ms-btn-primary" onClick={() => setShowGrantModal(true)} disabled={grantableUsers.length === 0}>
            + Grant Access
          </button>
        </div>
      )}

      <div className="ms-card" style={{ overflow: "hidden" }}>
        {loadingAccess ? (
          <div style={{ padding: 24, color: "rgba(240,246,255,0.5)", textAlign: "center" }}>Loading...</div>
        ) : (
          <table className="ms-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Organization</th>
                <th>Role</th>
                <th>Access Level</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accessList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "rgba(240,246,255,0.5)", padding: "28px 16px" }}>
                    No explicit access grants. Admins and assigned PM/AE always have access.
                  </td>
                </tr>
              ) : (
                accessList.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ fontWeight: 500 }}>{entry.name ?? "—"}</td>
                    <td>{entry.email}</td>
                    <td style={{ color: "rgba(240,246,255,0.5)" }}>{entry.organization_name ?? "—"}</td>
                    <td style={{ color: "rgba(240,246,255,0.5)" }}>{entry.role}</td>
                    <td>
                      <span
                        className="ms-badge"
                        style={
                          entry.access_level === "collaborator"
                            ? { background: "rgba(99,193,234,0.12)", color: "#63c1ea", border: "1px solid rgba(99,193,234,0.3)" }
                            : { background: "rgba(255,255,255,0.06)", color: "rgba(240,246,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }
                        }
                      >
                        {entry.access_level ?? "viewer"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="ms-btn-ghost"
                        onClick={() => handleRevoke(entry.user_id, entry.name)}
                        style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Grant Modal */}
      {showGrantModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowGrantModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 440 }}>
            <h2>Grant Access</h2>
            <form onSubmit={handleGrant} style={{ display: "grid", gap: 14 }}>
              <label className="ms-label">
                <span>User *</span>
                <select required className="ms-input" value={grantForm.user_id} onChange={(e) => setGrantForm({ ...grantForm, user_id: e.target.value })}>
                  <option value="">— Select a user —</option>
                  {grantableUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name ? `${u.name} (${u.email})` : u.email}</option>
                  ))}
                </select>
              </label>
              <label className="ms-label">
                <span>Access Level</span>
                <select className="ms-input" value={grantForm.access_level} onChange={(e) => setGrantForm({ ...grantForm, access_level: e.target.value })}>
                  <option value="viewer">Viewer</option>
                  <option value="collaborator">Collaborator</option>
                </select>
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={saving || !grantForm.user_id}>
                  {saving ? "Granting..." : "Grant Access"}
                </button>
                <button type="button" className="ms-btn-secondary" onClick={() => setShowGrantModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

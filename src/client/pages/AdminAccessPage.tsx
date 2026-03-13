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
    api
      .adminProjectAccess(selectedProjectId)
      .then(setAccessList)
      .catch(() => showToast("Failed to load access list", "error"))
      .finally(() => setLoadingAccess(false));
  }, [selectedProjectId]);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!grantForm.user_id || !selectedProjectId) return;
    setSaving(true);
    try {
      const entry = await api.adminGrantAccess(selectedProjectId, {
        user_id: grantForm.user_id,
        access_level: grantForm.access_level,
      });
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

  // Users not already in the access list
  const grantableUsers = users.filter((u) => !accessList.some((a) => a.user_id === u.id));

  return (
    <div>
      <h1 style={{ margin: "0 0 20px" }}>Project Access</h1>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "grid", gap: 6, maxWidth: 400 }}>
          <span style={{ fontSize: 13, color: "#b8c5e8", fontWeight: 600 }}>Project</span>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={inputStyle}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.customer_name ? ` — ${p.customer_name}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedProject && (
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 14, color: "#9fb0d9" }}>
              Showing explicit access grants for{" "}
              <strong style={{ color: "#eef3ff" }}>{selectedProject.name}</strong>
            </span>
          </div>
          <button onClick={() => setShowGrantModal(true)} style={primaryBtn} disabled={grantableUsers.length === 0}>
            + Grant Access
          </button>
        </div>
      )}

      <div style={tableCard}>
        {loadingAccess ? (
          <div style={{ padding: 24, color: "#9fb0d9", textAlign: "center" }}>Loading...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#182247" }}>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Organization</Th>
                <Th>Role</Th>
                <Th>Access Level</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {accessList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, color: "#9fb0d9", textAlign: "center" }}>
                    No explicit access grants. Admins and assigned PM/AE always have access.
                  </td>
                </tr>
              ) : (
                accessList.map((entry) => (
                  <tr key={entry.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <Td>{entry.name ?? "—"}</Td>
                    <Td>{entry.email}</Td>
                    <Td>{entry.organization_name ?? "—"}</Td>
                    <Td>{entry.role}</Td>
                    <Td>
                      <span style={accessBadge(entry.access_level)}>
                        {entry.access_level ?? "viewer"}
                      </span>
                    </Td>
                    <Td>
                      <button
                        onClick={() => handleRevoke(entry.user_id, entry.name)}
                        style={{ ...ghostBtn, color: "#ff6363", borderColor: "rgba(255,99,99,0.3)" }}
                      >
                        Revoke
                      </button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {showGrantModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowGrantModal(false); }}
        >
          <div
            style={{
              background: "#121935",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 480,
            }}
          >
            <h2 style={{ margin: "0 0 20px" }}>Grant Access</h2>
            <form onSubmit={handleGrant} style={{ display: "grid", gap: 14 }}>
              <FormField label="User *">
                <select
                  required
                  value={grantForm.user_id}
                  onChange={(e) => setGrantForm({ ...grantForm, user_id: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">— Select a user —</option>
                  {grantableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ? `${u.name} (${u.email})` : u.email}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Access Level">
                <select
                  value={grantForm.access_level}
                  onChange={(e) => setGrantForm({ ...grantForm, access_level: e.target.value })}
                  style={inputStyle}
                >
                  <option value="viewer">Viewer</option>
                  <option value="collaborator">Collaborator</option>
                </select>
              </FormField>
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button
                  type="submit"
                  disabled={saving || !grantForm.user_id}
                  style={{ ...primaryBtn, opacity: saving || !grantForm.user_id ? 0.6 : 1 }}
                >
                  {saving ? "Granting..." : "Grant Access"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGrantModal(false)}
                  style={secondaryBtn}
                >
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: 14, fontSize: 13, color: "#c8d4ff" }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: 14, color: "#eef3ff" }}>{children}</td>;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, color: "#b8c5e8", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function accessBadge(level: string | null): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 6,
    background: level === "collaborator" ? "rgba(99,179,237,0.15)" : "rgba(255,255,255,0.08)",
    color: level === "collaborator" ? "#63b3ed" : "#9fb0d9",
  };
}

const tableCard: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  overflow: "hidden",
  background: "#121935",
};

const primaryBtn: React.CSSProperties = {
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
};

const secondaryBtn: React.CSSProperties = {
  background: "#334155",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "#8db4ff",
  border: "1px solid rgba(141,180,255,0.3)",
  borderRadius: 8,
  padding: "5px 12px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#182247",
  color: "#eef3ff",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  boxSizing: "border-box",
};

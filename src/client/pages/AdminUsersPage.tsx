import { useEffect, useState } from "react";
import { api, type User } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const ROLES = ["admin", "pm", "pf_ae", "partner_ae"] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  pm: "Project Manager",
  pf_ae: "PF Account Executive",
  partner_ae: "Partner AE",
};

const EMPTY_CREATE_FORM = {
  email: "",
  name: "",
  organization_name: "",
  role: "pm" as Role,
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [editForm, setEditForm] = useState<Partial<User & { role: Role }>>({});
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const data = await api.adminUsers();
      setUsers(data);
    } catch {
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.email.trim()) return;
    setSaving(true);
    try {
      const created = await api.adminCreateUser({
        email: createForm.email.trim(),
        name: createForm.name.trim() || undefined,
        organization_name: createForm.organization_name.trim() || undefined,
        role: createForm.role,
      });
      setUsers((prev) => [...prev, created].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")));
      setShowCreateModal(false);
      setCreateForm(EMPTY_CREATE_FORM);
      showToast("User created.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create user", "error");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setEditForm({
      name: user.name ?? "",
      email: user.email,
      organization_name: user.organization_name ?? "",
      role: user.role as Role,
    });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    try {
      const updated = await api.adminUpdateUser(editingUser.id, {
        name: typeof editForm.name === "string" ? editForm.name.trim() || undefined : undefined,
        email: typeof editForm.email === "string" ? editForm.email.trim() || undefined : undefined,
        organization_name:
          typeof editForm.organization_name === "string"
            ? editForm.organization_name.trim() || undefined
            : undefined,
        role: editForm.role,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditingUser(null);
      showToast("User updated.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update user", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: User) {
    const next = user.is_active ? 0 : 1;
    try {
      const updated = await api.adminUpdateUser(user.id, { is_active: next });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      showToast(`User ${next ? "activated" : "deactivated"}.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update user", "error");
    }
  }

  if (loading) return <div>Loading users...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Users</h1>
        <button onClick={() => setShowCreateModal(true)} style={primaryBtn}>
          + New User
        </button>
      </div>

      <div style={tableCard}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#182247" }}>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Organization</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 24, color: "#9fb0d9", textAlign: "center" }}>
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <Td>{user.name ?? "—"}</Td>
                  <Td>{user.email}</Td>
                  <Td>{user.organization_name ?? "—"}</Td>
                  <Td>
                    <span style={roleBadge(user.role as Role)}>{ROLE_LABELS[user.role as Role] ?? user.role}</span>
                  </Td>
                  <Td>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: user.is_active ? "rgba(67,209,122,0.15)" : "rgba(255,99,99,0.15)",
                        color: user.is_active ? "#43d17a" : "#ff6363",
                      }}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => openEdit(user)} style={ghostBtn}>
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(user)}
                        style={{ ...ghostBtn, color: user.is_active ? "#ff6363" : "#43d17a" }}
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <Modal onClose={() => { setShowCreateModal(false); setCreateForm(EMPTY_CREATE_FORM); }}>
          <h2 style={{ margin: "0 0 20px" }}>New User</h2>
          <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
            <FormField label="Email *">
              <input
                autoFocus
                required
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                style={inputStyle}
                placeholder="user@example.com"
              />
            </FormField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <FormField label="Name">
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  style={inputStyle}
                  placeholder="Full name"
                />
              </FormField>
              <FormField label="Organization">
                <input
                  value={createForm.organization_name}
                  onChange={(e) => setCreateForm({ ...createForm, organization_name: e.target.value })}
                  style={inputStyle}
                  placeholder="Company name"
                />
              </FormField>
              <FormField label="Role *">
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })}
                  style={inputStyle}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </FormField>
            </div>
            <ModalActions>
              <button type="submit" disabled={saving || !createForm.email.trim()} style={primaryBtn}>
                {saving ? "Creating..." : "Create User"}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); setCreateForm(EMPTY_CREATE_FORM); }}
                style={secondaryBtn}
              >
                Cancel
              </button>
            </ModalActions>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <Modal onClose={() => setEditingUser(null)}>
          <h2 style={{ margin: "0 0 20px" }}>Edit User</h2>
          <form onSubmit={handleEdit} style={{ display: "grid", gap: 14 }}>
            <FormField label="Email *">
              <input
                required
                type="email"
                value={editForm.email ?? ""}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                style={inputStyle}
              />
            </FormField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <FormField label="Name">
                <input
                  value={editForm.name ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Organization">
                <input
                  value={editForm.organization_name ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, organization_name: e.target.value })}
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Role *">
                <select
                  value={editForm.role ?? "pm"}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                  style={inputStyle}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </FormField>
            </div>
            <ModalActions>
              <button type="submit" disabled={saving} style={primaryBtn}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button type="button" onClick={() => setEditingUser(null)} style={secondaryBtn}>
                Cancel
              </button>
            </ModalActions>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function ModalActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, marginTop: 6 }}>{children}</div>;
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#121935",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 560,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function roleBadge(role: Role): React.CSSProperties {
  const colors: Record<Role, { bg: string; color: string }> = {
    admin: { bg: "rgba(255,165,0,0.15)", color: "#ffa500" },
    pm: { bg: "rgba(99,179,237,0.15)", color: "#63b3ed" },
    pf_ae: { bg: "rgba(154,109,248,0.15)", color: "#9a6df8" },
    partner_ae: { bg: "rgba(67,209,122,0.15)", color: "#43d17a" },
  };
  const c = colors[role] ?? { bg: "rgba(255,255,255,0.1)", color: "#ddd" };
  return {
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 6,
    background: c.bg,
    color: c.color,
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

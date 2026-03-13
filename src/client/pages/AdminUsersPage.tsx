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

const ROLE_COLOR: Record<Role, string> = {
  admin: "#ff8c00",
  pm: "#0891b2",
  pf_ae: "#8764b8",
  partner_ae: "#107c10",
};

const EMPTY_CREATE_FORM = { email: "", name: "", organization_name: "", role: "pm" as Role };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [editForm, setEditForm] = useState<Partial<User & { role: Role }>>({});
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      setUsers(await api.adminUsers());
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
    setEditForm({ name: user.name ?? "", email: user.email, organization_name: user.organization_name ?? "", role: user.role as Role });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    try {
      const updated = await api.adminUpdateUser(editingUser.id, {
        name: typeof editForm.name === "string" ? editForm.name.trim() || undefined : undefined,
        email: typeof editForm.email === "string" ? editForm.email.trim() || undefined : undefined,
        organization_name: typeof editForm.organization_name === "string" ? editForm.organization_name.trim() || undefined : undefined,
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

  if (loading) return <div style={{ color: "rgba(240,246,255,0.5)", padding: 32 }}>Loading users...</div>;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Users</h1>
        <button className="ms-btn-primary" onClick={() => setShowCreateModal(true)}>+ New User</button>
      </div>

      <div className="ms-card" style={{ overflow: "hidden" }}>
        <table className="ms-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Organization</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "rgba(240,246,255,0.5)", padding: "28px 16px" }}>No users yet.</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 500 }}>{user.name ?? "—"}</td>
                  <td>{user.email}</td>
                  <td style={{ color: "rgba(240,246,255,0.5)" }}>{user.organization_name ?? "—"}</td>
                  <td>
                    <span
                      className="ms-badge"
                      style={{ background: (ROLE_COLOR[user.role as Role] ?? "#94a3b8") + "1a", color: ROLE_COLOR[user.role as Role] ?? "#94a3b8", border: `1px solid ${(ROLE_COLOR[user.role as Role] ?? "#94a3b8")}40` }}
                    >
                      {ROLE_LABELS[user.role as Role] ?? user.role}
                    </span>
                  </td>
                  <td>
                    <span
                      className="ms-badge"
                      style={{ background: user.is_active ? "#dff6dd" : "#fde7e9", color: user.is_active ? "#107c10" : "#d13438", border: `1px solid ${user.is_active ? "#107c10" : "#d13438"}40` }}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="ms-btn-ghost" onClick={() => openEdit(user)}>Edit</button>
                      <button
                        className="ms-btn-ghost"
                        onClick={() => toggleActive(user)}
                        style={{ color: user.is_active ? "#d13438" : "#107c10", borderColor: user.is_active ? "rgba(209,52,56,0.35)" : "rgba(16,124,16,0.35)" }}
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowCreateModal(false); setCreateForm(EMPTY_CREATE_FORM); } }}>
          <div className="ms-modal">
            <h2>New User</h2>
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
              <label className="ms-label">
                <span>Email *</span>
                <input autoFocus required type="email" className="ms-input" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="user@example.com" />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label className="ms-label">
                  <span>Name</span>
                  <input className="ms-input" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="Full name" />
                </label>
                <label className="ms-label">
                  <span>Organization</span>
                  <input className="ms-input" value={createForm.organization_name} onChange={(e) => setCreateForm({ ...createForm, organization_name: e.target.value })} placeholder="Company name" />
                </label>
                <label className="ms-label">
                  <span>Role *</span>
                  <select className="ms-input" value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={saving || !createForm.email.trim()}>
                  {saving ? "Creating..." : "Create User"}
                </button>
                <button type="button" className="ms-btn-secondary" onClick={() => { setShowCreateModal(false); setCreateForm(EMPTY_CREATE_FORM); }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingUser(null); }}>
          <div className="ms-modal">
            <h2>Edit User</h2>
            <form onSubmit={handleEdit} style={{ display: "grid", gap: 14 }}>
              <label className="ms-label">
                <span>Email *</span>
                <input required type="email" className="ms-input" value={editForm.email ?? ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label className="ms-label">
                  <span>Name</span>
                  <input className="ms-input" value={editForm.name ?? ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                </label>
                <label className="ms-label">
                  <span>Organization</span>
                  <input className="ms-input" value={editForm.organization_name ?? ""} onChange={(e) => setEditForm({ ...editForm, organization_name: e.target.value })} />
                </label>
                <label className="ms-label">
                  <span>Role *</span>
                  <select className="ms-input" value={editForm.role ?? "pm"} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
                <button type="button" className="ms-btn-secondary" onClick={() => setEditingUser(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

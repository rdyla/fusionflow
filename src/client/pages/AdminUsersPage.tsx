import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User, IMPERSONATE_KEY } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

// All known roles (for badge display)
const ROLES = ["admin", "executive", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "partner_ae", "client"] as const;
type Role = (typeof ROLES)[number];

// Roles available in the admin UI — clients are managed via CRM (vtx_portaluser)
const MANAGEABLE_ROLES = ["admin", "executive", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "partner_ae"] as const;

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  executive: "Executive",
  pm: "Project Manager",
  pf_ae: "PF Account Executive",
  pf_sa: "Solution Architect",
  pf_csm: "Customer Success Manager",
  pf_engineer: "Implementation Engineer",
  partner_ae: "Partner AE",
  client: "Client",
};

const ROLE_COLOR: Record<Role, string> = {
  admin: "#ff8c00",
  executive: "#b45309",
  pm: "#0891b2",
  pf_ae: "#8764b8",
  pf_sa: "#0b9aad",
  pf_csm: "#7c3aed",
  pf_engineer: "#059669",
  partner_ae: "#107c10",
  client: "#d97706",
};

const EMPTY_CREATE_FORM = { email: "", name: "", organization_name: "", role: "pm" as Role };


export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [editForm, setEditForm] = useState<Partial<User & { role: Role; manager_id: string | null }>>({});
  const [saving, setSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [openMenu, setOpenMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    if (openMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenu]);

  function toggleMenu(e: React.MouseEvent<HTMLButtonElement>, userId: string) {
    if (openMenu?.id === userId) { setOpenMenu(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenMenu({ id: userId, top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  useEffect(() => { loadUsers(); }, []);

  function handleViewAs(user: User) {
    localStorage.setItem(IMPERSONATE_KEY, user.email);
    navigate("/dashboard");
    window.location.reload();
  }

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
    setEditForm({
      name: user.name ?? "",
      email: user.email,
      organization_name: user.organization_name ?? "",
      role: user.role as Role,
      manager_id: user.manager_id ?? null,
      zoom_user_id: user.zoom_user_id ?? null,
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
        organization_name: typeof editForm.organization_name === "string" ? editForm.organization_name.trim() || undefined : undefined,
        role: editForm.role,
        manager_id: editForm.manager_id ?? null,
        zoom_user_id: typeof editForm.zoom_user_id === "string" ? editForm.zoom_user_id.trim() || null : null,
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

  async function handleDelete() {
    if (!deletingUser) return;
    try {
      await api.adminDeleteUser(deletingUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
      setDeletingUser(null);
      showToast("User deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete user", "error");
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

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading users...</div>;

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
              <tr><td colSpan={6} style={{ textAlign: "center", color: "#64748b", padding: "28px 16px" }}>No users yet.</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 500 }}>{user.name ?? "—"}</td>
                  <td>{user.email}</td>
                  <td style={{ color: "#64748b" }}>{user.organization_name ?? "—"}</td>
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
                    <button
                      onClick={(e) => toggleMenu(e, user.id)}
                      style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#64748b", cursor: "pointer", padding: "4px 8px", fontSize: 16, lineHeight: 1, letterSpacing: "0.05em" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.14)"; e.currentTarget.style.color = "#1e293b"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#64748b"; }}
                    >
                      ⋮
                    </button>
                    {openMenu?.id === user.id && (
                      <div ref={menuRef} style={{ position: "fixed", top: openMenu.top, right: openMenu.right, zIndex: 1000, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 0", minWidth: 160, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
                        <MenuItem onClick={() => { openEdit(user); setOpenMenu(null); }}>Edit</MenuItem>
                        <MenuItem
                          onClick={() => { toggleActive(user); setOpenMenu(null); }}
                          color={user.is_active ? "#d13438" : "#107c10"}
                        >
                          {user.is_active ? "Deactivate" : "Activate"}
                        </MenuItem>
                        {user.role !== "admin" && user.is_active && (
                          <MenuItem onClick={() => { handleViewAs(user); setOpenMenu(null); }} color="#ff8c00">
                            View As
                          </MenuItem>
                        )}
                        {user.role !== "admin" && (
                          <>
                            <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "4px 0" }} />
                            <MenuItem onClick={() => { setDeletingUser(user); setOpenMenu(null); }} color="#d13438">
                              Delete
                            </MenuItem>
                          </>
                        )}
                      </div>
                    )}
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
                    {MANAGEABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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

      {/* Delete Confirm */}
      {deletingUser && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeletingUser(null); }}>
          <div className="ms-modal" style={{ maxWidth: 420 }}>
            <h2 style={{ color: "#d13438" }}>Delete User</h2>
            <p style={{ color: "#475569", margin: "12px 0 20px" }}>
              Permanently delete <strong style={{ color: "#1e293b" }}>{deletingUser.name ?? deletingUser.email}</strong>? This removes them from all project access and cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="ms-btn-primary" style={{ background: "#d13438", borderColor: "#d13438" }} onClick={handleDelete}>Delete</button>
              <button className="ms-btn-secondary" onClick={() => setDeletingUser(null)}>Cancel</button>
            </div>
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
                    {MANAGEABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </label>
                {(editForm.role === "pf_ae" || editForm.role === "partner_ae") && (
                  <label className="ms-label">
                    <span>Reports to</span>
                    <select
                      className="ms-input"
                      value={editForm.manager_id ?? ""}
                      onChange={(e) => setEditForm({ ...editForm, manager_id: e.target.value || null })}
                    >
                      <option value="">— None —</option>
                      {users
                        .filter((u) =>
                          u.id !== editingUser?.id &&
                          (editingUser?.organization_name
                            ? u.organization_name === editingUser.organization_name
                            : true) &&
                          u.is_active
                        )
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name ?? u.email} ({ROLE_LABELS[u.role as Role] ?? u.role})
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
              <label className="ms-label">
                <span>Zoom User ID</span>
                <input
                  className="ms-input"
                  placeholder="e.g. aBcD1234EfGh"
                  value={editForm.zoom_user_id ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, zoom_user_id: e.target.value || null })}
                />
              </label>
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

function MenuItem({ onClick, color, children }: { onClick: () => void; color?: string; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block", width: "100%", textAlign: "left", background: hovered ? "#f1f5f9" : "none",
        border: "none", padding: "8px 14px", fontSize: 13, color: color ?? "#334155", cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

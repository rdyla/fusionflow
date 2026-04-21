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

const ORGS = ["Packet Fusion", "Zoom", "RingCentral"] as const;
type Org = (typeof ORGS)[number];

// Email domain → org auto-detection (mirrors server-side PARTNER_DOMAINS)
const ORG_DOMAINS: Record<string, Org> = {
  "packetfusion.com": "Packet Fusion",
  "zoom.com": "Zoom",
  "zoom.us": "Zoom",
  "ringcentral.com": "RingCentral",
};

const EMPTY_CREATE_FORM = { email: "", name: "", organization_name: "" as Org | "", role: "pm" as Role };

type CsPerm = "none" | "user" | "power_user";
const CS_PERM_LABELS: Record<CsPerm, string> = {
  none: "No Access",
  user: "User",
  power_user: "Power User",
};
const CS_PERM_COLOR: Record<CsPerm, string> = {
  none: "#94a3b8",
  user: "#0891b2",
  power_user: "#8764b8",
};

type OrgTab = "all" | Org;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgTab, setOrgTab] = useState<OrgTab>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [editForm, setEditForm] = useState<Partial<User & { role: Role; manager_id: string | null }>>({});
  const [saving, setSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [openMenu, setOpenMenu] = useState<{ id: string; top?: number; bottom?: number; right: number } | null>(null);
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
    // Flip menu upward if it would overflow the viewport bottom. 200px covers the tallest variant (4 items + divider + padding).
    const MENU_HEIGHT_ESTIMATE = 200;
    const flipUp = rect.bottom + MENU_HEIGHT_ESTIMATE + 8 > window.innerHeight;
    setOpenMenu({
      id: userId,
      top: flipUp ? undefined : rect.bottom + 4,
      bottom: flipUp ? window.innerHeight - rect.top + 4 : undefined,
      right: window.innerWidth - rect.right,
    });
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

  // Auto-detect org from email domain when creating a user
  function handleCreateEmailChange(email: string) {
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    const detected = ORG_DOMAINS[domain] ?? "";
    setCreateForm((prev) => ({
      ...prev,
      email,
      organization_name: detected || prev.organization_name,
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.email.trim()) return;
    setSaving(true);
    try {
      const created = await api.adminCreateUser({
        email: createForm.email.trim(),
        name: createForm.name.trim() || undefined,
        organization_name: createForm.organization_name || undefined,
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
      cs_permission: (user.cs_permission ?? "none") as CsPerm,
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
        cs_permission: editForm.role === "admin" ? undefined : (editForm.cs_permission as CsPerm | undefined),
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

  const tabCounts: Record<OrgTab, number> = {
    all: users.length,
    "Packet Fusion": users.filter((u) => u.organization_name === "Packet Fusion").length,
    Zoom: users.filter((u) => u.organization_name === "Zoom").length,
    RingCentral: users.filter((u) => u.organization_name === "RingCentral").length,
  };

  const visibleUsers =
    orgTab === "all" ? users : users.filter((u) => u.organization_name === orgTab);

  const ROLE_ORDER: Role[] = ["admin", "executive", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "partner_ae", "client"];

  // Packet Fusion + All tabs: group by role
  const roleGrouped: { label: string; color: string; users: User[] }[] = ROLE_ORDER
    .map((role) => ({
      label: `${ROLE_LABELS[role]}`,
      color: ROLE_COLOR[role] ?? "#94a3b8",
      users: visibleUsers
        .filter((u) => u.role === role)
        .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email)),
    }))
    .filter((g) => g.users.length > 0);

  // Partner tabs (Zoom, RingCentral, etc.): group by manager (reports to)
  const userById = Object.fromEntries(users.map((u) => [u.id, u]));
  const managerIds = Array.from(new Set(visibleUsers.map((u) => u.manager_id ?? null)));
  // Sort: managers with names first (alphabetically), then unassigned last
  const sortedManagerIds = [
    ...managerIds
      .filter((id) => id !== null && userById[id!])
      .sort((a, b) => (userById[a!]?.name ?? "").localeCompare(userById[b!]?.name ?? "")),
    null,
  ];
  const managerGrouped: { label: string; color: string; users: User[] }[] = sortedManagerIds
    .map((managerId) => ({
      label: managerId && userById[managerId]
        ? `Reports to: ${userById[managerId].name ?? userById[managerId].email}`
        : "Unassigned",
      color: managerId ? "#107c10" : "#94a3b8",
      users: visibleUsers
        .filter((u) => (u.manager_id ?? null) === managerId)
        .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email)),
    }))
    .filter((g) => g.users.length > 0);

  const isPartnerTab = orgTab !== "all" && orgTab !== "Packet Fusion";
  const groupedUsers = isPartnerTab ? managerGrouped : roleGrouped;

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading users...</div>;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Users</h1>
        <button className="ms-btn-primary" onClick={() => setShowCreateModal(true)}>+ New User</button>
      </div>

      {/* Org tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", marginBottom: 20 }}>
        {(["all", ...ORGS] as OrgTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setOrgTab(tab)}
            style={{
              padding: "9px 18px", fontSize: 13, fontWeight: orgTab === tab ? 600 : 400,
              border: "none", borderBottom: `2px solid ${orgTab === tab ? "#03395f" : "transparent"}`,
              background: "none", color: orgTab === tab ? "#03395f" : "#64748b",
              cursor: "pointer", transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {tab === "all" ? "All" : tab}
            <span style={{
              fontSize: 11, fontWeight: 600,
              background: orgTab === tab ? "#03395f" : "#f1f5f9",
              color: orgTab === tab ? "#fff" : "#64748b",
              borderRadius: 10, padding: "1px 7px", minWidth: 20, textAlign: "center",
            }}>
              {tabCounts[tab]}
            </span>
          </button>
        ))}
      </div>

      <div className="ms-card" style={{ overflow: "hidden" }}>
        <table className="ms-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              {orgTab === "all" && <th>Organization</th>}
              <th>Role</th>
              <th>Cloud Support</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.length === 0 ? (
              <tr><td colSpan={orgTab === "all" ? 7 : 6} style={{ textAlign: "center", color: "#64748b", padding: "28px 16px" }}>No users in this org.</td></tr>
            ) : (
              groupedUsers.flatMap(({ label, color, users: groupUsers }) => [
                <tr key={`group-${label}`}>
                  <td
                    colSpan={orgTab === "all" ? 7 : 6}
                    style={{
                      padding: "6px 16px", fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.1em", textTransform: "uppercase",
                      color: color,
                      background: color + "0d",
                      borderBottom: `1px solid ${color}25`,
                    }}
                  >
                    {label} · {groupUsers.length}
                  </td>
                </tr>,
                ...groupUsers.map((user) => {
                  const perm = (user.cs_permission ?? "none") as CsPerm;
                  const effectivePerm = user.role === "admin" ? "power_user" : perm;
                  return (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 500 }}>{user.name ?? "—"}</td>
                    <td>{user.email}</td>
                    {orgTab === "all" && <td style={{ color: "#64748b" }}>{user.organization_name ?? "—"}</td>}
                    <td>
                      <span
                        className="ms-badge"
                        style={{ background: (ROLE_COLOR[user.role as Role] ?? "#94a3b8") + "1a", color: ROLE_COLOR[user.role as Role] ?? "#94a3b8", border: `1px solid ${(ROLE_COLOR[user.role as Role] ?? "#94a3b8")}40` }}
                      >
                        {ROLE_LABELS[user.role as Role] ?? user.role}
                      </span>
                    </td>
                    <td>
                      {user.role === "partner_ae" ? (
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                      ) : effectivePerm === "none" ? (
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                      ) : (
                        <span
                          className="ms-badge"
                          style={{ background: CS_PERM_COLOR[effectivePerm] + "1a", color: CS_PERM_COLOR[effectivePerm], border: `1px solid ${CS_PERM_COLOR[effectivePerm]}40` }}
                        >
                          {user.role === "admin" ? "Admin" : CS_PERM_LABELS[effectivePerm]}
                        </span>
                      )}
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
                        <div ref={menuRef} style={{ position: "fixed", top: openMenu.top, bottom: openMenu.bottom, right: openMenu.right, zIndex: 1000, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 0", minWidth: 160, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
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
                  );
                })
              ])
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
                <input
                  autoFocus required type="email" className="ms-input"
                  value={createForm.email}
                  onChange={(e) => handleCreateEmailChange(e.target.value)}
                  placeholder="user@example.com"
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label className="ms-label">
                  <span>Name</span>
                  <input className="ms-input" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="Full name" />
                </label>
                <label className="ms-label">
                  <span>Organization</span>
                  <select
                    className="ms-input"
                    value={createForm.organization_name}
                    onChange={(e) => setCreateForm({ ...createForm, organization_name: e.target.value as Org | "" })}
                  >
                    <option value="">— Select org —</option>
                    {ORGS.map((org) => <option key={org} value={org}>{org}</option>)}
                  </select>
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
                  <select
                    className="ms-input"
                    value={ORGS.includes(editForm.organization_name as Org) ? (editForm.organization_name ?? "") : ""}
                    onChange={(e) => setEditForm({ ...editForm, organization_name: e.target.value })}
                  >
                    <option value="">— Select org —</option>
                    {ORGS.map((org) => <option key={org} value={org}>{org}</option>)}
                  </select>
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

              {/* Cloud Support Calculator permission */}
              {editForm.role !== "partner_ae" && (
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px", background: "#f8fafc" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#03395f", marginBottom: 10 }}>Cloud Support Calculator</div>
                  {editForm.role === "admin" ? (
                    <div style={{ fontSize: 13, color: "#8764b8" }}>Admin role always has full access.</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                      {(["none", "user", "power_user"] as CsPerm[]).map((p) => {
                        const active = (editForm.cs_permission ?? "none") === p;
                        const descriptions: Record<CsPerm, string> = {
                          none: "No access to the calculator",
                          user: "Create & manage own proposals",
                          power_user: "View and manage all proposals",
                        };
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setEditForm({ ...editForm, cs_permission: p })}
                            style={{
                              padding: "10px 12px", borderRadius: 6, textAlign: "left", cursor: "pointer",
                              border: `1.5px solid ${active ? CS_PERM_COLOR[p] : "#e2e8f0"}`,
                              background: active ? CS_PERM_COLOR[p] + "15" : "#fff",
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 600, color: active ? CS_PERM_COLOR[p] : "#1e293b", marginBottom: 3 }}>{CS_PERM_LABELS[p]}</div>
                            <div style={{ fontSize: 11, color: active ? CS_PERM_COLOR[p] : "#94a3b8", lineHeight: 1.4 }}>{descriptions[p]}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

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

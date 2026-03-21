import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type OptimizeAccount, type User } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  paused: "#f59e0b",
  churned: "#d13438",
};

const GRADUATION_LABELS: Record<string, string> = {
  auto: "Auto",
  manual: "Manual",
  direct: "Direct",
};

const HEALTH_COLORS: Record<string, string> = {
  at_risk: "#d13438",
  limited_value: "#f59e0b",
  emerging_value: "#0b9aad",
  realized_value: "#22c55e",
};

function getHealthBand(score: number): string {
  if (score >= 80) return "realized_value";
  if (score >= 60) return "emerging_value";
  if (score >= 40) return "limited_value";
  return "at_risk";
}

type EditForm = {
  optimize_status: "active" | "paused" | "churned";
  sa_user_id: string;
  csm_user_id: string;
  next_review_date: string;
  notes: string;
};

export default function AdminOptimizePage() {
  const [accounts, setAccounts] = useState<OptimizeAccount[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAccount, setEditingAccount] = useState<OptimizeAccount | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ optimize_status: "active", sa_user_id: "", csm_user_id: "", next_review_date: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [accs, usrs] = await Promise.all([api.optimizeAccounts(), api.users()]);
      setAccounts(accs);
      setUsers(usrs.filter((u) => ["admin", "pm", "pf_sa", "pf_csm"].includes(u.role)));
    } catch {
      showToast("Failed to load optimize accounts", "error");
    } finally {
      setLoading(false);
    }
  }

  function openEdit(account: OptimizeAccount) {
    setEditingAccount(account);
    setEditForm({
      optimize_status: account.optimize_status,
      sa_user_id: account.sa_user_id ?? "",
      csm_user_id: account.csm_user_id ?? "",
      next_review_date: account.next_review_date ?? "",
      notes: account.notes ?? "",
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAccount) return;
    setSaving(true);
    try {
      await api.optimizeUpdateAccount(editingAccount.project_id, {
        optimize_status: editForm.optimize_status,
        sa_user_id: editForm.sa_user_id || null,
        csm_user_id: editForm.csm_user_id || null,
        next_review_date: editForm.next_review_date || null,
        notes: editForm.notes || null,
      });
      await loadData();
      setEditingAccount(null);
      showToast("Account updated.", "success");
    } catch {
      showToast("Failed to update account", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(account: OptimizeAccount) {
    if (!window.confirm(`Remove "${account.project_name}" from Optimize? This will de-graduate the account but not delete the underlying project.`)) return;
    try {
      await api.optimizeDeleteAccount(account.project_id);
      setAccounts((prev) => prev.filter((a) => a.project_id !== account.project_id));
      showToast("Account removed from Optimize.", "success");
    } catch {
      showToast("Failed to remove account", "error");
    }
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading...</div>;

  const active = accounts.filter((a) => a.optimize_status !== "churned");
  const churned = accounts.filter((a) => a.optimize_status === "churned");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Optimize Accounts</h1>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          {active.length} active · {churned.length} churned
        </span>
      </div>

      <AccountTable
        accounts={active}
        users={users}
        onEdit={openEdit}
        onRemove={handleRemove}
        onNavigate={(pid) => navigate(`/optimize/${pid}`)}
      />

      {churned.length > 0 && (
        <>
          <div style={{ margin: "28px 0 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8" }}>
            Churned
          </div>
          <AccountTable
            accounts={churned}
            users={users}
            onEdit={openEdit}
            onRemove={handleRemove}
            onNavigate={(pid) => navigate(`/optimize/${pid}`)}
            dimmed
          />
        </>
      )}

      {/* Edit modal */}
      {editingAccount && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingAccount(null); }}>
          <div className="ms-modal" style={{ maxWidth: 520 }}>
            <h2 style={{ marginBottom: 4 }}>{editingAccount.project_name}</h2>
            {editingAccount.customer_name && (
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>{editingAccount.customer_name}</div>
            )}
            <form onSubmit={handleSaveEdit} style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label className="ms-label">
                  <span>Status</span>
                  <select className="ms-input" value={editForm.optimize_status} onChange={(e) => setEditForm({ ...editForm, optimize_status: e.target.value as EditForm["optimize_status"] })}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="churned">Churned</option>
                  </select>
                </label>
                <label className="ms-label">
                  <span>Next Review</span>
                  <input type="date" className="ms-input" value={editForm.next_review_date} onChange={(e) => setEditForm({ ...editForm, next_review_date: e.target.value })} />
                </label>
                <label className="ms-label">
                  <span>SA</span>
                  <select className="ms-input" value={editForm.sa_user_id} onChange={(e) => setEditForm({ ...editForm, sa_user_id: e.target.value })}>
                    <option value="">— None —</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                  </select>
                </label>
                <label className="ms-label">
                  <span>CSM</span>
                  <select className="ms-input" value={editForm.csm_user_id} onChange={(e) => setEditForm({ ...editForm, csm_user_id: e.target.value })}>
                    <option value="">— None —</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                  </select>
                </label>
              </div>
              <label className="ms-label">
                <span>Notes</span>
                <textarea className="ms-input" rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} style={{ resize: "vertical" }} />
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" className="ms-btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                <button type="button" className="ms-btn-secondary" onClick={() => setEditingAccount(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountTable({
  accounts,
  onEdit,
  onRemove,
  onNavigate,
  dimmed,
}: {
  accounts: OptimizeAccount[];
  users: User[];
  onEdit: (a: OptimizeAccount) => void;
  onRemove: (a: OptimizeAccount) => void;
  onNavigate: (projectId: string) => void;
  dimmed?: boolean;
}) {
  return (
    <div className="ms-card" style={{ overflow: "hidden", opacity: dimmed ? 0.6 : 1 }}>
      <table className="ms-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Customer</th>
            <th>Status</th>
            <th>SA</th>
            <th>CSM</th>
            <th>Last Score</th>
            <th>Next Review</th>
            <th>Graduated</th>
            <th>Method</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accounts.length === 0 ? (
            <tr>
              <td colSpan={10} style={{ textAlign: "center", color: "#64748b", padding: "28px 16px" }}>No accounts.</td>
            </tr>
          ) : (
            accounts.map((a) => {
              const scoreColor = a.last_assessment_score != null
                ? HEALTH_COLORS[getHealthBand(a.last_assessment_score)]
                : "#94a3b8";
              return (
                <tr key={a.project_id}>
                  <td>
                    <button
                      onClick={() => onNavigate(a.project_id)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#0b9aad", fontWeight: 600, fontSize: 13, textAlign: "left" }}
                    >
                      {a.project_name}
                    </button>
                  </td>
                  <td style={{ color: "#64748b" }}>{a.customer_name ?? "—"}</td>
                  <td>
                    <span className="ms-badge" style={{ background: `${STATUS_COLORS[a.optimize_status]}1a`, color: STATUS_COLORS[a.optimize_status], border: `1px solid ${STATUS_COLORS[a.optimize_status]}40`, textTransform: "capitalize" }}>
                      {a.optimize_status}
                    </span>
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{a.sa_name ?? "—"}</td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{a.csm_name ?? "—"}</td>
                  <td style={{ fontWeight: 700, color: scoreColor }}>{a.last_assessment_score != null ? a.last_assessment_score : "—"}</td>
                  <td style={{ color: "#64748b", fontSize: 12 }}>{a.next_review_date ?? "—"}</td>
                  <td style={{ color: "#94a3b8", fontSize: 12 }}>{a.graduated_at?.slice(0, 10) ?? "—"}</td>
                  <td>
                    {a.graduation_method && (
                      <span className="ms-badge" style={{ background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" }}>
                        {GRADUATION_LABELS[a.graduation_method] ?? a.graduation_method}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="ms-btn-ghost" onClick={() => onEdit(a)}>Edit</button>
                      <button className="ms-btn-ghost" onClick={() => onRemove(a)} style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}>Remove</button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

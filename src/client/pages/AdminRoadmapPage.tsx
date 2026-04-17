import { useEffect, useState } from "react";
import { api, type FeatureRequest, type FeatureCategory, type FeatureStatus, type FeaturePriority } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const STATUSES: FeatureStatus[] = ["submitted", "under_review", "planned", "in_progress", "released", "declined"];

const STATUS_LABELS: Record<FeatureStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  planned: "Planned",
  in_progress: "In Progress",
  released: "Released",
  declined: "Declined",
};

const STATUS_COLOR: Record<FeatureStatus, string> = {
  submitted: "#94a3b8",
  under_review: "#ff8c00",
  planned: "#0891b2",
  in_progress: "#7c3aed",
  released: "#107c10",
  declined: "#d13438",
};

const PRIORITY_LABELS: Record<FeaturePriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_COLOR: Record<FeaturePriority, string> = {
  critical: "#d13438",
  high: "#ff8c00",
  medium: "#0891b2",
  low: "#94a3b8",
};

const PRIORITIES: FeaturePriority[] = ["critical", "high", "medium", "low"];

const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  ui_ux: "UI / UX",
  performance: "Performance",
  integration: "Integration",
  reporting: "Reporting",
  security: "Security",
  other: "Other",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FeatureCategory[];

const STATUS_ORDER = STATUSES;

function nextStatus(s: FeatureStatus): FeatureStatus | null {
  const idx = STATUS_ORDER.indexOf(s);
  if (idx < 0 || idx >= STATUS_ORDER.length - 2) return null; // declined is terminal
  const next = STATUS_ORDER[idx + 1];
  if (next === "declined") return null;
  return next;
}

function prevStatus(s: FeatureStatus): FeatureStatus | null {
  const idx = STATUS_ORDER.indexOf(s);
  if (idx <= 0) return null;
  const prev = STATUS_ORDER[idx - 1];
  if (prev === "declined") return null;
  return prev;
}

const EMPTY_FORM = { title: "", description: "", category: "" as FeatureCategory | "", admin_notes: "" };

export default function AdminRoadmapPage() {
  const [items, setItems] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<FeatureRequest | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState<{
    title: string; description: string; status: FeatureStatus; priority: FeaturePriority;
    category: FeatureCategory | ""; admin_notes: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingItem, setDeletingItem] = useState<FeatureRequest | null>(null);
  const [showDeclined, setShowDeclined] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    api.featureRequests()
      .then(setItems)
      .catch(() => showToast("Failed to load feature requests", "error"))
      .finally(() => setLoading(false));
  }, []);

  function openEdit(item: FeatureRequest) {
    setEditingItem(item);
    setEditForm({
      title: item.title,
      description: item.description ?? "",
      status: item.status,
      priority: item.priority,
      category: item.category ?? "",
      admin_notes: item.admin_notes ?? "",
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.title.trim()) return;
    setSaving(true);
    try {
      const created = await api.createFeatureRequest({
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        category: createForm.category || undefined,
      });
      setItems((prev) => [created, ...prev]);
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      showToast("Feature request created.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem || !editForm) return;
    setSaving(true);
    try {
      await api.updateFeatureRequest(editingItem.id, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        status: editForm.status,
        priority: editForm.priority,
        category: editForm.category || null,
        admin_notes: editForm.admin_notes.trim() || null,
      });
      setItems((prev) =>
        prev.map((r) =>
          r.id === editingItem.id
            ? {
                ...r,
                title: editForm.title.trim(),
                description: editForm.description.trim() || null,
                status: editForm.status,
                priority: editForm.priority,
                category: (editForm.category || null) as FeatureCategory | null,
                admin_notes: editForm.admin_notes.trim() || null,
              }
            : r
        )
      );
      setEditingItem(null);
      showToast("Updated.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update", "error");
    } finally {
      setSaving(false);
    }
  }

  async function moveItem(item: FeatureRequest, targetStatus: FeatureStatus) {
    const prev = items;
    setItems((all) => all.map((r) => r.id === item.id ? { ...r, status: targetStatus } : r));
    try {
      await api.updateFeatureRequest(item.id, { status: targetStatus });
    } catch {
      setItems(prev);
      showToast("Failed to move item", "error");
    }
  }

  async function handleDelete() {
    if (!deletingItem) return;
    try {
      await api.deleteFeatureRequest(deletingItem.id);
      setItems((prev) => prev.filter((r) => r.id !== deletingItem.id));
      setDeletingItem(null);
      setEditingItem(null);
      showToast("Deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete", "error");
    }
  }

  const visibleStatuses = showDeclined ? STATUSES : STATUSES.filter((s) => s !== "declined");
  const byStatus = (status: FeatureStatus) => items.filter((r) => r.status === status);

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading roadmap...</div>;

  return (
    <div style={{ maxWidth: "100%" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Roadmap</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            className="ms-btn-secondary"
            style={{ fontSize: 12 }}
            onClick={() => setShowDeclined((v) => !v)}
          >
            {showDeclined ? "Hide Declined" : "Show Declined"}
          </button>
          <button className="ms-btn-primary" onClick={() => setShowCreate(true)}>+ New Request</button>
        </div>
      </div>

      {/* Kanban board */}
      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 16, alignItems: "flex-start" }}>
        {visibleStatuses.map((status) => {
          const col = byStatus(status);
          return (
            <div key={status} style={{ flexShrink: 0, width: 290 }}>
              {/* Column header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px",
                background: STATUS_COLOR[status] + "15",
                borderRadius: "8px 8px 0 0",
                borderBottom: `2px solid ${STATUS_COLOR[status]}`,
                marginBottom: 8,
              }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: STATUS_COLOR[status] }}>
                  {STATUS_LABELS[status]}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, background: STATUS_COLOR[status], color: "#fff",
                  borderRadius: 10, padding: "1px 8px",
                }}>
                  {col.length}
                </span>
              </div>

              {/* Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {col.length === 0 && (
                  <div style={{ textAlign: "center", color: "#cbd5e1", fontSize: 12, padding: "20px 0" }}>
                    No items
                  </div>
                )}
                {col.map((item) => {
                  const prev = prevStatus(item.status);
                  const next = nextStatus(item.status);
                  return (
                    <div
                      key={item.id}
                      style={{
                        background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
                        padding: "12px 14px", cursor: "pointer",
                        transition: "box-shadow 0.15s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.09)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
                      onClick={() => openEdit(item)}
                    >
                      {/* Priority + category row */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                        <span
                          className="ms-badge"
                          style={{
                            fontSize: 10, background: PRIORITY_COLOR[item.priority] + "18",
                            color: PRIORITY_COLOR[item.priority], border: `1px solid ${PRIORITY_COLOR[item.priority]}35`,
                          }}
                        >
                          {PRIORITY_LABELS[item.priority]}
                        </span>
                        {item.category && (
                          <span className="ms-badge" style={{ fontSize: 10, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" }}>
                            {CATEGORY_LABELS[item.category]}
                          </span>
                        )}
                      </div>

                      <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", marginBottom: 4, lineHeight: 1.35 }}>
                        {item.title}
                      </div>

                      {item.description && (
                        <div style={{
                          fontSize: 12, color: "#64748b", lineHeight: 1.4, marginBottom: 8,
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                        }}>
                          {item.description}
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                        {/* Vote count */}
                        <span style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12 }}>
                            <polyline points="18 15 12 9 6 15"/>
                          </svg>
                          {item.vote_count}
                        </span>

                        {/* Move buttons */}
                        <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                          {prev && (
                            <button
                              type="button"
                              title={`Move to ${STATUS_LABELS[prev]}`}
                              onClick={() => moveItem(item, prev)}
                              style={{
                                background: "none", border: "1px solid #e2e8f0", borderRadius: 4,
                                padding: "2px 6px", cursor: "pointer", fontSize: 11, color: "#64748b",
                              }}
                            >
                              ←
                            </button>
                          )}
                          {next && (
                            <button
                              type="button"
                              title={`Move to ${STATUS_LABELS[next]}`}
                              onClick={() => moveItem(item, next)}
                              style={{
                                background: "none", border: "1px solid #e2e8f0", borderRadius: 4,
                                padding: "2px 6px", cursor: "pointer", fontSize: 11, color: "#64748b",
                              }}
                            >
                              →
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Submitter */}
                      <div style={{ fontSize: 10, color: "#cbd5e1", marginTop: 6 }}>
                        {item.submitter_name ?? item.submitter_email ?? "Unknown"} · {new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setCreateForm(EMPTY_FORM); } }}>
          <div className="ms-modal">
            <h2>New Feature Request</h2>
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 14, marginTop: 4 }}>
              <label className="ms-label">
                <span>Title *</span>
                <input autoFocus required className="ms-input" value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} placeholder="Feature title..." />
              </label>
              <label className="ms-label">
                <span>Description</span>
                <textarea className="ms-input" rows={3} value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} style={{ resize: "vertical" }} />
              </label>
              <label className="ms-label">
                <span>Category</span>
                <select className="ms-input" value={createForm.category} onChange={(e) => setCreateForm({ ...createForm, category: e.target.value as FeatureCategory | "" })}>
                  <option value="">— Select —</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" className="ms-btn-primary" disabled={saving || !createForm.title.trim()}>{saving ? "Creating..." : "Create"}</button>
                <button type="button" className="ms-btn-secondary" onClick={() => { setShowCreate(false); setCreateForm(EMPTY_FORM); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingItem && editForm && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingItem(null); }}>
          <div className="ms-modal" style={{ maxWidth: 560 }}>
            <h2>Edit Request</h2>

            {/* Status selector */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 16px" }}>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, status: s })}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                    border: `1.5px solid ${editForm.status === s ? STATUS_COLOR[s] : "#e2e8f0"}`,
                    background: editForm.status === s ? STATUS_COLOR[s] + "20" : "#fff",
                    color: editForm.status === s ? STATUS_COLOR[s] : "#64748b",
                    fontWeight: editForm.status === s ? 700 : 400,
                  }}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            <form onSubmit={handleEdit} style={{ display: "grid", gap: 14 }}>
              <label className="ms-label">
                <span>Title *</span>
                <input required className="ms-input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </label>
              <label className="ms-label">
                <span>Description</span>
                <textarea className="ms-input" rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} style={{ resize: "vertical" }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label className="ms-label">
                  <span>Priority</span>
                  <select className="ms-input" value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as FeaturePriority })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                  </select>
                </label>
                <label className="ms-label">
                  <span>Category</span>
                  <select className="ms-input" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value as FeatureCategory | "" })}>
                    <option value="">— None —</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </label>
              </div>
              <label className="ms-label">
                <span>Internal Notes</span>
                <textarea
                  className="ms-input" rows={2}
                  placeholder="Visible to admins only..."
                  value={editForm.admin_notes}
                  onChange={(e) => setEditForm({ ...editForm, admin_notes: e.target.value })}
                  style={{ resize: "vertical" }}
                />
              </label>

              <div style={{ display: "flex", gap: 10, marginTop: 4, justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="submit" className="ms-btn-primary" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
                  <button type="button" className="ms-btn-secondary" onClick={() => setEditingItem(null)}>Cancel</button>
                </div>
                <button
                  type="button"
                  style={{ background: "none", border: "1px solid #d13438", borderRadius: 6, color: "#d13438", padding: "6px 14px", cursor: "pointer", fontSize: 13 }}
                  onClick={() => setDeletingItem(editingItem)}
                >
                  Delete
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deletingItem && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeletingItem(null); }}>
          <div className="ms-modal" style={{ maxWidth: 420 }}>
            <h2 style={{ color: "#d13438" }}>Delete Request</h2>
            <p style={{ color: "#475569", margin: "12px 0 20px" }}>
              Permanently delete <strong style={{ color: "#1e293b" }}>{deletingItem.title}</strong>? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="ms-btn-primary" style={{ background: "#d13438", borderColor: "#d13438" }} onClick={handleDelete}>Delete</button>
              <button className="ms-btn-secondary" onClick={() => setDeletingItem(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

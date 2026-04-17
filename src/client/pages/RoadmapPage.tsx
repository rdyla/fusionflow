import { useEffect, useState } from "react";
import { api, type FeatureRequest, type FeatureCategory, type FeatureStatus } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

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

const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  ui_ux: "UI / UX",
  performance: "Performance",
  integration: "Integration",
  reporting: "Reporting",
  security: "Security",
  other: "Other",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FeatureCategory[];

type TabFilter = "all" | FeatureStatus;

const VISIBLE_TABS: { key: TabFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under Review" },
  { key: "planned", label: "Planned" },
  { key: "in_progress", label: "In Progress" },
  { key: "released", label: "Released" },
];

export default function RoadmapPage() {
  const [items, setItems] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("all");
  const [showSubmit, setShowSubmit] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "" as FeatureCategory | "" });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    api.featureRequests()
      .then(setItems)
      .catch(() => showToast("Failed to load roadmap", "error"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const created = await api.createFeatureRequest({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category || undefined,
      });
      setItems((prev) => [created, ...prev]);
      setShowSubmit(false);
      setForm({ title: "", description: "", category: "" });
      showToast("Feature request submitted!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to submit", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleVote(item: FeatureRequest) {
    const prevItems = items;
    const voted = !item.user_has_voted;
    setItems((prev) =>
      prev.map((r) =>
        r.id === item.id
          ? { ...r, user_has_voted: voted ? 1 : 0, vote_count: r.vote_count + (voted ? 1 : -1) }
          : r
      )
    );
    try {
      await api.toggleFeatureVote(item.id);
    } catch {
      setItems(prevItems);
      showToast("Failed to update vote", "error");
    }
  }

  const visible = tab === "all" ? items : items.filter((r) => r.status === tab);

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading roadmap...</div>;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Product Roadmap</h1>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>
            Vote on existing requests or submit your own — we review everything.
          </p>
        </div>
        <button className="ms-btn-primary" onClick={() => setShowSubmit(true)}>+ Submit Request</button>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", marginBottom: 24, flexWrap: "wrap" }}>
        {VISIBLE_TABS.map(({ key, label }) => {
          const count = key === "all" ? items.length : items.filter((r) => r.status === key).length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                padding: "9px 16px", fontSize: 13, fontWeight: tab === key ? 600 : 400,
                border: "none", borderBottom: `2px solid ${tab === key ? "#03395f" : "transparent"}`,
                background: "none", color: tab === key ? "#03395f" : "#64748b",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {label}
              <span style={{
                fontSize: 11, fontWeight: 600,
                background: tab === key ? "#03395f" : "#f1f5f9",
                color: tab === key ? "#fff" : "#64748b",
                borderRadius: 10, padding: "1px 7px",
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: "48px 0" }}>
          No feature requests here yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {visible.map((item) => (
            <div
              key={item.id}
              className="ms-card"
              style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 16 }}
            >
              {/* Vote button */}
              <button
                type="button"
                onClick={() => handleVote(item)}
                style={{
                  flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 2, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                  border: `1.5px solid ${item.user_has_voted ? "#0891b2" : "#e2e8f0"}`,
                  background: item.user_has_voted ? "#0891b215" : "#fff",
                  color: item.user_has_voted ? "#0891b2" : "#64748b",
                  minWidth: 48,
                }}
              >
                <svg viewBox="0 0 24 24" fill={item.user_has_voted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{item.vote_count}</span>
              </button>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span
                    className="ms-badge"
                    style={{
                      background: STATUS_COLOR[item.status] + "1a",
                      color: STATUS_COLOR[item.status],
                      border: `1px solid ${STATUS_COLOR[item.status]}40`,
                      fontSize: 11,
                    }}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>
                  {item.category && (
                    <span className="ms-badge" style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", fontSize: 11 }}>
                      {CATEGORY_LABELS[item.category]}
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: 15, color: "#1e293b", marginBottom: 4 }}>{item.title}</div>
                {item.description && (
                  <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, marginBottom: 6,
                    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {item.description}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  Submitted by {item.submitter_name ?? item.submitter_email ?? "Unknown"} ·{" "}
                  {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submit modal */}
      {showSubmit && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowSubmit(false); setForm({ title: "", description: "", category: "" }); } }}>
          <div className="ms-modal">
            <h2>Submit a Feature Request</h2>
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14, marginTop: 4 }}>
              <label className="ms-label">
                <span>Title *</span>
                <input
                  autoFocus required className="ms-input"
                  placeholder="Briefly describe the feature..."
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="ms-label">
                <span>Description</span>
                <textarea
                  className="ms-input"
                  rows={4}
                  placeholder="More detail, use case, or business impact..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  style={{ resize: "vertical" }}
                />
              </label>
              <label className="ms-label">
                <span>Category</span>
                <select className="ms-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as FeatureCategory | "" })}>
                  <option value="">— Select category —</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={saving || !form.title.trim()}>
                  {saving ? "Submitting..." : "Submit Request"}
                </button>
                <button type="button" className="ms-btn-secondary" onClick={() => { setShowSubmit(false); setForm({ title: "", description: "", category: "" }); }}>
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

import { useEffect, useState } from "react";
import { api, type HelpRequest, type HelpRequestStatus } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const STATUSES: HelpRequestStatus[] = ["open", "in_progress", "resolved", "closed"];
const STATUS_LABELS: Record<HelpRequestStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};
const STATUS_COLOR: Record<HelpRequestStatus, string> = {
  open: "#d13438",
  in_progress: "#7c3aed",
  resolved: "#107c10",
  closed: "#94a3b8",
};

type Filter = HelpRequestStatus | "all";
const FILTERS: Filter[] = ["open", "in_progress", "resolved", "closed", "all"];

const fmt = (iso: string) => (iso ? new Date(iso).toLocaleString() : "");

export default function AdminHelpRequestsPage() {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>("open");
  const [rows, setRows] = useState<HelpRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await api.helpRequests(filter === "all" ? undefined : filter));
    } catch {
      showToast("Failed to load help requests", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const setStatus = async (r: HelpRequest, status: HelpRequestStatus) => {
    try {
      await api.updateHelpRequest(r.id, { status });
      showToast(`Marked ${STATUS_LABELS[status].toLowerCase()}`, "success");
      load();
    } catch {
      showToast("Update failed", "error");
    }
  };

  const saveNotes = async (r: HelpRequest, admin_notes: string) => {
    if ((r.admin_notes ?? "") === admin_notes) return;
    try {
      await api.updateHelpRequest(r.id, { admin_notes: admin_notes || null });
      showToast("Notes saved", "success");
    } catch {
      showToast("Save failed", "error");
    }
  };

  return (
    <div style={{ maxWidth: "100%" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Help requests</h1>
        <div style={{ display: "inline-flex", border: "1px solid #cbd5e1", borderRadius: 6, overflow: "hidden" }}>
          {FILTERS.map((f, i) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: "none", borderLeft: i === 0 ? "none" : "1px solid #cbd5e1",
                background: filter === f ? "#0891b2" : "#fff",
                color: filter === f ? "#fff" : "#475569",
              }}
            >
              {f === "all" ? "All" : STATUS_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="app-subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="app-subtitle">No {filter === "all" ? "" : STATUS_LABELS[filter].toLowerCase()} requests.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {rows.map((r) => (
            <div key={r.id} className="ms-section-card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.subject}</div>
                  <div className="app-subtitle" style={{ marginTop: 2, fontSize: 12 }}>
                    {r.requester_name || r.requester_email || "Unknown"}
                    {r.module ? ` · ${r.module}` : ""} · {fmt(r.created_at)}
                    {r.page_path ? ` · ${r.page_path}` : ""}
                  </div>
                </div>
                <span className="ms-badge" style={{ flexShrink: 0, background: STATUS_COLOR[r.status] + "1a", color: STATUS_COLOR[r.status], border: `1px solid ${STATUS_COLOR[r.status]}40` }}>
                  {STATUS_LABELS[r.status]}
                </span>
              </div>

              {r.body && (
                <p style={{ marginTop: 10, fontSize: 14, color: "#334155", whiteSpace: "pre-wrap" }}>{r.body}</p>
              )}

              <textarea
                className="ms-input"
                placeholder="Internal notes (optional)"
                defaultValue={r.admin_notes ?? ""}
                onBlur={(e) => saveNotes(r, e.target.value.trim())}
                rows={2}
                style={{ width: "100%", marginTop: 10, resize: "vertical" }}
              />

              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {STATUSES.filter((s) => s !== r.status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="ms-btn-secondary"
                    style={{ fontSize: 12 }}
                    onClick={() => setStatus(r, s)}
                  >
                    Mark {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

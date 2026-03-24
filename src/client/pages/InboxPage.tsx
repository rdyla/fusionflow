import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Notification, type User } from "../lib/api";

const TYPE_LABELS: Record<string, string> = {
  task_assigned: "Task assigned",
  task_blocked: "Task blocked",
  risk_assigned: "Risk assigned",
  risk_added: "Risk added",
  note_added: "Note",
  milestone_overdue: "Milestone overdue",
  go_live_reminder: "Go-live reminder",
  direct_message: "Message",
};

const TYPE_COLOR: Record<string, string> = {
  task_assigned: "#0891b2",
  task_blocked: "#d13438",
  risk_assigned: "#ff8c00",
  risk_added: "#ff8c00",
  note_added: "#6366f1",
  milestone_overdue: "#d13438",
  go_live_reminder: "#107c10",
  direct_message: "#0b9aad",
};

function notificationLink(n: Notification): string | null {
  if (!n.project_id) return null;
  if (n.entity_type === "task") return `/projects/${n.project_id}?tab=tasks&taskId=${n.entity_id}`;
  if (n.entity_type === "risk") return `/projects/${n.project_id}?tab=risks`;
  if (n.entity_type === "milestone") return `/projects/${n.project_id}?tab=milestones`;
  if (n.entity_type === "note") return `/projects/${n.project_id}?tab=notes`;
  if (n.entity_type === "project") return `/projects/${n.project_id}`;
  return null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type ComposeState = { open: boolean; recipientId: string; recipientName: string; body: string };

export default function InboxPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"all" | "notifications" | "messages">("all");
  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [compose, setCompose] = useState<ComposeState>({ open: false, recipientId: "", recipientName: "", body: "" });
  const [sending, setSending] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [showUserList, setShowUserList] = useState(false);
  const userSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    api.inbox(tab, page)
      .then((res) => {
        setItems((prev) => page === 1 ? res.items : [...prev, ...res.items]);
        setTotal(res.total);
        setHasMore(res.hasMore);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tab, page]);

  useEffect(() => {
    api.users().then(setUsers).catch(() => {});
  }, []);

  async function handleMarkRead(id: string) {
    await api.markNotificationRead(id).catch(() => {});
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    await api.markAllRead().catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setMarkingAll(false);
  }

  async function handleSend() {
    if (!compose.recipientId || !compose.body.trim()) return;
    setSending(true);
    try {
      await api.sendMessage(compose.recipientId, compose.body.trim());
      setCompose({ open: false, recipientId: "", recipientName: "", body: "" });
      setUserSearch("");
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  function handleNotificationClick(n: Notification) {
    if (!n.read_at) handleMarkRead(n.id);
    const link = notificationLink(n);
    if (link) navigate(link);
  }

  const filteredUsers = users.filter((u) =>
    userSearch.length > 0 &&
    (u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", margin: 0 }}>Inbox</h1>
          {total > 0 && (
            <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
              {total} item{total !== 1 ? "s" : ""}{unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {unreadCount > 0 && (
            <button className="ms-btn-secondary" onClick={handleMarkAllRead} disabled={markingAll} style={{ fontSize: 12 }}>
              {markingAll ? "Marking…" : "Mark all read"}
            </button>
          )}
          <button
            className="ms-btn-primary"
            style={{ fontSize: 12 }}
            onClick={() => setCompose({ open: true, recipientId: "", recipientName: "", body: "" })}
          >
            + New Message
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
        {(["all", "notifications", "messages"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? "#0b9aad" : "#64748b",
              borderBottom: tab === t ? "2px solid #0b9aad" : "2px solid transparent",
              marginBottom: -1,
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Compose panel */}
      {compose.open && (
        <div className="ms-card" style={{ marginBottom: 20, border: "1px solid #bae6fd", background: "#f0f9ff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#0369a1" }}>New Message</span>
            <button
              type="button"
              onClick={() => { setCompose({ open: false, recipientId: "", recipientName: "", body: "" }); setUserSearch(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>

          {/* Recipient picker */}
          <div style={{ marginBottom: 12, position: "relative" }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
              To
            </label>
            {compose.recipientId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 600 }}>{compose.recipientName}</span>
                <button
                  type="button"
                  onClick={() => setCompose((s) => ({ ...s, recipientId: "", recipientName: "" }))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 12 }}
                >
                  change
                </button>
              </div>
            ) : (
              <div>
                <input
                  ref={userSearchRef}
                  className="ms-input"
                  placeholder="Search by name or email…"
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setShowUserList(true); }}
                  onFocus={() => setShowUserList(true)}
                  style={{ fontSize: 13 }}
                />
                {showUserList && filteredUsers.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 50, maxHeight: 200, overflowY: "auto" }}>
                    {filteredUsers.slice(0, 8).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setCompose((s) => ({ ...s, recipientId: u.id, recipientName: u.name ?? u.email }));
                          setUserSearch("");
                          setShowUserList(false);
                        }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#334155" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <span style={{ fontWeight: 600 }}>{u.name ?? u.email}</span>
                        {u.name && <span style={{ color: "#94a3b8", marginLeft: 6, fontSize: 12 }}>{u.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
              Message
            </label>
            <textarea
              className="ms-input"
              rows={3}
              style={{ resize: "vertical", fontSize: 13 }}
              placeholder="Write your message…"
              value={compose.body}
              onChange={(e) => setCompose((s) => ({ ...s, body: e.target.value }))}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="ms-btn-primary"
              onClick={handleSend}
              disabled={!compose.recipientId || !compose.body.trim() || sending}
              style={{ fontSize: 13 }}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* Notification list */}
      {loading && items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#94a3b8", fontSize: 13 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div className="ms-card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔔</div>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>Nothing here yet</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 2 }}>
          {items.map((n) => {
            const color = TYPE_COLOR[n.type] ?? "#64748b";
            const label = TYPE_LABELS[n.type] ?? n.type;
            const isUnread = !n.read_at;
            const isMessage = n.type === "direct_message";
            const hasLink = !!notificationLink(n);

            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "14px 16px",
                  background: isUnread ? "#f0f9ff" : "#fff",
                  border: `1px solid ${isUnread ? "#bae6fd" : "#f1f5f9"}`,
                  borderRadius: 10,
                  cursor: hasLink || isMessage ? "pointer" : "default",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { if (hasLink || isMessage) (e.currentTarget as HTMLDivElement).style.background = isUnread ? "#e0f2fe" : "#f8fafc"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isUnread ? "#f0f9ff" : "#fff"; }}
              >
                {/* Unread dot */}
                <div style={{ paddingTop: 4, flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: isUnread ? color : "transparent", border: isUnread ? "none" : "1px solid #e2e8f0" }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color, background: `${color}18`, padding: "2px 7px", borderRadius: 10 }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{timeAgo(n.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: isUnread ? 600 : 400, color: "#1e293b", marginBottom: n.body ? 3 : 0 }}>
                    {n.title}
                  </div>
                  {n.body && (
                    <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {isMessage && n.sender_name && (
                        <span style={{ fontWeight: 600, color: "#475569" }}>{n.sender_name}: </span>
                      )}
                      {n.body}
                    </div>
                  )}
                </div>

                {/* Mark read button */}
                {isUnread && (
                  <button
                    type="button"
                    title="Mark as read"
                    onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                    style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, padding: "0 4px", alignSelf: "flex-start", marginTop: 2 }}
                  >
                    ✓
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button
            className="ms-btn-secondary"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading}
            style={{ fontSize: 13 }}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

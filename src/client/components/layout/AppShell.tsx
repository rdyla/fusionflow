import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import logoUrl from "../../assets/fusion flow transparent logo.png";
import { api, type User, type SystemStatusResponse, type Notification, IMPERSONATE_KEY } from "../../lib/api";
import { SystemStatusBadge } from "../ui/SystemStatusBadge";
import { UserChip } from "../ui/UserChip";
import { useIsMobile } from "../../hooks/useIsMobile";

const NOTIF_TYPE_LABELS: Record<string, string> = {
  task_assigned: "Task assigned",
  task_blocked: "Task blocked",
  risk_assigned: "Risk assigned",
  risk_added: "Risk added",
  note_added: "Note",
  milestone_overdue: "Milestone overdue",
  go_live_reminder: "Go-live reminder",
  direct_message: "Message",
};

const NOTIF_TYPE_COLOR: Record<string, string> = {
  task_assigned: "#0891b2",
  task_blocked: "#d13438",
  risk_assigned: "#ff8c00",
  risk_added: "#ff8c00",
  note_added: "#6366f1",
  milestone_overdue: "#d13438",
  go_live_reminder: "#107c10",
  direct_message: "#0b9aad",
};

function notifTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AppShell() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [canProspect, setCanProspect] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [sysStatus, setSysStatus] = useState<SystemStatusResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Close mobile nav drawer on navigation
  useEffect(() => { setDrawerOpen(false); }, [navigate]);

  // Close notif panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  useEffect(() => {
    const imp = localStorage.getItem(IMPERSONATE_KEY);
    setImpersonating(imp);
    api.me()
      .then((res) => {
        setCurrentUser(res.user);
        setIsAdmin(res.role === "admin" && !imp);
        setIsClient(res.role === "client");
        setCanProspect(["admin", "executive", "pf_ae", "partner_ae"].includes(res.role));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function fetchStatus() {
      api.systemStatus().then(setSysStatus).catch(() => {});
    }
    fetchStatus();
    const id = setInterval(fetchStatus, 300_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function fetchUnread() {
      api.inboxUnreadCount().then((r) => setUnreadCount(r.count)).catch(() => {});
    }
    fetchUnread();
    const id = setInterval(fetchUnread, 60_000);
    return () => clearInterval(id);
  }, []);

  function exitImpersonation() {
    localStorage.removeItem(IMPERSONATE_KEY);
    navigate("/admin/users");
    window.location.reload();
  }

  function openNotifPanel() {
    setNotifOpen((prev) => {
      if (!prev) {
        setNotifLoading(true);
        api.inbox("all", 1)
          .then((res) => setNotifItems(res.items.slice(0, 15)))
          .catch(() => {})
          .finally(() => setNotifLoading(false));
      }
      return !prev;
    });
  }

  function handleNotifRead(id: string) {
    api.markNotificationRead(id).catch(() => {});
    setNotifItems((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  function handleNotifDelete(id: string) {
    api.deleteNotification(id).catch(() => {});
    const item = notifItems.find((n) => n.id === id);
    if (item && !item.read_at) setUnreadCount((c) => Math.max(0, c - 1));
    setNotifItems((prev) => prev.filter((n) => n.id !== id));
  }

  function notificationLink(n: Notification): string | null {
    if (!n.project_id) return null;
    if (n.entity_type === "task") return `/projects/${n.project_id}?tab=tasks&taskId=${n.entity_id}`;
    if (n.entity_type === "risk") return `/projects/${n.project_id}?tab=risks`;
    if (n.entity_type === "milestone") return `/projects/${n.project_id}?tab=milestones`;
    if (n.entity_type === "note") return `/projects/${n.project_id}?tab=notes`;
    if (n.entity_type === "project") return `/projects/${n.project_id}`;
    return null;
  }

  function handleNotifNavigate(n: Notification) {
    if (!n.read_at) handleNotifRead(n.id);
    const link = notificationLink(n);
    if (link) {
      setNotifOpen(false);
      navigate(link);
    }
  }

  const navContent = (
    <>
      <nav style={{ flex: 1, paddingTop: 10, overflowY: "auto" }}>
        {!isClient && (
          <>
            <NavSection label="Customers" />
            <SideLink to="/customers" onClick={() => setDrawerOpen(false)}>All Customers</SideLink>
            <Divider />
            <NavSection label="Implementation" />
            <SideLink to="/dashboard" end onClick={() => setDrawerOpen(false)}>Dashboard</SideLink>
            <SideLink to="/projects" onClick={() => setDrawerOpen(false)}>Projects</SideLink>
            <SideLink to="/solutions" onClick={() => setDrawerOpen(false)}>Solutions</SideLink>
            <SideLink to="/optimize" onClick={() => setDrawerOpen(false)}>Optimizations</SideLink>
            <Divider />
          </>
        )}
        {isClient && (
          <>
            <NavSection label="Projects" />
            <SideLink to="/projects" onClick={() => setDrawerOpen(false)}>My Projects</SideLink>
            <Divider />
            <NavSection label="Solutions" />
            <SideLink to="/solutions" onClick={() => setDrawerOpen(false)}>My Solutions</SideLink>
            <Divider />
          </>
        )}
        {canProspect && (
          <>
            <Divider />
            <NavSection label="Prospecting" />
            <SideLink to="/prospecting" onClick={() => setDrawerOpen(false)}>Prospect Lists</SideLink>
          </>
        )}
        {!isClient && (
          <>
            <NavSection label="Me" />
            <SideLink to="/inbox" onClick={() => setDrawerOpen(false)}>
              Inbox{unreadCount > 0 && (
                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: "#d13438", color: "#fff", borderRadius: 10, padding: "1px 6px", verticalAlign: "middle" }}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </SideLink>
            <Divider />
          </>
        )}
        {isAdmin && (
          <>
            <NavSection label="Admin" />
            <SideLink to="/admin/projects" onClick={() => setDrawerOpen(false)}>Projects</SideLink>
            <SideLink to="/admin/solutions" onClick={() => setDrawerOpen(false)}>Solutions</SideLink>
            <SideLink to="/admin/optimize" onClick={() => setDrawerOpen(false)}>Optimize</SideLink>
            <SideLink to="/admin/labor" onClick={() => setDrawerOpen(false)}>Labor Config</SideLink>
            <SideLink to="/admin/templates" onClick={() => setDrawerOpen(false)}>Templates</SideLink>
            <SideLink to="/admin/users" onClick={() => setDrawerOpen(false)}>Users</SideLink>
          </>
        )}
      </nav>
      {currentUser && (
        <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
          <UserChip user={currentUser} />
        </div>
      )}
    </>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {/* Desktop sidebar */}
      {!isMobile && (
        <aside style={{
          width: 240,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "#03395f",
          borderRight: "1px solid rgba(255,255,255,0.1)",
        }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(0,0,0,0.1)", flexShrink: 0 }}>
            <Link to="/" style={{ textDecoration: "none", display: "block" }}>
              <img src={logoUrl} alt="FusionFlow360" style={{ width: 200, height: "auto", display: "block" }} />
            </Link>
          </div>
          {navContent}
        </aside>
      )}

      {/* Mobile drawer overlay */}
      {isMobile && drawerOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)" }}
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            style={{
              position: "absolute", top: 0, left: 0, bottom: 0,
              width: 280,
              display: "flex", flexDirection: "column",
              background: "#03395f",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(0,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Link to="/" style={{ textDecoration: "none", display: "block" }} onClick={() => setDrawerOpen(false)}>
                <img src={logoUrl} alt="FusionFlow360" style={{ width: 160, height: "auto", display: "block" }} />
              </Link>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", padding: 4, display: "flex" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 22, height: 22 }}>
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f0f4f8", position: "relative" }}>

        {/* Top bar */}
        <header style={{
          position: "relative",
          zIndex: 10,
          height: 56,
          background: "#021e34",
          display: "flex",
          alignItems: "center",
          paddingLeft: isMobile ? 16 : 28,
          paddingRight: isMobile ? 12 : 20,
          flexShrink: 0,
          borderBottom: "1px solid rgba(0,0,0,0.2)",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 10 }}>
            {isMobile && (
              <button
                onClick={() => setDrawerOpen(true)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)", padding: 4, display: "flex", marginRight: 4 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 22, height: 22 }}>
                  <path d="M3 12h18M3 6h18M3 18h18"/>
                </svg>
              </button>
            )}
            {!isMobile && (
              <>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Module
                </span>
                <span style={{ color: "rgba(255,255,255,0.3)" }}>›</span>
              </>
            )}
            <span style={{ fontFamily: "'Jost', sans-serif", fontSize: isMobile ? 14 : 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "0.02em" }}>
              {isMobile ? "FusionFlow360" : "Onboarding & Implementation"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }} ref={notifRef}>
            <SystemStatusBadge status={sysStatus} />
            <button
              type="button"
              onClick={openNotifPanel}
              title="Notifications"
              style={{ position: "relative", background: "none", border: "none", cursor: "pointer", color: notifOpen ? "#fff" : "rgba(255,255,255,0.75)", padding: 4, display: "flex", alignItems: "center" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: 0, right: 0,
                  fontSize: 9, fontWeight: 800,
                  background: "#d13438", color: "#fff",
                  borderRadius: 10, padding: "1px 4px",
                  lineHeight: 1.4, minWidth: 14, textAlign: "center",
                }}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notification dropdown panel */}
            {notifOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 10px)", right: 0,
                width: 360, maxHeight: 480,
                background: "#fff", borderRadius: 12,
                boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)",
                border: "1px solid #e2e8f0",
                display: "flex", flexDirection: "column",
                overflow: "hidden", zIndex: 1000,
              }}>
                {/* Header */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>Notifications</span>
                  <button
                    type="button"
                    onClick={() => { setNotifOpen(false); navigate("/inbox"); }}
                    style={{ fontSize: 11, fontWeight: 600, color: "#0b9aad", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    View all
                  </button>
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {notifLoading ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>Loading…</div>
                  ) : notifItems.length === 0 ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>You're all caught up</div>
                  ) : notifItems.map((n) => {
                    const color = NOTIF_TYPE_COLOR[n.type] ?? "#64748b";
                    const label = NOTIF_TYPE_LABELS[n.type] ?? n.type;
                    const isUnread = !n.read_at;
                    const link = notificationLink(n);
                    return (
                      <div
                        key={n.id}
                        style={{
                          display: "flex", gap: 10, padding: "11px 14px",
                          background: isUnread ? "#f0f9ff" : "#fff",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        <div style={{ paddingTop: 3, flexShrink: 0 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: isUnread ? color : "#e2e8f0" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color, background: `${color}18`, padding: "1px 6px", borderRadius: 8 }}>
                              {label}
                            </span>
                            <span style={{ fontSize: 10, color: "#94a3b8" }}>{notifTimeAgo(n.created_at)}</span>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: isUnread ? 600 : 400, color: "#1e293b", marginBottom: n.body ? 2 : 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {n.title}
                          </div>
                          {n.body && (
                            <div style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {n.type === "direct_message" && n.sender_name && (
                                <span style={{ fontWeight: 600 }}>{n.sender_name}: </span>
                              )}
                              {n.body}
                            </div>
                          )}
                          {/* Actions */}
                          <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
                            {link && (
                              <button
                                type="button"
                                onClick={() => handleNotifNavigate(n)}
                                style={{ fontSize: 11, fontWeight: 600, color: "#0b9aad", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                              >
                                Go to →
                              </button>
                            )}
                            {isUnread && (
                              <button
                                type="button"
                                onClick={() => handleNotifRead(n.id)}
                                style={{ fontSize: 11, color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                              >
                                Mark read
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleNotifDelete(n.id)}
                              style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: "auto" }}
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Impersonation banner */}
        {impersonating && (
          <div style={{
            position: "relative", zIndex: 10,
            background: "rgba(255,140,0,0.12)", borderBottom: "1px solid rgba(255,140,0,0.35)",
            padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 12, color: "#ff8c00", fontWeight: 600 }}>
              Viewing as <strong>{impersonating}</strong> — changes are live
            </span>
            <button
              onClick={exitImpersonation}
              style={{ fontSize: 12, fontWeight: 600, color: "#ff8c00", background: "rgba(255,140,0,0.15)", border: "1px solid rgba(255,140,0,0.4)", borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}
            >
              Exit
            </button>
          </div>
        )}

        {/* Content */}
        <main style={{
          position: "relative", zIndex: 1,
          flex: 1, overflowY: "auto",
          padding: isMobile ? "20px 16px" : "32px 40px",
          background: "#f0f4f8",
        }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavSection({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.45)", padding: "8px 20px 4px" }}>
      {label}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "rgba(0,0,0,0.1)", margin: "10px 16px" }} />;
}


function SideLink({ to, children, end, onClick }: { to: string; children: React.ReactNode; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => `ms-nav-link${isActive ? " active" : ""}`}
    >
      {children}
    </NavLink>
  );
}

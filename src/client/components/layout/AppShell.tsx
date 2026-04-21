import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
  go_live_reminder: "Go-live reminder",
  direct_message: "Message",
};

const NOTIF_TYPE_COLOR: Record<string, string> = {
  task_assigned: "#0891b2",
  task_blocked: "#d13438",
  risk_assigned: "#ff8c00",
  risk_added: "#ff8c00",
  note_added: "#6366f1",
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
  const location = useLocation();
  const isMobile = useIsMobile();

  useEffect(() => { setDrawerOpen(false); }, [navigate]);

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
      <nav style={{ flex: 1, paddingTop: 8, overflowY: "auto" }}>
        {!isClient && (
          <>
            <SideLink to="/customers" icon={NAV_ICONS.customers} onClick={() => setDrawerOpen(false)}>Customers</SideLink>
            <SideLink to="/solutions" icon={NAV_ICONS.solutions} onClick={() => setDrawerOpen(false)}>Solutions</SideLink>
            <SideLink to="/dashboard" icon={NAV_ICONS.projects} onClick={() => setDrawerOpen(false)}>Projects</SideLink>
            <SideLink to="/optimize" icon={NAV_ICONS.optimizations} onClick={() => setDrawerOpen(false)}>Optimizations</SideLink>
            {false && canProspect && (
              <SideLink to="/prospecting" icon={NAV_ICONS.prospecting} onClick={() => setDrawerOpen(false)}>Prospecting</SideLink>
            )}
            <SideLink to="/support/cases" icon={NAV_ICONS.support} onClick={() => setDrawerOpen(false)}>Support</SideLink>
            <SideLink to="/roadmap" icon={NAV_ICONS.roadmap} onClick={() => setDrawerOpen(false)}>Roadmap</SideLink>
          </>
        )}
        {isClient && (
          <>
            <SideLink to="/projects" icon={NAV_ICONS.projects} onClick={() => setDrawerOpen(false)}>Projects</SideLink>
            <SideLink to="/solutions" icon={NAV_ICONS.solutions} onClick={() => setDrawerOpen(false)}>Solutions</SideLink>
            <SideLink to="/support/cases" icon={NAV_ICONS.support} onClick={() => setDrawerOpen(false)}>Support</SideLink>
          </>
        )}
        {isAdmin && (
          <div style={{ marginTop: 16, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <SideLink to="/admin/projects" icon={NAV_ICONS.adminProjects} onClick={() => setDrawerOpen(false)}>Admin: Projects</SideLink>
            <SideLink to="/admin/solutions" icon={NAV_ICONS.adminSolutions} onClick={() => setDrawerOpen(false)}>Admin: Solutions</SideLink>
            <SideLink to="/admin/optimize" icon={NAV_ICONS.adminOptimize} onClick={() => setDrawerOpen(false)}>Admin: Optimize</SideLink>
            <SideLink to="/admin/labor" icon={NAV_ICONS.adminLabor} onClick={() => setDrawerOpen(false)}>Admin: Labor</SideLink>
            <SideLink to="/admin/templates" icon={NAV_ICONS.adminTemplates} onClick={() => setDrawerOpen(false)}>Admin: Templates</SideLink>
            <SideLink to="/admin/users" icon={NAV_ICONS.adminUsers} onClick={() => setDrawerOpen(false)}>Admin: Users</SideLink>
            <SideLink to="/admin/roadmap" icon={NAV_ICONS.adminRoadmap} onClick={() => setDrawerOpen(false)}>Admin: Roadmap</SideLink>
          </div>
        )}
      </nav>

      {/* System status widget at bottom — pops up */}
      <div style={{ flexShrink: 0, padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <SystemStatusBadge status={sysStatus} popUp />
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {/* Desktop sidebar */}
      {!isMobile && (
        <aside style={{
          width: 220,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "#021e34",
          borderRight: "1px solid rgba(255,255,255,0.1)",
        }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(0,0,0,0.1)", flexShrink: 0 }}>
            <Link to="/" style={{ textDecoration: "none", display: "block" }}>
              <div style={{ fontFamily: "'avenir-lt-pro', sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1, color: "#ffffff", whiteSpace: "nowrap" }}>
                Cloud<span style={{ color: "#22c55e" }}>Connect</span>
              </div>
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
              background: "#021e34",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(0,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Link to="/" style={{ textDecoration: "none", display: "block" }} onClick={() => setDrawerOpen(false)}>
                <div style={{ fontFamily: "'avenir-lt-pro', sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1, color: "#ffffff", whiteSpace: "nowrap" }}>
                  Cloud<span style={{ color: "#22c55e" }}>Connect</span>
                </div>
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
          {/* Left: mobile hamburger + wordmark (empty on desktop — sidebar handles identity/nav) */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isMobile && (
              <>
                <button
                  onClick={() => setDrawerOpen(true)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)", padding: 4, display: "flex", marginRight: 4 }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 22, height: 22 }}>
                    <path d="M3 12h18M3 6h18M3 18h18"/>
                  </svg>
                </button>
                <span style={{ fontFamily: "'avenir-lt-pro', sans-serif", fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em", color: "#ffffff", whiteSpace: "nowrap" }}>
                  Cloud<span style={{ color: "#22c55e" }}>Connect</span>
                </span>
              </>
            )}
          </div>

          {/* Right: inbox bell + user avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }} ref={notifRef}>
            {/* Notification bell */}
            {!isClient && (
              <button
                type="button"
                onClick={openNotifPanel}
                title="Inbox"
                style={{ position: "relative", background: "none", border: "none", cursor: "pointer", color: notifOpen ? "#fff" : "rgba(255,255,255,0.75)", padding: 6, display: "flex", alignItems: "center", borderRadius: 8 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unreadCount > 0 && (
                  <span style={{
                    position: "absolute", top: 2, right: 2,
                    fontSize: 9, fontWeight: 800,
                    background: "#d13438", color: "#fff",
                    borderRadius: 10, padding: "1px 4px",
                    lineHeight: 1.4, minWidth: 14, textAlign: "center",
                  }}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            )}

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
                          <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
                            {link && (
                              <button type="button" onClick={() => handleNotifNavigate(n)}
                                style={{ fontSize: 11, fontWeight: 600, color: "#0b9aad", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                                Go to →
                              </button>
                            )}
                            {isUnread && (
                              <button type="button" onClick={() => handleNotifRead(n.id)}
                                style={{ fontSize: 11, color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                                Mark read
                              </button>
                            )}
                            <button type="button" onClick={() => handleNotifDelete(n.id)}
                              style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: "auto" }}>
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

            {/* User avatar — compact, pops down */}
            {currentUser && (
              <UserChip user={currentUser} compact popout="down" />
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

function SideLink({ to, children, end, onClick, icon }: { to: string; children: React.ReactNode; end?: boolean; onClick?: () => void; icon?: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => `ms-nav-link${isActive ? " active" : ""}`}
    >
      {icon}
      {children}
    </NavLink>
  );
}

// ── Nav icons ──────────────────────────────────────────────────────────────

function I({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.85 }}>
      {children}
    </svg>
  );
}

const NAV_ICONS = {
  customers: (
    <I>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </I>
  ),
  solutions: (
    <I>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </I>
  ),
  projects: (
    <I>
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </I>
  ),
  optimizations: (
    <I>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </I>
  ),
  prospecting: (
    <I>
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </I>
  ),
  adminProjects: (
    <I>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </I>
  ),
  adminSolutions: (
    <I>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </I>
  ),
  adminOptimize: (
    <I>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </I>
  ),
  adminLabor: (
    <I>
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </I>
  ),
  adminTemplates: (
    <I>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="9" y1="21" x2="9" y2="9"/>
    </I>
  ),
  adminUsers: (
    <I>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </I>
  ),
  support: (
    <I>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </I>
  ),
  roadmap: (
    <I>
      <rect x="3" y="4" width="18" height="4" rx="1"/>
      <rect x="3" y="10" width="13" height="4" rx="1"/>
      <rect x="3" y="16" width="8" height="4" rx="1"/>
    </I>
  ),
  adminRoadmap: (
    <I>
      <rect x="3" y="3" width="5" height="18" rx="1"/>
      <rect x="10" y="3" width="5" height="12" rx="1"/>
      <rect x="17" y="3" width="5" height="7" rx="1"/>
    </I>
  ),
};

import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import logoUrl from "../../assets/fusionflow360-logov4.png";
import { api, type User, type SystemStatusResponse, IMPERSONATE_KEY } from "../../lib/api";
import { SystemStatusBadge } from "../ui/SystemStatusBadge";
import { useIsMobile } from "../../hooks/useIsMobile";

const ROLE_LABELS: Record<string, string> = {
  admin:       "Admin",
  pm:          "Project Manager",
  pf_ae:       "Account Executive",
  pf_sa:       "Solution Architect",
  pf_csm:      "Customer Success Manager",
  pf_engineer: "Implementation Engineer",
  partner_ae:  "Partner AE",
  client:      "Client",
};

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export default function AppShell() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [sysStatus, setSysStatus] = useState<SystemStatusResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Close drawer on navigation
  useEffect(() => { setDrawerOpen(false); }, [navigate]);

  useEffect(() => {
    const imp = localStorage.getItem(IMPERSONATE_KEY);
    setImpersonating(imp);
    api.me()
      .then((res) => {
        setCurrentUser(res.user);
        setIsAdmin(res.role === "admin" && !imp);
        setIsClient(res.role === "client");
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

  function exitImpersonation() {
    localStorage.removeItem(IMPERSONATE_KEY);
    navigate("/admin/users");
    window.location.reload();
  }

  const navContent = (
    <>
      <nav style={{ flex: 1, paddingTop: 10, overflowY: "auto" }}>
        {!isClient && (
          <>
            <NavSection label="Solutioning" />
            <SideLink to="/solutions" onClick={() => setDrawerOpen(false)}>Solutions</SideLink>
            <Divider />
            <NavSection label="Implementation" />
            <SideLink to="/dashboard" end onClick={() => setDrawerOpen(false)}>Dashboard</SideLink>
            <SideLink to="/projects" onClick={() => setDrawerOpen(false)}>Projects</SideLink>
            <Divider />
            <NavSection label="Optimize" />
            <SideLink to="/optimize" onClick={() => setDrawerOpen(false)}>Accounts</SideLink>
            <Divider />
          </>
        )}
        {isClient && (
          <>
            <NavSection label="Projects" />
            <SideLink to="/projects" onClick={() => setDrawerOpen(false)}>My Projects</SideLink>
            <Divider />
          </>
        )}
        {isAdmin && (
          <>
            <NavSection label="Admin" />
            <SideLink to="/admin/projects" onClick={() => setDrawerOpen(false)}>Projects</SideLink>
            <SideLink to="/admin/solutions" onClick={() => setDrawerOpen(false)}>Solutions</SideLink>
            <SideLink to="/admin/users" onClick={() => setDrawerOpen(false)}>Users</SideLink>
            <SideLink to="/admin/access" onClick={() => setDrawerOpen(false)}>Access</SideLink>
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SystemStatusBadge status={sysStatus} />
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

function UserChip({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const abbr = initials(user.name, user.email);
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-chip]")) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div style={{ position: "relative" }} data-profile-chip="">
      {/* Popout — renders above the chip */}
      {open && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 10px)",
          left: 0,
          right: 0,
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 8px 30px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.15)",
          overflow: "hidden",
          zIndex: 500,
          minWidth: 230,
        }}>
          {/* Header band */}
          <div style={{
            background: "linear-gradient(135deg, #03395f, #021e34)",
            padding: "20px 18px 16px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "linear-gradient(135deg, #63c1ea, #17c662)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Jost', sans-serif", fontSize: 16, fontWeight: 700,
              color: "#fff", flexShrink: 0, letterSpacing: "0.04em",
              border: "2px solid rgba(255,255,255,0.25)",
            }}>
              {abbr}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.name ?? user.email}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.email}
              </div>
            </div>
          </div>

          {/* Details */}
          <div style={{ padding: "12px 18px 4px", borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Role</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{roleLabel}</div>
            {user.organization_name && (
              <>
                <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 10, marginBottom: 4 }}>Organization</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{user.organization_name}</div>
              </>
            )}
          </div>

          {/* Sign out */}
          <div style={{ padding: "6px 8px" }}>
            <a
              href="/cdn-cgi/access/logout"
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 10px", borderRadius: 6,
                fontSize: 13, fontWeight: 500, color: "#1e293b",
                textDecoration: "none", cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, color: "#64748b", flexShrink: 0 }}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </a>
          </div>
        </div>
      )}

      {/* Chip trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          background: open ? "rgba(255,255,255,0.12)" : "transparent",
          border: "none", borderRadius: 8, padding: "6px 8px",
          cursor: "pointer", textAlign: "left", transition: "background 0.12s",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: "linear-gradient(135deg, #63c1ea, #17c662)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 700,
          color: "#fff", flexShrink: 0, letterSpacing: "0.04em",
        }}>
          {abbr}
        </div>
        <div style={{ lineHeight: 1.35, minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {user.name ?? user.email}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", letterSpacing: "0.02em" }}>
            {user.organization_name ? `${user.organization_name} · ` : ""}{roleLabel}
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ width: 14, height: 14, color: "rgba(255,255,255,0.4)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
    </div>
  );
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

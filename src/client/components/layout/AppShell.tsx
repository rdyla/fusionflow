import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import logoUrl from "../../assets/fusion flow transparent logo.png";
import { api, type User, type SystemStatusResponse, IMPERSONATE_KEY } from "../../lib/api";
import { SystemStatusBadge } from "../ui/SystemStatusBadge";
import { UserChip } from "../ui/UserChip";
import { useIsMobile } from "../../hooks/useIsMobile";

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
            <SideLink to="/admin/optimize" onClick={() => setDrawerOpen(false)}>Optimize</SideLink>
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

import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import logoUrl from "../../assets/fusion flow transparent logo.png";
import { api, type User, type SystemStatusResponse, IMPERSONATE_KEY } from "../../lib/api";
import { SystemStatusBadge } from "../ui/SystemStatusBadge";

const ROLE_LABELS: Record<string, string> = {
  admin:      "Admin",
  pm:         "Project Manager",
  pf_ae:      "Account Executive",
  pf_sa:      "Solution Architect",
  pf_csm:      "Customer Success Manager",
  pf_engineer: "Implementation Engineer",
  partner_ae:  "Partner AE",
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [sysStatus, setSysStatus] = useState<SystemStatusResponse | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const imp = localStorage.getItem(IMPERSONATE_KEY);
    setImpersonating(imp);

    api.me()
      .then((res) => {
        setCurrentUser(res.user);
        setIsAdmin(res.role === "admin" && !imp);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function fetchStatus() {
      api.systemStatus().then(setSysStatus).catch(() => {});
    }
    fetchStatus();
    const id = setInterval(fetchStatus, 90_000);
    return () => clearInterval(id);
  }, []);

  function exitImpersonation() {
    localStorage.removeItem(IMPERSONATE_KEY);
    navigate("/admin/users");
    window.location.reload();
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {/* Sidebar */}
      <aside style={{
        width: 240,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "#091525",
        borderRight: "1px solid rgba(255,255,255,0.07)",
      }}>
        {/* Logo */}
        <div style={{ height: 62, display: "flex", alignItems: "center", padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <Link to="/" style={{ textDecoration: "none", display: "block", overflow: "hidden", height: 53, width: 200 }}>
            <img src={logoUrl} alt="FusionFlow360" style={{ width: 200, height: "auto", display: "block" }} />
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, paddingTop: 10, overflowY: "auto" }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)", padding: "8px 20px 4px" }}>
            Solutioning
          </div>
          <SideLink to="/solutions">Solutions</SideLink>

          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "10px 16px" }} />

          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)", padding: "6px 20px 4px" }}>
            Implementation
          </div>
          <SideLink to="/dashboard" end>Dashboard</SideLink>
          <SideLink to="/projects">Projects</SideLink>

          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "10px 16px" }} />

          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)", padding: "6px 20px 4px" }}>
            Optimize
          </div>
          <SideLink to="/optimize">Accounts</SideLink>

          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "10px 16px" }} />

          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)", padding: "6px 20px 4px" }}>
            Support
          </div>
          <SideLink to="/support" end>Cases</SideLink>

          {isAdmin && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "10px 16px" }} />
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)", padding: "6px 20px 4px" }}>
                Admin
              </div>
              <SideLink to="/admin/projects">Projects</SideLink>
              <SideLink to="/admin/solutions">Solutions</SideLink>
              <SideLink to="/admin/users">Users</SideLink>
              <SideLink to="/admin/access">Access</SideLink>
            </>
          )}
        </nav>

        {/* Bottom user chip */}
        {currentUser && (
          <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <UserChip user={currentUser} />
          </div>
        )}
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#0d1b2e", position: "relative" }}>

        {/* Subtle grid background */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: "linear-gradient(rgba(0,200,224,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,224,0.025) 1px, transparent 1px)",
          backgroundSize: "60px 60px" }} />

        {/* Radial glow */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          background: "radial-gradient(ellipse 70% 50% at 80% 10%, rgba(8,145,178,0.06) 0%, transparent 70%)" }} />

        {/* Top bar */}
        <header style={{
          position: "relative",
          zIndex: 10,
          height: 56,
          background: "rgba(9,21,37,0.85)",
          backdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          paddingLeft: 28,
          paddingRight: 20,
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "rgba(240,246,255,0.3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Module
            </span>
            <span style={{ color: "rgba(255,255,255,0.15)" }}>›</span>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 700, color: "#00c8e0", letterSpacing: "0.02em" }}>
              Onboarding &amp; Implementation
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
            padding: "8px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
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
        <main style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "32px 40px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function UserChip({ user }: { user: User }) {
  const abbr = initials(user.name, user.email);
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #00c8e0, #0891b2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Syne', sans-serif",
        fontSize: 12,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
        letterSpacing: "0.04em",
      }}>
        {abbr}
      </div>
      <div style={{ lineHeight: 1.35, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(240,246,255,0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {user.name ?? user.email}
        </div>
        <div style={{ fontSize: 10, color: "rgba(240,246,255,0.35)", whiteSpace: "nowrap", letterSpacing: "0.02em" }}>
          {user.organization_name ? `${user.organization_name} · ` : ""}{roleLabel}
        </div>
      </div>
    </div>
  );
}

function SideLink({ to, children, end }: { to: string; children: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `ms-nav-link${isActive ? " active" : ""}`}
    >
      {children}
    </NavLink>
  );
}


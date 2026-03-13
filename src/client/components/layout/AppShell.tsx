import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { api, type User } from "../../lib/api";

const ROLE_LABELS: Record<string, string> = {
  admin:      "Admin",
  pm:         "Project Manager",
  pf_ae:      "Account Executive",
  partner_ae: "Partner AE",
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

  useEffect(() => {
    api.me()
      .then((res) => {
        setCurrentUser(res.user);
        setIsAdmin(res.role === "admin");
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", background: "#1a1f3b" }}>
        {/* Logo */}
        <div style={{ height: 48, display: "flex", alignItems: "center", padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
          <Link to="/" style={{ textDecoration: "none", color: "#fff", fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>
            Fusion<span style={{ color: "#0078d4" }}>Flow</span>
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, paddingTop: 8, overflowY: "auto" }}>
          <SideLink to="/dashboard" end>Dashboard</SideLink>
          <SideLink to="/projects">Projects</SideLink>

          {isAdmin && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "8px 16px" }} />
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.38)", padding: "6px 20px 4px" }}>
                Admin
              </div>
              <SideLink to="/admin/users">Users</SideLink>
              <SideLink to="/admin/access">Access</SideLink>
            </>
          )}
        </nav>
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f3f2f1" }}>
        {/* Top bar */}
        <header style={{ height: 48, background: "#1a1f3b", display: "flex", alignItems: "center", paddingLeft: 24, paddingRight: 16, flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.08)", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", letterSpacing: "0.01em" }}>
            Onboarding & Implementation
          </span>

          {currentUser && <UserChip user={currentUser} />}
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "28px 36px" }}>
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
      {/* Text block */}
      <div style={{ textAlign: "right", lineHeight: 1.3 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>
          {user.name ?? user.email}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>
          {user.organization_name ? `${user.organization_name} · ` : ""}{roleLabel}
        </div>
      </div>

      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#0078d4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
          letterSpacing: "0.02em",
        }}
      >
        {abbr}
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

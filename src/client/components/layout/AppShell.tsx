import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { api } from "../../lib/api";

export default function AppShell() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    api.me()
      .then((user) => setIsAdmin(user.role === "admin"))
      .catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0b1020", color: "#f5f7fb" }}>
      <header
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700 }}>
          Fusion<span style={{ color: "#43d17a" }}>Flow</span>
        </div>

        <nav style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link style={navLinkStyle} to="/">Dashboard</Link>
          <Link style={navLinkStyle} to="/projects">Projects</Link>
          {isAdmin && (
            <>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
              <Link style={{ ...navLinkStyle, color: "#ffa500" }} to="/admin/users">Users</Link>
              <Link style={{ ...navLinkStyle, color: "#ffa500" }} to="/admin/access">Access</Link>
            </>
          )}
        </nav>
      </header>

      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        <Outlet />
      </main>
    </div>
  );
}

const navLinkStyle: React.CSSProperties = {
  color: "#dbe4ff",
  textDecoration: "none",
  fontWeight: 500,
};

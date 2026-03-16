import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import logoUrl from "../../assets/fusion flow transparent logo.png";
import { api, type User, type SystemStatusResponse, type VendorStatus, IMPERSONATE_KEY } from "../../lib/api";

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

// ── System Status Badge ───────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  operational:          "#22c55e",
  degraded_performance: "#f59e0b",
  partial_outage:       "#f59e0b",
  major_outage:         "#ef4444",
  under_maintenance:    "#a78bfa",
};
const OVERALL_DOT: Record<string, string> = {
  operational: "#22c55e",
  degraded:    "#f59e0b",
  outage:      "#ef4444",
};
const OVERALL_LABEL: Record<string, string> = {
  operational: "All Systems Go",
  degraded:    "Degraded",
  outage:      "Service Disruption",
};
const COMPONENT_STATUS_LABEL: Record<string, string> = {
  operational:          "Operational",
  degraded_performance: "Degraded",
  partial_outage:       "Partial Outage",
  major_outage:         "Major Outage",
  under_maintenance:    "Maintenance",
};

function worstOverall(a: VendorStatus | null, b: VendorStatus | null): "operational" | "degraded" | "outage" {
  const rank = { outage: 2, degraded: 1, operational: 0 };
  const ra = a ? rank[a.overall] : 0;
  const rb = b ? rank[b.overall] : 0;
  const worst = Math.max(ra, rb);
  return (["operational", "degraded", "outage"] as const)[worst];
}

function SystemStatusBadge({ status }: { status: SystemStatusResponse | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // While loading, show the original "Live" look
  if (!status) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 40, fontSize: 12, color: "rgba(240,246,255,0.4)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00c8e0", boxShadow: "0 0 6px #00c8e0", display: "inline-block" }} />
        Live
      </div>
    );
  }

  const overall = worstOverall(status.zoom, status.ringcentral);
  const dotColor = OVERALL_DOT[overall];
  const label = OVERALL_LABEL[overall];
  const isOk = overall === "operational";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "5px 12px",
          background: open ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${isOk ? "rgba(255,255,255,0.08)" : `${dotColor}40`}`,
          borderRadius: 40, fontSize: 12,
          color: isOk ? "rgba(240,246,255,0.4)" : dotColor,
          cursor: "pointer", outline: "none",
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: dotColor,
          boxShadow: `0 0 6px ${dotColor}`,
          display: "inline-block",
          animation: isOk ? undefined : "pulse 1.5s infinite",
        }} />
        {label}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 280, zIndex: 200,
          background: "#0d1b2e",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}>
          {status.vendors.includes("zoom") && status.zoom && (
            <VendorPanel name="Zoom" vendor={status.zoom} />
          )}
          {status.vendors.includes("zoom") && status.vendors.includes("ringcentral") && status.zoom && status.ringcentral && (
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
          )}
          {status.vendors.includes("ringcentral") && status.ringcentral && (
            <VendorPanel name="RingCentral" vendor={status.ringcentral} />
          )}
          <div style={{ padding: "6px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "rgba(240,246,255,0.25)", textAlign: "right" }}>
            Updated {Math.round((Date.now() - Math.max(status.zoom?.fetched_at ?? 0, status.ringcentral?.fetched_at ?? 0)) / 1000)}s ago
          </div>
        </div>
      )}
    </div>
  );
}

function VendorPanel({ name, vendor }: { name: string; vendor: VendorStatus }) {
  const dotColor = OVERALL_DOT[vendor.overall];
  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(240,246,255,0.5)" }}>
          {name}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: dotColor }}>
          {OVERALL_LABEL[vendor.overall]}
        </span>
      </div>
      {vendor.components.length === 0 ? (
        <div style={{ fontSize: 11, color: "rgba(240,246,255,0.3)", fontStyle: "italic" }}>No data</div>
      ) : (
        vendor.components.map((c) => (
          <div key={c.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: STATUS_DOT[c.status] ?? "#94a3b8", flexShrink: 0, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "rgba(240,246,255,0.7)" }}>{c.label}</span>
            </div>
            <span style={{ fontSize: 11, color: STATUS_DOT[c.status] ?? "#94a3b8" }}>
              {COMPONENT_STATUS_LABEL[c.status] ?? c.status}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import type { User } from "../../lib/api";

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

export function UserChip({ user, popout = "up", compact = false }: { user: User; popout?: "up" | "down"; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const abbr = initials(user.name, user.email);
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-chip]")) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const popoutPosition: React.CSSProperties = popout === "up"
    ? { bottom: "calc(100% + 10px)", left: 0, right: 0 }
    : { top: "calc(100% + 10px)", right: 0 };

  return (
    <div style={{ position: "relative" }} data-profile-chip="">
      {open && (
        <div style={{
          position: "absolute",
          ...popoutPosition,
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
            display: "flex", alignItems: "center", gap: 14,
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
              href="/api/auth/logout"
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 10px", borderRadius: 6,
                fontSize: 13, fontWeight: 500, color: "#1e293b",
                textDecoration: "none", cursor: "pointer", transition: "background 0.12s",
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
      {compact ? (
        <button
          onClick={() => setOpen(v => !v)}
          title={user.name ?? user.email}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer", padding: 2, borderRadius: "50%",
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg, #63c1ea, #17c662)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Jost', sans-serif", fontSize: 12, fontWeight: 700,
            color: "#fff", letterSpacing: "0.04em",
            boxShadow: open ? "0 0 0 2px rgba(255,255,255,0.4)" : "none",
          }}>
            {abbr}
          </div>
        </button>
      ) : (
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
      )}
    </div>
  );
}

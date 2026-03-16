import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import logoUrl from "../assets/fusion flow transparent logo.png";
import { api, type User, type SystemStatusResponse } from "../lib/api";
import { SystemStatusBadge } from "../components/ui/SystemStatusBadge";

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

type Module = {
  num: string;
  tag: string;
  title: string;
  subtitle: string;
  desc: string;
  features: string[];
  accent: string;
  glow: string;
  route: string | null;
  icon: React.ReactNode;
};

const MODULES: Module[] = [
  {
    num: "01",
    tag: "Discovery",
    title: "Solutioning",
    subtitle: "Needs Assessment",
    desc: "Capture requirements, map pain points, and architect the right solution before a single line of code is written.",
    features: ["Stakeholder intake forms", "Requirements matrix builder", "Gap & risk analysis", "Solution scope documentation"],
    accent: "#2563eb",
    glow: "rgba(37,99,235,0.25)",
    route: "/solutions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}>
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/>
      </svg>
    ),
  },
  {
    num: "02",
    tag: "Onboarding",
    title: "Implementation",
    subtitle: "Onboarding & Setup",
    desc: "Structured onboarding workflows that get clients live fast — with full visibility into every milestone and handoff.",
    features: ["Onboarding project templates", "Milestone & task tracking", "Client portal provisioning", "Porting & number management"],
    accent: "#0891b2",
    glow: "rgba(8,145,178,0.25)",
    route: "/dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    num: "03",
    tag: "Build",
    title: "Design & Dev",
    subtitle: "Custom Development",
    desc: "Manage bespoke build projects with sprint boards, design specs, UAT cycles, and go-live checkpoints in one place.",
    features: ["Sprint & backlog management", "Design review workflows", "UAT sign-off tracking", "Deployment checklists"],
    accent: "#7c3aed",
    glow: "rgba(124,58,237,0.25)",
    route: null,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}>
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
  {
    num: "04",
    tag: "Growth",
    title: "Optimization",
    subtitle: "Continuous Improvement",
    desc: "Post-launch health checks, performance reviews, and proactive expansion opportunities to drive lasting client value.",
    features: ["QBR & review scheduling", "Usage analytics dashboards", "Expansion opportunity tracking", "SLA & KPI monitoring"],
    accent: "#059669",
    glow: "rgba(5,150,105,0.25)",
    route: null,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
];

export default function ModuleSelectPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sysStatus, setSysStatus] = useState<SystemStatusResponse | null>(null);

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => {});
  }, []);

  useEffect(() => {
    function fetchStatus() {
      api.systemStatus().then(setSysStatus).catch(() => {});
    }
    fetchStatus();
    const id = setInterval(fetchStatus, 90_000);
    return () => clearInterval(id);
  }, []);

  function handleCardClick(mod: Module) {
    if (mod.route) {
      navigate(mod.route);
    } else {
      setToast(`${mod.title} — Coming Soon`);
      setTimeout(() => setToast(null), 2500);
    }
  }

  const abbr = user ? initials(user.name, user.email) : "…";

  return (
    <div style={{ minHeight: "100vh", background: "#0d1b2e", color: "#f0f6ff", fontFamily: "'DM Sans', sans-serif", overflowX: "hidden", position: "relative" }}>

      {/* Background glows */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(ellipse 60% 50% at 15% 20%, rgba(0,200,224,0.07) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 85% 75%, rgba(37,99,235,0.06) 0%, transparent 70%), radial-gradient(ellipse 40% 35% at 70% 15%, rgba(124,58,237,0.05) 0%, transparent 65%)" }} />

      {/* Grid */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "linear-gradient(rgba(0,200,224,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,224,0.035) 1px, transparent 1px)",
        backgroundSize: "60px 60px" }} />

      {/* Header */}
      <header style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 48px", height: 72, borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)", background: "rgba(13,27,46,0.8)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <SystemStatusBadge status={sysStatus} />
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #00c8e0, #2563eb)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.05em" }}>
            {abbr}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ position: "relative", zIndex: 5, textAlign: "center", padding: "72px 48px 48px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <div style={{ overflow: "hidden", height: 108, width: 528 }}>
            <img src={logoUrl} alt="FusionFlow360" style={{ width: 528, height: "auto", display: "block" }} />
          </div>
        </div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(29px, 4vw, 46px)", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.03em", marginBottom: 18 }}>
          Where Every Engagement<br />
          <span style={{ color: "#00c8e0" }}>Finds Its Flow</span>
        </h1>
        <p style={{ fontSize: 13, color: "rgba(240,246,255,0.5)", maxWidth: 500, margin: "0 auto 16px", lineHeight: 1.65, fontWeight: 300 }}>
          From the first discovery call to long-term growth, every client engagement moves through a deliberate journey — built to deliver clarity, momentum, and measurable outcomes.
        </p>
        <div style={{ width: 48, height: 2, background: "linear-gradient(90deg, transparent, #00c8e0, transparent)", margin: "32px auto 0", borderRadius: 2 }} />
      </section>

      {/* Modules */}
      <section style={{ position: "relative", zIndex: 5, padding: "0 48px 80px" }}>
        <p style={{ textAlign: "center", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(240,246,255,0.4)", marginBottom: 36 }}>
          Choose your module
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, maxWidth: 1280, margin: "0 auto" }}>
          {MODULES.map((mod, i) => {
            const isHovered = hovered === i;
            const isActive = mod.route !== null;
            return (
              <div
                key={mod.num}
                onClick={() => handleCardClick(mod)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: "relative",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${isHovered ? mod.accent : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 20,
                  padding: "36px 28px 32px",
                  cursor: isActive ? "pointer" : "default",
                  overflow: "hidden",
                  transition: "transform 0.35s cubic-bezier(0.22,1,0.36,1), border-color 0.3s, box-shadow 0.35s",
                  transform: isHovered && isActive ? "translateY(-6px)" : "none",
                  boxShadow: isHovered && isActive ? `0 20px 60px ${mod.glow}, 0 0 0 1px ${mod.accent}` : "none",
                  opacity: !isActive && isHovered ? 0.85 : 1,
                }}
              >
                {/* Glow overlay */}
                <div style={{ position: "absolute", inset: 0, borderRadius: 20, background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${mod.glow}, transparent 70%)`, opacity: isHovered ? 1 : 0, transition: "opacity 0.4s", pointerEvents: "none" }} />

                {/* Step + coming soon */}
                <div style={{ position: "absolute", top: 20, right: 22, display: "flex", alignItems: "center", gap: 8 }}>
                  {!isActive && (
                    <span style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, padding: "2px 7px", color: "rgba(240,246,255,0.4)" }}>
                      Soon
                    </span>
                  )}
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(240,246,255,0.35)" }}>
                    {mod.num}
                  </span>
                </div>

                {/* Icon */}
                <div style={{ width: 60, height: 60, borderRadius: 16, background: `${mod.accent}22`, border: `1px solid ${mod.accent}44`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, color: mod.accent, transition: "transform 0.35s cubic-bezier(0.22,1,0.36,1)", transform: isHovered && isActive ? "scale(1.08)" : "none" }}>
                  {mod.icon}
                </div>

                {/* Tag */}
                <div style={{ display: "inline-block", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: mod.accent, background: `${mod.accent}1e`, border: `1px solid ${mod.accent}40`, borderRadius: 4, padding: "3px 8px", marginBottom: 12 }}>
                  {mod.tag}
                </div>

                {/* Title */}
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 12 }}>
                  {mod.title}
                  <span style={{ display: "block", color: "rgba(240,246,255,0.5)", fontWeight: 400, fontSize: 15, fontFamily: "'DM Sans', sans-serif", marginTop: 3 }}>{mod.subtitle}</span>
                </div>

                {/* Desc */}
                <p style={{ fontSize: 13, color: "rgba(240,246,255,0.5)", lineHeight: 1.7, fontWeight: 300, marginBottom: 24 }}>
                  {mod.desc}
                </p>

                {/* Features */}
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {mod.features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "rgba(240,246,255,0.6)" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: mod.accent, boxShadow: `0 0 6px ${mod.accent}`, flexShrink: 0, display: "inline-block" }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 600, color: isActive ? mod.accent : "rgba(240,246,255,0.3)", letterSpacing: "0.02em", display: "flex", alignItems: "center", gap: 6 }}>
                    {isActive ? "Enter Module" : "Coming Soon"}
                    {isActive && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 14, height: 14 }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    )}
                  </span>
                  {isActive && (
                    <div style={{ width: 30, height: 30, background: `${mod.accent}22`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", opacity: isHovered ? 1 : 0, transform: isHovered ? "translateX(0)" : "translateX(-6px)", transition: "opacity 0.3s, transform 0.3s" }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke={mod.accent} strokeWidth="2.5" style={{ width: 13, height: 13 }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom strip */}
      <div style={{ position: "relative", zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center", gap: 40, padding: "28px 48px 40px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        {[
          { icon: <svg viewBox="0 0 24 24" fill="none" stroke="#00c8e0" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, label: "SOC 2 Compliant" },
          { icon: <svg viewBox="0 0 24 24" fill="none" stroke="#00c8e0" strokeWidth="2" style={{ width: 16, height: 16 }}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>, label: "Multi-region Available" },
          { icon: <svg viewBox="0 0 24 24" fill="none" stroke="#00c8e0" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: "Role-based Access" },
          { icon: <svg viewBox="0 0 24 24" fill="none" stroke="#00c8e0" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.1 19.79 19.79 0 0 1 1.59 4.5 2 2 0 0 1 3.56 2.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.9-.9a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 17z"/></svg>, label: "24/7 Support" },
        ].map((item, i, arr) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: i < arr.length - 1 ? 0 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(240,246,255,0.45)" }}>
              {item.icon}
              {item.label}
            </div>
            {i < arr.length - 1 && <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)", margin: "0 20px" }} />}
          </div>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "rgba(13,27,46,0.95)", backdropFilter: "blur(12px)", border: "1px solid rgba(0,200,224,0.4)", borderRadius: 12, padding: "14px 24px", fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "#00c8e0", zIndex: 100, whiteSpace: "nowrap", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          ↗ {toast}
        </div>
      )}

      <style>{`
        @keyframes ff-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        @media (max-width: 1100px) {
          .ff-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .ff-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

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

// ── SVG wheel math ─────────────────────────────────────────────────────────────

const CX = 300, CY = 270, RO = 175, RI = 108;

function rad(d: number) { return d * Math.PI / 180; }
function pt(radius: number, deg: number) {
  return {
    x: +(CX + radius * Math.cos(rad(deg))).toFixed(1),
    y: +(CY + radius * Math.sin(rad(deg))).toFixed(1),
  };
}
function midDeg(s: number, e: number) {
  const end = e < s ? e + 360 : e;
  const m = (s + end) / 2;
  return m >= 360 ? m - 360 : m;
}
function donutPath(R: number, ri: number, s: number, e: number) {
  const end = e < s ? e + 360 : e;
  const lg = (end - s) > 180 ? 1 : 0;
  const p1 = pt(R, s), p2 = pt(R, end), p3 = pt(ri, end), p4 = pt(ri, s);
  return `M${p1.x},${p1.y}A${R},${R},0,${lg},1,${p2.x},${p2.y}L${p3.x},${p3.y}A${ri},${ri},0,${lg},0,${p4.x},${p4.y}Z`;
}
function hexToRgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Phase data ─────────────────────────────────────────────────────────────────

type Phase = {
  n: number;
  name: string;
  color: string;
  s: number;
  e: number;
  headline: string;
  steps: string[];
  route: string | null;
};

const PHASES: Phase[] = [
  {
    n: 1, name: "Evaluate", color: "#4d9fd6", s: 230, e: 310,
    headline: "Clarity before commitment.",
    steps: ["Discovery", "Assess", "Analysis", "Vendor Selection"],
    route: "/solutions",
  },
  {
    n: 2, name: "Implement", color: "#22c55e", s: 320, e: 40,
    headline: "Execution with expertise.",
    steps: ["Kick-Off", "Plan", "Design", "Train / UAT", "Go-Live"],
    route: "/dashboard",
  },
  {
    n: 3, name: "Optimize", color: "#60a5fa", s: 50, e: 130,
    headline: "Performance, sustained.",
    steps: ["Audit", "Impact Assessment", "Utilization", "Enhancement", "Strategy"],
    route: "/optimize",
  },
  {
    n: 4, name: "Transform", color: "#0b9aad", s: 140, e: 220,
    headline: "Growth, by design.",
    steps: ["Trends", "Information & Insight", "Leadership", "Innovation", "Roadmap"],
    route: null,
  },
];

const ARROWS: [number, number][] = [[315, 0], [45, 1], [135, 2], [225, 3]];

// ── Component ──────────────────────────────────────────────────────────────────

export default function ModuleSelectPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [sysStatus, setSysStatus] = useState<SystemStatusResponse | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => {});
  }, []);

  useEffect(() => {
    function fetchStatus() { api.systemStatus().then(setSysStatus).catch(() => {}); }
    fetchStatus();
    const id = setInterval(fetchStatus, 90_000);
    return () => clearInterval(id);
  }, []);

  function handlePhaseClick(phase: Phase) {
    if (phase.route) {
      navigate(phase.route);
    } else {
      setToast(`${phase.name} — Coming Soon`);
      setTimeout(() => setToast(null), 2500);
    }
  }

  const abbr = user ? initials(user.name, user.email) : "…";
  const activePhase = hovered !== null ? PHASES[hovered] : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0d1b2e", color: "#f0f6ff", fontFamily: "'DM Sans', sans-serif", overflowX: "hidden", position: "relative" }}>

      <style>{`
        @keyframes ff-spin { to { transform: rotate(360deg); } }
        .ff-spin-ring { transform-origin: ${CX}px ${CY}px; animation: ff-spin 45s linear infinite; }
      `}</style>

      {/* Background glows */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(ellipse 60% 50% at 15% 20%, rgba(0,200,224,0.07) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 85% 75%, rgba(37,99,235,0.06) 0%, transparent 70%), radial-gradient(ellipse 40% 35% at 70% 15%, rgba(124,58,237,0.05) 0%, transparent 65%)" }} />
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

      {/* Logo */}
      <section style={{ position: "relative", zIndex: 5, textAlign: "center", padding: "36px 48px 4px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <img src={logoUrl} alt="FusionFlow360" style={{ width: 660, height: "auto", display: "block" }} />
        </div>
        <p style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(15px, 2vw, 20px)", fontWeight: 700, color: "rgba(240,246,255,0.6)", letterSpacing: "-0.01em", margin: 0 }}>
          Where Every Engagement <span style={{ color: "#00c8e0" }}>Finds Its Flow</span>
        </p>
      </section>

      {/* Wheel + blurb — side by side */}
      <section style={{ position: "relative", zIndex: 5, padding: "4px 40px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, maxWidth: 1100, margin: "0 auto" }}>

          {/* Left column: wheel + detail panel */}
          <div style={{ flex: "0 0 540px", minWidth: 0 }}>
            <svg
              viewBox="0 0 600 540"
              width="100%"
              style={{ display: "block" }}
            >
              {/* Animated outer guide ring */}
              <circle className="ff-spin-ring" cx={CX} cy={CY} r={RO + 28}
                fill="none" stroke="#c2d6ed" strokeWidth="1" strokeDasharray="5 11" />
              <circle cx={CX} cy={CY} r={RO + 13} fill="none" stroke="#dce9f6" strokeWidth="0.5" />

              {/* Center dark fill */}
              <circle cx={CX} cy={CY} r={RI - 4} fill="#0d1c30" />

              {/* Phase segments */}
              {PHASES.map((p, i) => {
                const isH = hovered === i;
                const mid = midDeg(p.s, p.e);
                const segPt = pt((RO + RI) / 2, mid);
                const lp = pt(RO + 55, mid);
                const ep = pt(RO + 2, mid);
                const cp = pt(RO + 45, mid);

                return (
                  <g
                    key={i}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => handlePhaseClick(p)}
                  >
                    {/* Outer glow halo on hover */}
                    {isH && (
                      <path d={donutPath(RO + 9, RI - 2, p.s + 1, p.e - 1)} fill={p.color} opacity={0.15} />
                    )}
                    {/* Main segment */}
                    <path
                      d={donutPath(RO, RI, p.s, p.e)}
                      fill={p.color}
                      opacity={isH ? 1 : 0.38}
                      style={{ transition: "opacity 0.22s" }}
                    />
                    {/* Phase number */}
                    <text
                      x={segPt.x} y={segPt.y}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize="20" fontWeight="700" fill="white"
                      opacity={isH ? 1 : 0.6}
                      style={{ transition: "opacity 0.22s", pointerEvents: "none" }}
                    >{p.n}</text>

                    {/* Connector line */}
                    <line
                      x1={ep.x} y1={ep.y} x2={cp.x} y2={cp.y}
                      stroke={p.color} strokeWidth="1"
                      opacity={isH ? 0.85 : 0.22}
                      style={{ transition: "opacity 0.22s" }}
                    />
                    {/* Label bubble */}
                    <circle
                      cx={lp.x} cy={lp.y} r="24"
                      fill={hexToRgba(p.color, isH ? 0.2 : 0.05)}
                      stroke={p.color}
                      strokeWidth={isH ? 1.5 : 0}
                      style={{ transition: "fill 0.22s, stroke-width 0.22s" }}
                    />
                    <text
                      x={lp.x} y={lp.y - 8}
                      textAnchor="middle" fontSize="13" fontWeight="700"
                      fill={p.color} opacity={isH ? 1 : 0.55}
                      style={{ transition: "opacity 0.22s", pointerEvents: "none" }}
                    >{p.name}</text>
                    <text
                      x={lp.x} y={lp.y + 8}
                      textAnchor="middle" fontSize="10"
                      fill={isH ? "#a0bfd6" : "#99b5cc"}
                      style={{ transition: "fill 0.22s", pointerEvents: "none" }}
                    >Phase {p.n}</text>
                  </g>
                );
              })}

              {/* Clockwise flow arrows */}
              {ARROWS.map(([deg, phaseIdx]) => {
                const ap = pt(RO + 20, deg);
                const col = PHASES[phaseIdx].color;
                return (
                  <g key={deg} transform={`translate(${ap.x},${ap.y}) rotate(${deg + 180})`}>
                    <circle r="10" fill="#0d1b2e" stroke={hexToRgba(col, 0.45)} strokeWidth="1" />
                    <path d="M0,-5.5 L4,3 L0,0.5 L-4,3Z" fill={col} opacity="0.85" />
                  </g>
                );
              })}

              {/* Inner dashed ring */}
              <circle cx={CX} cy={CY} r={RI - 14}
                fill="none" stroke="#1a4070" strokeWidth="1" strokeDasharray="3 5" opacity="0.6" />

              {/* Center label */}
              {activePhase ? (
                <>
                  <text x={CX} y={CY + 4} textAnchor="middle" fontSize="17" fontWeight="700" fill="white">
                    {activePhase.name}
                  </text>
                  <text x={CX} y={CY + 21} textAnchor="middle" fontSize="8" fill="#4ade80" letterSpacing="0.12em" fontWeight="700">
                    PHASE {activePhase.n} · FF360
                  </text>
                </>
              ) : (
                <>
                  <text x={CX} y={CY + 3} textAnchor="middle" fontSize="13" fontWeight="600" fill="rgba(240,246,255,0.55)">
                    Intelligence
                  </text>
                  <text x={CX} y={CY + 19} textAnchor="middle" fontSize="13" fontWeight="600" fill="rgba(240,246,255,0.55)">
                    Platform
                  </text>
                </>
              )}
            </svg>
          </div>

          {/* Right column: blurb card */}
          <div style={{
            width: 270,
            flexShrink: 0,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderLeft: "3px solid #00c8e0",
            borderRadius: 10,
            padding: "24px 20px",
            alignSelf: "center",
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "#00c8e0", marginBottom: 14 }}>
              FusionFlow360
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(240,246,255,0.65)", lineHeight: 1.75, fontStyle: "italic" }}>
              "From the first discovery call to long-term growth, every client engagement moves through a deliberate journey — built to deliver clarity, momentum, and measurable outcomes.
            </p>
            <p style={{ margin: "14px 0 0", fontSize: 12, fontWeight: 700, color: "rgba(240,246,255,0.4)", letterSpacing: "0.04em" }}>
              Circular. Evolving. Never static.
            </p>
          </div>

        </div>

        {/* Detail panel — below wheel+blurb, unconstrained width */}
        <div style={{ margin: "0 auto", width: "fit-content", minWidth: 540, minHeight: 80, paddingTop: 4 }}>
          {activePhase ? (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${hexToRgba(activePhase.color, 0.2)}`,
              borderTop: `3px solid ${activePhase.color}`,
              borderRadius: "0 0 12px 12px",
              padding: "16px 28px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".12em",
                  background: hexToRgba(activePhase.color, 0.12), color: activePhase.color,
                  border: `1px solid ${hexToRgba(activePhase.color, 0.3)}`, padding: "3px 10px", borderRadius: 4,
                }}>Phase {activePhase.n}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#f0f6ff" }}>{activePhase.name}</span>
                <span style={{ fontSize: 12, color: activePhase.color, fontStyle: "italic" }}>{activePhase.headline}</span>
                <div style={{ marginLeft: "auto" }}>
                  {activePhase.route ? (
                    <button
                      onClick={() => navigate(activePhase.route!)}
                      style={{
                        padding: "7px 18px", borderRadius: 6,
                        background: hexToRgba(activePhase.color, 0.15),
                        border: `1px solid ${hexToRgba(activePhase.color, 0.45)}`,
                        color: activePhase.color, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      }}
                    >Enter Module →</button>
                  ) : (
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".1em",
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                      color: "rgba(240,246,255,0.35)", padding: "4px 10px", borderRadius: 4,
                    }}>Coming Soon</span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "nowrap" as const, gap: 8 }}>
                {activePhase.steps.map((step) => (
                  <span key={step} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 13px",
                    background: hexToRgba(activePhase.color, 0.08),
                    border: `1.5px solid ${hexToRgba(activePhase.color, 0.3)}`,
                    borderRadius: 20, fontSize: 12, color: activePhase.color, fontWeight: 500, whiteSpace: "nowrap" as const,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: activePhase.color, display: "inline-block", flexShrink: 0 }} />
                    {step}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "16px 0", fontSize: 11, color: "rgba(240,246,255,0.22)", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
              hover a phase to explore
            </div>
          )}
        </div>
      </section>

      {/* Bottom strip */}
      <div style={{ position: "relative", zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px 48px 28px", borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
        {[
          { label: "SOC 2 Compliant" },
          { label: "Multi-region Available" },
          { label: "Role-based Access" },
          { label: "24/7 Support" },
        ].map((item, i, arr) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "rgba(240,246,255,0.35)" }}>{item.label}</span>
            {i < arr.length - 1 && <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)", margin: "0 24px" }} />}
          </div>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "rgba(13,27,46,0.95)", backdropFilter: "blur(12px)", border: "1px solid rgba(0,200,224,0.4)", borderRadius: 12, padding: "14px 24px", fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "#00c8e0", zIndex: 100, whiteSpace: "nowrap" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          ↗ {toast}
        </div>
      )}
    </div>
  );
}

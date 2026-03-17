import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type DashboardSummaryResponse } from "../lib/api";

// ── Color maps ────────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<string, string> = {
  on_track: "#107c10",
  at_risk: "#ff8c00",
  off_track: "#d13438",
};
const PRIORITY_COLOR: Record<string, string> = {
  high: "#d13438",
  medium: "#ff8c00",
  low: "#94a3b8",
};
const SEVERITY_COLOR: Record<string, string> = {
  high: "#d13438",
  medium: "#ff8c00",
  low: "#94a3b8",
};
const STATUS_COLOR: Record<string, string> = {
  completed: "#059669",
  in_progress: "#0891b2",
  not_started: "#94a3b8",
  blocked: "#d13438",
};
const PHASE_COLORS = [
  "#0078d4", "#107c10", "#ff8c00", "#8764b8",
  "#00b7c3", "#e74856", "#ca5010", "#038387",
];

const VENDOR_COLORS: Record<string, string> = {
  Zoom:        "#0078d4",
  RingCentral: "#ff8c00",
  Unknown:     "#94a3b8",
};

const TYPE_LABELS: Record<string, string> = {
  ucaas:   "UCaaS",
  ccaas:   "CCaaS",
  zoom_ra: "Zoom Rev. Accel.",
  zoom_va: "Zoom Virtual Agent",
  rc_ace:  "RC ACE",
  rc_air:  "RC AIR",
  Unknown: "Unknown",
};
const TYPE_COLORS = [
  "#0891b2", "#8764b8", "#059669", "#ff8c00",
  "#e74856", "#038387", "#94a3b8",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthLabel(h: string | null) {
  if (!h) return "—";
  return h.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="ms-badge"
      style={{ background: color + "1a", color, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}

function DonutChart({
  data,
  colorMap,
  fallbackColors,
  centerLabel = "projects",
}: {
  data: { label: string; count: number }[];
  colorMap?: Record<string, string>;
  fallbackColors?: string[];
  centerLabel?: string;
}) {
  const palette = fallbackColors ?? PHASE_COLORS;
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <div style={{ fontSize: 13, color: "rgba(240,246,255,0.35)", fontStyle: "italic" }}>No data yet.</div>;

  const cx = 72, cy = 72, R = 62, r = 40;
  let cumAngle = -Math.PI / 2;

  function colorFor(label: string, idx: number) {
    return colorMap?.[label] ?? palette[idx % palette.length];
  }

  function slice(count: number, color: string, idx: number) {
    const angle = (count / total) * 2 * Math.PI;
    const start = cumAngle;
    const end = cumAngle + angle;
    cumAngle = end;
    const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
    const x2 = cx + R * Math.cos(end),   y2 = cy + R * Math.sin(end);
    const ix1 = cx + r * Math.cos(end),  iy1 = cy + r * Math.sin(end);
    const ix2 = cx + r * Math.cos(start),iy2 = cy + r * Math.sin(start);
    const large = angle > Math.PI ? 1 : 0;
    return (
      <path
        key={idx}
        d={`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${r} ${r} 0 ${large} 0 ${ix2} ${iy2} Z`}
        fill={color}
        stroke="#021a2e"
        strokeWidth={2}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width={144} height={144} viewBox="0 0 144 144" style={{ flexShrink: 0 }}>
        {data.map((d, i) => slice(d.count, colorFor(d.label, i), i))}
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#f0f6ff" fontSize={20} fontWeight={700}>{total}</text>
        <text x={cx} y={cy + 11} textAnchor="middle" fill="rgba(240,246,255,0.45)" fontSize={9}>{centerLabel}</text>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {data.map((d, i) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: colorFor(d.label, i) }} />
            <span style={{ fontSize: 12, color: "rgba(240,246,255,0.8)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#f0f6ff", flexShrink: 0 }}>{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ title, value, accent }: { title: string; value: number; accent?: string }) {
  return (
    <div className="ms-metric-card">
      <div className="ms-metric-label">{title}</div>
      <div className="ms-metric-value" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.dashboardSummary().then((d) => {
      if (d.user.role === "client") {
        navigate("/projects", { replace: true });
        return;
      }
      setData(d);
    });
  }, [navigate]);

  if (!data) {
    return <div style={{ padding: 40, color: "rgba(240,246,255,0.5)" }}>Loading...</div>;
  }

  const { user, summary, projects, openTasks, openRisks, phaseDistribution, vendorDistribution, typeDistribution } = data;

  // Normalize vendor labels (DB stores "Zoom" / "RingCentral" from the VENDOR_LABELS map)
  const vendorData = vendorDistribution.map((d) => ({
    label: d.label === "zoom" ? "Zoom" : d.label === "ringcentral" ? "RingCentral" : d.label,
    count: d.count,
  }));

  // Map raw solution_type keys to display labels
  const typeData = typeDistribution.map((d) => ({
    label: TYPE_LABELS[d.label] ?? d.label,
    count: d.count,
  }));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="ms-page-title">Dashboard</h1>
        <p className="ms-page-subtitle">Welcome back, {user.name}</p>
      </div>

      {/* Metric cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <MetricCard title="Active Projects" value={summary.activeProjects} />
        <MetricCard title="At Risk" value={summary.atRiskProjects} accent={summary.atRiskProjects > 0 ? "#ff8c00" : undefined} />
        <MetricCard title="Open Tasks" value={summary.openTasks} />
        <MetricCard title="Open Risks" value={summary.openRisks} accent={summary.openRisks > 0 ? "#d13438" : undefined} />
      </div>

      {/* Distribution charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
        <div className="ms-section-card">
          <div className="ms-section-title">By Stage</div>
          <DonutChart
            data={phaseDistribution.map((d) => ({ label: d.phase_name, count: d.count }))}
            fallbackColors={PHASE_COLORS}
            centerLabel="projects"
          />
        </div>
        <div className="ms-section-card">
          <div className="ms-section-title">By Vendor</div>
          <DonutChart
            data={vendorData}
            colorMap={VENDOR_COLORS}
            centerLabel="projects"
          />
        </div>
        <div className="ms-section-card">
          <div className="ms-section-title">By Solution Type</div>
          <DonutChart
            data={typeData}
            fallbackColors={TYPE_COLORS}
            centerLabel="projects"
          />
        </div>
      </div>

      {/* Projects table */}
      <div className="ms-card" style={{ marginBottom: 20, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "rgba(240,246,255,0.9)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Projects
          </span>
          <Link to="/projects" style={{ fontSize: 13, color: "#63c1ea", textDecoration: "none", fontWeight: 600 }}>
            View all →
          </Link>
        </div>
        <table className="ms-table">
          <thead>
            <tr>
              {["Project", "Customer", "Vendor", "Status", "Health", "Target Go-Live"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "rgba(240,246,255,0.5)", padding: "24px 16px" }}>
                  No projects yet.
                </td>
              </tr>
            )}
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link
                    to={`/projects/${p.id}`}
                    style={{ color: "#63c1ea", textDecoration: "none", fontWeight: 600 }}
                  >
                    {p.name}
                  </Link>
                </td>
                <td style={{ color: "rgba(240,246,255,0.6)" }}>{p.customer_name ?? "—"}</td>
                <td style={{ color: "rgba(240,246,255,0.6)" }}>{p.vendor ?? "—"}</td>
                <td>
                  <Badge
                    label={p.status?.replace("_", " ") ?? "—"}
                    color={STATUS_COLOR[p.status ?? ""] ?? "#94a3b8"}
                  />
                </td>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: HEALTH_COLOR[p.health ?? ""] ?? "#94a3b8", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "rgba(240,246,255,0.85)" }}>{healthLabel(p.health)}</span>
                  </span>
                </td>
                <td style={{ color: "rgba(240,246,255,0.6)" }}>{formatDate(p.target_go_live_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Open Tasks + Open Risks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Open Tasks */}
        <div className="ms-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", fontWeight: 700, fontSize: 14, color: "rgba(240,246,255,0.9)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Open Tasks
          </div>
          {openTasks.length === 0 ? (
            <div style={{ padding: "20px", color: "rgba(240,246,255,0.5)", fontSize: 14 }}>No open tasks.</div>
          ) : (
            <div>
              {openTasks.map((t) => (
                <div
                  key={t.id}
                  style={{ padding: "11px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "flex-start", gap: 10 }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[t.status ?? ""] ?? "#94a3b8", marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      to={`/projects/${t.project_id}?tab=tasks&taskId=${t.id}`}
                      style={{ fontSize: 13, color: "rgba(240,246,255,0.9)", fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", textDecoration: "none" }}
                    >
                      {t.title}
                    </Link>
                    <div style={{ fontSize: 12, color: "rgba(240,246,255,0.5)", display: "flex", gap: 6 }}>
                      <Link to={`/projects/${t.project_id}`} style={{ color: "#63c1ea", textDecoration: "none" }}>
                        {t.project_name}
                      </Link>
                      {t.due_date && <span>· Due {formatDate(t.due_date)}</span>}
                    </div>
                  </div>
                  {t.priority && (
                    <Badge label={t.priority} color={PRIORITY_COLOR[t.priority] ?? "#94a3b8"} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open Risks */}
        <div className="ms-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", fontWeight: 700, fontSize: 14, color: "rgba(240,246,255,0.9)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Open Risks
          </div>
          {openRisks.length === 0 ? (
            <div style={{ padding: "20px", color: "rgba(240,246,255,0.5)", fontSize: 14 }}>No open risks.</div>
          ) : (
            <div>
              {openRisks.map((r) => (
                <div
                  key={r.id}
                  style={{ padding: "11px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "flex-start", gap: 10 }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEVERITY_COLOR[r.severity ?? ""] ?? "#94a3b8", marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "rgba(240,246,255,0.9)", fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <Link to={`/projects/${r.project_id}`} style={{ color: "#63c1ea", textDecoration: "none" }}>
                        {r.project_name}
                      </Link>
                    </div>
                  </div>
                  {r.severity && (
                    <Badge label={r.severity} color={SEVERITY_COLOR[r.severity] ?? "#94a3b8"} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

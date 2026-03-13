import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  low: "#605e5c",
};
const SEVERITY_COLOR: Record<string, string> = {
  high: "#d13438",
  medium: "#ff8c00",
  low: "#605e5c",
};
const STATUS_COLOR: Record<string, string> = {
  completed: "#107c10",
  in_progress: "#0078d4",
  not_started: "#605e5c",
  blocked: "#d13438",
};
const PHASE_COLORS = [
  "#0078d4", "#107c10", "#ff8c00", "#8764b8",
  "#00b7c3", "#e74856", "#ca5010", "#038387",
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

function DonutChart({ data }: { data: { phase_name: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;

  const cx = 80, cy = 80, R = 68, r = 44;
  let cumAngle = -Math.PI / 2;

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
        stroke="#fff"
        strokeWidth={2}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <svg width={160} height={160} viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
        {data.map((d, i) => slice(d.count, PHASE_COLORS[i % PHASE_COLORS.length], i))}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#323130" fontSize={22} fontWeight={700}>{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#605e5c" fontSize={10}>projects</text>
      </svg>
      <div style={{ flex: 1 }}>
        {data.map((d, i) => (
          <div key={d.phase_name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: PHASE_COLORS[i % PHASE_COLORS.length] }} />
            <span style={{ fontSize: 13, color: "#323130", flex: 1 }}>{d.phase_name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#323130" }}>{d.count}</span>
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

  useEffect(() => {
    api.dashboardSummary().then(setData);
  }, []);

  if (!data) {
    return <div style={{ padding: 40, color: "#605e5c" }}>Loading...</div>;
  }

  const { user, summary, projects, openTasks, openRisks, phaseDistribution } = data;

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

      {/* Phase distribution */}
      {phaseDistribution.length > 0 && (
        <div className="ms-section-card" style={{ marginBottom: 20 }}>
          <div className="ms-section-title">Projects by Stage</div>
          <DonutChart data={phaseDistribution} />
        </div>
      )}

      {/* Projects table */}
      <div className="ms-card" style={{ marginBottom: 20, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #edebe9" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#323130", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Projects
          </span>
          <Link to="/projects" style={{ fontSize: 13, color: "#0078d4", textDecoration: "none", fontWeight: 600 }}>
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
                <td colSpan={6} style={{ textAlign: "center", color: "#605e5c", padding: "24px 16px" }}>
                  No projects yet.
                </td>
              </tr>
            )}
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link
                    to={`/projects/${p.id}`}
                    style={{ color: "#0078d4", textDecoration: "none", fontWeight: 600 }}
                  >
                    {p.name}
                  </Link>
                </td>
                <td style={{ color: "#605e5c" }}>{p.customer_name ?? "—"}</td>
                <td style={{ color: "#605e5c" }}>{p.vendor ?? "—"}</td>
                <td>
                  <Badge
                    label={p.status?.replace("_", " ") ?? "—"}
                    color={STATUS_COLOR[p.status ?? ""] ?? "#605e5c"}
                  />
                </td>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: HEALTH_COLOR[p.health ?? ""] ?? "#605e5c", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "#323130" }}>{healthLabel(p.health)}</span>
                  </span>
                </td>
                <td style={{ color: "#605e5c" }}>{formatDate(p.target_go_live_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Open Tasks + Open Risks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Open Tasks */}
        <div className="ms-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #edebe9", fontWeight: 700, fontSize: 14, color: "#323130", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Open Tasks
          </div>
          {openTasks.length === 0 ? (
            <div style={{ padding: "20px", color: "#605e5c", fontSize: 14 }}>No open tasks.</div>
          ) : (
            <div>
              {openTasks.map((t) => (
                <div
                  key={t.id}
                  style={{ padding: "11px 20px", borderBottom: "1px solid #edebe9", display: "flex", alignItems: "flex-start", gap: 10 }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[t.status ?? ""] ?? "#605e5c", marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#323130", fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#605e5c", display: "flex", gap: 6 }}>
                      <Link to={`/projects/${t.project_id}`} style={{ color: "#0078d4", textDecoration: "none" }}>
                        {t.project_name}
                      </Link>
                      {t.due_date && <span>· Due {formatDate(t.due_date)}</span>}
                    </div>
                  </div>
                  {t.priority && (
                    <Badge label={t.priority} color={PRIORITY_COLOR[t.priority] ?? "#605e5c"} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open Risks */}
        <div className="ms-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #edebe9", fontWeight: 700, fontSize: 14, color: "#323130", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Open Risks
          </div>
          {openRisks.length === 0 ? (
            <div style={{ padding: "20px", color: "#605e5c", fontSize: 14 }}>No open risks.</div>
          ) : (
            <div>
              {openRisks.map((r) => (
                <div
                  key={r.id}
                  style={{ padding: "11px 20px", borderBottom: "1px solid #edebe9", display: "flex", alignItems: "flex-start", gap: 10 }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEVERITY_COLOR[r.severity ?? ""] ?? "#605e5c", marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#323130", fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <Link to={`/projects/${r.project_id}`} style={{ color: "#0078d4", textDecoration: "none" }}>
                        {r.project_name}
                      </Link>
                    </div>
                  </div>
                  {r.severity && (
                    <Badge label={r.severity} color={SEVERITY_COLOR[r.severity] ?? "#605e5c"} />
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

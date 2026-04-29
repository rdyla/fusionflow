import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { supportApi, severityColor, type SupportDashboardResponse, type SupportUser } from "../lib/supportApi";

const STATUS_COLORS = ["#0891b2", "#8764b8", "#ff8c00", "#059669", "#94a3b8", "#e74856", "#038387"];
const OWNER_COLORS  = ["#0078d4", "#107c10", "#ff8c00", "#8764b8", "#00b7c3", "#e74856", "#ca5010", "#94a3b8"];
const AGING_COLORS: Record<string, string> = {
  "<1d":  "#059669",
  "1–3d": "#0891b2",
  "3–7d": "#ff8c00",
  "7d+":  "#d13438",
};

function MetricCard({ title, value, accent }: { title: string; value: string | number; accent?: string }) {
  return (
    <div className="ms-metric-card">
      <div className="ms-metric-label">{title}</div>
      <div className="ms-metric-value" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

function DonutChart({
  data, colorFor, centerLabel,
}: {
  data: { label: string; count: number }[];
  colorFor: (label: string, idx: number) => string;
  centerLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No data.</div>;
  }
  const cx = 72, cy = 72, R = 62, r = 40;
  let cumAngle = -Math.PI / 2;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width={144} height={144} viewBox="0 0 144 144" style={{ flexShrink: 0 }}>
        {data.map((d, i) => {
          const angle = (d.count / total) * 2 * Math.PI;
          const start = cumAngle;
          const end   = cumAngle + angle;
          cumAngle = end;
          const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
          const x2 = cx + R * Math.cos(end),   y2 = cy + R * Math.sin(end);
          const ix1 = cx + r * Math.cos(end),  iy1 = cy + r * Math.sin(end);
          const ix2 = cx + r * Math.cos(start), iy2 = cy + r * Math.sin(start);
          const large = angle > Math.PI ? 1 : 0;
          return (
            <path
              key={d.label + i}
              d={`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${r} ${r} 0 ${large} 0 ${ix2} ${iy2} Z`}
              fill={colorFor(d.label, i)}
              stroke="#021a2e"
              strokeWidth={2}
            />
          );
        })}
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#1e293b" fontSize={20} fontWeight={700}>{total}</text>
        <text x={cx} y={cy + 11} textAnchor="middle" fill="#64748b" fontSize={9}>{centerLabel}</text>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {data.map((d, i) => (
          <div key={d.label + i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: colorFor(d.label, i) }} />
            <span style={{ fontSize: 12, color: "#334155", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", flexShrink: 0 }}>{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ days, opened, resolved }: { days: string[]; opened: number[]; resolved: number[] }) {
  const W = 720, H = 180, padL = 28, padR = 8, padT = 10, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(1, ...opened, ...resolved);
  const stepX = innerW / Math.max(1, days.length - 1);

  function pointsFor(values: number[]): string {
    return values.map((v, i) => {
      const x = padL + i * stepX;
      const y = padT + innerH - (v / max) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }

  const ticks = [0, Math.ceil(max / 2), max];
  const firstLabel = new Date(days[0] + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lastLabel  = new Date(days[days.length - 1] + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {/* Y axis grid */}
        {ticks.map((t, i) => {
          const y = padT + innerH - (t / max) * innerH;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#94a3b8">{t}</text>
            </g>
          );
        })}
        {/* Opened line */}
        <polyline fill="none" stroke="#0891b2" strokeWidth={2} points={pointsFor(opened)} />
        {/* Resolved line */}
        <polyline fill="none" stroke="#059669" strokeWidth={2} points={pointsFor(resolved)} />
        {/* X axis labels */}
        <text x={padL} y={H - 6} fontSize={10} fill="#94a3b8">{firstLabel}</text>
        <text x={W - padR} y={H - 6} textAnchor="end" fontSize={10} fill="#94a3b8">{lastLabel}</text>
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "#334155" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 2, background: "#0891b2" }} /> Opened
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 2, background: "#059669" }} /> Resolved
        </span>
      </div>
    </div>
  );
}

export default function SupportDashboardPage() {
  const user = useOutletContext<SupportUser | null>();
  const navigate = useNavigate();
  const [data, setData] = useState<SupportDashboardResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user === null) return;
    if (!user.isInternal) {
      navigate("/support/cases", { replace: true });
      return;
    }
    supportApi.getDashboard()
      .then(setData)
      .catch((e) => setError(e.message));
  }, [user, navigate]);

  if (error) {
    return <div style={{ padding: 40, color: "#d13438" }}>Error: {error}</div>;
  }
  if (!data) {
    return <div style={{ padding: 40, color: "#64748b" }}>Loading…</div>;
  }

  const { kpis, severityDistribution, statusDistribution, ownerDistribution, agingBuckets, trend, windowDays } = data;
  const avgResolve = kpis.avgResolveDays === null
    ? "—"
    : kpis.avgResolveDays < 1
      ? `${(kpis.avgResolveDays * 24).toFixed(1)}h`
      : `${kpis.avgResolveDays.toFixed(1)}d`;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #e2e8f0" }}>
        <button
          style={{ padding: "8px 14px", background: "transparent", border: "none", borderBottom: "2px solid #0891b2", fontSize: 13, fontWeight: 600, color: "#0891b2", cursor: "default" }}>
          Dashboard
        </button>
        <button onClick={() => navigate("/support/cases")}
          style={{ padding: "8px 14px", background: "transparent", border: "none", borderBottom: "2px solid transparent", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer" }}>
          Cases
        </button>
      </div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="ms-page-title">Support Dashboard</h1>
        <p className="ms-page-subtitle">Open case snapshot · {windowDays}-day trend</p>
      </div>

      {/* KPI cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <MetricCard title="Open Cases" value={kpis.totalOpen} />
        <MetricCard title="P1 / E1 Open" value={kpis.p1Open} accent={kpis.p1Open > 0 ? "#d13438" : undefined} />
        <MetricCard title="Unassigned" value={kpis.unassigned} accent={kpis.unassigned > 0 ? "#ff8c00" : undefined} />
        <MetricCard title={`Resolved (${windowDays}d)`} value={kpis.resolvedLast30d} />
        <MetricCard title={`Avg Resolve (${windowDays}d)`} value={avgResolve} />
      </div>

      {/* Distributions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
        <div className="ms-section-card">
          <div className="ms-section-title">By Severity</div>
          <DonutChart
            data={severityDistribution}
            colorFor={(label) => severityColor(label)}
            centerLabel="open"
          />
        </div>
        <div className="ms-section-card">
          <div className="ms-section-title">By Status</div>
          <DonutChart
            data={statusDistribution}
            colorFor={(_, i) => STATUS_COLORS[i % STATUS_COLORS.length]}
            centerLabel="open"
          />
        </div>
        <div className="ms-section-card">
          <div className="ms-section-title">By Owner</div>
          <DonutChart
            data={ownerDistribution}
            colorFor={(label, i) => label === "Unassigned" ? "#94a3b8" : OWNER_COLORS[i % OWNER_COLORS.length]}
            centerLabel="open"
          />
        </div>
      </div>

      {/* Aging + Trend */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <div className="ms-section-card">
          <div className="ms-section-title">Aging (Open)</div>
          {agingBuckets.every((b) => b.count === 0) ? (
            <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No open cases.</div>
          ) : (
            <div>
              {agingBuckets.map((b) => {
                const max = Math.max(1, ...agingBuckets.map((x) => x.count));
                const pct = (b.count / max) * 100;
                const color = AGING_COLORS[b.label] ?? "#94a3b8";
                return (
                  <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 36, fontSize: 12, color: "#334155", fontWeight: 600 }}>{b.label}</span>
                    <div style={{ flex: 1, height: 14, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: color }} />
                    </div>
                    <span style={{ width: 28, textAlign: "right", fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{b.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="ms-section-card">
          <div className="ms-section-title">Opened vs Resolved ({windowDays}d)</div>
          <TrendChart days={trend.days} opened={trend.opened} resolved={trend.resolved} />
        </div>
      </div>
    </div>
  );
}

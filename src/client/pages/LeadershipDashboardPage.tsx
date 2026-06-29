import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type LeadershipDashboardResponse } from "../lib/api";

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T00:00:00" : d;
  return new Date(normalized).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const WINDOW_OPTIONS: { value: "week" | "month" | "quarter"; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  accent,
  sub,
}: {
  title: string;
  value: number | string;
  accent?: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="ms-metric-card">
      <div className="ms-metric-label">{title}</div>
      <div className="ms-metric-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function WindowToggle({
  value,
  onChange,
}: {
  value: "week" | "month" | "quarter";
  onChange: (v: "week" | "month" | "quarter") => void;
}) {
  return (
    <div style={{ display: "inline-flex", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      {WINDOW_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              color: active ? "#fff" : "#475569",
              background: active ? "#0b9aad" : "transparent",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LeadershipDashboardPage() {
  const [window, setWindow] = useState<"week" | "month" | "quarter">("week");
  const [data, setData] = useState<LeadershipDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.leadershipDashboard(window)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [window]);

  const windowLabel = WINDOW_OPTIONS.find((o) => o.value === window)?.label ?? "Week";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="ms-page-title">Leadership</h1>
          <p className="ms-page-subtitle">Outcomes and capacity over the current {windowLabel.toLowerCase()}</p>
        </div>
        <WindowToggle value={window} onChange={setWindow} />
      </div>

      {error && (
        <div className="ms-section-card" style={{ color: "#d13438", marginBottom: 20 }}>{error}</div>
      )}

      {loading && !data ? (
        <div style={{ padding: 40, color: "#64748b" }}>Loading...</div>
      ) : data ? (
        <>
          {/* ── Outcomes ─────────────────────────────────────────────────── */}
          <div className="ms-section-title" style={{ marginBottom: 12 }}>Outcomes</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 20 }}>
            <MetricCard title="Tasks Completed" value={data.projects.tasksCompleted} />
            <MetricCard title="Go-Lives" value={data.projects.goLives.length} accent={data.projects.goLives.length > 0 ? "#107c10" : undefined} />
            <MetricCard title="Upcoming Go-Lives" value={data.projects.upcomingGoLives.length} />
            <MetricCard
              title="Active Projects"
              value={data.projects.activeProjects}
              sub={`${data.projects.atRiskProjects} at risk · ${data.projects.blockedProjects} blocked`}
            />
            <MetricCard
              title="Open Blockers"
              value={data.projects.openBlockers}
              accent={data.projects.openBlockers > 0 ? "#d13438" : undefined}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
            <div className="ms-section-card">
              <div className="ms-section-title" style={{ marginBottom: 12 }}>Go-lives this period</div>
              {data.projects.goLives.length === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No go-lives in this period.</div>
              ) : (
                <div>
                  {data.projects.goLives.map((g) => (
                    <ListRow
                      key={g.id}
                      to={`/projects/${g.id}`}
                      title={g.name ?? "Untitled"}
                      subtitle={g.customer_name}
                      right={formatDate(g.date)}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="ms-section-card">
              <div className="ms-section-title" style={{ marginBottom: 12 }}>Upcoming go-lives (30d)</div>
              {data.projects.upcomingGoLives.length === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No upcoming go-lives in the next 30 days.</div>
              ) : (
                <div>
                  {data.projects.upcomingGoLives.map((g) => (
                    <ListRow
                      key={g.id}
                      to={`/projects/${g.id}`}
                      title={g.name ?? "Untitled"}
                      subtitle={g.customer_name}
                      right={formatDate(g.date)}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="ms-section-card">
              <div className="ms-section-title" style={{ marginBottom: 12 }}>Went live · still open</div>
              {data.projects.wentLiveStillOpen.length === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>Nothing lingering — go-lives are wrapped up or in Optimize.</div>
              ) : (
                <div>
                  {data.projects.wentLiveStillOpen.map((g) => (
                    <ListRow
                      key={g.id}
                      to={`/projects/${g.id}`}
                      title={g.name ?? "Untitled"}
                      subtitle={g.customer_name}
                      right={formatDate(g.date)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Capacity ─────────────────────────────────────────────────── */}
          <div className="ms-section-title" style={{ marginBottom: 12 }}>Capacity</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <TotalHoursCard total={data.time.totalHours} prev={data.time.prevTotalHours} entries={data.time.entries} />

            <div className="ms-section-card">
              <div className="ms-section-title" style={{ marginBottom: 12 }}>Hours by engineer</div>
              {data.time.totalHours === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No time logged in the app for this period yet.</div>
              ) : (
                <HoursLeaderboard
                  rows={data.time.byEngineer.map((e) => ({
                    key: e.user_id ?? e.email ?? e.name ?? "unknown",
                    label: e.name ?? e.email ?? "Unassigned",
                    hours: e.hours,
                  }))}
                />
              )}
            </div>

            <div className="ms-section-card">
              <div className="ms-section-title" style={{ marginBottom: 12 }}>Top projects by hours</div>
              {data.time.totalHours === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No time logged in the app for this period yet.</div>
              ) : (
                <div>
                  {data.time.byProject.map((p) => (
                    <ListRow
                      key={p.project_id ?? p.name ?? "unknown"}
                      to={p.project_id ? `/projects/${p.project_id}` : undefined}
                      title={p.name ?? "Unknown project"}
                      subtitle={p.customer_name}
                      right={`${p.hours.toFixed(1)} h`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function TotalHoursCard({ total, prev, entries }: { total: number; prev: number; entries: number }) {
  const delta = total - prev;
  const up = delta >= 0;
  const pct = prev > 0 ? Math.round((delta / prev) * 100) : null;
  return (
    <div className="ms-section-card">
      <div className="ms-metric-label">Total Hours</div>
      <div className="ms-metric-value" style={{ marginTop: 2 }}>{total.toFixed(1)}</div>
      {total === 0 ? (
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>No time logged in the app for this period yet.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12 }}>
          <span style={{ color: up ? "#107c10" : "#d13438", fontWeight: 700 }}>
            {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} h{pct !== null ? ` (${up ? "+" : ""}${pct}%)` : ""}
          </span>
          <span style={{ color: "#94a3b8" }}>vs prior period</span>
        </div>
      )}
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{entries} {entries === 1 ? "entry" : "entries"}</div>
    </div>
  );
}

function HoursLeaderboard({ rows }: { rows: { key: string; label: string; hours: number }[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.hours), 0) || 1;
  return (
    <div>
      {rows.map((r) => (
        <div key={r.key} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
            <span style={{ fontSize: 13, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", flexShrink: 0, marginLeft: 8 }}>{r.hours.toFixed(1)} h</span>
          </div>
          <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(r.hours / max) * 100}%`, background: "#0b9aad", borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListRow({
  to,
  title,
  subtitle,
  right,
}: {
  to?: string;
  title: string;
  subtitle?: string | null;
  right?: React.ReactNode;
}) {
  const content = (
    <>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: to ? "#0b9aad" : "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>}
      </div>
      {right != null && <span style={{ fontSize: 12, color: "#475569", flexShrink: 0, marginLeft: 10 }}>{right}</span>}
    </>
  );
  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid #f1f5f9",
    textDecoration: "none",
  };
  if (to) {
    return <Link to={to} style={rowStyle}>{content}</Link>;
  }
  return <div style={rowStyle}>{content}</div>;
}

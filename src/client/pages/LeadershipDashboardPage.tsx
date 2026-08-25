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

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>{children}</div>;
}

// ── Sub-components ───────────────────────────────────────────────────────────

// A metric tile that, when given `expandKey` + `onToggle`, becomes clickable —
// click reveals `children` (the list/detail comprising that number) inline,
// via a rotating chevron affordance. Portfolio-wide numbers here have no
// single project's tab to drill into (unlike the per-project Dashboard's
// tab-switch KPI tiles), so this expands in place instead of navigating.
function MetricCard({
  title,
  value,
  accent,
  sub,
  expandKey,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  value: number | string;
  accent?: string;
  sub?: React.ReactNode;
  expandKey?: string;
  expanded?: boolean;
  onToggle?: (key: string) => void;
  children?: React.ReactNode;
}) {
  const expandable = !!expandKey && !!onToggle;
  return (
    <div
      className="ms-metric-card"
      role={expandable ? "button" : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
      onClick={expandable ? () => onToggle!(expandKey!) : undefined}
      onKeyDown={
        expandable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle!(expandKey!);
              }
            }
          : undefined
      }
      style={expandable ? { cursor: "pointer" } : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="ms-metric-label">{title}</div>
        {expandable && (
          <span
            style={{
              fontSize: 10,
              color: "#94a3b8",
              display: "inline-block",
              transform: expanded ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
            }}
          >
            ▶
          </span>
        )}
      </div>
      <div className="ms-metric-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{sub}</div>}
      {expandable && expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9" }} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
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
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
          <p style={{ fontSize: 12, color: "#94a3b8", marginTop: -8, marginBottom: 12 }}>Click any tile to see what makes it up.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
            <MetricCard
              title="Projects by PM"
              value={data.projects.projectsByPM.filter((r) => r.user_id).length}
              sub={
                data.projects.projectsByPM[0]?.user_id
                  ? `busiest: ${data.projects.projectsByPM[0].name ?? "Unknown"} (${data.projects.projectsByPM[0].n})`
                  : undefined
              }
              expandKey="projectsByPM"
              expanded={expandedKeys.has("projectsByPM")}
              onToggle={toggleExpand}
            >
              {data.projects.projectsByPM.length === 0 ? (
                <EmptyNote>No active projects assigned to a PM.</EmptyNote>
              ) : (
                <HoursLeaderboard
                  rows={data.projects.projectsByPM.map((r) => ({
                    key: r.user_id ?? "unassigned",
                    label: r.user_id ? r.name ?? "Unknown" : "Unassigned",
                    hours: r.n,
                  }))}
                  unit=""
                />
              )}
            </MetricCard>

            <MetricCard
              title="Active Projects"
              value={data.projects.activeProjects}
              expandKey="activeProjects"
              expanded={expandedKeys.has("activeProjects")}
              onToggle={toggleExpand}
            >
              {data.projects.activeProjectsList.length === 0 ? (
                <EmptyNote>No active projects.</EmptyNote>
              ) : (
                <>
                  {data.projects.activeProjectsList.map((p) => (
                    <ListRow key={p.id} to={`/projects/${p.id}`} title={p.name ?? "Untitled"} subtitle={p.customer_name} right={p.health ?? p.status} />
                  ))}
                  {data.projects.activeProjects > data.projects.activeProjectsList.length && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                      Showing {data.projects.activeProjectsList.length} of {data.projects.activeProjects}.
                    </div>
                  )}
                </>
              )}
            </MetricCard>

            <MetricCard
              title="At Risk"
              value={data.projects.atRiskProjects}
              accent={data.projects.atRiskProjects > 0 ? "#ff8c00" : undefined}
              expandKey="atRiskProjects"
              expanded={expandedKeys.has("atRiskProjects")}
              onToggle={toggleExpand}
            >
              {data.projects.atRiskProjectsList.length === 0 ? (
                <EmptyNote>No at-risk projects.</EmptyNote>
              ) : (
                data.projects.atRiskProjectsList.map((p) => (
                  <ListRow key={p.id} to={`/projects/${p.id}`} title={p.name ?? "Untitled"} subtitle={p.customer_name} right={p.status} />
                ))
              )}
            </MetricCard>

            <MetricCard
              title="Blocked"
              value={data.projects.blockedProjects}
              accent={data.projects.blockedProjects > 0 ? "#d13438" : undefined}
              expandKey="blockedProjects"
              expanded={expandedKeys.has("blockedProjects")}
              onToggle={toggleExpand}
            >
              {data.projects.blockedProjectsList.length === 0 ? (
                <EmptyNote>No blocked projects.</EmptyNote>
              ) : (
                data.projects.blockedProjectsList.map((p) => (
                  <ListRow key={p.id} to={`/projects/${p.id}`} title={p.name ?? "Untitled"} subtitle={p.customer_name} right={p.health} />
                ))
              )}
            </MetricCard>

            <MetricCard
              title="Went Live · Still Open"
              value={data.projects.wentLiveStillOpen.length}
              expandKey="wentLiveStillOpen"
              expanded={expandedKeys.has("wentLiveStillOpen")}
              onToggle={toggleExpand}
            >
              {data.projects.wentLiveStillOpen.length === 0 ? (
                <EmptyNote>Nothing lingering — go-lives are wrapped up or in Optimize.</EmptyNote>
              ) : (
                data.projects.wentLiveStillOpen.map((g) => (
                  <ListRow key={g.id} to={`/projects/${g.id}`} title={g.name ?? "Untitled"} subtitle={g.customer_name} right={formatDate(g.date)} />
                ))
              )}
            </MetricCard>
          </div>

          {/* ── Capacity ─────────────────────────────────────────────────── */}
          <div className="ms-section-title" style={{ marginBottom: 12 }}>Capacity</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <TotalHoursCard total={data.time.totalHours} prev={data.time.prevTotalHours} entries={data.time.entries} />

            <div className="ms-section-card">
              <div className="ms-section-title" style={{ marginBottom: 12 }}>Hours by Project Member</div>
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

            <MetricCard
              title="Projects at Risk (Hours)"
              value={data.hoursRisk.atRiskCount}
              accent={data.hoursRisk.atRiskCount > 0 ? "#d13438" : undefined}
              sub={data.hoursRisk.candidatesChecked > 0 ? `of ${data.hoursRisk.candidatesChecked} checked vs. SOW quote` : "no candidates to check"}
              expandKey="hoursRisk"
              expanded={expandedKeys.has("hoursRisk")}
              onToggle={toggleExpand}
            >
              {data.hoursRisk.atRisk.length === 0 ? (
                <EmptyNote>No projects logging hours close to or over their quoted SOW.</EmptyNote>
              ) : (
                data.hoursRisk.atRisk.map((p) => (
                  <ListRow
                    key={p.id}
                    to={`/projects/${p.id}`}
                    title={p.name ?? "Untitled"}
                    subtitle={p.customer_name}
                    right={
                      <span style={{ color: (p.pct ?? 0) >= 100 ? "#d13438" : "#ff8c00", fontWeight: 700 }}>
                        {p.hoursLogged.toFixed(1)}h / {p.quotedHours?.toFixed(0)}h ({p.pct}%)
                      </span>
                    }
                  />
                ))
              )}
              {data.hoursRisk.noQuoteCount > 0 && (
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                  {data.hoursRisk.noQuoteCount} project{data.hoursRisk.noQuoteCount === 1 ? "" : "s"} with hours logged have no resolvable SOW quote.
                </div>
              )}
            </MetricCard>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="ms-section-card">
              <div className="ms-section-title" style={{ marginBottom: 12 }}>Project Assignment (PM's)</div>
              {data.projects.projectsByPM.length === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No active project assignments.</div>
              ) : (
                <HoursLeaderboard
                  rows={data.projects.projectsByPM.map((r) => ({
                    key: r.user_id ?? "unassigned",
                    label: r.user_id ? r.name ?? "Unknown" : "Unassigned",
                    hours: r.n,
                  }))}
                  unit=""
                />
              )}
            </div>

            <div className="ms-section-card">
              <div className="ms-section-title" style={{ marginBottom: 12 }}>Project Assignment (IE's, SA's)</div>
              {data.projects.projectAssignmentsIESA.length === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No active project assignments.</div>
              ) : (
                <HoursLeaderboard
                  rows={data.projects.projectAssignmentsIESA.map((r) => ({
                    key: r.user_id ?? "unassigned",
                    label: r.user_id ? r.name ?? "Unknown" : "Unassigned",
                    hours: r.n,
                  }))}
                  unit=""
                />
              )}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <MetricCard
              title="No Time Logged (Last Week)"
              value={data.noTimeLastWeek.count}
              accent={data.noTimeLastWeek.count > 0 ? "#ff8c00" : undefined}
              sub="assigned to an active project, 0 hours logged in the last 7 days"
              expandKey="noTimeLastWeek"
              expanded={expandedKeys.has("noTimeLastWeek")}
              onToggle={toggleExpand}
            >
              {data.noTimeLastWeek.people.length === 0 ? (
                <EmptyNote>Everyone assigned logged time in the last week.</EmptyNote>
              ) : (
                data.noTimeLastWeek.people.map((p) => (
                  <ListRow
                    key={p.user_id}
                    title={p.name ?? "Unknown"}
                    right={`${p.projectCount} project${p.projectCount === 1 ? "" : "s"}`}
                  />
                ))
              )}
            </MetricCard>
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

function HoursLeaderboard({ rows, unit = "h" }: { rows: { key: string; label: string; hours: number }[]; unit?: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.hours), 0) || 1;
  return (
    <div>
      {rows.map((r) => (
        <div key={r.key} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
            <span style={{ fontSize: 13, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", flexShrink: 0, marginLeft: 8 }}>
              {unit === "h" ? `${r.hours.toFixed(1)} h` : `${r.hours}${unit ? ` ${unit}` : ""}`}
            </span>
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

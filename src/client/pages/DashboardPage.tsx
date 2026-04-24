import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type DashboardSummaryResponse, type Task } from "../lib/api";
import { SolutionTypePills } from "../components/ui/SolutionTypePills";

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
  ci:      "Conv. Intelligence",
  va:      "AI Virtual Agent",
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

const VENDOR_LABELS: Record<string, string> = {
  zoom:        "Zoom",
  ringcentral: "RingCentral",
  cato:        "Cato Networks",
  microsoft:   "Microsoft",
  cisco:       "Cisco",
  tbd:         "TBD",
};

const PHASE_STATUS_COLOR: Record<string, string> = {
  completed:   "#059669",
  in_progress: "#0891b2",
  not_started: "#475569",
  blocked:     "#d13438",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthLabel(h: string | null) {
  if (!h) return "—";
  return h.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(d: string | null) {
  if (!d) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T00:00:00" : d;
  return new Date(normalized).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  if (total === 0) return <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No data yet.</div>;

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
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#1e293b" fontSize={20} fontWeight={700}>{total}</text>
        <text x={cx} y={cy + 11} textAnchor="middle" fill="#64748b" fontSize={9}>{centerLabel}</text>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {data.map((d, i) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: colorFor(d.label, i) }} />
            <span style={{ fontSize: 12, color: "#334155", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", flexShrink: 0 }}>{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type PhaseEntry = { project_id: string; name: string; status: string; sort_order: number };

function PhaseFlowIndicator({ phases }: { phases: PhaseEntry[] }) {
  if (!phases || phases.length === 0) return <span style={{ color: "#64748b", fontSize: 11 }}>—</span>;
  const sorted = [...phases].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {sorted.map((phase, i) => {
        const status = phase.status || "not_started";
        const color = PHASE_STATUS_COLOR[status] ?? "#475569";
        const isActive = status === "in_progress";
        const prevDone = i > 0 && sorted[i - 1].status === "completed";
        return (
          <div key={phase.name + i} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && <div style={{ width: 5, height: 2, background: prevDone ? "#107c10" : "#475569", flexShrink: 0 }} />}
            <div
              title={`${phase.name} — ${status.replace(/_/g, " ")}`}
              style={{
                width: isActive ? 13 : 10,
                height: isActive ? 13 : 10,
                borderRadius: "50%",
                background: status === "not_started" ? "#475569" : color,
                border: `1.5px solid ${status === "not_started" ? "#64748b" : color}`,
                boxShadow: isActive ? `0 0 0 2.5px ${color}55` : "none",
                flexShrink: 0,
                cursor: "default",
              }}
            />
          </div>
        );
      })}
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

type MyTask = Task & { project_name: string; phase_name: string | null; assignee_name: string | null };

const STATUS_FILTER_OPTIONS = [
  { value: "all",         label: "All Open"     },
  { value: "not_started", label: "Not Started"  },
  { value: "in_progress", label: "In Progress"  },
  { value: "blocked",     label: "Blocked"      },
  { value: "overdue",     label: "Overdue"      },
  { value: "completed",   label: "Completed"    },
];

const PRIORITY_FILTER_OPTIONS = [
  { value: "all",    label: "Any Priority" },
  { value: "high",   label: "High"         },
  { value: "medium", label: "Medium"       },
  { value: "low",    label: "Low"          },
];

const TASK_STATUS_COLOR: Record<string, string> = {
  not_started: "#94a3b8",
  in_progress: "#0891b2",
  blocked:     "#d13438",
  completed:   "#059669",
};

const TASK_STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  blocked:     "Blocked",
  completed:   "Completed",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const navigate = useNavigate();

  // ── My Tasks state ────────────────────────────────────────────────────────
  const [taskItems, setTaskItems]         = useState<MyTask[]>([]);
  const [taskTotal, setTaskTotal]         = useState(0);
  const [taskPage, setTaskPage]           = useState(1);
  const [taskHasMore, setTaskHasMore]     = useState(false);
  const [taskLoading, setTaskLoading]     = useState(false);
  const [taskStatus, setTaskStatus]       = useState("all");
  const [taskPriority, setTaskPriority]   = useState("all");
  const [taskSearch, setTaskSearch]       = useState("");
  const [taskSearchInput, setTaskSearchInput] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.dashboardSummary().then((d) => {
      if (d.user.role === "client") {
        navigate("/projects", { replace: true });
        return;
      }
      setData(d);
    });
  }, [navigate]);

  const loadTasks = useCallback((status: string, priority: string, search: string, page: number) => {
    setTaskLoading(true);
    api.myTasks({
      status:   status   !== "all" ? status   : undefined,
      priority: priority !== "all" ? priority : undefined,
      search:   search || undefined,
      page,
    }).then((res) => {
      setTaskItems(page === 1 ? res.items : (prev) => [...prev, ...res.items]);
      setTaskTotal(res.total);
      setTaskHasMore(res.hasMore);
    }).catch(() => {}).finally(() => setTaskLoading(false));
  }, []);

  useEffect(() => {
    if (!data) return;
    setTaskPage(1);
    loadTasks(taskStatus, taskPriority, taskSearch, 1);
  }, [data, taskStatus, taskPriority, taskSearch, loadTasks]);

  function handleSearchChange(val: string) {
    setTaskSearchInput(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setTaskSearch(val), 350);
  }

  function handleFilterChange(newStatus: string, newPriority: string) {
    setTaskStatus(newStatus);
    setTaskPriority(newPriority);
    setTaskPage(1);
  }

  function loadMoreTasks() {
    const next = taskPage + 1;
    setTaskPage(next);
    loadTasks(taskStatus, taskPriority, taskSearch, next);
  }

  if (!data) {
    return <div style={{ padding: 40, color: "#64748b" }}>Loading...</div>;
  }

  const { user, summary, projects, projectPhases, openBlockers, phaseDistribution, vendorDistribution, typeDistribution } = data;

  // Build a map from project_id → sorted phases
  const phasesByProject = projectPhases.reduce<Record<string, PhaseEntry[]>>((acc, ph) => {
    if (!acc[ph.project_id]) acc[ph.project_id] = [];
    acc[ph.project_id].push(ph);
    return acc;
  }, {});

  // Normalize + merge vendor labels (DB may store "zoom", "Zoom", "RingCentral", "ringcentral", etc.)
  const vendorData = Object.values(
    vendorDistribution.reduce<Record<string, { label: string; count: number }>>((acc, d) => {
      const key = d.label?.toLowerCase() ?? "unknown";
      const label = VENDOR_LABELS[key] ?? VENDOR_LABELS[d.label ?? ""] ?? d.label ?? "Unknown";
      acc[label] = { label, count: (acc[label]?.count ?? 0) + d.count };
      return acc;
    }, {})
  );

  // Normalize + merge solution type labels (DB may store raw keys like "ucaas" or display values like "UCaaS")
  const REVERSE_TYPE: Record<string, string> = Object.fromEntries(
    Object.entries(TYPE_LABELS).map(([, v]) => [v.toLowerCase(), v])
  );
  const typeData = Object.values(
    typeDistribution.reduce<Record<string, { label: string; count: number }>>((acc, d) => {
      const raw = d.label ?? "";
      const label = TYPE_LABELS[raw] ?? REVERSE_TYPE[raw.toLowerCase()] ?? raw;
      acc[label] = { label, count: (acc[label]?.count ?? 0) + d.count };
      return acc;
    }, {})
  );

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
        <MetricCard title="Open Blockers" value={summary.openBlockers} accent={summary.openBlockers > 0 ? "#d13438" : undefined} />
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Projects
          </span>
          <Link to="/projects" style={{ fontSize: 13, color: "#63c1ea", textDecoration: "none", fontWeight: 600 }}>
            View all →
          </Link>
        </div>
        <table className="ms-table">
          <thead>
            <tr>
              {["Project", "Customer", "Provider / Tech", "Phases", "Health"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "#64748b", padding: "24px 16px" }}>
                  No projects yet.
                </td>
              </tr>
            )}
            {projects.map((p) => {
              const isCompleted = p.status === "completed";
              const isBlocked = p.status === "blocked";
              const rowStyle: React.CSSProperties = isCompleted
                ? { opacity: 0.5, background: "#f8fafc" }
                : isBlocked
                ? { background: "rgba(209,52,56,0.04)", borderLeft: "3px solid #d13438" }
                : {};
              const vendorLabel = VENDOR_LABELS[p.vendor ?? ""] ?? p.vendor ?? null;
              const hasTypes = (p.solution_types?.length ?? 0) > 0;
              return (
                <tr
                  key={p.id}
                  style={{ cursor: "pointer", ...rowStyle }}
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <td>
                    <div style={{ fontWeight: 600, color: isCompleted ? "#64748b" : "#1e293b", fontSize: 14 }}>{p.name}</div>
                    {p.target_go_live_date && (
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                        Target Go-Live: {formatDate(p.target_go_live_date)}
                      </div>
                    )}
                  </td>
                  <td style={{ color: isCompleted ? "#94a3b8" : "#475569", fontSize: 13 }}>{p.customer_name ?? "—"}</td>
                  <td>
                    {vendorLabel || hasTypes ? (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        {vendorLabel && vendorLabel !== "TBD" && (
                          <span className="ms-badge" style={{ background: `${VENDOR_COLORS[vendorLabel] ?? "#94a3b8"}1a`, color: VENDOR_COLORS[vendorLabel] ?? "#94a3b8", border: `1px solid ${VENDOR_COLORS[vendorLabel] ?? "#94a3b8"}40`, fontSize: 11 }}>
                            {vendorLabel}
                          </span>
                        )}
                        <SolutionTypePills types={p.solution_types} emptyFallback={null} />
                      </div>
                    ) : <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    <PhaseFlowIndicator phases={phasesByProject[p.id] ?? []} />
                  </td>
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: HEALTH_COLOR[p.health ?? ""] ?? "#94a3b8", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: isCompleted ? "#94a3b8" : "#334155" }}>{healthLabel(p.health)}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── My Tasks (full width, filterable) ───────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "start" }}>

        {/* Tasks panel */}
        <div className="ms-card" style={{ overflow: "hidden" }}>
          {/* Header + filters */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                My Tasks
                {taskTotal > 0 && (
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "#94a3b8", textTransform: "none", letterSpacing: 0 }}>
                    {taskTotal} total
                  </span>
                )}
              </div>
              {/* Search */}
              <input
                type="text"
                className="ms-input"
                placeholder="Search tasks…"
                value={taskSearchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                style={{ fontSize: 13, padding: "5px 10px", width: 200, height: 32 }}
              />
            </div>
            {/* Status + Priority filter pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleFilterChange(opt.value, taskPriority)}
                  style={{
                    padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: taskStatus === opt.value ? 700 : 400,
                    border: `1px solid ${taskStatus === opt.value ? "#0b9aad" : "#e2e8f0"}`,
                    background: taskStatus === opt.value ? "#e0f2fe" : "#fff",
                    color: taskStatus === opt.value ? "#0b9aad" : "#64748b",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
              <div style={{ width: 1, background: "#e2e8f0", margin: "0 2px" }} />
              {PRIORITY_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleFilterChange(taskStatus, opt.value)}
                  style={{
                    padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: taskPriority === opt.value ? 700 : 400,
                    border: `1px solid ${taskPriority === opt.value ? "#8764b8" : "#e2e8f0"}`,
                    background: taskPriority === opt.value ? "#f3e8ff" : "#fff",
                    color: taskPriority === opt.value ? "#8764b8" : "#64748b",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Task rows */}
          {taskLoading && taskItems.length === 0 ? (
            <div style={{ padding: "24px 20px", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
          ) : taskItems.length === 0 ? (
            <div style={{ padding: "24px 20px", color: "#64748b", fontSize: 13 }}>No tasks match the current filter.</div>
          ) : (
            <>
              {taskItems.map((t) => {
                const isOverdue = t.status !== "completed" && t.due_date && new Date(t.due_date + "T00:00:00") < new Date();
                return (
                  <div
                    key={t.id}
                    style={{
                      padding: "10px 20px", borderBottom: "1px solid #f1f5f9",
                      display: "flex", alignItems: "flex-start", gap: 12,
                      background: t.status === "blocked" ? "rgba(209,52,56,0.03)" : undefined,
                    }}
                  >
                    {/* Status dot */}
                    <div style={{ paddingTop: 4, flexShrink: 0 }}>
                      <span style={{
                        display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                        background: TASK_STATUS_COLOR[t.status ?? ""] ?? "#94a3b8",
                      }} />
                    </div>

                    {/* Main content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link
                        to={`/projects/${t.project_id}?tab=tasks&taskId=${t.id}`}
                        style={{ fontSize: 13, color: "#1e293b", fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none", marginBottom: 2 }}
                      >
                        {t.title}
                      </Link>
                      <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link to={`/projects/${t.project_id}`} style={{ color: "#63c1ea", textDecoration: "none" }}>
                          {t.project_name}
                        </Link>
                        {t.phase_name && <span>· {t.phase_name}</span>}
                        {t.assignee_name && <span>· {t.assignee_name}</span>}
                        {t.due_date && (
                          <span style={{ color: isOverdue ? "#d13438" : "#94a3b8", fontWeight: isOverdue ? 600 : 400 }}>
                            · Due {formatDate(t.due_date)}{isOverdue ? " (overdue)" : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Badges */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      {t.status && t.status !== "not_started" && (
                        <Badge
                          label={TASK_STATUS_LABEL[t.status] ?? t.status}
                          color={TASK_STATUS_COLOR[t.status] ?? "#94a3b8"}
                        />
                      )}
                      {t.priority && (
                        <Badge label={t.priority} color={PRIORITY_COLOR[t.priority] ?? "#94a3b8"} />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Load more */}
              {taskHasMore && (
                <div style={{ padding: "12px 20px", textAlign: "center" }}>
                  <button
                    className="ms-btn-secondary"
                    onClick={loadMoreTasks}
                    disabled={taskLoading}
                    style={{ fontSize: 12 }}
                  >
                    {taskLoading ? "Loading…" : `Load more (${taskTotal - taskItems.length} remaining)`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Open Blockers sidebar */}
        <div className="ms-card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(0,0,0,0.07)", fontWeight: 700, fontSize: 13, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Open Blockers
          </div>
          {openBlockers.length === 0 ? (
            <div style={{ padding: "16px", color: "#64748b", fontSize: 13 }}>No open blockers.</div>
          ) : (
            <div>
              {openBlockers.map((r) => (
                <div key={r.id} style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: SEVERITY_COLOR[r.severity ?? ""] ?? "#94a3b8", marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
                      {r.title}
                    </div>
                    <Link to={`/projects/${r.project_id}?tab=blockers`} style={{ fontSize: 11, color: "#63c1ea", textDecoration: "none" }}>
                      {r.project_name}
                    </Link>
                  </div>
                  {r.severity && <Badge label={r.severity} color={SEVERITY_COLOR[r.severity] ?? "#94a3b8"} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

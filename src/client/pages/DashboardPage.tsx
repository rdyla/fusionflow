import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type DashboardSummaryResponse, type Task } from "../lib/api";
import { SolutionTypePills } from "../components/ui/SolutionTypePills";
import { SOLUTION_TYPE_LABELS, canonicalizeSolutionType, type SolutionType } from "../../shared/solutionTypes";
import { humanize } from "../lib/format";
import { sortProjects, nextSort, statusOptions, SortableTh, StatusFilter, type ProjectSort, type ProjectSortKey } from "../lib/projectSort";

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

// Explicit per-vendor colors (statically assigned — nothing auto-shifts, so a
// new vendor needs its own entry or it falls to VENDOR_FALLBACK). Brand-aligned
// where it matters: Zoom blue, RingCentral orange, Dialpad purple, Cato green.
const VENDOR_COLORS: Record<string, string> = {
  Zoom:            "#0078d4",  // brand blue
  RingCentral:     "#ff8c00",  // brand orange
  Dialpad:         "#8764b8",  // brand purple
  "Cato Networks": "#107c10",  // green
  Mitel:           "#e74856",  // red
  Microsoft:       "#00b7c3",  // cyan
  Cisco:           "#038387",  // teal
  TBD:             "#b146c2",  // magenta
  Unknown:         "#94a3b8",
};

// Fallback palette for vendors without an explicit color above — distinct hues
// that avoid the assigned brand colors so a new/unknown vendor never collides
// with a known one.
const VENDOR_FALLBACK = ["#ca5010", "#498205", "#a4262c", "#487ca5", "#8e562e", "#5c2e91"];

// Reverse map: lowercased canonical display label → SolutionType key. Lets us
// catch legacy rows that stored the display value (e.g. "Workforce Management")
// alongside rows that stored the canonical key.
const REVERSE_TYPE_LABEL: Record<string, SolutionType> = Object.fromEntries(
  Object.entries(SOLUTION_TYPE_LABELS).map(([k, v]) => [v.toLowerCase(), k as SolutionType])
);

function normalizeTypeLabel(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") return "Unknown";
  const lower = trimmed.toLowerCase();
  // (1) canonical key match — folds case variants and legacy aliases
  const canon = canonicalizeSolutionType(lower);
  if (canon) return SOLUTION_TYPE_LABELS[canon];
  // (2) display-value match — catches legacy rows that stored the label literally
  const reverse = REVERSE_TYPE_LABEL[lower];
  if (reverse) return SOLUTION_TYPE_LABELS[reverse];
  // (3) preserve the raw string so unrecognized values don't silently merge into "Unknown"
  return trimmed;
}
const TYPE_COLORS = [
  "#0891b2", "#8764b8", "#059669", "#ff8c00",
  "#e74856", "#038387", "#94a3b8",
];

const VENDOR_LABELS: Record<string, string> = {
  zoom:        "Zoom",
  ringcentral: "RingCentral",
  dialpad:     "Dialpad",
  mitel:       "Mitel",
  cato:        "Cato Networks",
  microsoft:   "Microsoft",
  cisco:       "Cisco",
  tbd:         "TBD",
};

// Fallback display name for a vendor that isn't in VENDOR_LABELS — title-case
// it (e.g. raw "mitel" → "Mitel") so the dashboard never shows a bare lowercase
// vendor. Known multi-case names (RingCentral, Cato Networks) come from the map.
function titleCaseVendor(raw: string): string {
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

const PROJECT_STATUS_COLOR: Record<string, string> = {
  completed: "#059669",
  in_progress: "#0891b2",
  not_started: "#94a3b8",
  blocked: "#d13438",
};
// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T00:00:00" : d;
  return new Date(normalized).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ label, color, style }: { label: string; color: string; style?: React.CSSProperties }) {
  return (
    <span
      className="ms-badge"
      style={{ background: color + "1a", color, border: `1px solid ${color}40`, ...style }}
    >
      {label}
    </span>
  );
}

type DonutDatum = { label: string; count: number; id?: string | null };
function DonutChart({
  data,
  colorMap,
  fallbackColors,
  centerLabel = "projects",
  onSliceClick,
}: {
  data: DonutDatum[];
  colorMap?: Record<string, string>;
  fallbackColors?: string[];
  centerLabel?: string;
  onSliceClick?: (item: DonutDatum) => void;
}) {
  const palette = fallbackColors ?? PHASE_COLORS;
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No data yet.</div>;

  const cx = 72, cy = 72, R = 62, r = 40;
  let cumAngle = -Math.PI / 2;

  function colorFor(label: string, idx: number) {
    return colorMap?.[label] ?? palette[idx % palette.length];
  }

  function slice(d: DonutDatum, color: string, idx: number) {
    const angle = (d.count / total) * 2 * Math.PI;
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
        style={onSliceClick ? { cursor: "pointer" } : undefined}
        onClick={onSliceClick ? () => onSliceClick(d) : undefined}
      >
        <title>{`${d.label}: ${d.count}`}</title>
      </path>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width={144} height={144} viewBox="0 0 144 144" style={{ flexShrink: 0 }}>
        {data.map((d, i) => slice(d, colorFor(d.label, i), i))}
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#1e293b" fontSize={20} fontWeight={700}>{total}</text>
        <text x={cx} y={cy + 11} textAnchor="middle" fill="#64748b" fontSize={9}>{centerLabel}</text>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {data.map((d, i) => {
          const clickable = !!onSliceClick;
          return (
            <div
              key={d.label}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onSliceClick!(d) : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSliceClick!(d); } } : undefined}
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: clickable ? "pointer" : "default" }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: colorFor(d.label, i) }} />
              <span style={{ fontSize: 12, color: "#334155", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", flexShrink: 0 }}>{d.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type StageEntry = { project_id: string; name: string; status: string; sort_order: number };

/** Return the "current stage" label for a project — the in_progress stage
 *  with the highest sort_order. Multi-phase projects may have the same
 *  stage name repeated per phase; using max sort_order picks the latest
 *  position in the lifecycle even when a phase is ahead of another. */
function currentStageName(stages: StageEntry[] | undefined): string {
  if (!stages || stages.length === 0) return "—";
  const inProgress = stages.filter((s) => s.status === "in_progress");
  if (inProgress.length === 0) return "—";
  const latest = inProgress.reduce((a, b) => ((a.sort_order ?? 0) >= (b.sort_order ?? 0) ? a : b));
  return latest.name;
}

function MetricCard({
  title,
  value,
  accent,
  to,
  onClick,
}: {
  title: string;
  value: number;
  accent?: string;
  to?: string;
  onClick?: () => void;
}) {
  const interactive = (to || onClick) && value > 0;
  const inner = (
    <>
      <div className="ms-metric-label">{title}</div>
      <div className="ms-metric-value" style={accent ? { color: accent } : undefined}>{value}</div>
    </>
  );
  const interactiveStyle: React.CSSProperties = interactive
    ? { cursor: "pointer", transition: "transform 120ms ease, box-shadow 120ms ease" }
    : {};
  if (to && interactive) {
    return (
      <Link to={to} className="ms-metric-card" style={{ ...interactiveStyle, textDecoration: "none", color: "inherit", display: "block" }}>
        {inner}
      </Link>
    );
  }
  if (onClick && interactive) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
        className="ms-metric-card"
        style={interactiveStyle}
      >
        {inner}
      </div>
    );
  }
  return <div className="ms-metric-card">{inner}</div>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

type MyTask = Task & { project_name: string; stage_name: string | null; assignee_name: string | null };

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
  // Projects table sort/filter
  const [projSearch, setProjSearch]       = useState("");
  const [projStatus, setProjStatus]       = useState("");
  const [projSort, setProjSort]           = useState<ProjectSort>(null);
  const toggleProjSort = (key: ProjectSortKey) => setProjSort((prev) => nextSort(prev, key));
  const [taskSearchInput, setTaskSearchInput] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tasksRef = useRef<HTMLDivElement | null>(null);
  const blockersRef = useRef<HTMLDivElement | null>(null);

  function scrollToTasks() {
    if (taskStatus !== "all") setTaskStatus("all");
    requestAnimationFrame(() => tasksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function scrollToBlockers() {
    blockersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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

  const { user, summary, projects, projectStages, openBlockers, stageDistribution, vendorDistribution, typeDistribution, aeDistribution, isSalesLeader } = data;

  // Projects table: filter by name/customer search + status, then sort.
  const projSearchQ = projSearch.trim().toLowerCase();
  const visibleProjects = sortProjects(
    projects.filter((p) => {
      if (projStatus && p.status !== projStatus) return false;
      if (projSearchQ) {
        const hay = `${p.name} ${p.customer_name ?? ""}`.toLowerCase();
        if (!hay.includes(projSearchQ)) return false;
      }
      return true;
    }),
    projSort,
  );

  // Build a map from project_id → sorted stages
  const stagesByProject = projectStages.reduce<Record<string, StageEntry[]>>((acc, ph) => {
    if (!acc[ph.project_id]) acc[ph.project_id] = [];
    acc[ph.project_id].push(ph);
    return acc;
  }, {});

  // Normalize + merge vendor labels (DB may store "zoom", "Zoom", "RingCentral", "ringcentral", etc.)
  const vendorData = Object.values(
    vendorDistribution.reduce<Record<string, { label: string; count: number }>>((acc, d) => {
      const key = d.label?.toLowerCase() ?? "unknown";
      const label = VENDOR_LABELS[key] ?? VENDOR_LABELS[d.label ?? ""] ?? (d.label ? titleCaseVendor(d.label) : "Unknown");
      acc[label] = { label, count: (acc[label]?.count ?? 0) + d.count };
      return acc;
    }, {})
  );

  // Merge case/alias variants (e.g. "ucaas" + "UCaaS" + "UCAAS") into one slice
  // by routing every raw value through the shared canonical-label resolver.
  const typeData = Object.values(
    typeDistribution.reduce<Record<string, { label: string; count: number }>>((acc, d) => {
      const label = normalizeTypeLabel(d.label);
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
        <MetricCard
          title="At Risk"
          value={summary.atRiskProjects}
          accent={summary.atRiskProjects > 0 ? "#ff8c00" : undefined}
          to="/projects?health=at_risk"
        />
        <MetricCard title="Open Tasks" value={summary.openTasks} onClick={scrollToTasks} />
        <MetricCard
          title="Open Blockers"
          value={summary.openBlockers}
          accent={summary.openBlockers > 0 ? "#d13438" : undefined}
          onClick={scrollToBlockers}
        />
      </div>

      {/* Distribution charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
        <div className="ms-section-card">
          <div className="ms-section-title">By Stage</div>
          <DonutChart
            data={stageDistribution.map((d) => ({ label: d.stage_name, count: d.count }))}
            fallbackColors={PHASE_COLORS}
            centerLabel="projects"
          />
        </div>
        <div className="ms-section-card">
          <div className="ms-section-title">{isSalesLeader ? "By AE" : "By Vendor"}</div>
          {isSalesLeader ? (
            <DonutChart
              data={aeDistribution}
              fallbackColors={PHASE_COLORS}
              centerLabel="projects"
              onSliceClick={(item) => {
                const param = user.role === "pf_ae" ? "pf_ae_id" : "partner_ae_id";
                const id = item.id ?? "none";
                navigate(`/projects?${param}=${encodeURIComponent(id)}&ae_name=${encodeURIComponent(item.label)}`);
              }}
            />
          ) : (
            <DonutChart
              data={vendorData}
              colorMap={VENDOR_COLORS}
              fallbackColors={VENDOR_FALLBACK}
              centerLabel="projects"
            />
          )}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Projects
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              className="ms-input"
              placeholder="Search project or customer…"
              value={projSearch}
              onChange={(e) => setProjSearch(e.target.value)}
              style={{ width: 220 }}
            />
            <StatusFilter value={projStatus} onChange={setProjStatus} options={statusOptions(projects)} />
            <Link to="/projects" style={{ fontSize: 13, color: "#63c1ea", textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}>
              View all →
            </Link>
          </div>
        </div>
        <table className="ms-table">
          <thead>
            <tr>
              <SortableTh label="Project" colKey="name" sort={projSort} onSort={toggleProjSort} />
              <SortableTh label="Customer" colKey="customer" sort={projSort} onSort={toggleProjSort} />
              <th>Provider / Tech</th>
              <SortableTh label="Status" colKey="status" sort={projSort} onSort={toggleProjSort} />
              <th>Current Stage</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            {visibleProjects.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "#64748b", padding: "24px 16px" }}>
                  {projects.length === 0 ? "No projects yet." : "No projects match your filters."}
                </td>
              </tr>
            )}
            {visibleProjects.map((p) => {
              const isCompleted = p.status === "completed";
              const isBlocked = p.status === "blocked";
              const onHold = p.on_hold === 1;
              const rowStyle: React.CSSProperties = onHold
                ? { opacity: 0.55, background: "#f8fafc" }
                : isCompleted
                ? { opacity: 0.5, background: "#f8fafc" }
                : isBlocked
                ? { background: "rgba(209,52,56,0.04)", borderLeft: "3px solid #d13438" }
                : {};
              const vendorLabel = VENDOR_LABELS[(p.vendor ?? "").toLowerCase()] ?? (p.vendor ? titleCaseVendor(p.vendor) : null);
              const hasTypes = (p.solution_types?.length ?? 0) > 0;
              return (
                <tr
                  key={p.id}
                  style={{ cursor: "pointer", ...rowStyle }}
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <td>
                    <div style={{ fontWeight: 600, color: isCompleted ? "#64748b" : "#1e293b", fontSize: 14 }}>
                      {p.name}
                      {onHold && (
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 9, padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.04em", verticalAlign: "middle" }}>On Hold</span>
                      )}
                    </div>
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
                    {p.status ? (
                      <Badge label={humanize(p.status)} color={PROJECT_STATUS_COLOR[p.status] ?? "#94a3b8"} style={{ textTransform: "none" }} />
                    ) : <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ fontSize: 13, color: isCompleted ? "#94a3b8" : "#334155" }}>
                    {currentStageName(stagesByProject[p.id])}
                  </td>
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: HEALTH_COLOR[p.health ?? ""] ?? "#94a3b8", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: isCompleted ? "#94a3b8" : "#334155" }}>{humanize(p.health)}</span>
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
        <div ref={tasksRef} className="ms-card" style={{ overflow: "hidden", scrollMarginTop: 16 }}>
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
                        {t.stage_name && <span>· {t.stage_name}</span>}
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
                          label={TASK_STATUS_LABEL[t.status] ?? humanize(t.status)}
                          color={TASK_STATUS_COLOR[t.status] ?? "#94a3b8"}
                          style={{ textTransform: "none" }}
                        />
                      )}
                      {t.priority && (
                        <Badge label={humanize(t.priority)} color={PRIORITY_COLOR[t.priority] ?? "#94a3b8"} style={{ textTransform: "none" }} />
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
        <div ref={blockersRef} className="ms-card" style={{ overflow: "hidden", scrollMarginTop: 16 }}>
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
                  {r.severity && <Badge label={humanize(r.severity)} color={SEVERITY_COLOR[r.severity] ?? "#94a3b8"} style={{ textTransform: "none" }} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

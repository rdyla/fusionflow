/**
 * Project Dashboard tab — stakeholder-facing read view.
 *
 * Anchored on a single project. Stats are scoped to that project. Multi-phase
 * behavior lives INSIDE the project via the `phases` table: City of Thousand
 * Oaks is one project containing Libraries / Treatment / HQ phases, each with
 * its own per-phase PMI stage chain and go-live.
 *
 * Layout (matches the May-2026 mockup that drove the launch redesign):
 *   - 4 KPI tiles with embedded graphics
 *   - 3 chart cards row (Tasks donut, Blockers donut, Progress by Phase bars)
 *   - Stage Progress matrix (one column per phase + Shared)
 *
 * Click-to-drill: Tasks-overview and Blockers-by-severity cards jump to
 * their respective tabs. Everything else is display-only.
 *
 * Internal staff, customer contacts authenticated as `client` users
 * matched to the project's account, and partner AEs explicitly attached
 * via project_staff all see the same payload; access is enforced
 * server-side via canViewProject().
 */

import { useEffect, useState } from "react";
import { api, type StakeholderSummary } from "../../lib/api";

// PF brand palette
const PF_BLUE = "#03395f";
const PF_BLUE_LIGHT = "#3b82f6";
const PF_GREEN = "#17C662";
const PF_BORDER = "#dde4ef";
const TEXT_PRIMARY = "#0f172a";
const TEXT_MUTED = "#64748b";
const TEXT_FAINT = "#94a3b8";

// Tasks donut palette
const TASK_DONE_COLOR        = PF_GREEN;
const TASK_IN_PROGRESS_COLOR = PF_BLUE_LIGHT;
const TASK_NOT_STARTED_COLOR = "#cbd5e1";

// Blocker severity palette — high contrast so a critical row immediately
// catches the eye.
const SEVERITY_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high:     "#f59e0b",
  medium:   "#3b82f6",
  low:      "#94a3b8",
};

export default function ProjectDashboardTab({ projectId, onChangeTab }: { projectId: string; currentUserRole?: string; onChangeTab?: (tab: string) => void }) {
  const [data, setData] = useState<StakeholderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.stakeholderSummary(projectId)
      .then((res) => { setData(res); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <Center>Loading dashboard…</Center>;
  if (error) return <Center error>{error}</Center>;
  if (!data) return <Center>No data.</Center>;

  const { stats, phases, blockers, stage_progress } = data;
  const multiPhase = phases.length > 0;
  const rollupLabel = multiPhase
    ? `Across ${phases.length} phase${phases.length === 1 ? "" : "s"}`
    : "Across this project";

  // Tasks breakdown: server gives us done + in_progress + total.
  const taskNotStarted = Math.max(stats.tasks.total - stats.tasks.done - stats.tasks.in_progress, 0);

  // Blocker severity rollup. Falls back to "medium" for anything unscored.
  const sevCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const b of blockers) {
    const s = b.severity && sevCounts[b.severity] !== undefined ? b.severity : "medium";
    sevCounts[s]++;
  }

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      {/* ── KPI tiles ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
        <KpiTile
          label="Overall complete"
          value={`${stats.overall_complete_pct}%`}
          sublabel={rollupLabel}
          graphic={<PercentDonut pct={stats.overall_complete_pct} />}
        />
        <KpiTile
          label="Total tasks"
          value={`${stats.tasks.total}`}
          sublabel={`${stats.tasks.done} done · ${stats.tasks.in_progress} in progress`}
          graphic={<TaskMiniDonut done={stats.tasks.done} inProgress={stats.tasks.in_progress} notStarted={taskNotStarted} />}
        />
        <KpiTile
          label="Blockers"
          value={`${stats.blockers.total}`}
          sublabel={stats.blockers.critical > 0 ? `${stats.blockers.critical} critical` : "—"}
          danger={stats.blockers.critical > 0}
          graphic={<BlockersAlertIcon critical={stats.blockers.critical > 0} />}
        />
        <KpiTile
          label={multiPhase ? "Days to final go-live" : "Days to go-live"}
          value={stats.days_to_final_go_live !== null ? `${stats.days_to_final_go_live}` : "—"}
          sublabel={stats.target_go_live_date ? `${fmtDate(stats.target_go_live_date)} target` : "Not set"}
          graphic={<CalendarIcon />}
        />
      </div>

      {/* ── Chart cards row ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <ChartCard title="Tasks overview" onClick={() => onChangeTab?.("tasks")} clickLabel="View tasks">
          <DonutChart
            slices={[
              { label: "Done",        count: stats.tasks.done,        color: TASK_DONE_COLOR        },
              { label: "In Progress", count: stats.tasks.in_progress, color: TASK_IN_PROGRESS_COLOR },
              { label: "Not Started", count: taskNotStarted,          color: TASK_NOT_STARTED_COLOR },
            ]}
            centerValue={`${stats.tasks.total}`}
            centerLabel="Total"
            emptyMessage="No tasks yet"
          />
        </ChartCard>
        <ChartCard title="Blockers by severity" onClick={() => onChangeTab?.("blockers")} clickLabel="View blockers">
          <DonutChart
            slices={(["critical","high","medium","low"] as const)
              .map((sev) => ({ label: capitalize(sev), count: sevCounts[sev] ?? 0, color: SEVERITY_COLOR[sev] }))
              .filter((s) => s.count > 0)}
            centerValue={`${stats.blockers.total}`}
            centerLabel="Total"
            emptyMessage="No active blockers"
          />
        </ChartCard>
        <ChartCard title={multiPhase ? "Progress by phase" : "Progress"}>
          <PhaseProgressBars phases={phases} multiPhase={multiPhase} overallPct={stats.overall_complete_pct} />
        </ChartCard>
      </div>

      {/* ── Stage progress matrix ─────────────────────────────────────── */}
      {stage_progress.length > 0 && (
        <div style={{
          background: "#fff", border: `1px solid ${PF_BORDER}`, borderRadius: 12,
          padding: "16px 18px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${PF_BORDER}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: PF_BLUE, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Stage progress
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: TEXT_MUTED }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 4, borderRadius: 2, background: PF_BLUE }} />
                Completed / In Progress
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 4, borderRadius: 2, background: "#e2e8f0" }} />
                Not Started
              </span>
            </div>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${stage_progress.length}, minmax(0, 1fr))`,
            gap: 18,
          }}>
            {stage_progress.map((col) => (
              <div key={col.phase_id ?? "shared"} style={{ minWidth: 0 }}>
                {stage_progress.length > 1 && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: PF_BLUE,
                    textTransform: "uppercase", letterSpacing: "0.1em",
                    marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${PF_BORDER}`,
                  }}>
                    {col.phase_name ?? "Shared"}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {col.stages.map((p) => <StageSlider key={p.id} stage={p} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  label, value, sublabel, danger, graphic,
}: {
  label: string;
  value?: string;
  sublabel?: string;
  danger?: boolean;
  graphic?: React.ReactNode;
}) {
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${danger ? "#fecaca" : PF_BORDER}`,
      borderRadius: 12, padding: "14px 16px", minHeight: 110,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </div>
        {value !== undefined && (
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, lineHeight: 1, color: danger ? "#991b1b" : PF_BLUE }}>
            {value}
          </div>
        )}
        {sublabel && (
          <div style={{ fontSize: 11, color: danger ? "#991b1b" : TEXT_MUTED, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sublabel}
          </div>
        )}
      </div>
      {graphic && <div style={{ flexShrink: 0 }}>{graphic}</div>}
    </div>
  );
}

// ── KPI tile graphics ────────────────────────────────────────────────────────

/** Partial-fill ring showing the overall % complete. Single-color arc on a
 *  light track; the percentage itself is rendered in the tile body so the
 *  donut stays purely visual. */
function PercentDonut({ pct }: { pct: number }) {
  const size = 60, strokeW = 7, r = (size / 2) - strokeW;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const arc = (clamped / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeW} />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke={PF_BLUE} strokeWidth={strokeW}
        strokeDasharray={`${arc} ${c - arc}`}
        strokeDashoffset={c / 4}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
    </svg>
  );
}

/** Mini multi-segment donut showing the done / in-progress / not-started
 *  split for the Total Tasks tile. Renders as a tiny visual signal — no
 *  numbers in the centre. */
function TaskMiniDonut({ done, inProgress, notStarted }: { done: number; inProgress: number; notStarted: number }) {
  const total = done + inProgress + notStarted;
  const size = 60, strokeW = 7, r = (size / 2) - strokeW;
  const c = 2 * Math.PI * r;
  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeW} />
      </svg>
    );
  }
  const segs: Array<{ pct: number; color: string }> = [
    { pct: done / total,        color: TASK_DONE_COLOR        },
    { pct: inProgress / total,  color: TASK_IN_PROGRESS_COLOR },
    { pct: notStarted / total,  color: TASK_NOT_STARTED_COLOR },
  ];
  let cumOffset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segs.map((s, i) => {
        if (s.pct === 0) return null;
        const arc = s.pct * c;
        const dashOffset = c / 4 - cumOffset;
        cumOffset += arc;
        return (
          <circle
            key={i}
            cx={size/2} cy={size/2} r={r}
            fill="none" stroke={s.color} strokeWidth={strokeW}
            strokeDasharray={`${arc} ${c - arc}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size/2} ${size/2})`}
          />
        );
      })}
    </svg>
  );
}

/** Triangle alert icon. Glows red when there's a critical blocker. */
function BlockersAlertIcon({ critical }: { critical: boolean }) {
  const fill = critical ? "#fee2e2" : "#f1f5f9";
  const stroke = critical ? "#dc2626" : "#94a3b8";
  return (
    <svg width={60} height={60} viewBox="0 0 60 60">
      <path d="M30 8 L54 50 L6 50 Z" fill={fill} stroke={stroke} strokeWidth={3} strokeLinejoin="round" />
      <line x1={30} y1={22} x2={30} y2={38} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      <circle cx={30} cy={44} r={2} fill={stroke} />
    </svg>
  );
}

/** Calendar icon for the days-to-go-live tile. */
function CalendarIcon() {
  return (
    <svg width={60} height={60} viewBox="0 0 60 60">
      <rect x={8} y={14} width={44} height={38} rx={4} fill="#eff6ff" stroke={PF_BLUE} strokeWidth={2} />
      <line x1={8} y1={24} x2={52} y2={24} stroke={PF_BLUE} strokeWidth={2} />
      <line x1={20} y1={10} x2={20} y2={18} stroke={PF_BLUE} strokeWidth={3} strokeLinecap="round" />
      <line x1={40} y1={10} x2={40} y2={18} stroke={PF_BLUE} strokeWidth={3} strokeLinecap="round" />
      <rect x={16} y={30} width={6} height={6} rx={1} fill={PF_BLUE} opacity={0.4} />
      <rect x={27} y={30} width={6} height={6} rx={1} fill={PF_BLUE} />
      <rect x={38} y={30} width={6} height={6} rx={1} fill={PF_BLUE} opacity={0.4} />
      <rect x={16} y={40} width={6} height={6} rx={1} fill={PF_BLUE} opacity={0.4} />
      <rect x={27} y={40} width={6} height={6} rx={1} fill={PF_BLUE} opacity={0.4} />
    </svg>
  );
}

// ── Chart card + donut ───────────────────────────────────────────────────────

function ChartCard({ title, children, onClick, clickLabel }: { title: string; children: React.ReactNode; onClick?: () => void; clickLabel?: string }) {
  const interactive = !!onClick;
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); } } : undefined}
      style={{
        background: "#fff", border: `1px solid ${PF_BORDER}`, borderRadius: 12,
        padding: "14px 16px", cursor: interactive ? "pointer" : "default",
        transition: "box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={interactive ? (e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(3, 57, 95, 0.08)"; e.currentTarget.style.borderColor = "#bfdbfe"; } : undefined}
      onMouseLeave={interactive ? (e) => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.borderColor = PF_BORDER; } : undefined}
      title={clickLabel}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: PF_BLUE, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

type DonutSlice = { label: string; count: number; color: string };

/** Project-tuned donut chart. Renders the slices on the left + a legend on
 *  the right. Whole card is clickable via the parent ChartCard; slice clicks
 *  bubble up so a stray segment hit still takes the user to the tab. */
function DonutChart({ slices, centerValue, centerLabel, emptyMessage }: { slices: DonutSlice[]; centerValue: string; centerLabel?: string; emptyMessage?: string }) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (total === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 144, color: TEXT_FAINT, fontSize: 13, fontStyle: "italic" }}>
        {emptyMessage ?? "No data yet"}
      </div>
    );
  }
  const size = 144, cx = size/2, cy = size/2, R = 60, r = 38;
  let cumAngle = -Math.PI / 2;
  const paths = slices.map((s, i) => {
    if (s.count === 0) return null;
    const angle = (s.count / total) * 2 * Math.PI;
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
        key={i}
        d={`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${r} ${r} 0 ${large} 0 ${ix2} ${iy2} Z`}
        fill={s.color}
      >
        <title>{`${s.label}: ${s.count}`}</title>
      </path>
    );
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        {paths}
        <text x={cx} y={cy - 4} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={22} fontWeight={700}>{centerValue}</text>
        {centerLabel && (
          <text x={cx} y={cy + 14} textAnchor="middle" fill={TEXT_MUTED} fontSize={10} style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {centerLabel}
          </text>
        )}
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: s.color }} />
            <span style={{ flex: 1, color: TEXT_MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            <strong style={{ color: TEXT_PRIMARY }}>{s.count}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Progress by Phase bars ───────────────────────────────────────────────────

function PhaseProgressBars({ phases, multiPhase, overallPct }: { phases: StakeholderSummary["phases"]; multiPhase: boolean; overallPct: number }) {
  // Single-phase projects: show one overall bar so the card isn't empty.
  if (!multiPhase) {
    return (
      <div>
        <PhaseBar name="Overall" pct={overallPct} />
        <div style={{ fontSize: 11, color: TEXT_FAINT, marginTop: 10, fontStyle: "italic" }}>
          No deployment phases — single-phase project.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {phases.map((p) => <PhaseBar key={p.id} name={p.name} pct={p.completion_pct} />)}
      </div>
      <div style={{ fontSize: 11, color: TEXT_FAINT, marginTop: 10 }}>
        Across {phases.length} phase{phases.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function PhaseBar({ name, pct }: { name: string; pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill = clamped >= 100 ? PF_GREEN : PF_BLUE;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
        <span style={{ fontSize: 11, color: TEXT_MUTED, flexShrink: 0 }}>{clamped}%</span>
      </div>
      <div style={{ background: "#f1f5f9", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ background: fill, height: "100%", width: `${clamped}%`, transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

// ── Stage slider (matrix row) ────────────────────────────────────────────────

function StageSlider({ stage }: { stage: { name: string; status: string | null; total_tasks: number; done_tasks: number; pct: number } }) {
  const isComplete = stage.pct >= 100;
  const isNotStarted = stage.total_tasks === 0 || (stage.done_tasks === 0 && stage.status !== "in_progress");
  const fill = isComplete ? PF_GREEN : isNotStarted ? "#cbd5e1" : PF_BLUE;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {stage.name}
        </span>
        <span style={{ fontSize: 11, color: TEXT_MUTED, flexShrink: 0 }}>
          {stage.total_tasks > 0
            ? `${stage.done_tasks}/${stage.total_tasks} · ${stage.pct}%`
            : "no tasks"}
        </span>
      </div>
      <div style={{ background: "#f1f5f9", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ background: fill, height: "100%", width: `${stage.pct}%`, transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

function Center({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div style={{ padding: 32, textAlign: "center", color: error ? "#991b1b" : TEXT_MUTED }}>
      {children}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

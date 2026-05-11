import { useMemo } from "react";
import type { Project, Phase, Task, Risk } from "../../lib/api";

// ── Constants ─────────────────────────────────────────────────────────────
const ACCENT_GREEN = "#10b981";
const ACCENT_AMBER = "#f59e0b";
const ACCENT_RED   = "#d13438";
const ACCENT_NAVY  = "#03395f";
const MUTED        = "#94a3b8";
const BORDER       = "#e2e8f0";

// Window for "Next up" — 14 days as agreed.
const UPCOMING_DAYS = 14;
// Go-live banding: ≤30 days → amber, past → red, otherwise green.
const GOLIVE_AMBER_DAYS = 30;

// ── Helpers ───────────────────────────────────────────────────────────────
function daysBetween(future: Date, now = new Date()): number {
  const ms = future.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtWeekday(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

// ── Card ──────────────────────────────────────────────────────────────────
type KpiCardProps = {
  label: string;
  value: string | number;
  /** When set, drawn as a 0–100 progress bar under the value. */
  progressPct?: number;
  /** Accent color for the value text. */
  accent?: string;
  /** Optional click handler — turns the card into a clickable tile. */
  onClick?: () => void;
};

function KpiCard({ label, value, progressPct, accent = ACCENT_NAVY, onClick }: KpiCardProps) {
  const clickable = Boolean(onClick);
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: "14px 16px",
        cursor: clickable ? "pointer" : "default",
        transition: "transform 0.1s, box-shadow 0.1s",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={clickable ? (e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 8px rgba(0,0,0,0.08)"; } : undefined}
      onMouseLeave={clickable ? (e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)"; } : undefined}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent, lineHeight: 1.1 }}>
        {value}
      </div>
      {progressPct !== undefined && (
        <div style={{ marginTop: 8, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, progressPct))}%`, background: accent, transition: "width 0.3s" }} />
        </div>
      )}
    </div>
  );
}

// ── Phase stepper ─────────────────────────────────────────────────────────
type PhaseStepperProps = {
  phases: Phase[];
  tasks: Task[];
  activePhaseId: string | null;
};

function PhaseStepper({ phases, tasks, activePhaseId }: PhaseStepperProps) {
  if (phases.length === 0) return null;
  const activeIdx = activePhaseId ? phases.findIndex(p => p.id === activePhaseId) : -1;

  // Per-phase task progress for the active phase, shown as a sub-label.
  const activePhaseProgress = (() => {
    if (activeIdx < 0) return null;
    const phaseTasks = tasks.filter(t => t.phase_id === phases[activeIdx].id);
    if (phaseTasks.length === 0) return null;
    const done = phaseTasks.filter(t => t.status === "completed").length;
    return Math.round((done / phaseTasks.length) * 100);
  })();

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 20px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
        Phase Progress
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
        {phases.map((phase, i) => {
          const isCompleted = phase.status === "completed";
          const isActive    = i === activeIdx;
          const color = isCompleted ? ACCENT_GREEN : isActive ? ACCENT_NAVY : MUTED;
          return (
            <div key={phase.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
              {/* Connector line to next phase */}
              {i < phases.length - 1 && (
                <div style={{ position: "absolute", top: 12, left: "50%", right: "-50%", height: 2, background: isCompleted ? ACCENT_GREEN : "#e2e8f0", zIndex: 0 }} />
              )}
              {/* Dot */}
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: isCompleted ? ACCENT_GREEN : isActive ? "#fff" : "#f1f5f9",
                border: `2px solid ${color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: isCompleted ? "#fff" : color,
                position: "relative", zIndex: 1,
              }}>
                {isCompleted ? "✓" : i + 1}
              </div>
              {/* Label */}
              <div style={{ marginTop: 6, fontSize: 11, fontWeight: isActive ? 700 : 500, color, textAlign: "center", lineHeight: 1.3, padding: "0 4px" }}>
                {phase.name}
              </div>
              {isActive && activePhaseProgress !== null && (
                <div style={{ marginTop: 2, fontSize: 10, color: MUTED }}>
                  {activePhaseProgress}% of phase
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── List sections ─────────────────────────────────────────────────────────
type UpcomingItem = {
  date: Date;
  title: string;
  /** What kind of milestone: task due, phase end, go-live. */
  kind: "task" | "phase_end" | "go_live";
  /** Optional sub-label (assignee, phase name, etc.). */
  detail?: string;
};

type Props = {
  project: Project;
  phases: Phase[];
  tasks: Task[];
  risks: Risk[];
  /** Navigate to the Blockers tab. */
  onViewBlockers?: () => void;
  /** Navigate to the Tasks tab. */
  onViewTasks?: () => void;
};

export default function ProjectExecutiveDashboard({ project, phases, tasks, risks, onViewBlockers, onViewTasks }: Props) {
  const now = new Date();
  // Strip time for date math so "today" tasks count as 0 days, not -1.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ── Derived metrics ────────────────────────────────────────────────────
  const currentPhase   = phases.find(p => p.status !== "completed") ?? null;
  const completedCount = tasks.filter(t => t.status === "completed").length;
  const progressPct    = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  // Active blockers — anything not resolved counts.
  const activeBlockers = risks.filter(r => (r.status ?? "open").toLowerCase() !== "resolved");

  const goLiveDate     = project.target_go_live_date ? new Date(project.target_go_live_date) : null;
  const daysToGoLive   = goLiveDate ? daysBetween(goLiveDate, today) : null;
  const goLiveAccent =
    daysToGoLive === null ? MUTED
    : daysToGoLive < 0 ? ACCENT_RED
    : daysToGoLive <= GOLIVE_AMBER_DAYS ? ACCENT_AMBER
    : ACCENT_GREEN;
  const goLiveValue =
    daysToGoLive === null ? "—"
    : daysToGoLive < 0 ? `${Math.abs(daysToGoLive)}d overdue`
    : daysToGoLive === 0 ? "Today"
    : `${daysToGoLive}d`;

  const blockersAccent = activeBlockers.length === 0 ? ACCENT_GREEN : activeBlockers.length <= 2 ? ACCENT_AMBER : ACCENT_RED;

  // ── Upcoming milestones (next 14 days) ─────────────────────────────────
  const upcoming = useMemo<UpcomingItem[]>(() => {
    const items: UpcomingItem[] = [];
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + UPCOMING_DAYS);

    // Task due dates within window, not yet completed
    for (const t of tasks) {
      if (!t.due_date) continue;
      if (t.status === "completed") continue;
      const d = new Date(t.due_date);
      if (d < today || d > horizon) continue;
      const phase = phases.find(p => p.id === t.phase_id);
      items.push({ date: d, title: t.title, kind: "task", detail: phase?.name });
    }

    // Phase ends within window
    for (const p of phases) {
      if (!p.planned_end) continue;
      const d = new Date(p.planned_end);
      if (d < today || d > horizon) continue;
      if (p.status === "completed") continue;
      items.push({ date: d, title: `Phase end: ${p.name}`, kind: "phase_end" });
    }

    // Go-live date if in window
    if (goLiveDate && goLiveDate >= today && goLiveDate <= horizon) {
      items.push({ date: goLiveDate, title: "Go-Live", kind: "go_live" });
    }

    items.sort((a, b) => a.date.getTime() - b.date.getTime());
    return items.slice(0, 10);
  }, [phases, tasks, goLiveDate, today]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "grid", gap: 16 }}>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <KpiCard
          label="Current Phase"
          value={currentPhase?.name ?? "Complete"}
          accent={currentPhase ? ACCENT_NAVY : ACCENT_GREEN}
        />
        <KpiCard
          label="Overall Progress"
          value={`${progressPct}%`}
          progressPct={progressPct}
          accent={progressPct === 100 ? ACCENT_GREEN : ACCENT_NAVY}
        />
        <KpiCard
          label="Open Blockers"
          value={activeBlockers.length}
          accent={blockersAccent}
          onClick={activeBlockers.length > 0 ? onViewBlockers : undefined}
        />
        <KpiCard
          label="Days to Go-Live"
          value={goLiveValue}
          accent={goLiveAccent}
        />
      </div>

      {/* Phase stepper */}
      <PhaseStepper phases={phases} tasks={tasks} activePhaseId={currentPhase?.id ?? null} />

      {/* Two-column: Next up + Blockers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Next up (14 days) */}
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Next {UPCOMING_DAYS} Days
            </div>
            {onViewTasks && (
              <button type="button" onClick={onViewTasks} style={{ fontSize: 11, fontWeight: 600, color: "#0891b2", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                View all →
              </button>
            )}
          </div>
          {upcoming.length === 0 ? (
            <div style={{ fontSize: 13, color: MUTED, padding: "8px 0" }}>Nothing on the calendar.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {upcoming.map((item, i) => {
                const kindColor = item.kind === "go_live" ? ACCENT_GREEN : item.kind === "phase_end" ? "#7c3aed" : ACCENT_NAVY;
                return (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    {/* Date pill */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 44, padding: "4px 6px", background: "#f8fafc", border: `1px solid ${BORDER}`, borderRadius: 6, flexShrink: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", lineHeight: 1.2 }}>
                        {fmtWeekday(item.date)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", lineHeight: 1.2 }}>
                        {fmtShortDate(item.date)}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#1e293b", marginBottom: 2 }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: kindColor }} />
                        {item.kind === "task" ? `Task${item.detail ? ` · ${item.detail}` : ""}` : item.kind === "phase_end" ? "Phase milestone" : "Project milestone"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active blockers */}
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Active Blockers
            </div>
            {onViewBlockers && activeBlockers.length > 0 && (
              <button type="button" onClick={onViewBlockers} style={{ fontSize: 11, fontWeight: 600, color: "#0891b2", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                View all →
              </button>
            )}
          </div>
          {activeBlockers.length === 0 ? (
            <div style={{ fontSize: 13, color: MUTED, padding: "8px 0" }}>No active blockers.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {activeBlockers.slice(0, 5).map((b) => {
                const severityColor = (b.severity ?? "").toLowerCase() === "high" ? ACCENT_RED : (b.severity ?? "").toLowerCase() === "low" ? "#64748b" : ACCENT_AMBER;
                return (
                  <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: severityColor, fontSize: 14, marginTop: 1, flexShrink: 0 }}>⚠</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#1e293b", marginBottom: 2 }}>
                        {b.title}
                      </div>
                      {b.description && (
                        <div style={{ fontSize: 11, color: MUTED, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {b.description}
                        </div>
                      )}
                      <div style={{ fontSize: 10, fontWeight: 600, color: severityColor, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {b.severity ?? "open"}
                      </div>
                    </div>
                  </div>
                );
              })}
              {activeBlockers.length > 5 && (
                <div style={{ fontSize: 11, color: MUTED, paddingTop: 4 }}>
                  + {activeBlockers.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

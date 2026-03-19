import { useEffect, useRef, useState } from "react";
import {
  api,
  type AsanaCustomFieldDef,
  type AsanaProjectData,
  type AsanaSectionWithTasks,
  type AsanaTask,
} from "../../lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDateShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysBetween(a: string, b: string) {
  return (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86_400_000;
}

function addDays(base: string, days: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Section color palette
const SECTION_COLORS = [
  "#0891b2", "#059669", "#7c3aed", "#d97706", "#db2777",
  "#0284c7", "#16a34a", "#9333ea", "#ea580c", "#be185d",
];

// ── Custom field chip ─────────────────────────────────────────────────────────

function FieldChip({ name, value }: { name: string; value: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500,
      background: "rgba(99,193,234,0.1)", color: "#0891b2",
      border: "1px solid rgba(99,193,234,0.25)",
      whiteSpace: "nowrap",
    }}
      title={`${name}: ${value}`}
    >
      <span style={{ color: "#94a3b8", fontWeight: 400 }}>{name}:</span> {value}
    </span>
  );
}

// ── Task row (tasks view) ─────────────────────────────────────────────────────

function TaskRow({ task, fieldDefs }: { task: AsanaTask; fieldDefs: AsanaCustomFieldDef[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !task.completed && task.due_on && task.due_on < today;

  // Only show fields that have a value and are in the project's field defs
  const defGids = new Set(fieldDefs.map((f) => f.gid));
  const populated = (task.custom_fields ?? []).filter(
    (f) => defGids.has(f.gid) && f.display_value && f.display_value.trim() !== ""
  );

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
      background: task.completed ? "#f8fafc" : "#ffffff",
      borderRadius: 6, border: "1px solid rgba(0,0,0,0.06)",
      opacity: task.completed ? 0.65 : 1,
    }}>
      {/* completion indicator */}
      <div style={{
        width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 3,
        border: task.completed ? "none" : "2px solid #cbd5e1",
        background: task.completed ? "#059669" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {task.completed && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: task.completed ? "#94a3b8" : "#1e293b",
          textDecoration: task.completed ? "line-through" : "none",
        }}>
          {task.name}
        </div>

        {/* Standard meta */}
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, display: "flex", flexWrap: "wrap", gap: "3px 12px" }}>
          {task.assignee && <span>Assignee: {task.assignee.name}</span>}
          {task.start_on && <span>Start: {fmtDate(task.start_on)}</span>}
          {task.due_on && (
            <span style={{ color: overdue ? "#d13438" : "#64748b" }}>
              Due: {fmtDate(task.due_on)}{overdue ? " · Overdue" : ""}
            </span>
          )}
          {task.num_subtasks > 0 && (
            <span>{task.num_subtasks} subtask{task.num_subtasks !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Custom fields */}
        {populated.length > 0 && (
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {populated.map((f) => (
              <FieldChip key={f.gid} name={f.name} value={f.display_value!} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Timeline (Gantt) view ─────────────────────────────────────────────────────

function AsanaTimeline({ sections }: { sections: AsanaSectionWithTasks[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Collect all tasks that have at least a due_on date
  const allTasks = sections.flatMap((s, si) =>
    s.tasks
      .filter((t) => t.due_on || t.start_on)
      .map((t) => ({ ...t, sectionName: s.section.name, colorIdx: si % SECTION_COLORS.length }))
  );

  if (allTasks.length === 0) {
    return (
      <div className="ms-section-card" style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>
        No tasks with dates to display on the timeline.
      </div>
    );
  }

  // Date range
  const dates = allTasks.flatMap((t) => [t.start_on, t.due_on].filter(Boolean) as string[]);
  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));

  // Pad by a few days on each side
  const rangeStart = addDays(minDate, -3);
  const rangeEnd = addDays(maxDate, 7);
  const totalDays = Math.max(daysBetween(rangeStart, rangeEnd), 1);

  // Build month header markers
  const months: { label: string; leftPct: number }[] = [];
  const cur = new Date(rangeStart + "T00:00:00");
  cur.setDate(1); // first of month
  while (true) {
    const iso = cur.toISOString().slice(0, 10);
    if (iso > rangeEnd) break;
    const left = Math.max(0, (daysBetween(rangeStart, iso) / totalDays) * 100);
    months.push({
      label: cur.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      leftPct: left,
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  // Today marker
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayPct = Math.min(100, Math.max(0, (daysBetween(rangeStart, todayIso) / totalDays) * 100));
  const todayVisible = todayIso >= rangeStart && todayIso <= rangeEnd;

  function pct(date: string) {
    return Math.max(0, Math.min(100, (daysBetween(rangeStart, date) / totalDays) * 100));
  }

  const ROW_H = 36;
  const LABEL_W = 220;

  return (
    <div className="ms-section-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>Timeline</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
          {fmtDateShort(minDate)} – {fmtDateShort(maxDate)}
        </div>
      </div>

      <div ref={scrollRef} style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 700 }}>
          {/* Month header */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ width: LABEL_W, flexShrink: 0, padding: "6px 14px", fontSize: 11, fontWeight: 700, color: "#94a3b8", background: "#fafafa", borderRight: "1px solid rgba(0,0,0,0.06)" }}>
              Task
            </div>
            <div style={{ flex: 1, position: "relative", height: 28, background: "#fafafa" }}>
              {months.map((m) => (
                <div key={m.label} style={{ position: "absolute", left: `${m.leftPct}%`, top: 0, bottom: 0, display: "flex", alignItems: "center", paddingLeft: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", whiteSpace: "nowrap" }}>{m.label}</span>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 1, background: "rgba(0,0,0,0.06)" }} />
                </div>
              ))}
              {todayVisible && (
                <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 1, background: "#0891b2", opacity: 0.5 }} />
              )}
            </div>
          </div>

          {/* Section groups */}
          {sections.map((s, si) => {
            const color = SECTION_COLORS[si % SECTION_COLORS.length];
            const datedTasks = s.tasks.filter((t) => t.due_on || t.start_on);
            if (datedTasks.length === 0) return null;

            return (
              <div key={s.section.gid}>
                {/* Section label row */}
                <div style={{ display: "flex", background: `${color}0d`, borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <div style={{ width: LABEL_W, flexShrink: 0, padding: "5px 14px", borderRight: "1px solid rgba(0,0,0,0.06)" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color }}>{s.section.name}</span>
                  </div>
                  <div style={{ flex: 1, position: "relative" }}>
                    {todayVisible && (
                      <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 1, background: "#0891b2", opacity: 0.2 }} />
                    )}
                  </div>
                </div>

                {/* Task rows */}
                {datedTasks.map((task) => {
                  const start = task.start_on ?? task.due_on!;
                  const end = task.due_on ?? task.start_on!;
                  const leftPct = pct(start);
                  const rightPct = pct(end);
                  const widthPct = Math.max(rightPct - leftPct, 0.5);
                  const today = new Date().toISOString().slice(0, 10);
                  const overdue = !task.completed && task.due_on && task.due_on < today;

                  return (
                    <div key={task.gid} style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.04)", height: ROW_H }}>
                      <div style={{
                        width: LABEL_W, flexShrink: 0, padding: "0 14px",
                        display: "flex", alignItems: "center", gap: 6,
                        borderRight: "1px solid rgba(0,0,0,0.06)",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                          background: task.completed ? "#059669" : overdue ? "#d13438" : color,
                        }} />
                        <span style={{
                          fontSize: 12, color: "#334155",
                          textDecoration: task.completed ? "line-through" : "none",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          opacity: task.completed ? 0.6 : 1,
                        }}
                          title={task.name}
                        >
                          {task.name}
                        </span>
                      </div>

                      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
                        {/* month grid lines */}
                        {months.map((m) => (
                          <div key={m.label} style={{ position: "absolute", left: `${m.leftPct}%`, top: 0, bottom: 0, width: 1, background: "rgba(0,0,0,0.04)" }} />
                        ))}
                        {/* today line */}
                        {todayVisible && (
                          <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 1, background: "#0891b2", opacity: 0.3 }} />
                        )}

                        {/* task bar */}
                        <div
                          title={`${task.name}\n${task.start_on ? fmtDateShort(task.start_on) + " → " : ""}${task.due_on ? fmtDateShort(task.due_on) : ""}${task.assignee ? "\n" + task.assignee.name : ""}`}
                          style={{
                            position: "absolute",
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            height: 18,
                            borderRadius: 4,
                            background: task.completed ? "#059669" : overdue ? "#d13438" : color,
                            opacity: task.completed ? 0.5 : 1,
                            minWidth: 4,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Today legend */}
          {todayVisible && (
            <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 16, height: 2, background: "#0891b2", opacity: 0.5 }} />
              <span style={{ fontSize: 11, color: "#94a3b8" }}>Today</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
}

export default function AsanaProjectView({ projectId }: Props) {
  const [data, setData] = useState<AsanaProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [subTab, setSubTab] = useState<"tasks" | "timeline">("tasks");

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .asanaProjectData(projectId)
      .then((d) => {
        setData(d);
        setExpandedSections(new Set(d.sections.map((s) => s.section.gid)));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load Asana data"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return <div style={{ color: "#64748b", padding: 32, textAlign: "center" }}>Loading Asana project data...</div>;
  }

  if (error) {
    return (
      <div className="ms-section-card">
        <div style={{ color: "#d13438", fontSize: 14 }}>Unable to load Asana data: {error}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
          Check that the Asana integration is connected and the linked project is accessible.
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { project, sections, customFieldDefs } = data;
  const totalTasks = sections.reduce((n, s) => n + s.tasks.length, 0);
  const completedTasks = sections.reduce((n, s) => n + s.tasks.filter((t) => t.completed).length, 0);
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  function toggleSection(gid: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Summary banner */}
      <div className="ms-section-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 4 }}>
              Asana Project
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>{project.name}</div>
            {project.notes && (
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, maxWidth: 640 }}>{project.notes}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 24, flexShrink: 0 }}>
            {project.due_on && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>Due</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginTop: 2 }}>{fmtDate(project.due_on)}</div>
              </div>
            )}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>Progress</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#059669", marginTop: 2 }}>{pct}%</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{completedTasks}/{totalTasks} tasks</div>
            </div>
          </div>
        </div>
        {totalTasks > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ height: 6, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#059669", borderRadius: 999, transition: "width 0.3s" }} />
            </div>
          </div>
        )}

        {/* Custom field definitions summary */}
        {customFieldDefs.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94a3b8", marginRight: 4 }}>Fields:</span>
            {customFieldDefs.map((f) => (
              <span key={f.gid} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(0,0,0,0.04)", color: "#64748b", border: "1px solid rgba(0,0,0,0.06)" }}>
                {f.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="ms-tabs" style={{ marginBottom: -8 }}>
        {(["tasks", "timeline"] as const).map((t) => (
          <button
            key={t}
            className={`ms-tab-btn${subTab === t ? " active" : ""}`}
            onClick={() => setSubTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tasks view */}
      {subTab === "tasks" && (
        <>
          {sections.length === 0 && (
            <div className="ms-section-card" style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>
              No sections found in this Asana project.
            </div>
          )}
          {sections.map(({ section, tasks }) => {
            const sectionDone = tasks.filter((t) => t.completed).length;
            const expanded = expandedSections.has(section.gid);
            return (
              <div key={section.gid} className="ms-section-card" style={{ padding: 0, overflow: "hidden" }}>
                <button
                  onClick={() => toggleSection(section.gid)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0 }}>
                      <path d="M4 2l4 4-4 4" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1e293b" }}>
                      {section.name}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{sectionDone}/{tasks.length} complete</span>
                </button>
                {expanded && (
                  <div style={{ padding: "0 14px 14px 14px", display: "grid", gap: 6 }}>
                    {tasks.length === 0 && (
                      <div style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic", padding: "6px 0" }}>No tasks</div>
                    )}
                    {tasks.map((task) => (
                      <TaskRow key={task.gid} task={task} fieldDefs={customFieldDefs} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Timeline view */}
      {subTab === "timeline" && <AsanaTimeline sections={sections} />}

      <div style={{ fontSize: 11, color: "#cbd5e1", textAlign: "right" }}>
        Read-only · Data sourced from Asana
      </div>
    </div>
  );
}

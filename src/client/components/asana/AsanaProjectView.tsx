import { useEffect, useState } from "react";
import { api, type AsanaProjectData, type AsanaTask } from "../../lib/api";

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TaskRow({ task }: { task: AsanaTask }) {
  const overdue = !task.completed && task.due_on && task.due_on < new Date().toISOString().slice(0, 10);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        background: task.completed ? "#f8fafc" : "#ffffff",
        borderRadius: 6,
        border: "1px solid rgba(0,0,0,0.06)",
        opacity: task.completed ? 0.65 : 1,
      }}
    >
      {/* completion dot */}
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: task.completed ? "none" : "2px solid #cbd5e1",
          background: task.completed ? "#059669" : "transparent",
          flexShrink: 0,
          marginTop: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {task.completed && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: task.completed ? "#94a3b8" : "#1e293b", textDecoration: task.completed ? "line-through" : "none" }}>
          {task.name}
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
          {task.assignee && <span>Assignee: {task.assignee.name}</span>}
          {task.due_on && (
            <span style={{ color: overdue ? "#d13438" : "#64748b" }}>
              Due: {formatDate(task.due_on)}{overdue ? " · Overdue" : ""}
            </span>
          )}
          {task.num_subtasks > 0 && <span>{task.num_subtasks} subtask{task.num_subtasks !== 1 ? "s" : ""}</span>}
        </div>
      </div>
    </div>
  );
}

interface Props {
  projectId: string;
}

export default function AsanaProjectView({ projectId }: Props) {
  const [data, setData] = useState<AsanaProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .asanaProjectData(projectId)
      .then((d) => {
        setData(d);
        // expand all sections by default
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
        <div style={{ color: "#d13438", fontSize: 14 }}>
          Unable to load Asana data: {error}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
          Check that the Asana integration is connected and the linked project is accessible.
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { project, sections } = data;
  const totalTasks = sections.reduce((n, s) => n + s.tasks.length, 0);
  const completedTasks = sections.reduce((n, s) => n + s.tasks.filter((t) => t.completed).length, 0);
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  function toggleSection(gid: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Project summary banner */}
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
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginTop: 2 }}>{formatDate(project.due_on)}</div>
              </div>
            )}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>Progress</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#059669", marginTop: 2 }}>{pct}%</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{completedTasks}/{totalTasks} tasks</div>
            </div>
          </div>
        </div>

        {/* progress bar */}
        {totalTasks > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ height: 6, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#059669", borderRadius: 999, transition: "width 0.3s" }} />
            </div>
          </div>
        )}
      </div>

      {/* Sections + tasks */}
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
            {/* Section header */}
            <button
              onClick={() => toggleSection(section.gid)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  style={{ transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0 }}
                >
                  <path d="M4 2l4 4-4 4" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1e293b" }}>
                  {section.name}
                </span>
              </div>
              <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>
                {sectionDone}/{tasks.length} complete
              </span>
            </button>

            {/* Tasks */}
            {expanded && (
              <div style={{ padding: "0 14px 14px 14px", display: "grid", gap: 6 }}>
                {tasks.length === 0 && (
                  <div style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic", padding: "6px 0" }}>No tasks</div>
                )}
                {tasks.map((task) => (
                  <TaskRow key={task.gid} task={task} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 11, color: "#cbd5e1", textAlign: "right" }}>
        Read-only · Data sourced from Asana
      </div>
    </div>
  );
}

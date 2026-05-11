import { useEffect, useState } from "react";
import { api, type Project } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const { showToast } = useToast();

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      setProjects(await api.adminProjects());
    } catch {
      showToast("Failed to load projects", "error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleArchive(project: Project) {
    const archiving = !project.archived;
    try {
      const updated = await api.adminArchiveProject(project.id, archiving);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast(`Project ${archiving ? "archived" : "unarchived"}.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update project", "error");
    }
  }

  async function handleRunHealthScoring() {
    setScoring(true);
    try {
      const result = await api.adminRunHealthScoring();
      await loadProjects();
      showToast(`Health scored for ${result.scored} project${result.scored !== 1 ? "s" : ""}.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Health scoring failed", "error");
    } finally {
      setScoring(false);
    }
  }

  async function handleDelete(project: Project) {
    if (project.in_optimize) {
      showToast(
        `"${project.name}" is in Optimize. Remove it from Optimize first (Admin → Optimize Accounts → Remove), then delete the project.`,
        "error"
      );
      return;
    }
    if (!window.confirm(`Permanently delete "${project.name}"? This cannot be undone.`)) return;
    try {
      await api.adminDeleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      showToast("Project deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete project", "error");
    }
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading projects...</div>;

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Projects</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {active.length} active · {archived.length} archived
          </span>
          <button
            className="ms-btn-secondary"
            onClick={handleRunHealthScoring}
            disabled={scoring}
            style={{ fontSize: 12 }}
          >
            {scoring ? "Scoring…" : "⚡ Run Health Scoring"}
          </button>
        </div>
      </div>

      <ProjectTable projects={active} onToggleArchive={toggleArchive} onDelete={handleDelete} />

      {archived.length > 0 && (
        <>
          <div style={{ margin: "28px 0 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8" }}>
            Archived
          </div>
          <ProjectTable projects={archived} onToggleArchive={toggleArchive} onDelete={handleDelete} dimmed />
        </>
      )}
    </div>
  );
}

function ProjectTable({
  projects,
  onToggleArchive,
  onDelete,
  dimmed,
}: {
  projects: Project[];
  onToggleArchive: (p: Project) => void;
  onDelete: (p: Project) => void;
  dimmed?: boolean;
}) {
  return (
    <div className="ms-card" style={{ overflow: "hidden", opacity: dimmed ? 0.6 : 1 }}>
      <table className="ms-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Customer</th>
            <th>Vendor</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {projects.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "#64748b", padding: "28px 16px" }}>
                No projects.
              </td>
            </tr>
          ) : (
            projects.map((p) => {
              const inOptimize = !!p.in_optimize;
              return (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{p.name}</span>
                      {inOptimize && (
                        <span
                          title="This project is marked complete and tracked in Optimize"
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "#0b6cad",
                            background: "rgba(11,108,173,0.1)",
                            border: "1px solid rgba(11,108,173,0.25)",
                            borderRadius: 4,
                            padding: "2px 6px",
                          }}
                        >
                          In Optimize
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ color: "#64748b" }}>{p.customer_name ?? "—"}</td>
                  <td style={{ color: "#64748b" }}>{p.vendor ?? "—"}</td>
                  <td style={{ color: "#64748b" }}>{p.status ?? "—"}</td>
                  <td style={{ color: "#94a3b8", fontSize: 12 }}>{p.updated_at?.slice(0, 10) ?? "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="ms-btn-ghost"
                        onClick={() => onToggleArchive(p)}
                        style={p.archived ? { color: "#107c10", borderColor: "rgba(16,124,16,0.35)" } : {}}
                      >
                        {p.archived ? "Unarchive" : "Archive"}
                      </button>
                      <button
                        className="ms-btn-ghost"
                        onClick={() => onDelete(p)}
                        disabled={inOptimize}
                        title={
                          inOptimize
                            ? "Remove this project from Optimize before deleting (Admin → Optimize Accounts → Remove)."
                            : undefined
                        }
                        style={{
                          color: "#d13438",
                          borderColor: "rgba(209,52,56,0.35)",
                          opacity: inOptimize ? 0.4 : 1,
                          cursor: inOptimize ? "not-allowed" : "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

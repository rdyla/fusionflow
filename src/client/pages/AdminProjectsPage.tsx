import { useEffect, useState } from "react";
import { api, type Project } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
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

  async function handleDelete(project: Project) {
    if (!window.confirm(`Permanently delete "${project.name}"? This cannot be undone.`)) return;
    try {
      await api.adminDeleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      showToast("Project deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete project", "error");
    }
  }

  if (loading) return <div style={{ color: "rgba(240,246,255,0.5)", padding: 32 }}>Loading projects...</div>;

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Projects</h1>
        <span style={{ fontSize: 12, color: "rgba(240,246,255,0.4)" }}>
          {active.length} active · {archived.length} archived
        </span>
      </div>

      <ProjectTable projects={active} onToggleArchive={toggleArchive} onDelete={handleDelete} />

      {archived.length > 0 && (
        <>
          <div style={{ margin: "28px 0 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(240,246,255,0.3)" }}>
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
              <td colSpan={6} style={{ textAlign: "center", color: "rgba(240,246,255,0.5)", padding: "28px 16px" }}>
                No projects.
              </td>
            </tr>
          ) : (
            projects.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td style={{ color: "rgba(240,246,255,0.5)" }}>{p.customer_name ?? "—"}</td>
                <td style={{ color: "rgba(240,246,255,0.5)" }}>{p.vendor ?? "—"}</td>
                <td style={{ color: "rgba(240,246,255,0.5)" }}>{p.status ?? "—"}</td>
                <td style={{ color: "rgba(240,246,255,0.4)", fontSize: 12 }}>{p.updated_at?.slice(0, 10) ?? "—"}</td>
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
                      style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

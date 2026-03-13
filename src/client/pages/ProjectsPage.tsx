import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Project, type User } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const EMPTY_FORM = {
  name: "",
  customer_name: "",
  vendor: "",
  solution_type: "",
  kickoff_date: "",
  target_go_live_date: "",
  pm_user_id: "",
  ae_user_id: "",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.projects(), api.users()])
      .then(([p, u]) => { setProjects(p); setUsers(u); })
      .catch((err) => setError(err.message || "Failed to load projects"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    setSaving(true);
    try {
      const created = await api.createProject({
        name: form.name.trim(),
        customer_name: form.customer_name.trim() || undefined,
        vendor: form.vendor.trim() || undefined,
        solution_type: form.solution_type.trim() || undefined,
        kickoff_date: form.kickoff_date || undefined,
        target_go_live_date: form.target_go_live_date || undefined,
        pm_user_id: form.pm_user_id || null,
        ae_user_id: form.ae_user_id || null,
      });

      showToast("Project created.", "success");
      navigate(`/projects/${created.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create project", "error");
      setSaving(false);
    }
  }

  function handleClose() {
    setShowModal(false);
    setForm(EMPTY_FORM);
  }

  if (loading) return <div>Loading projects...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Projects</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "10px 18px",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          + New Project
        </button>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          overflow: "hidden",
          background: "#121935",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#182247" }}>
            <tr>
              <Th>Name</Th>
              <Th>Customer</Th>
              <Th>Vendor</Th>
              <Th>Status</Th>
              <Th>Health</Th>
              <Th>Go-Live</Th>
            </tr>
          </thead>

          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 24, color: "#9fb0d9", textAlign: "center" }}>
                  No projects yet.
                </td>
              </tr>
            ) : (
              projects.map((project) => (
                <tr key={project.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <Td>
                    <Link
                      to={`/projects/${project.id}`}
                      style={{ color: "#8db4ff", textDecoration: "none", fontWeight: 600 }}
                    >
                      {project.name}
                    </Link>
                  </Td>
                  <Td>{project.customer_name ?? "—"}</Td>
                  <Td>{project.vendor ?? "—"}</Td>
                  <Td>{project.status ?? "—"}</Td>
                  <Td>{project.health ?? "—"}</Td>
                  <Td>{project.target_go_live_date ?? "—"}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div
            style={{
              background: "#121935",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 560,
            }}
          >
            <h2 style={{ margin: "0 0 20px" }}>New Project</h2>

            <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
              <FormField label="Project Name *">
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={inputStyle}
                  placeholder="e.g. Acme Corp – Webex Calling"
                />
              </FormField>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <FormField label="Customer Name">
                  <input
                    value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                    style={inputStyle}
                    placeholder="Customer"
                  />
                </FormField>

                <FormField label="Vendor">
                  <input
                    value={form.vendor}
                    onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g. Cisco, Zoom"
                  />
                </FormField>

                <FormField label="Solution Type">
                  <input
                    value={form.solution_type}
                    onChange={(e) => setForm({ ...form, solution_type: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g. UCaaS, CCaaS"
                  />
                </FormField>

                <FormField label="Kickoff Date">
                  <input
                    type="date"
                    value={form.kickoff_date}
                    onChange={(e) => setForm({ ...form, kickoff_date: e.target.value })}
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="Target Go-Live">
                  <input
                    type="date"
                    value={form.target_go_live_date}
                    onChange={(e) => setForm({ ...form, target_go_live_date: e.target.value })}
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="Project Manager">
                  <select
                    value={form.pm_user_id}
                    onChange={(e) => setForm({ ...form, pm_user_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Unassigned</option>
                    {users.filter((u) => u.role === "pm" || u.role === "admin").map((u) => (
                      <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Account Executive">
                  <select
                    value={form.ae_user_id}
                    onChange={(e) => setForm({ ...form, ae_user_id: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Unassigned</option>
                    {users.filter((u) => u.role === "pf_ae" || u.role === "admin").map((u) => (
                      <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim()}
                  style={{
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 18px",
                    fontWeight: 700,
                    cursor: saving || !form.name.trim() ? "default" : "pointer",
                    opacity: saving || !form.name.trim() ? 0.6 : 1,
                    fontSize: 14,
                  }}
                >
                  {saving ? "Creating..." : "Create Project"}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    background: "#334155",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 18px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: 14, fontSize: 13, color: "#c8d4ff" }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: 14, color: "#eef3ff" }}>
      {children}
    </td>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, color: "#b8c5e8", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#182247",
  color: "#eef3ff",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  boxSizing: "border-box",
};

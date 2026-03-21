import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const CATEGORIES = ["ucaas", "ccaas", "ci", "virtual_agent"] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_LABELS: Record<Category, string> = {
  ucaas: "UCaaS",
  ccaas: "CCaaS",
  ci: "Conversation Intelligence",
  virtual_agent: "Virtual Agent",
};

const WORKSTREAMS = [
  "discovery_requirements",
  "solution_design",
  "project_management",
  "implementation_configuration",
  "integration",
  "migration_data_porting",
  "testing_uat",
  "training_enablement",
  "documentation_handover",
  "hypercare",
] as const;

const WORKSTREAM_LABELS: Record<typeof WORKSTREAMS[number], string> = {
  discovery_requirements: "Discovery & Requirements",
  solution_design: "Solution Design",
  project_management: "Project Management",
  implementation_configuration: "Implementation & Config",
  integration: "Integration",
  migration_data_porting: "Migration & Data Porting",
  testing_uat: "Testing & UAT",
  training_enablement: "Training & Enablement",
  documentation_handover: "Documentation & Handover",
  hypercare: "Hypercare",
};

export default function AdminLaborPage() {
  const [categories, setCategories] = useState<Record<string, Record<string, number>>>({});
  const [defaults, setDefaults] = useState<Record<string, Record<string, number>>>({});
  const [edits, setEdits] = useState<Record<string, Record<string, number>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api.laborConfig()
      .then((data) => {
        setCategories(data.categories);
        setDefaults(data.defaults);
        setEdits(structuredClone(data.categories));
      })
      .catch(() => showToast("Failed to load labor config", "error"))
      .finally(() => setLoading(false));
  }, []);

  // Check if user is admin
  useEffect(() => {
    api.me().then((me) => {
      if (me.role !== "admin") navigate("/dashboard");
    }).catch(() => navigate("/login"));
  }, [navigate]);

  function setHours(cat: Category, ws: string, val: number) {
    setEdits((prev) => ({ ...prev, [cat]: { ...prev[cat], [ws]: val } }));
  }

  function isModified(cat: Category) {
    const current = categories[cat] ?? {};
    const edited = edits[cat] ?? {};
    return WORKSTREAMS.some((ws) => (edited[ws] ?? 0) !== (current[ws] ?? 0));
  }

  function totalHours(cat: Category) {
    return WORKSTREAMS.reduce((sum, ws) => sum + ((edits[cat]?.[ws]) ?? 0), 0);
  }

  async function handleSave(cat: Category) {
    setSaving((p) => ({ ...p, [cat]: true }));
    try {
      await api.updateLaborConfig(cat, edits[cat] ?? {});
      setCategories((prev) => ({ ...prev, [cat]: { ...edits[cat] } }));
      showToast("Saved.", "success");
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving((p) => ({ ...p, [cat]: false }));
    }
  }

  async function handleReset(cat: Category) {
    setSaving((p) => ({ ...p, [cat]: true }));
    try {
      await api.resetLaborConfig(cat);
      const defaultHours = defaults[cat] ?? {};
      setCategories((prev) => ({ ...prev, [cat]: { ...defaultHours } }));
      setEdits((prev) => ({ ...prev, [cat]: { ...defaultHours } }));
      showToast("Reset to defaults.", "success");
    } catch {
      showToast("Reset failed", "error");
    } finally {
      setSaving((p) => ({ ...p, [cat]: false }));
    }
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Labor Estimate Config</h1>
      <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 28 }}>
        Configure the baseline hours per workstream for each solution category. These values are used as the starting point before driver adjustments and complexity multipliers are applied.
      </p>

      <div style={{ display: "grid", gap: 24 }}>
        {CATEGORIES.map((cat) => {
          const catEdits = edits[cat] ?? {};
          const catDefaults = defaults[cat] ?? {};
          const modified = isModified(cat);
          const total = totalHours(cat);
          const isSaving = saving[cat] ?? false;

          return (
            <div key={cat} className="ms-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                    Total baseline: <span style={{ fontWeight: 600, color: "#334155" }}>{total} hrs</span>
                    {modified && <span style={{ color: "#f59e0b", marginLeft: 8 }}>● unsaved changes</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="ms-btn-secondary"
                    disabled={isSaving}
                    onClick={() => handleReset(cat)}
                    style={{ fontSize: 12 }}
                  >
                    Reset to Defaults
                  </button>
                  <button
                    className="ms-btn-primary"
                    disabled={isSaving || !modified}
                    onClick={() => handleSave(cat)}
                    style={{ fontSize: 12 }}
                  >
                    {isSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {WORKSTREAMS.map((ws) => {
                  const current = catEdits[ws] ?? catDefaults[ws] ?? 0;
                  const defaultVal = catDefaults[ws] ?? 0;
                  const isDiff = current !== defaultVal;
                  return (
                    <div key={ws} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: isDiff ? "rgba(99,193,234,0.06)" : "#f8fafc", borderRadius: 6, border: `1px solid ${isDiff ? "rgba(99,193,234,0.25)" : "rgba(0,0,0,0.06)"}` }}>
                      <span style={{ fontSize: 13, color: "#475569" }}>{WORKSTREAM_LABELS[ws]}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {isDiff && (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>({defaultVal})</span>
                        )}
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          value={current}
                          onChange={(e) => setHours(cat, ws, Math.max(0, parseInt(e.target.value) || 0))}
                          style={{ width: 64, padding: "4px 8px", fontSize: 13, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 4, background: "#fff", color: "#1e293b", textAlign: "right" }}
                        />
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>hrs</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

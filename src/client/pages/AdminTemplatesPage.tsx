import { useEffect, useState } from "react";
import { api, type Template, type TemplateStage, type TemplateTask } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const SOLUTION_TYPE_OPTIONS = [
  { value: "ucaas", label: "UCaaS" },
  { value: "ccaas", label: "CCaaS" },
  { value: "zoom_ra", label: "Zoom Revenue Accelerator" },
  { value: "zoom_va", label: "Zoom Virtual Agent" },
  { value: "rc_ace", label: "RC ACE" },
  { value: "rc_air", label: "RC AIR" },
];

const SOLUTION_TYPE_LABEL: Record<string, string> = {
  ucaas: "UCaaS",
  ccaas: "CCaaS",
  zoom_ra: "Zoom Revenue Accelerator",
  zoom_va: "Zoom Virtual Agent",
  rc_ace: "RC ACE",
  rc_air: "RC AIR",
};

const PRIORITY_COLOR: Record<string, string> = {
  high: "#d13438",
  medium: "#ff8c00",
  low: "#059669",
};

function PriorityBadge({ priority }: { priority: string | null }) {
  const p = priority ?? "medium";
  const color = PRIORITY_COLOR[p] ?? "#94a3b8";
  return (
    <span
      className="ms-badge"
      style={{ background: color + "1a", color, border: `1px solid ${color}40`, fontSize: 11 }}
    >
      {p}
    </span>
  );
}

const EMPTY_CREATE = { name: "", solution_type: "ucaas", description: "" };

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<Template | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editForm, setEditForm] = useState({ name: "", solution_type: "", description: "" });
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null);

  // Add stage
  const [addingStageToTemplate, setAddingStageToTemplate] = useState<string | null>(null);
  const [newStageName, setNewStageName] = useState("");
  const [savingStage, setSavingStage] = useState(false);

  // Add task
  const [addingTaskState, setAddingTaskState] = useState<{ templateId: string; stageId: string | null } | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [savingTask, setSavingTask] = useState(false);

  const { showToast } = useToast();

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    try {
      setLoading(true);
      setTemplates(await api.adminTemplates());
    } catch {
      showToast("Failed to load templates", "error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(template: Template) {
    if (expandedId === template.id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(template.id);
    setExpandedDetail(null);
    setLoadingDetail(true);
    try {
      const detail = await api.adminTemplate(template.id);
      setExpandedDetail(detail);
    } catch {
      showToast("Failed to load template detail", "error");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const created = await api.adminCreateTemplate({
        name: createForm.name.trim(),
        solution_type: createForm.solution_type || undefined,
        description: createForm.description.trim() || undefined,
      });
      setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setShowCreateModal(false);
      setCreateForm(EMPTY_CREATE);
      showToast("Template created.", "success");
    } catch {
      showToast("Failed to create template", "error");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(t: Template) {
    setEditingTemplate(t);
    setEditForm({
      name: t.name,
      solution_type: t.solution_type ?? "",
      description: t.description ?? "",
    });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTemplate) return;
    setSaving(true);
    try {
      const updated = await api.adminUpdateTemplate(editingTemplate.id, {
        name: editForm.name.trim() || undefined,
        solution_type: editForm.solution_type || undefined,
        description: editForm.description.trim() || undefined,
      });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
      if (expandedDetail?.id === updated.id) {
        setExpandedDetail((prev) => prev ? { ...prev, ...updated } : prev);
      }
      setEditingTemplate(null);
      showToast("Template updated.", "success");
    } catch {
      showToast("Failed to update template", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingTemplate) return;
    try {
      await api.adminDeleteTemplate(deletingTemplate.id);
      setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id));
      if (expandedId === deletingTemplate.id) {
        setExpandedId(null);
        setExpandedDetail(null);
      }
      setDeletingTemplate(null);
      showToast("Template deleted.", "success");
    } catch {
      showToast("Failed to delete template", "error");
    }
  }

  async function handleAddStage(templateId: string) {
    if (!newStageName.trim()) return;
    setSavingStage(true);
    try {
      const currentStages = expandedDetail?.stages ?? [];
      const maxOrder = currentStages.reduce((m, p) => Math.max(m, p.order_index), 0);
      const stage = await api.adminAddTemplateStage(templateId, {
        name: newStageName.trim(),
        order_index: maxOrder + 1,
      });
      const stageWithTasks: TemplateStage = { ...stage, tasks: [] };
      setExpandedDetail((prev) => prev ? { ...prev, stages: [...(prev.stages ?? []), stageWithTasks] } : prev);
      setTemplates((prev) => prev.map((t) => t.id === templateId ? { ...t, stage_count: (t.stage_count ?? 0) + 1 } : t));
      setNewStageName("");
      setAddingStageToTemplate(null);
      showToast("Stage added.", "success");
    } catch {
      showToast("Failed to add stage", "error");
    } finally {
      setSavingStage(false);
    }
  }

  async function handleDeleteStage(templateId: string, stageId: string) {
    try {
      await api.adminDeleteTemplateStage(templateId, stageId);
      setExpandedDetail((prev) => {
        if (!prev) return prev;
        const removedTasks = (prev.stages?.find((p) => p.id === stageId)?.tasks ?? []).length;
        return {
          ...prev,
          stages: (prev.stages ?? []).filter((p) => p.id !== stageId),
          _removedTasks: removedTasks,
        } as Template & { _removedTasks?: number };
      });
      setTemplates((prev) => prev.map((t) => t.id === templateId ? { ...t, stage_count: Math.max(0, (t.stage_count ?? 1) - 1) } : t));
      showToast("Stage removed.", "success");
    } catch {
      showToast("Failed to delete stage", "error");
    }
  }

  async function handleAddTask(templateId: string, stageId: string | null) {
    if (!newTaskTitle.trim()) return;
    setSavingTask(true);
    try {
      const task = await api.adminAddTemplateTask(templateId, {
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        stage_id: stageId ?? undefined,
        order_index: 0,
      });
      setExpandedDetail((prev) => {
        if (!prev) return prev;
        if (!stageId) return prev;
        return {
          ...prev,
          stages: (prev.stages ?? []).map((p) =>
            p.id === stageId ? { ...p, tasks: [...p.tasks, task] } : p
          ),
        };
      });
      setTemplates((prev) => prev.map((t) => t.id === templateId ? { ...t, task_count: (t.task_count ?? 0) + 1 } : t));
      setNewTaskTitle("");
      setNewTaskPriority("medium");
      setAddingTaskState(null);
      showToast("Task added.", "success");
    } catch {
      showToast("Failed to add task", "error");
    } finally {
      setSavingTask(false);
    }
  }

  async function handleDeleteTask(templateId: string, stageId: string, task: TemplateTask) {
    try {
      await api.adminDeleteTemplateTask(templateId, task.id);
      setExpandedDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          stages: (prev.stages ?? []).map((p) =>
            p.id === stageId ? { ...p, tasks: p.tasks.filter((t) => t.id !== task.id) } : p
          ),
        };
      });
      setTemplates((prev) => prev.map((t) => t.id === templateId ? { ...t, task_count: Math.max(0, (t.task_count ?? 1) - 1) } : t));
      showToast("Task removed.", "success");
    } catch {
      showToast("Failed to delete task", "error");
    }
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading templates...</div>;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Project Templates</h1>
        <button className="ms-btn-primary" onClick={() => setShowCreateModal(true)}>+ New Template</button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {templates.length === 0 && (
          <div className="ms-card" style={{ color: "#64748b", padding: 24, textAlign: "center" }}>
            No templates yet. Create one to get started.
          </div>
        )}
        {templates.map((t) => (
          <div key={t.id} className="ms-card" style={{ padding: 0, overflow: "hidden" }}>
            {/* Header row */}
            <div
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer" }}
              onClick={() => toggleExpand(t)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: "#1e293b" }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {t.solution_type ? (SOLUTION_TYPE_LABEL[t.solution_type] ?? t.solution_type) : "—"}
                  {t.description ? ` · ${t.description}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  <strong style={{ color: "#334155" }}>{t.stage_count ?? 0}</strong> stages
                </span>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  <strong style={{ color: "#334155" }}>{t.task_count ?? 0}</strong> tasks
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); openEdit(t); }}
                  style={{ fontSize: 12, color: "#0891b2", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 4 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(8,145,178,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeletingTemplate(t); }}
                  style={{ fontSize: 12, color: "#d13438", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 4 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(209,52,56,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  Delete
                </button>
                <span style={{ fontSize: 14, color: "#94a3b8", userSelect: "none" }}>
                  {expandedId === t.id ? "▲" : "▼"}
                </span>
              </div>
            </div>

            {/* Expanded detail */}
            {expandedId === t.id && (
              <div style={{ borderTop: "1px solid #f1f5f9", background: "#f8fafc", padding: "18px 18px 8px" }}>
                {loadingDetail && <div style={{ color: "#94a3b8", fontSize: 13 }}>Loading...</div>}
                {!loadingDetail && expandedDetail && (
                  <>
                    {(expandedDetail.stages ?? []).length === 0 && (
                      <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", marginBottom: 12 }}>No stages yet.</div>
                    )}
                    {(expandedDetail.stages ?? []).map((stage) => (
                      <div key={stage.id} style={{ marginBottom: 18 }}>
                        {/* Stage header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#334155" }}>{stage.name}</div>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>({stage.tasks.length} tasks)</span>
                          <div style={{ flex: 1 }} />
                          <button
                            onClick={() => {
                              setAddingTaskState({ templateId: expandedDetail.id, stageId: stage.id });
                              setNewTaskTitle("");
                              setNewTaskPriority("medium");
                            }}
                            style={{ fontSize: 11, color: "#0891b2", background: "none", border: "none", cursor: "pointer", padding: "2px 8px", borderRadius: 4 }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(8,145,178,0.08)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                          >
                            + Task
                          </button>
                          <button
                            onClick={() => handleDeleteStage(expandedDetail.id, stage.id)}
                            style={{ fontSize: 11, color: "#d13438", background: "none", border: "none", cursor: "pointer", padding: "2px 8px", borderRadius: 4 }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(209,52,56,0.08)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                          >
                            Remove stage
                          </button>
                        </div>

                        {/* Task list */}
                        <div style={{ display: "grid", gap: 4, paddingLeft: 14 }}>
                          {stage.tasks.length === 0 && (
                            <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>No tasks.</div>
                          )}
                          {stage.tasks.map((task) => (
                            <div
                              key={task.id}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "white", borderRadius: 5, border: "1px solid #f1f5f9" }}
                            >
                              <PriorityBadge priority={task.priority} />
                              <span style={{ flex: 1, fontSize: 13, color: "#334155" }}>{task.title}</span>
                              {task.default_assignee_role && (
                                <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, padding: "2px 6px" }}>
                                  {task.default_assignee_role}
                                </span>
                              )}
                              <button
                                onClick={() => handleDeleteTask(expandedDetail.id, stage.id, task)}
                                style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 3 }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = "#d13438"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
                                title="Remove task"
                              >
                                ×
                              </button>
                            </div>
                          ))}

                          {/* Add task inline */}
                          {addingTaskState?.templateId === expandedDetail.id && addingTaskState?.stageId === stage.id && (
                            <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                              <input
                                autoFocus
                                className="ms-input"
                                style={{ flex: 1, fontSize: 12, padding: "4px 8px" }}
                                placeholder="Task title"
                                value={newTaskTitle}
                                onChange={(e) => setNewTaskTitle(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(expandedDetail.id, stage.id); if (e.key === "Escape") setAddingTaskState(null); }}
                              />
                              <select
                                className="ms-input"
                                style={{ fontSize: 12, padding: "4px 8px", width: 90 }}
                                value={newTaskPriority}
                                onChange={(e) => setNewTaskPriority(e.target.value)}
                              >
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                              </select>
                              <button
                                className="ms-btn-primary"
                                style={{ fontSize: 12, padding: "4px 12px" }}
                                onClick={() => handleAddTask(expandedDetail.id, stage.id)}
                                disabled={savingTask || !newTaskTitle.trim()}
                              >
                                Add
                              </button>
                              <button
                                className="ms-btn-secondary"
                                style={{ fontSize: 12, padding: "4px 10px" }}
                                onClick={() => setAddingTaskState(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Add stage */}
                    <div style={{ marginTop: 4, paddingBottom: 12 }}>
                      {addingStageToTemplate === expandedDetail.id ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            autoFocus
                            className="ms-input"
                            style={{ flex: 1, fontSize: 13, padding: "5px 10px" }}
                            placeholder="Stage name"
                            value={newStageName}
                            onChange={(e) => setNewStageName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleAddStage(expandedDetail.id); if (e.key === "Escape") setAddingStageToTemplate(null); }}
                          />
                          <button
                            className="ms-btn-primary"
                            style={{ fontSize: 12, padding: "5px 14px" }}
                            onClick={() => handleAddStage(expandedDetail.id)}
                            disabled={savingStage || !newStageName.trim()}
                          >
                            Add Stage
                          </button>
                          <button
                            className="ms-btn-secondary"
                            style={{ fontSize: 12, padding: "5px 10px" }}
                            onClick={() => { setAddingStageToTemplate(null); setNewStageName(""); }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddingStageToTemplate(expandedDetail.id); setNewStageName(""); }}
                          style={{ fontSize: 12, color: "#0891b2", background: "none", border: "1px dashed rgba(8,145,178,0.4)", borderRadius: 5, padding: "6px 14px", cursor: "pointer", width: "100%" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(8,145,178,0.05)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                        >
                          + Add Stage
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowCreateModal(false); setCreateForm(EMPTY_CREATE); } }}>
          <div className="ms-modal">
            <h2>New Template</h2>
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
              <label className="ms-label">
                <span>Name *</span>
                <input autoFocus required className="ms-input" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="e.g. UCaaS - Zoom" />
              </label>
              <label className="ms-label">
                <span>Solution Type</span>
                <select className="ms-input" value={createForm.solution_type} onChange={(e) => setCreateForm({ ...createForm, solution_type: e.target.value })}>
                  <option value="">— None —</option>
                  {SOLUTION_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="ms-label">
                <span>Description</span>
                <input className="ms-input" value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="Brief description" />
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={creating || !createForm.name.trim()}>
                  {creating ? "Creating..." : "Create Template"}
                </button>
                <button type="button" className="ms-btn-secondary" onClick={() => { setShowCreateModal(false); setCreateForm(EMPTY_CREATE); }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTemplate && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingTemplate(null); }}>
          <div className="ms-modal">
            <h2>Edit Template</h2>
            <form onSubmit={handleEdit} style={{ display: "grid", gap: 14 }}>
              <label className="ms-label">
                <span>Name *</span>
                <input required className="ms-input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </label>
              <label className="ms-label">
                <span>Solution Type</span>
                <select className="ms-input" value={editForm.solution_type} onChange={(e) => setEditForm({ ...editForm, solution_type: e.target.value })}>
                  <option value="">— None —</option>
                  {SOLUTION_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="ms-label">
                <span>Description</span>
                <input className="ms-input" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
                <button type="button" className="ms-btn-secondary" onClick={() => setEditingTemplate(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deletingTemplate && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeletingTemplate(null); }}>
          <div className="ms-modal" style={{ maxWidth: 420 }}>
            <h2 style={{ color: "#d13438" }}>Delete Template</h2>
            <p style={{ color: "#475569", margin: "12px 0 20px" }}>
              Permanently delete <strong style={{ color: "#1e293b" }}>{deletingTemplate.name}</strong>? This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="ms-btn-primary" style={{ background: "#d13438", borderColor: "#d13438" }} onClick={handleDelete}>Delete</button>
              <button className="ms-btn-secondary" onClick={() => setDeletingTemplate(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

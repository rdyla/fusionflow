import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type Document,
  type Milestone,
  type Note,
  type Phase,
  type Project,
  type Risk,
  type Task,
  type User,
} from "../lib/api";
import ProjectTimeline from "../components/timeline/ProjectTimeline";
import ProjectDocuments from "../components/documents/ProjectDocuments";
import { useToast } from "../components/ui/ToastProvider";

type DetailTab = "overview" | "timeline" | "tasks" | "risks" | "milestones" | "documents" | "activity";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editHealth, setEditHealth] = useState("");
  const [editTargetGoLiveDate, setEditTargetGoLiveDate] = useState("");
  const [editPmUserId, setEditPmUserId] = useState("");
  const [editAeUserId, setEditAeUserId] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newNoteVisibility, setNewNoteVisibility] = useState<"internal" | "partner" | "public">("internal");
  const [savingNote, setSavingNote] = useState(false);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);

  // Task CRUD state
  const [addingTaskPhaseId, setAddingTaskPhaseId] = useState<string | null>(null);
  const [newTaskFields, setNewTaskFields] = useState({ title: "", due_date: "", priority: "", assignee_user_id: "" });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [savingTask, setSavingTask] = useState(false);

  // Risk CRUD state
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [riskForm, setRiskForm] = useState({ title: "", description: "", severity: "medium", status: "open", owner_user_id: "" });
  const [savingRisk, setSavingRisk] = useState(false);

  // Milestone CRUD state
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [milestoneForm, setMilestoneForm] = useState({ name: "", phase_id: "", target_date: "", actual_date: "", status: "not_started" });
  const [savingMilestone, setSavingMilestone] = useState(false);

  const { showToast } = useToast();
  const groupedTasks = useMemo(() => {
    return phases.map((phase) => ({
      phase,
      tasks: tasks.filter((task) => task.phase_id === phase.id),
    }));
  }, [phases, tasks]);

  const userMap = useMemo(() => {
    return new Map(users.map((u) => [u.id, u]));
  }, [users]);

  function userName(id: string | null) {
    if (!id) return "—";
    const u = userMap.get(id);
    return u ? (u.name ?? u.email) : id;
  }

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        const [projectData, phaseData, milestoneData, taskData, riskData, noteData, userData, docData] =
          await Promise.all([
            api.project(id),
            api.phases(id),
            api.milestones(id),
            api.tasks(id),
            api.risks(id),
            api.notes(id),
            api.users(),
            api.documents(id),
          ]);

        setProject(projectData);
        setEditStatus(projectData.status ?? "");
        setEditHealth(projectData.health ?? "");
        setEditTargetGoLiveDate(projectData.target_go_live_date ?? "");
        setEditPmUserId(projectData.pm_user_id ?? "");
        setEditAeUserId(projectData.ae_user_id ?? "");
        setPhases(phaseData);
        setMilestones(milestoneData);
        setTasks(taskData);
        setRisks(riskData);
        setNotes(noteData);
        setUsers(userData);
        setDocuments(docData);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load project";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  if (loading) return <div>Loading project...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!project) return <div>Project not found.</div>;

  async function handleSaveProject() {
    if (!project) return;

    setSavingProject(true);
    setSaveMessage(null);

    try {
      const updated = await api.updateProject(project.id, {
        status: editStatus || undefined,
        health: editHealth || undefined,
        target_go_live_date: editTargetGoLiveDate || undefined,
        pm_user_id: editPmUserId || null,
        ae_user_id: editAeUserId || null,
      });
      setEditPmUserId(updated.pm_user_id ?? "");
      setEditAeUserId(updated.ae_user_id ?? "");

      setProject(updated);
      setSaveMessage("Project updated successfully.");
      showToast("Project updated successfully.", "success");

    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update project";
      setSaveMessage(message);
      showToast(message, "error");
    } finally {
      setSavingProject(false);
    }
  }

  async function handleCreateTask(phaseId: string) {
    if (!project || !newTaskFields.title.trim()) return;

    setSavingTask(true);
    try {
      const created = await api.createTask(project.id, {
        title: newTaskFields.title.trim(),
        phase_id: phaseId,
        due_date: newTaskFields.due_date || null,
        priority: (newTaskFields.priority as "low" | "medium" | "high") || null,
        assignee_user_id: newTaskFields.assignee_user_id.trim() || null,
        status: "not_started",
      });
      setTasks((prev) => [...prev, created]);
      setAddingTaskPhaseId(null);
      setNewTaskFields({ title: "", due_date: "", priority: "", assignee_user_id: "" });
      showToast("Task created.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create task", "error");
    } finally {
      setSavingTask(false);
    }
  }

  async function handleUpdateTask() {
    if (!project || !editingTask) return;

    setSavingTask(true);
    try {
      const updated = await api.updateTask(project.id, editingTask.id, {
        title: editingTask.title,
        phase_id: editingTask.phase_id,
        due_date: editingTask.due_date,
        priority: editingTask.priority as "low" | "medium" | "high" | null,
        assignee_user_id: editingTask.assignee_user_id,
        status: editingTask.status as "not_started" | "in_progress" | "completed" | "blocked",
      });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditingTask(null);
      showToast("Task updated.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update task", "error");
    } finally {
      setSavingTask(false);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!project) return;

    try {
      await api.deleteTask(project.id, taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (editingTask?.id === taskId) setEditingTask(null);
      showToast("Task deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete task", "error");
    }
  }

  // ── Risk handlers ────────────────────────────────────────────────────────

  function openNewRisk() {
    setEditingRisk(null);
    setRiskForm({ title: "", description: "", severity: "medium", status: "open", owner_user_id: "" });
    setShowRiskModal(true);
  }

  function openEditRisk(risk: Risk) {
    setEditingRisk(risk);
    setRiskForm({
      title: risk.title,
      description: risk.description ?? "",
      severity: risk.severity ?? "medium",
      status: risk.status ?? "open",
      owner_user_id: risk.owner_user_id ?? "",
    });
    setShowRiskModal(true);
  }

  async function handleSaveRisk(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setSavingRisk(true);
    try {
      const payload = {
        title: riskForm.title.trim(),
        description: riskForm.description.trim() || undefined,
        severity: riskForm.severity as "low" | "medium" | "high",
        status: riskForm.status as "open" | "mitigated" | "closed",
        owner_user_id: riskForm.owner_user_id || null,
      };
      if (editingRisk) {
        const updated = await api.updateRisk(project.id, editingRisk.id, payload);
        setRisks((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        showToast("Risk updated.", "success");
      } else {
        const created = await api.createRisk(project.id, payload);
        setRisks((prev) => [...prev, created]);
        showToast("Risk added.", "success");
      }
      setShowRiskModal(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save risk", "error");
    } finally {
      setSavingRisk(false);
    }
  }

  async function handleDeleteRisk(riskId: string) {
    if (!project || !window.confirm("Delete this risk?")) return;
    try {
      await api.deleteRisk(project.id, riskId);
      setRisks((prev) => prev.filter((r) => r.id !== riskId));
      showToast("Risk deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete risk", "error");
    }
  }

  // ── Milestone handlers ────────────────────────────────────────────────────

  function openNewMilestone() {
    setEditingMilestone(null);
    setMilestoneForm({ name: "", phase_id: "", target_date: "", actual_date: "", status: "not_started" });
    setShowMilestoneModal(true);
  }

  function openEditMilestone(ms: Milestone) {
    setEditingMilestone(ms);
    setMilestoneForm({
      name: ms.name,
      phase_id: ms.phase_id ?? "",
      target_date: ms.target_date ?? "",
      actual_date: ms.actual_date ?? "",
      status: ms.status ?? "not_started",
    });
    setShowMilestoneModal(true);
  }

  async function handleSaveMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setSavingMilestone(true);
    try {
      const payload = {
        name: milestoneForm.name.trim(),
        phase_id: milestoneForm.phase_id || null,
        target_date: milestoneForm.target_date || null,
        actual_date: milestoneForm.actual_date || null,
        status: milestoneForm.status as "not_started" | "in_progress" | "completed",
      };
      if (editingMilestone) {
        const updated = await api.updateMilestone(project.id, editingMilestone.id, payload);
        setMilestones((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        showToast("Milestone updated.", "success");
      } else {
        const created = await api.createMilestone(project.id, payload);
        setMilestones((prev) => [...prev, created]);
        showToast("Milestone added.", "success");
      }
      setShowMilestoneModal(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save milestone", "error");
    } finally {
      setSavingMilestone(false);
    }
  }

  async function handleDeleteMilestone(milestoneId: string) {
    if (!project || !window.confirm("Delete this milestone?")) return;
    try {
      await api.deleteMilestone(project.id, milestoneId);
      setMilestones((prev) => prev.filter((m) => m.id !== milestoneId));
      showToast("Milestone deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete milestone", "error");
    }
  }

  async function handleAddNote() {
    if (!project) return;
    if (!newNoteBody.trim()) {
      setNoteMessage("Please enter a note.");
      return;
    }

    setSavingNote(true);
    setNoteMessage(null);

    try {
      const created = await api.createNote(project.id, {
        body: newNoteBody.trim(),
        visibility: newNoteVisibility,
      });

      setNotes((prev) => [created, ...prev]);
      setNewNoteBody("");
      setNewNoteVisibility("internal");
      setNoteMessage("Note added.");
      showToast("Note added.", "success");

    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add note";
      setNoteMessage(message);
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/projects" style={{ color: "#8db4ff", textDecoration: "none" }}>
          ← Back to Projects
        </Link>
      </div>

      <div
        style={{
          background: "#121935",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h1 style={{ marginTop: 0 }}>{project.name}</h1>
        <p style={{ color: "#b8c5e8", marginTop: 4 }}>
          {project.customer_name ?? "Unknown customer"} • {project.vendor ?? "Unknown vendor"} •{" "}
          {project.solution_type ?? "—"}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 24,
          }}
        >
          <InfoCard label="Status" value={project.status} />
          <InfoCard label="Health" value={project.health} />
          <InfoCard label="Kickoff Date" value={project.kickoff_date} />
          <InfoCard label="Target Go-Live" value={project.target_go_live_date} />
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 28,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
            Overview
          </TabButton>
          <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>
            Timeline
          </TabButton>
          <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")}>
            Tasks
          </TabButton>
          <TabButton active={tab === "risks"} onClick={() => setTab("risks")}>
            Risks
          </TabButton>
          <TabButton active={tab === "milestones"} onClick={() => setTab("milestones")}>
            Milestones
          </TabButton>
          <TabButton active={tab === "documents"} onClick={() => setTab("documents")}>
            Documents
          </TabButton>
          <TabButton active={tab === "activity"} onClick={() => setTab("activity")}>
            Activity
          </TabButton>
        </div>

        {tab === "overview" && (
          <div style={{ display: "grid", gap: 16 }}>
            <SectionCard title="Project Summary">
              <OverviewGrid>
                <OverviewItem label="Customer" value={project.customer_name} />
                <OverviewItem label="Vendor" value={project.vendor} />
                <OverviewItem label="Solution Type" value={project.solution_type} />
                <OverviewItem label="Kickoff" value={project.kickoff_date} />
                <OverviewItem label="Actual Go-Live" value={project.actual_go_live_date} />
                <OverviewItem label="Project Manager" value={userName(project.pm_user_id)} />
                <OverviewItem label="Account Executive" value={userName(project.ae_user_id)} />
              </OverviewGrid>
            </SectionCard>

            <SectionCard title="Project Controls">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 16,
                }}
              >
                <FormField label="Status">
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select status</option>
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="complete">Complete</option>
                  </select>
                </FormField>

                <FormField label="Health">
                  <select
                    value={editHealth}
                    onChange={(e) => setEditHealth(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select health</option>
                    <option value="on_track">On Track</option>
                    <option value="at_risk">At Risk</option>
                    <option value="delayed">Delayed</option>
                  </select>
                </FormField>

                <FormField label="Target Go-Live">
                  <input
                    type="date"
                    value={editTargetGoLiveDate ?? ""}
                    onChange={(e) => setEditTargetGoLiveDate(e.target.value)}
                    style={inputStyle}
                  />
                </FormField>

                <FormField label="Project Manager">
                  <select value={editPmUserId} onChange={(e) => setEditPmUserId(e.target.value)} style={inputStyle}>
                    <option value="">Unassigned</option>
                    {users.filter((u) => u.role === "pm" || u.role === "admin").map((u) => (
                      <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Account Executive">
                  <select value={editAeUserId} onChange={(e) => setEditAeUserId(e.target.value)} style={inputStyle}>
                    <option value="">Unassigned</option>
                    {users.filter((u) => u.role === "pf_ae" || u.role === "admin").map((u) => (
                      <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 18,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={handleSaveProject}
                  disabled={savingProject}
                  style={{
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 16px",
                    fontWeight: 700,
                    cursor: savingProject ? "default" : "pointer",
                    opacity: savingProject ? 0.7 : 1,
                  }}
                >
                  {savingProject ? "Saving..." : "Save Changes"}
                </button>

                {saveMessage && (
                  <span style={{ color: "#b8c5e8", fontSize: 14 }}>{saveMessage}</span>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Quick Counts">
              <OverviewGrid>
                <OverviewItem label="Phases" value={String(phases.length)} />
                <OverviewItem label="Milestones" value={String(milestones.length)} />
                <OverviewItem label="Tasks" value={String(tasks.length)} />
                <OverviewItem label="Risks" value={String(risks.length)} />
                <OverviewItem label="Notes" value={String(notes.length)} />
              </OverviewGrid>
            </SectionCard>
          </div>
        )}

        {tab === "timeline" && (
          <ProjectTimeline
            phases={phases}
            milestones={milestones}
            onUpdatePhase={async (phaseId, updates) => {
              if (!project) return;
              const updated = await api.updatePhase(project.id, phaseId, updates);
              setPhases((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            }}
          />
        )}

        {tab === "tasks" && (
          <SectionCard title="Tasks by Phase">
            <div style={{ display: "grid", gap: 24 }}>
              {groupedTasks.map(({ phase, tasks: phaseTasks }) => (
                <div key={phase.id}>
                  <div style={{ color: "#eef3ff", fontWeight: 700, marginBottom: 10 }}>
                    {phase.name}
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    {phaseTasks.length === 0 && addingTaskPhaseId !== phase.id && (
                      <EmptyRow>No tasks</EmptyRow>
                    )}

                    {phaseTasks.map((task) =>
                      editingTask?.id === task.id ? (
                        <div
                          key={task.id}
                          style={{
                            background: "#182247",
                            borderRadius: 12,
                            padding: 14,
                            display: "grid",
                            gap: 10,
                            border: "1px solid rgba(255,255,255,0.12)",
                          }}
                        >
                          <FormField label="Title">
                            <input
                              value={editingTask.title}
                              onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                              style={inputStyle}
                            />
                          </FormField>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <FormField label="Status">
                              <select
                                value={editingTask.status ?? ""}
                                onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value })}
                                style={inputStyle}
                              >
                                <option value="not_started">Not Started</option>
                                <option value="in_progress">In Progress</option>
                                <option value="completed">Completed</option>
                                <option value="blocked">Blocked</option>
                              </select>
                            </FormField>
                            <FormField label="Priority">
                              <select
                                value={editingTask.priority ?? ""}
                                onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value || null })}
                                style={inputStyle}
                              >
                                <option value="">None</option>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                            </FormField>
                            <FormField label="Due Date">
                              <input
                                type="date"
                                value={editingTask.due_date ?? ""}
                                onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value || null })}
                                style={inputStyle}
                              />
                            </FormField>
                            <FormField label="Assignee">
                              <select
                                value={editingTask.assignee_user_id ?? ""}
                                onChange={(e) => setEditingTask({ ...editingTask, assignee_user_id: e.target.value || null })}
                                style={inputStyle}
                              >
                                <option value="">Unassigned</option>
                                {users.map((u) => (
                                  <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                                ))}
                              </select>
                            </FormField>
                            <FormField label="Move to Phase">
                              <select
                                value={editingTask.phase_id ?? ""}
                                onChange={(e) => setEditingTask({ ...editingTask, phase_id: e.target.value || null })}
                                style={inputStyle}
                              >
                                <option value="">No phase</option>
                                {phases.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </FormField>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={handleUpdateTask}
                              disabled={savingTask}
                              style={{ ...btnStyle, background: "#2563eb" }}
                            >
                              {savingTask ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingTask(null)}
                              style={{ ...btnStyle, background: "#334155" }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              style={{ ...btnStyle, background: "#7f1d1d", marginLeft: "auto" }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={task.id}
                          style={{
                            background: "#182247",
                            borderRadius: 12,
                            padding: 14,
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 16,
                            alignItems: "start",
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#eef3ff", fontWeight: 700, marginBottom: 4 }}>
                              {task.title}
                            </div>
                            <div style={{ color: "#9fb0d9", fontSize: 14 }}>
                              Due: {task.due_date ?? "—"} • Assignee: {userName(task.assignee_user_id)} • Priority: {task.priority ?? "—"}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                            <span
                              style={{
                                background: "#334155",
                                color: "#fff",
                                padding: "4px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 700,
                                textTransform: "capitalize",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {task.status?.replaceAll("_", " ") ?? "unknown"}
                            </span>
                            <button
                              onClick={() => setEditingTask(task)}
                              style={{ ...btnStyle, background: "#1e3a5f", fontSize: 12, padding: "4px 10px" }}
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      )
                    )}

                    {addingTaskPhaseId === phase.id ? (
                      <div
                        style={{
                          background: "#182247",
                          borderRadius: 12,
                          padding: 14,
                          display: "grid",
                          gap: 10,
                          border: "1px solid rgba(255,255,255,0.12)",
                        }}
                      >
                        <FormField label="Title">
                          <input
                            autoFocus
                            value={newTaskFields.title}
                            onChange={(e) => setNewTaskFields({ ...newTaskFields, title: e.target.value })}
                            style={inputStyle}
                            placeholder="Task title"
                          />
                        </FormField>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                          <FormField label="Due Date">
                            <input
                              type="date"
                              value={newTaskFields.due_date}
                              onChange={(e) => setNewTaskFields({ ...newTaskFields, due_date: e.target.value })}
                              style={inputStyle}
                            />
                          </FormField>
                          <FormField label="Priority">
                            <select
                              value={newTaskFields.priority}
                              onChange={(e) => setNewTaskFields({ ...newTaskFields, priority: e.target.value })}
                              style={inputStyle}
                            >
                              <option value="">None</option>
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </FormField>
                          <FormField label="Assignee">
                            <select
                              value={newTaskFields.assignee_user_id}
                              onChange={(e) => setNewTaskFields({ ...newTaskFields, assignee_user_id: e.target.value })}
                              style={inputStyle}
                            >
                              <option value="">Unassigned</option>
                              {users.map((u) => (
                                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                              ))}
                            </select>
                          </FormField>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handleCreateTask(phase.id)}
                            disabled={savingTask || !newTaskFields.title.trim()}
                            style={{ ...btnStyle, background: "#2563eb", opacity: !newTaskFields.title.trim() ? 0.5 : 1 }}
                          >
                            {savingTask ? "Saving..." : "Add Task"}
                          </button>
                          <button
                            onClick={() => { setAddingTaskPhaseId(null); setNewTaskFields({ title: "", due_date: "", priority: "", assignee_user_id: "" }); }}
                            style={{ ...btnStyle, background: "#334155" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingTaskPhaseId(phase.id); setEditingTask(null); }}
                        style={{ ...btnStyle, background: "transparent", border: "1px dashed rgba(255,255,255,0.2)", color: "#9fb0d9", alignSelf: "start" }}
                      >
                        + Add Task
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {tab === "risks" && (
          <SectionCard title="Risks & Blockers">
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button onClick={openNewRisk} style={primaryBtnSm}>+ Add Risk</button>
            </div>
            {risks.length === 0 ? (
              <EmptyRow>No risks recorded</EmptyRow>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {risks.map((risk) => (
                  <div
                    key={risk.id}
                    style={{
                      background: "#182247",
                      borderRadius: 12,
                      padding: 14,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      alignItems: "start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#eef3ff", fontWeight: 700, marginBottom: 4 }}>{risk.title}</div>
                      {risk.description && (
                        <div style={{ color: "#b8c5e8", fontSize: 14, marginBottom: 6 }}>{risk.description}</div>
                      )}
                      <div style={{ color: "#9fb0d9", fontSize: 13 }}>
                        Severity: {risk.severity ?? "—"} • Owner: {userName(risk.owner_user_id)}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      <span style={riskStatusBadge(risk.status)}>
                        {risk.status ?? "open"}
                      </span>
                      <button onClick={() => openEditRisk(risk)} style={{ ...btnStyle, background: "#1e3a5f", fontSize: 12, padding: "4px 10px" }}>Edit</button>
                      <button onClick={() => handleDeleteRisk(risk.id)} style={{ ...btnStyle, background: "#7f1d1d", fontSize: 12, padding: "4px 10px" }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {tab === "milestones" && (
          <SectionCard title="Milestones">
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button onClick={openNewMilestone} style={primaryBtnSm}>+ Add Milestone</button>
            </div>
            {milestones.length === 0 ? (
              <EmptyRow>No milestones recorded</EmptyRow>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {milestones.map((ms) => (
                  <div
                    key={ms.id}
                    style={{
                      background: "#182247",
                      borderRadius: 12,
                      padding: 14,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      alignItems: "start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#eef3ff", fontWeight: 700, marginBottom: 4 }}>{ms.name}</div>
                      <div style={{ color: "#9fb0d9", fontSize: 13 }}>
                        Phase: {phases.find((p) => p.id === ms.phase_id)?.name ?? "—"} • Target: {ms.target_date ?? "—"} • Actual: {ms.actual_date ?? "—"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      <span style={milestoneStatusBadge(ms.status)}>
                        {ms.status?.replaceAll("_", " ") ?? "not started"}
                      </span>
                      <button onClick={() => openEditMilestone(ms)} style={{ ...btnStyle, background: "#1e3a5f", fontSize: 12, padding: "4px 10px" }}>Edit</button>
                      <button onClick={() => handleDeleteMilestone(ms.id)} style={{ ...btnStyle, background: "#7f1d1d", fontSize: 12, padding: "4px 10px" }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {tab === "documents" && (
          <ProjectDocuments
            projectId={project.id}
            documents={documents}
            phases={phases}
            tasks={tasks}
            onDocumentsChange={setDocuments}
          />
        )}

        {tab === "activity" && (
          <div style={{ display: "grid", gap: 16 }}>
            <SectionCard title="Add Note">
              <div style={{ display: "grid", gap: 14 }}>
                <FormField label="Visibility">
                  <select
                    value={newNoteVisibility}
                    onChange={(e) =>
                      setNewNoteVisibility(e.target.value as "internal" | "partner" | "public")
                    }
                    style={inputStyle}
                  >
                    <option value="internal">Internal</option>
                    <option value="partner">Partner</option>
                    <option value="public">Public</option>
                  </select>
                </FormField>

                <FormField label="Note">
                  <textarea
                    value={newNoteBody}
                    onChange={(e) => setNewNoteBody(e.target.value)}
                    rows={5}
                    style={{
                      ...inputStyle,
                      resize: "vertical",
                      minHeight: 120,
                      fontFamily: "inherit",
                    }}
                    placeholder="Add a project update..."
                  />
                </FormField>

                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={handleAddNote}
                    disabled={savingNote}
                    style={{
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "10px 16px",
                      fontWeight: 700,
                      cursor: savingNote ? "default" : "pointer",
                      opacity: savingNote ? 0.7 : 1,
                    }}
                  >
                    {savingNote ? "Saving..." : "Add Note"}
                  </button>

                  {noteMessage && (
                    <span style={{ color: "#b8c5e8", fontSize: 14 }}>{noteMessage}</span>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Notes & Activity">
              {notes.length === 0 ? (
                <EmptyRow>No notes recorded</EmptyRow>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        background: "#182247",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div style={{ color: "#eef3ff", marginBottom: 8 }}>{note.body}</div>
                      <div style={{ color: "#9fb0d9", fontSize: 13 }}>
                        Visibility: {note.visibility ?? "—"} • Author: {userName(note.author_user_id)} •{" "}
                        {note.created_at}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </div>
      {/* Risk Modal */}
      {showRiskModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowRiskModal(false); }}
        >
          <div style={{ background: "#121935", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 560 }}>
            <h2 style={{ margin: "0 0 20px" }}>{editingRisk ? "Edit Risk" : "Add Risk"}</h2>
            <form onSubmit={handleSaveRisk} style={{ display: "grid", gap: 14 }}>
              <FormField label="Title *">
                <input autoFocus required value={riskForm.title} onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })} style={inputStyle} />
              </FormField>
              <FormField label="Description">
                <textarea value={riskForm.description} onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
              </FormField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <FormField label="Severity">
                  <select value={riskForm.severity} onChange={(e) => setRiskForm({ ...riskForm, severity: e.target.value })} style={inputStyle}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </FormField>
                <FormField label="Status">
                  <select value={riskForm.status} onChange={(e) => setRiskForm({ ...riskForm, status: e.target.value })} style={inputStyle}>
                    <option value="open">Open</option>
                    <option value="mitigated">Mitigated</option>
                    <option value="closed">Closed</option>
                  </select>
                </FormField>
                <FormField label="Owner">
                  <select value={riskForm.owner_user_id} onChange={(e) => setRiskForm({ ...riskForm, owner_user_id: e.target.value })} style={inputStyle}>
                    <option value="">Unassigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                  </select>
                </FormField>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" disabled={savingRisk || !riskForm.title.trim()} style={{ ...btnStyle, background: "#2563eb", opacity: !riskForm.title.trim() ? 0.5 : 1 }}>
                  {savingRisk ? "Saving..." : editingRisk ? "Save Changes" : "Add Risk"}
                </button>
                <button type="button" onClick={() => setShowRiskModal(false)} style={{ ...btnStyle, background: "#334155" }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Milestone Modal */}
      {showMilestoneModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowMilestoneModal(false); }}
        >
          <div style={{ background: "#121935", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 520 }}>
            <h2 style={{ margin: "0 0 20px" }}>{editingMilestone ? "Edit Milestone" : "Add Milestone"}</h2>
            <form onSubmit={handleSaveMilestone} style={{ display: "grid", gap: 14 }}>
              <FormField label="Name *">
                <input autoFocus required value={milestoneForm.name} onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })} style={inputStyle} />
              </FormField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <FormField label="Phase">
                  <select value={milestoneForm.phase_id} onChange={(e) => setMilestoneForm({ ...milestoneForm, phase_id: e.target.value })} style={inputStyle}>
                    <option value="">No phase</option>
                    {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Status">
                  <select value={milestoneForm.status} onChange={(e) => setMilestoneForm({ ...milestoneForm, status: e.target.value })} style={inputStyle}>
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </FormField>
                <FormField label="Target Date">
                  <input type="date" value={milestoneForm.target_date} onChange={(e) => setMilestoneForm({ ...milestoneForm, target_date: e.target.value })} style={inputStyle} />
                </FormField>
                <FormField label="Actual Date">
                  <input type="date" value={milestoneForm.actual_date} onChange={(e) => setMilestoneForm({ ...milestoneForm, actual_date: e.target.value })} style={inputStyle} />
                </FormField>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" disabled={savingMilestone || !milestoneForm.name.trim()} style={{ ...btnStyle, background: "#2563eb", opacity: !milestoneForm.name.trim() ? 0.5 : 1 }}>
                  {savingMilestone ? "Saving..." : editingMilestone ? "Save Changes" : "Add Milestone"}
                </button>
                <button type="button" onClick={() => setShowMilestoneModal(false)} style={{ ...btnStyle, background: "#334155" }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "#2563eb" : "#182247",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        padding: "10px 14px",
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function InfoCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div
      style={{
        background: "#182247",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "#b8c5e8", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#f5f7fb" }}>{value ?? "—"}</div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#121935",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: "#eef3ff", marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function OverviewGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function OverviewItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div
      style={{
        background: "#182247",
        padding: 14,
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 12, color: "#9fb0d9", marginBottom: 6 }}>{label}</div>
      <div style={{ color: "#eef3ff", fontWeight: 600 }}>{value ?? "—"}</div>
    </div>
  );
}

function RowCard({
  title,
  subtitle,
  status,
}: {
  title: string;
  subtitle: string;
  status: string | null;
}) {
  return (
    <div
      style={{
        background: "#182247",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div>
        <div style={{ color: "#eef3ff", fontWeight: 700, marginBottom: 4 }}>{title}</div>
        <div style={{ color: "#9fb0d9", fontSize: 14 }}>{subtitle}</div>
      </div>

      <span
        style={{
          background: "#334155",
          color: "#fff",
          padding: "6px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          textTransform: "capitalize",
          whiteSpace: "nowrap",
        }}
      >
        {status?.replaceAll("_", " ") ?? "unknown"}
      </span>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#9fb0d9" }}>{children}</div>;
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
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
};

const btnStyle: React.CSSProperties = {
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "8px 14px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};

const primaryBtnSm: React.CSSProperties = {
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "8px 16px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

function riskStatusBadge(status: string | null): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    open:      { bg: "rgba(255,99,99,0.15)",    color: "#ff6363" },
    mitigated: { bg: "rgba(255,165,0,0.15)",    color: "#ffa500" },
    closed:    { bg: "rgba(67,209,122,0.15)",   color: "#43d17a" },
  };
  const c = map[status ?? "open"] ?? map.open;
  return { fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: c.bg, color: c.color, whiteSpace: "nowrap" };
}

function milestoneStatusBadge(status: string | null): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    not_started: { bg: "rgba(255,255,255,0.08)", color: "#9fb0d9" },
    in_progress: { bg: "rgba(99,179,237,0.15)",  color: "#63b3ed" },
    completed:   { bg: "rgba(67,209,122,0.15)",  color: "#43d17a" },
  };
  const c = map[status ?? "not_started"] ?? map.not_started;
  return { fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: c.bg, color: c.color, whiteSpace: "nowrap" };
}
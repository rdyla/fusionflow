import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  type Document,
  type DynamicsContact,
  type Milestone,
  type Note,
  type Phase,
  type Project,
  type ProjectContact,
  type ProjectStaffMember,
  type Risk,
  type Task,
  type TaskComment,
  type User,
} from "../lib/api";
import ProjectTimeline from "../components/timeline/ProjectTimeline";
import ProjectDocuments from "../components/documents/ProjectDocuments";
import ZoomTab from "../components/zoom/ZoomTab";
import { useToast } from "../components/ui/ToastProvider";

type DetailTab = "overview" | "timeline" | "tasks" | "risks" | "milestones" | "documents" | "activity" | "zoom";

const STATUS_COLOR: Record<string, string> = {
  completed: "#059669",
  in_progress: "#0891b2",
  not_started: "#94a3b8",
  blocked: "#d13438",
};
const RISK_COLOR: Record<string, string> = {
  open: "#d13438",
  mitigated: "#ff8c00",
  closed: "#059669",
};
const MILESTONE_COLOR: Record<string, string> = {
  not_started: "#94a3b8",
  in_progress: "#0891b2",
  completed: "#059669",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function taskCommentTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="ms-badge" style={{ background: color + "1a", color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const [project, setProject] = useState<Project | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [crmContacts, setCrmContacts] = useState<DynamicsContact[]>([]);
  const [crmContactsLoading, setCrmContactsLoading] = useState(false);
  const [contactModalTab, setContactModalTab] = useState<"crm" | "manual">("crm");
  const [contactRole, setContactRole] = useState("");
  const [manualContact, setManualContact] = useState({ name: "", email: "", phone: "", job_title: "" });
  const [savingContact, setSavingContact] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editHealth, setEditHealth] = useState("");
  const [editTargetGoLiveDate, setEditTargetGoLiveDate] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newNoteVisibility, setNewNoteVisibility] = useState<"internal" | "partner" | "public">("internal");
  const [savingNote, setSavingNote] = useState(false);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskCommentBody, setTaskCommentBody] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const attachFileRef = useRef<HTMLInputElement>(null);

  const [showRiskModal, setShowRiskModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [riskForm, setRiskForm] = useState({ title: "", description: "", severity: "medium", status: "open", owner_user_id: "" });
  const [savingRisk, setSavingRisk] = useState(false);

  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [milestoneForm, setMilestoneForm] = useState({ name: "", phase_id: "", target_date: "", actual_date: "", status: "not_started" });
  const [savingMilestone, setSavingMilestone] = useState(false);

  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [projectStaff, setProjectStaff] = useState<ProjectStaffMember[]>([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [addStaffUserId, setAddStaffUserId] = useState("");
  const [addStaffRole, setAddStaffRole] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const { showToast } = useToast();

  const groupedTasks = useMemo(
    () => phases.map((phase) => ({ phase, tasks: tasks.filter((t) => t.phase_id === phase.id) })),
    [phases, tasks]
  );
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  function userName(id: string | null) {
    if (!id) return "—";
    const u = userMap.get(id);
    return u ? (u.name ?? u.email) : id;
  }

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        const [projectData, phaseData, milestoneData, taskData, riskData, noteData, userData, docData, staffData, meData] =
          await Promise.all([
            api.project(id), api.phases(id), api.milestones(id), api.tasks(id),
            api.risks(id), api.notes(id), api.users(), api.documents(id),
            api.projectStaff(id),
            api.me(),
          ]);
        api.projectContacts(id).then(setContacts).catch(() => {});
        setProject(projectData);
        setEditStatus(projectData.status ?? "");
        setEditHealth(projectData.health ?? "");
        setEditTargetGoLiveDate(projectData.target_go_live_date ?? "");
        setProjectStaff(staffData);
        setPhases(phaseData);
        setMilestones(milestoneData);
        setTasks(taskData);
        setRisks(riskData);
        setNotes(noteData);
        setUsers(userData);
        setDocuments(docData);
        setCurrentUserRole(meData.role);
        setCurrentUserId(meData.user.id);

        const tabParam = searchParams.get("tab") as DetailTab | null;
        if (tabParam) setTab(tabParam);

        const taskIdParam = searchParams.get("taskId");
        if (taskIdParam && tabParam === "tasks") {
          const matched = taskData.find((t) => t.id === taskIdParam);
          if (matched) setEditingTask(matched);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load project");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Must be before early returns — hooks must always run in the same order
  useEffect(() => {
    if (!editingTask || !project) {
      setTaskComments([]);
      setTaskCommentBody("");
      return;
    }
    api.taskComments(project.id, editingTask.id).then(setTaskComments).catch(() => {});
  }, [editingTask?.id]);

  if (loading) return <div style={{ color: "rgba(240,246,255,0.5)", padding: 32 }}>Loading project...</div>;
  if (error) return <div style={{ color: "#d13438", padding: 32 }}>Error: {error}</div>;
  if (!project) return <div style={{ color: "rgba(240,246,255,0.5)", padding: 32 }}>Project not found.</div>;

  const canEdit = currentUserRole === "admin" || currentUserRole === "pm";

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSaveProject() {
    if (!project) return;
    setSavingProject(true);
    setSaveMessage(null);
    try {
      const updated = await api.updateProject(project.id, {
        status: editStatus || undefined,
        health: editHealth || undefined,
        target_go_live_date: editTargetGoLiveDate || undefined,
      });
      setProject(updated);
      setSaveMessage("Saved.");
      showToast("Project updated successfully.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update project";
      setSaveMessage(message);
      showToast(message, "error");
    } finally {
      setSavingProject(false);
    }
  }

  async function handleAddStaff() {
    if (!addStaffUserId || !addStaffRole || !project) return;
    setAddingStaff(true);
    try {
      const added = await api.addProjectStaff(project.id, { user_id: addStaffUserId, staff_role: addStaffRole });
      setProjectStaff((prev) => [...prev, added]);
      setAddStaffUserId("");
      setAddStaffRole("");
      setShowStaffModal(false);
      showToast("Staff member added.", "success");
    } catch {
      showToast("Failed to add staff member", "error");
    } finally {
      setAddingStaff(false);
    }
  }

  async function handleRemoveStaff(staffId: string) {
    if (!project) return;
    try {
      await api.removeProjectStaff(project.id, staffId);
      setProjectStaff((prev) => prev.filter((s) => s.id !== staffId));
      showToast("Staff member removed.", "success");
    } catch {
      showToast("Failed to remove staff member", "error");
    }
  }

  async function handleUpdateTask() {
    if (!project || !editingTask) return;
    setSavingTask(true);

    // New task (sentinel id = "")
    if (editingTask.id === "") {
      try {
        const created = await api.createTask(project.id, {
          title: editingTask.title.trim(),
          phase_id: editingTask.phase_id,
          due_date: editingTask.due_date || null,
          priority: (editingTask.priority as "low" | "medium" | "high") || null,
          assignee_user_id: editingTask.assignee_user_id || null,
          status: (editingTask.status as "not_started") ?? "not_started",
        });
        setTasks((prev) => [...prev, created]);
        setEditingTask(null);
        showToast("Task created.", "success");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to create task", "error");
      } finally {
        setSavingTask(false);
      }
      return;
    }

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

  async function handleAddTaskComment() {
    if (!project || !editingTask || !taskCommentBody.trim()) return;
    setAddingComment(true);
    try {
      const comment = await api.addTaskComment(project.id, editingTask.id, taskCommentBody.trim());
      setTaskComments((prev) => [...prev, comment]);
      setTaskCommentBody("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add comment", "error");
    } finally {
      setAddingComment(false);
    }
  }

  async function handleDeleteTaskComment(commentId: string) {
    if (!project || !editingTask) return;
    try {
      await api.deleteTaskComment(project.id, editingTask.id, commentId);
      setTaskComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete comment", "error");
    }
  }

  async function handleTaskAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!project || !editingTask) return;
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingAttachment(true);
    try {
      const doc = await api.uploadDocument(project.id, { file, category: "Other", task_id: editingTask.id });
      setDocuments((prev) => [doc, ...prev]);
      showToast("File attached.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleDeleteTaskAttachment(docId: string) {
    if (!project) return;
    try {
      await api.deleteDocument(project.id, docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  }

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
    if (!newNoteBody.trim()) { setNoteMessage("Please enter a note."); return; }
    setSavingNote(true);
    setNoteMessage(null);
    try {
      const created = await api.createNote(project.id, { body: newNoteBody.trim(), visibility: newNoteVisibility });
      setNotes((prev) => [created, ...prev]);
      setNewNoteBody("");
      setNewNoteVisibility("internal");
      showToast("Note added.", "success");
    } catch (err) {
      setNoteMessage(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSavingNote(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const HEALTH_COLOR: Record<string, string> = {
    on_track: "#107c10", at_risk: "#ff8c00", off_track: "#d13438", delayed: "#ff8c00",
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 16 }}>
        <Link to="/projects" style={{ color: "#00c8e0", textDecoration: "none", fontSize: 13, fontWeight: 500 }}>
          ← Projects
        </Link>
      </div>

      {/* Project header card */}
      <div className="ms-card" style={{ padding: "20px 24px", marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: "rgba(240,246,255,0.9)" }}>{project.name}</h1>
        <div style={{ fontSize: 14, color: "rgba(240,246,255,0.5)", marginBottom: 14 }}>
          {project.customer_name ?? "Unknown customer"}
        </div>

        {/* Vendor + solution type badges */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          {project.vendor && (
            <span className="ms-badge" style={{ background: "rgba(0,120,212,0.15)", color: "#4fc3f7", border: "1px solid rgba(0,120,212,0.35)", fontSize: 12, padding: "4px 12px" }}>
              {project.vendor}
            </span>
          )}
          {project.solution_type && (
            <span className="ms-badge" style={{ background: "rgba(135,100,184,0.15)", color: "#b39ddb", border: "1px solid rgba(135,100,184,0.35)", fontSize: 12, padding: "4px 12px" }}>
              {project.solution_type}
            </span>
          )}
        </div>

        {/* Summary info tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div className="ms-info-item">
            <div className="ms-info-label">Status</div>
            <div className="ms-info-value">
              {project.status ? (
                <Badge label={project.status.replace("_", " ")} color={STATUS_COLOR[project.status] ?? "#94a3b8"} />
              ) : "—"}
            </div>
          </div>
          <div className="ms-info-item">
            <div className="ms-info-label">Health</div>
            <div className="ms-info-value">
              {project.health ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: HEALTH_COLOR[project.health] ?? "#94a3b8" }} />
                  {project.health.replace("_", " ")}
                </span>
              ) : "—"}
            </div>
          </div>
          <div className="ms-info-item">
            <div className="ms-info-label">Kickoff Date</div>
            <div className="ms-info-value">{project.kickoff_date ? formatDate(project.kickoff_date) : "—"}</div>
          </div>
          <div className="ms-info-item">
            <div className="ms-info-label">Target Go-Live</div>
            <div className="ms-info-value">{project.target_go_live_date ? formatDate(project.target_go_live_date) : "—"}</div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="ms-tabs">
        {(["overview", "timeline", "tasks", "risks", "milestones", "documents", "activity", "zoom"] as DetailTab[]).map((t) => (
          <button
            key={t}
            className={`ms-tab-btn${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Overview ──────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div style={{ display: "grid", gap: 16 }}>
          {/* ── Project Team ──────────────────────────────────────────────── */}
          <div className="ms-section-card">
            <div className="ms-section-title">PF Team</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginBottom: 14 }}>
              {/* Primary PM */}
              {project.pm_user_id && (() => {
                const pm = userMap.get(project.pm_user_id);
                if (!pm) return null;
                const abbr = pm.name ? pm.name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase() : pm.email.slice(0, 2).toUpperCase();
                return (
                  <div key="pm" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, rgba(0,120,212,0.3), rgba(0,200,224,0.2))", border: "1px solid rgba(0,200,224,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#00c8e0" }}>{abbr}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(240,246,255,0.35)", marginBottom: 2 }}>Project Manager</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(240,246,255,0.9)" }}>{pm.name ?? pm.email}</div>
                      <a href={`mailto:${pm.email}`} style={{ fontSize: 12, color: "#00c8e0", textDecoration: "none" }}>{pm.email}</a>
                    </div>
                  </div>
                );
              })()}
              {/* Additional staff */}
              {projectStaff.map((s) => {
                const abbr = s.name ? s.name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase() : s.email.slice(0, 2).toUpperCase();
                const roleLabel: Record<string, string> = { ae: "Account Executive", sa: "Solution Architect", csm: "Client Success Manager", engineer: "Implementation Engineer" };
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", position: "relative" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, rgba(0,120,212,0.3), rgba(0,200,224,0.2))", border: "1px solid rgba(0,200,224,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#00c8e0" }}>{abbr}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(240,246,255,0.35)", marginBottom: 2 }}>{roleLabel[s.staff_role] ?? s.staff_role}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(240,246,255,0.9)" }}>{s.name ?? s.email}</div>
                      <a href={`mailto:${s.email}`} style={{ fontSize: 12, color: "#00c8e0", textDecoration: "none" }}>{s.email}</a>
                    </div>
                    {canEdit && (
                      <button onClick={() => handleRemoveStaff(s.id)} style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "rgba(209,52,56,0.6)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "2px 4px" }} title="Remove">✕</button>
                    )}
                  </div>
                );
              })}
              {projectStaff.length === 0 && !project.pm_user_id && (
                <div style={{ color: "rgba(240,246,255,0.3)", fontSize: 13, fontStyle: "italic", gridColumn: "1 / -1" }}>No staff assigned.</div>
              )}
            </div>
            {canEdit && (
              <div style={{ paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <button className="ms-btn-secondary" onClick={() => { setShowStaffModal(true); setAddStaffUserId(""); setAddStaffRole(""); }}>
                  + Add Staff Member
                </button>
              </div>
            )}
          </div>

          {canEdit && <div className="ms-section-card">
            <div className="ms-section-title">Project Controls</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              <label className="ms-label">
                <span>Status</span>
                <select className="ms-input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="">Select status</option>
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="complete">Complete</option>
                </select>
              </label>
              <label className="ms-label">
                <span>Health</span>
                <select className="ms-input" value={editHealth} onChange={(e) => setEditHealth(e.target.value)}>
                  <option value="">Select health</option>
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="delayed">Delayed</option>
                </select>
              </label>
              <label className="ms-label">
                <span>Target Go-Live</span>
                <input type="date" className="ms-input" value={editTargetGoLiveDate ?? ""} onChange={(e) => setEditTargetGoLiveDate(e.target.value)} />
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
              <button className="ms-btn-primary" onClick={handleSaveProject} disabled={savingProject}>
                {savingProject ? "Saving..." : "Save Changes"}
              </button>
              {saveMessage && <span style={{ fontSize: 13, color: "rgba(240,246,255,0.5)" }}>{saveMessage}</span>}
            </div>
          </div>}

          {/* ── Customer Contacts ─────────────────────────────────────────── */}
          <div className="ms-section-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>Customer Contacts</div>
              {canEdit && (
                <button
                  className="ms-btn-secondary"
                  onClick={() => {
                    setShowContactModal(true);
                    setContactModalTab(project.dynamics_account_id ? "crm" : "manual");
                    setContactRole("");
                    setManualContact({ name: "", email: "", phone: "", job_title: "" });
                    if (project.dynamics_account_id && crmContacts.length === 0) {
                      setCrmContactsLoading(true);
                      api.getDynamicsContacts(project.dynamics_account_id)
                        .then(setCrmContacts)
                        .catch(() => {})
                        .finally(() => setCrmContactsLoading(false));
                    }
                  }}
                >
                  + Add Contact
                </button>
              )}
            </div>

            {contacts.length === 0 ? (
              <div style={{ fontSize: 13, color: "rgba(240,246,255,0.35)", fontStyle: "italic" }}>
                No customer contacts added yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {contacts.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(0,200,224,0.12)", border: "1px solid rgba(0,200,224,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 15, fontWeight: 700, color: "#00c8e0" }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(240,246,255,0.9)" }}>{c.name}</span>
                        {c.contact_role && (
                          <span className="ms-badge" style={{ background: "rgba(0,200,224,0.1)", color: "#00c8e0", border: "1px solid rgba(0,200,224,0.2)", fontSize: 11 }}>
                            {c.contact_role}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(240,246,255,0.4)", marginTop: 3 }}>
                        {[c.job_title, c.email, c.phone].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        className="ms-btn-ghost"
                        style={{ fontSize: 12, color: "#d13438", borderColor: "rgba(209,52,56,0.3)", flexShrink: 0 }}
                        onClick={async () => {
                          await api.removeProjectContact(project.id, c.id);
                          setContacts((prev) => prev.filter((x) => x.id !== c.id));
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ms-section-card">
            <div className="ms-section-title">Quick Counts</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
              {[["Phases", phases.length], ["Milestones", milestones.length], ["Tasks", tasks.length], ["Risks", risks.length], ["Notes", notes.length]].map(
                ([label, value]) => (
                  <div key={label as string} className="ms-info-item" style={{ textAlign: "center" }}>
                    <div className="ms-info-label">{label}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#00c8e0", lineHeight: 1.2 }}>{value}</div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Timeline ──────────────────────────────────────────────────────── */}
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

      {/* ── Tasks ─────────────────────────────────────────────────────────── */}
      {tab === "tasks" && (
        <div className="ms-section-card">
          <div className="ms-section-title">Tasks by Phase</div>
          <div style={{ display: "grid", gap: 24 }}>
            {groupedTasks.map(({ phase, tasks: phaseTasks }) => (
              <div key={phase.id}>
                <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(240,246,255,0.9)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {phase.name}
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {phaseTasks.length === 0 && (
                    <div style={{ color: "#a19f9d", fontSize: 13, padding: "8px 0" }}>No tasks</div>
                  )}

                  {phaseTasks.map((task) => (
                    <div
                      key={task.id}
                      className="ms-row-item"
                      onClick={() => setEditingTask(task)}
                      style={{ cursor: "pointer" }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: "rgba(240,246,255,0.9)", marginBottom: 3 }}>{task.title}</div>
                        <div style={{ fontSize: 12, color: "rgba(240,246,255,0.5)" }}>
                          Due: {task.due_date ? formatDate(task.due_date) : "—"} · Assignee: {userName(task.assignee_user_id)} · Priority: {task.priority ?? "—"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        <Badge label={task.status?.replaceAll("_", " ") ?? "unknown"} color={STATUS_COLOR[task.status ?? ""] ?? "#94a3b8"} />
                      </div>
                    </div>
                  ))}

                  {canEdit && (
                    <button
                      className="ms-btn-ghost"
                      onClick={() => setEditingTask({ id: "", project_id: project.id, phase_id: phase.id, title: "", assignee_user_id: null, due_date: null, completed_at: null, status: "not_started", priority: null })}
                      style={{ alignSelf: "start", border: "1px dashed rgba(255,255,255,0.2)", color: "rgba(240,246,255,0.5)" }}
                    >
                      + Add Task
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Risks ─────────────────────────────────────────────────────────── */}
      {tab === "risks" && (
        <div className="ms-section-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>Risks & Blockers</div>
            {canEdit && <button className="ms-btn-primary" onClick={openNewRisk}>+ Add Risk</button>}
          </div>
          {risks.length === 0 ? (
            <div style={{ color: "#a19f9d", fontSize: 14, padding: "8px 0" }}>No risks recorded.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {risks.map((risk) => (
                <div key={risk.id} className="ms-row-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "rgba(240,246,255,0.9)", marginBottom: 4 }}>{risk.title}</div>
                    {risk.description && <div style={{ color: "rgba(240,246,255,0.5)", fontSize: 13, marginBottom: 4 }}>{risk.description}</div>}
                    <div style={{ fontSize: 12, color: "rgba(240,246,255,0.5)" }}>Severity: {risk.severity ?? "—"} · Owner: {userName(risk.owner_user_id)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <Badge label={risk.status ?? "open"} color={RISK_COLOR[risk.status ?? "open"] ?? "#94a3b8"} />
                    {canEdit && <button className="ms-btn-ghost" onClick={() => openEditRisk(risk)}>Edit</button>}
                    {canEdit && <button className="ms-btn-danger" onClick={() => handleDeleteRisk(risk.id)}>Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Milestones ────────────────────────────────────────────────────── */}
      {tab === "milestones" && (
        <div className="ms-section-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>Milestones</div>
            {canEdit && <button className="ms-btn-primary" onClick={openNewMilestone}>+ Add Milestone</button>}
          </div>
          {milestones.length === 0 ? (
            <div style={{ color: "#a19f9d", fontSize: 14, padding: "8px 0" }}>No milestones recorded.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {milestones.map((ms) => (
                <div key={ms.id} className="ms-row-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "rgba(240,246,255,0.9)", marginBottom: 4 }}>{ms.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(240,246,255,0.5)" }}>
                      Phase: {phases.find((p) => p.id === ms.phase_id)?.name ?? "—"} · Target: {ms.target_date ? formatDate(ms.target_date) : "—"} · Actual: {ms.actual_date ? formatDate(ms.actual_date) : "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <Badge label={ms.status?.replaceAll("_", " ") ?? "not started"} color={MILESTONE_COLOR[ms.status ?? "not_started"] ?? "#94a3b8"} />
                    {canEdit && <button className="ms-btn-ghost" onClick={() => openEditMilestone(ms)}>Edit</button>}
                    {canEdit && <button className="ms-btn-danger" onClick={() => handleDeleteMilestone(ms.id)}>Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Documents ─────────────────────────────────────────────────────── */}
      {tab === "documents" && (
        <ProjectDocuments
          projectId={project.id}
          documents={documents}
          phases={phases}
          tasks={tasks}
          onDocumentsChange={setDocuments}
        />
      )}

      {/* ── Activity ──────────────────────────────────────────────────────── */}
      {tab === "activity" && (
        <div style={{ display: "grid", gap: 16 }}>
          {canEdit && <div className="ms-section-card">
            <div className="ms-section-title">Add Note</div>
            <div style={{ display: "grid", gap: 12 }}>
              <label className="ms-label">
                <span>Visibility</span>
                <select className="ms-input" value={newNoteVisibility} onChange={(e) => setNewNoteVisibility(e.target.value as "internal" | "partner" | "public")}>
                  <option value="internal">Internal</option>
                  <option value="partner">Partner</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label className="ms-label">
                <span>Note</span>
                <textarea
                  className="ms-input"
                  value={newNoteBody}
                  onChange={(e) => setNewNoteBody(e.target.value)}
                  rows={5}
                  style={{ resize: "vertical", minHeight: 110 }}
                  placeholder="Add a project update..."
                />
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button className="ms-btn-primary" onClick={handleAddNote} disabled={savingNote}>
                  {savingNote ? "Saving..." : "Add Note"}
                </button>
                {noteMessage && <span style={{ fontSize: 13, color: "rgba(240,246,255,0.5)" }}>{noteMessage}</span>}
              </div>
            </div>
          </div>}

          <div className="ms-section-card">
            <div className="ms-section-title">Notes & Activity</div>
            {notes.length === 0 ? (
              <div style={{ color: "#a19f9d", fontSize: 14 }}>No notes recorded.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {notes.map((note) => (
                  <div key={note.id} style={{ padding: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 2 }}>
                    <div style={{ color: "rgba(240,246,255,0.9)", marginBottom: 8, fontSize: 14 }}>{note.body}</div>
                    <div style={{ fontSize: 12, color: "rgba(240,246,255,0.5)" }}>
                      Visibility: {note.visibility ?? "—"} · Author: {userName(note.author_user_id)} · {note.created_at}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Zoom ──────────────────────────────────────────────────────────── */}
      {tab === "zoom" && <ZoomTab projectId={project.id} />}

      {/* ── Risk Modal ────────────────────────────────────────────────────── */}
      {showRiskModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowRiskModal(false); }}>
          <div className="ms-modal">
            <h2>{editingRisk ? "Edit Risk" : "Add Risk"}</h2>
            <form onSubmit={handleSaveRisk} style={{ display: "grid", gap: 14 }}>
              <label className="ms-label">
                <span>Title *</span>
                <input autoFocus required className="ms-input" value={riskForm.title} onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })} />
              </label>
              <label className="ms-label">
                <span>Description</span>
                <textarea className="ms-input" value={riskForm.description} onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })} rows={3} style={{ resize: "vertical" }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label className="ms-label">
                  <span>Severity</span>
                  <select className="ms-input" value={riskForm.severity} onChange={(e) => setRiskForm({ ...riskForm, severity: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label className="ms-label">
                  <span>Status</span>
                  <select className="ms-input" value={riskForm.status} onChange={(e) => setRiskForm({ ...riskForm, status: e.target.value })}>
                    <option value="open">Open</option>
                    <option value="mitigated">Mitigated</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <label className="ms-label">
                  <span>Owner</span>
                  <select className="ms-input" value={riskForm.owner_user_id} onChange={(e) => setRiskForm({ ...riskForm, owner_user_id: e.target.value })}>
                    <option value="">Unassigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={savingRisk || !riskForm.title.trim()}>
                  {savingRisk ? "Saving..." : editingRisk ? "Save Changes" : "Add Risk"}
                </button>
                <button type="button" className="ms-btn-secondary" onClick={() => setShowRiskModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Milestone Modal ───────────────────────────────────────────────── */}
      {showMilestoneModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowMilestoneModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 500 }}>
            <h2>{editingMilestone ? "Edit Milestone" : "Add Milestone"}</h2>
            <form onSubmit={handleSaveMilestone} style={{ display: "grid", gap: 14 }}>
              <label className="ms-label">
                <span>Name *</span>
                <input autoFocus required className="ms-input" value={milestoneForm.name} onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="ms-label">
                  <span>Phase</span>
                  <select className="ms-input" value={milestoneForm.phase_id} onChange={(e) => setMilestoneForm({ ...milestoneForm, phase_id: e.target.value })}>
                    <option value="">No phase</option>
                    {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="ms-label">
                  <span>Status</span>
                  <select className="ms-input" value={milestoneForm.status} onChange={(e) => setMilestoneForm({ ...milestoneForm, status: e.target.value })}>
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>
                <label className="ms-label">
                  <span>Target Date</span>
                  <input type="date" className="ms-input" value={milestoneForm.target_date} onChange={(e) => setMilestoneForm({ ...milestoneForm, target_date: e.target.value })} />
                </label>
                <label className="ms-label">
                  <span>Actual Date</span>
                  <input type="date" className="ms-input" value={milestoneForm.actual_date} onChange={(e) => setMilestoneForm({ ...milestoneForm, actual_date: e.target.value })} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={savingMilestone || !milestoneForm.name.trim()}>
                  {savingMilestone ? "Saving..." : editingMilestone ? "Save Changes" : "Add Milestone"}
                </button>
                <button type="button" className="ms-btn-secondary" onClick={() => setShowMilestoneModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Task Modal ─────────────────────────────────────────────────────── */}
      {editingTask && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingTask(null); }}>
          <div className="ms-modal" style={{ maxWidth: 660, display: "flex", flexDirection: "column", maxHeight: "85vh" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f0f6ff" }}>{editingTask.id === "" ? "New Task" : "Task Details"}</h2>
              <button onClick={() => setEditingTask(null)} style={{ background: "none", border: "none", color: "rgba(240,246,255,0.5)", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>

            {/* Body */}
            <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "grid", gap: 16 }}>

              {/* Title */}
              <label className="ms-label">
                <span>Title</span>
                <input className="ms-input" value={editingTask.title} onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })} disabled={!canEdit} />
              </label>

              {/* Status + Priority */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="ms-label">
                  <span>Status</span>
                  <select className="ms-input" value={editingTask.status ?? ""} onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value })} disabled={!canEdit}>
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </label>
                <label className="ms-label">
                  <span>Priority</span>
                  <select className="ms-input" value={editingTask.priority ?? ""} onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value || null })} disabled={!canEdit}>
                    <option value="">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>

              {/* Due Date + Assignee */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="ms-label">
                  <span>Due Date</span>
                  <input type="date" className="ms-input" value={editingTask.due_date ?? ""} onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value || null })} disabled={!canEdit} />
                </label>
                <label className="ms-label">
                  <span>Assignee</span>
                  <select className="ms-input" value={editingTask.assignee_user_id ?? ""} onChange={(e) => setEditingTask({ ...editingTask, assignee_user_id: e.target.value || null })} disabled={!canEdit}>
                    <option value="">Unassigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                  </select>
                </label>
              </div>

              {/* Phase */}
              {canEdit && (
                <label className="ms-label">
                  <span>Phase</span>
                  <select className="ms-input" value={editingTask.phase_id ?? ""} onChange={(e) => setEditingTask({ ...editingTask, phase_id: e.target.value || null })}>
                    <option value="">No phase</option>
                    {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}

              {/* Comments + Attachments only shown for existing tasks */}
              {editingTask.id !== "" && <>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(240,246,255,0.35)", marginBottom: 10 }}>
                  Comments {taskComments.length > 0 && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({taskComments.length})</span>}
                </div>

                {taskComments.length === 0 && (
                  <div style={{ fontSize: 13, color: "rgba(240,246,255,0.3)", fontStyle: "italic", marginBottom: 10 }}>No comments yet.</div>
                )}

                {taskComments.map((c) => {
                  const canDeleteComment = c.author_user_id === currentUserId || canEdit;
                  const authorLabel = c.author_name ?? c.author_email ?? "Unknown";
                  const ago = taskCommentTimeAgo(c.created_at);
                  return (
                    <div key={c.id} style={{ marginBottom: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#00c8e0" }}>{authorLabel}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "rgba(240,246,255,0.3)" }}>{ago}</span>
                          {canDeleteComment && (
                            <button
                              onClick={() => handleDeleteTaskComment(c.id)}
                              style={{ background: "none", border: "none", color: "rgba(209,52,56,0.6)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                              title="Delete comment"
                            >×</button>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: "rgba(240,246,255,0.8)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.body}</div>
                    </div>
                  );
                })}

                <textarea
                  className="ms-input"
                  rows={2}
                  placeholder="Add a comment..."
                  value={taskCommentBody}
                  onChange={(e) => setTaskCommentBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddTaskComment(); }}
                  style={{ resize: "vertical", minHeight: 56 }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <button
                    className="ms-btn-primary"
                    onClick={handleAddTaskComment}
                    disabled={addingComment || !taskCommentBody.trim()}
                    style={{ fontSize: 12, padding: "5px 14px" }}
                  >
                    {addingComment ? "Posting..." : "Add Comment"}
                  </button>
                </div>
              </div>

              {/* Attachments */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(240,246,255,0.35)", marginBottom: 10 }}>
                  Attachments
                </div>

                {documents.filter((d) => d.task_id === editingTask.id).length === 0 && (
                  <div style={{ fontSize: 13, color: "rgba(240,246,255,0.3)", fontStyle: "italic", marginBottom: 10 }}>No attachments yet.</div>
                )}

                {documents.filter((d) => d.task_id === editingTask.id).map((doc) => (
                  <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 6 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>📎</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "rgba(240,246,255,0.85)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.name}</div>
                      <div style={{ fontSize: 11, color: "rgba(240,246,255,0.3)", marginTop: 1 }}>
                        {doc.uploader_name ?? "—"} · {doc.size_bytes ? fmtBytes(doc.size_bytes) : ""}
                      </div>
                    </div>
                    <a
                      href={api.downloadDocumentUrl(project!.id, doc.id)}
                      download
                      style={{ fontSize: 12, color: "#00c8e0", textDecoration: "none", flexShrink: 0 }}
                      title="Download"
                    >↓</a>
                    {canEdit && (
                      <button
                        onClick={() => handleDeleteTaskAttachment(doc.id)}
                        style={{ background: "none", border: "none", color: "rgba(209,52,56,0.6)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
                        title="Remove attachment"
                      >×</button>
                    )}
                  </div>
                ))}

                <input ref={attachFileRef} type="file" style={{ display: "none" }} onChange={handleTaskAttachmentUpload} />
                <button
                  className="ms-btn-secondary"
                  onClick={() => attachFileRef.current?.click()}
                  disabled={uploadingAttachment}
                  style={{ fontSize: 12, padding: "5px 14px" }}
                >
                  {uploadingAttachment ? "Uploading..." : "+ Attach File"}
                </button>
              </div>
              </>}

            </div>

            {/* Footer */}
            {canEdit && (
              <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
                <button className="ms-btn-primary" onClick={handleUpdateTask} disabled={savingTask || !editingTask.title.trim()}>
                  {savingTask ? "Saving..." : editingTask.id === "" ? "Create Task" : "Save"}
                </button>
                <button className="ms-btn-secondary" onClick={() => setEditingTask(null)}>Cancel</button>
                {editingTask.id !== "" && (
                  <button className="ms-btn-danger" onClick={() => handleDeleteTask(editingTask.id)} style={{ marginLeft: "auto" }}>Delete</button>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Add Staff Modal ──────────────────────────────────────────────── */}
      {showStaffModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowStaffModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 480, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f0f6ff" }}>Add Staff Member</h2>
              <button onClick={() => setShowStaffModal(false)} style={{ background: "none", border: "none", color: "rgba(240,246,255,0.5)", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
              <label className="ms-label">
                <span>Role on Project</span>
                <select className="ms-input" value={addStaffRole} onChange={(e) => setAddStaffRole(e.target.value)}>
                  <option value="">— Select role —</option>
                  <option value="ae">Account Executive</option>
                  <option value="sa">Solution Architect</option>
                  <option value="csm">Client Success Manager</option>
                  <option value="engineer">Implementation Engineer</option>
                </select>
              </label>
              <label className="ms-label">
                <span>Team Member</span>
                <select className="ms-input" value={addStaffUserId} onChange={(e) => setAddStaffUserId(e.target.value)}>
                  <option value="">— Select team member —</option>
                  {users.filter((u) => u.role !== "partner_ae").map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
              <button className="ms-btn-primary" disabled={!addStaffUserId || !addStaffRole || addingStaff} onClick={handleAddStaff}>
                {addingStaff ? "Adding…" : "Add Staff Member"}
              </button>
              <button className="ms-btn-secondary" onClick={() => setShowStaffModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Contact Modal ──────────────────────────────────────────────── */}
      {showContactModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowContactModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 580, display: "flex", flexDirection: "column", maxHeight: "85vh" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f0f6ff" }}>Add Customer Contact</h2>
              <button onClick={() => setShowContactModal(false)} style={{ background: "none", border: "none", color: "rgba(240,246,255,0.5)", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>

            {/* Role selector — always shown */}
            <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
              <label className="ms-label">
                <span>Role on Project</span>
                <select className="ms-input" value={contactRole} onChange={(e) => setContactRole(e.target.value)}>
                  <option value="">— Select role —</option>
                  <option>Customer Project Manager</option>
                  <option>Technical Contact</option>
                  <option>Executive Sponsor</option>
                  <option>Billing Contact</option>
                  <option>End User Champion</option>
                  <option>Other</option>
                </select>
              </label>
            </div>

            {/* Tab toggle — only if CRM account is linked */}
            {project.dynamics_account_id && (
              <div style={{ display: "flex", gap: 0, padding: "12px 24px 0", flexShrink: 0 }}>
                {(["crm", "manual"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setContactModalTab(t)}
                    style={{
                      flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 600, cursor: "pointer",
                      background: "none", border: "none",
                      borderBottom: `2px solid ${contactModalTab === t ? "#00c8e0" : "transparent"}`,
                      color: contactModalTab === t ? "#00c8e0" : "rgba(240,246,255,0.35)",
                      marginBottom: -1,
                    }}
                  >
                    {t === "crm" ? "From CRM" : "Enter Manually"}
                  </button>
                ))}
              </div>
            )}

            {/* Body */}
            <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>

              {/* CRM tab */}
              {contactModalTab === "crm" && (
                <div>
                  {crmContactsLoading ? (
                    <div style={{ color: "rgba(240,246,255,0.4)", fontSize: 13, padding: "20px 0" }}>Loading CRM contacts…</div>
                  ) : crmContacts.length === 0 ? (
                    <div style={{ color: "rgba(240,246,255,0.35)", fontSize: 13, fontStyle: "italic", padding: "20px 0" }}>No contacts found in CRM for this account.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {crmContacts
                        .filter((c) => !contacts.some((p) => p.dynamics_contact_id === c.contactid))
                        .map((c) => {
                          const fullName = [c.firstname, c.lastname].filter(Boolean).join(" ");
                          return (
                            <div key={c.contactid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6 }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(240,246,255,0.85)" }}>{fullName || "—"}</div>
                                <div style={{ fontSize: 12, color: "rgba(240,246,255,0.4)", marginTop: 2 }}>
                                  {[c.jobtitle, c.emailaddress1, c.telephone1].filter(Boolean).join(" · ")}
                                </div>
                              </div>
                              <button
                                className="ms-btn-secondary"
                                style={{ fontSize: 12, flexShrink: 0 }}
                                disabled={savingContact || !contactRole}
                                title={!contactRole ? "Select a role first" : ""}
                                onClick={async () => {
                                  setSavingContact(true);
                                  try {
                                    const added = await api.addProjectContact(project.id, {
                                      dynamics_contact_id: c.contactid,
                                      name: fullName || "Unknown",
                                      email: c.emailaddress1,
                                      phone: c.telephone1,
                                      job_title: c.jobtitle,
                                      contact_role: contactRole || null,
                                    });
                                    setContacts((prev) => [...prev, added]);
                                    setContactRole("");
                                  } catch {
                                    showToast("Failed to add contact", "error");
                                  } finally {
                                    setSavingContact(false);
                                  }
                                }}
                              >
                                + Add
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* Manual tab */}
              {(!project.dynamics_account_id || contactModalTab === "manual") && (
                <div style={{ display: "grid", gap: 14 }}>
                  <label className="ms-label">
                    <span>Name *</span>
                    <input className="ms-input" placeholder="Full name" value={manualContact.name} onChange={(e) => setManualContact((m) => ({ ...m, name: e.target.value }))} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label className="ms-label">
                      <span>Email</span>
                      <input className="ms-input" type="email" placeholder="email@company.com" value={manualContact.email} onChange={(e) => setManualContact((m) => ({ ...m, email: e.target.value }))} />
                    </label>
                    <label className="ms-label">
                      <span>Phone</span>
                      <input className="ms-input" placeholder="(555) 555-5555" value={manualContact.phone} onChange={(e) => setManualContact((m) => ({ ...m, phone: e.target.value }))} />
                    </label>
                  </div>
                  <label className="ms-label">
                    <span>Job Title</span>
                    <input className="ms-input" placeholder="e.g. IT Director" value={manualContact.job_title} onChange={(e) => setManualContact((m) => ({ ...m, job_title: e.target.value }))} />
                  </label>
                </div>
              )}
            </div>

            {/* Footer — manual only */}
            {(!project.dynamics_account_id || contactModalTab === "manual") && (
              <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
                <button
                  className="ms-btn-primary"
                  disabled={savingContact || !manualContact.name.trim() || !contactRole}
                  onClick={async () => {
                    setSavingContact(true);
                    try {
                      const added = await api.addProjectContact(project.id, {
                        name: manualContact.name.trim(),
                        email: manualContact.email || null,
                        phone: manualContact.phone || null,
                        job_title: manualContact.job_title || null,
                        contact_role: contactRole || null,
                      });
                      setContacts((prev) => [...prev, added]);
                      setManualContact({ name: "", email: "", phone: "", job_title: "" });
                      setContactRole("");
                    } catch {
                      showToast("Failed to add contact", "error");
                    } finally {
                      setSavingContact(false);
                    }
                  }}
                >
                  {savingContact ? "Adding…" : "Add Contact"}
                </button>
                <button className="ms-btn-secondary" onClick={() => setShowContactModal(false)}>Cancel</button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}

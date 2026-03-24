import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  type AsanaProjectSummary,
  type AsanaSectionSummary,
  type AsanaWorkspace,
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
import RingCentralTab from "../components/ringcentral/RingCentralTab";
import AsanaProjectView from "../components/asana/AsanaProjectView";
import SharePointDocs from "../components/sharepoint/SharePointDocs";
import { useToast } from "../components/ui/ToastProvider";

type DetailTab = "overview" | "timeline" | "tasks" | "risks" | "milestones" | "documents" | "sharepoint" | "activity" | "zoom" | "asana";

function detectPlatform(vendor: string | null | undefined): "zoom" | "ringcentral" | null {
  const v = vendor?.toLowerCase() ?? "";
  if (v.includes("zoom")) return "zoom";
  if (v.includes("ring") || v.includes("rc")) return "ringcentral";
  return null;
}

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
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [addPartnerUserId, setAddPartnerUserId] = useState("");
  const [addingPartner, setAddingPartner] = useState(false);

  // Asana section summaries (loaded for managed_in_asana projects)
  const [asanaSectionSummaries, setAsanaSectionSummaries] = useState<AsanaSectionSummary[]>([]);

  // Asana link modal
  const [showAsanaModal, setShowAsanaModal] = useState(false);
  const [asanaConnected, setAsanaConnected] = useState<boolean | null>(null);
  const [asanaWorkspaces, setAsanaWorkspaces] = useState<AsanaWorkspace[]>([]);
  const [asanaSelectedWorkspace, setAsanaSelectedWorkspace] = useState("");
  const [asanaProjects, setAsanaProjects] = useState<AsanaProjectSummary[]>([]);
  const [asanaLoadingProjects, setAsanaLoadingProjects] = useState(false);
  const [asanaLinking, setAsanaLinking] = useState(false);
  const [addStaffUserId, setAddStaffUserId] = useState("");
  const [addStaffRole, setAddStaffRole] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const [crmSyncing, setCrmSyncing] = useState(false);
  const [staffPhotoMap, setStaffPhotoMap] = useState<Record<string, string | null>>({});

  // Apply template
  const [templateList, setTemplateList] = useState<{ id: string; name: string; phase_count?: number; task_count?: number }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [applyResult, setApplyResult] = useState<{ phases_created: number; tasks_created: number } | null>(null);

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
        if (projectData.managed_in_asana) {
          api.asanaSectionSummary(id).then(setAsanaSectionSummaries).catch(() => {});
        }
        setProjectStaff(staffData);
        if (staffData.length > 0) {
          const emails = staffData.map((s: { email: string }) => s.email);
          api.staffPhotos(emails).then(setStaffPhotoMap).catch(() => {});
        }
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

  // Load template list for apply-template panel (admin/pm only — if it fails we just hide the section)
  useEffect(() => {
    api.adminTemplates().then(setTemplateList).catch(() => {});
  }, []);

  // Must be before early returns — hooks must always run in the same order
  useEffect(() => {
    if (!editingTask || !project) {
      setTaskComments([]);
      setTaskCommentBody("");
      return;
    }
    api.taskComments(project.id, editingTask.id).then(setTaskComments).catch(() => {});
  }, [editingTask?.id]);

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading project...</div>;
  if (error) return <div style={{ color: "#d13438", padding: 32 }}>Error: {error}</div>;
  if (!project) return <div style={{ color: "#64748b", padding: 32 }}>Project not found.</div>;

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

  async function handleClearHealthOverride() {
    if (!project) return;
    setSavingProject(true);
    setSaveMessage(null);
    try {
      const updated = await api.updateProject(project.id, { clear_health_override: true });
      setProject(updated);
      setEditHealth(updated.health ?? "");
      setSaveMessage("Health reset to auto.");
      showToast("Health reset to auto-computed.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset health";
      showToast(message, "error");
    } finally {
      setSavingProject(false);
    }
  }

  async function handleApplyTemplate() {
    if (!project || !selectedTemplateId) return;
    setApplyingTemplate(true);
    try {
      const result = await api.applyTemplate(project.id, selectedTemplateId);
      setApplyResult(result);
      setShowApplyConfirm(false);
      // Reload phases and tasks
      const [newPhases, newTasks] = await Promise.all([api.phases(project.id), api.tasks(project.id)]);
      setPhases(newPhases);
      setTasks(newTasks);
      showToast(`Template applied: ${result.phases_created} new phase${result.phases_created !== 1 ? "s" : ""} created, ${result.tasks_created} tasks added.`, "success");
      setSelectedTemplateId("");
    } catch {
      showToast("Failed to apply template", "error");
    } finally {
      setApplyingTemplate(false);
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

  async function handleCrmSync() {
    if (!project) return;
    setCrmSyncing(true);
    try {
      const { staff, crm } = await api.projectCrmSync(project.id);
      setProjectStaff(staff);
      const matched = [
        crm.ae_name  ? `AE: ${crm.ae_name}`  : null,
        crm.sa_name  ? `SA: ${crm.sa_name}`  : null,
        crm.csm_name ? `CSM: ${crm.csm_name}` : null,
      ].filter(Boolean);
      showToast(matched.length ? `Synced from CRM — ${matched.join(", ")}` : "Synced from CRM (no team found)", "success");
    } catch {
      showToast("CRM sync failed", "error");
    } finally {
      setCrmSyncing(false);
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

  async function handleAddPartner() {
    if (!addPartnerUserId || !project) return;
    setAddingPartner(true);
    try {
      const added = await api.addProjectStaff(project.id, { user_id: addPartnerUserId, staff_role: "partner_ae" });
      setProjectStaff((prev) => [...prev, added]);
      setAddPartnerUserId("");
      setShowPartnerModal(false);
      showToast("Partner AE added.", "success");
    } catch {
      showToast("Failed to add partner AE", "error");
    } finally {
      setAddingPartner(false);
    }
  }

  async function handleRemovePartner(staffId: string) {
    if (!project) return;
    try {
      await api.removeProjectStaff(project.id, staffId);
      setProjectStaff((prev) => prev.filter((s) => s.id !== staffId));
      showToast("Partner AE removed.", "success");
    } catch {
      showToast("Failed to remove partner AE", "error");
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
      // Partner AEs always post at partner visibility (server also enforces this)
      const visibility = currentUserRole === "partner_ae" ? "partner" : newNoteVisibility;
      const created = await api.createNote(project.id, { body: newNoteBody.trim(), visibility });
      setNotes((prev) => [created, ...prev]);
      setNewNoteBody("");
      setNewNoteVisibility("internal");
      showToast(currentUserRole === "partner_ae" ? "Comment posted." : "Note added.", "success");
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
        <Link to="/projects" style={{ color: "#63c1ea", textDecoration: "none", fontSize: 13, fontWeight: 500 }}>
          ← Projects
        </Link>
      </div>

      {/* Project header card */}
      <div className="ms-card" style={{ padding: "20px 24px", marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{project.name}</h1>
        <div style={{ fontSize: 14, color: "#64748b", marginBottom: 14 }}>
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
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                    padding: "1px 6px", borderRadius: 10,
                    background: project.health_override ? "rgba(124,58,237,0.12)" : "rgba(8,145,178,0.12)",
                    color: project.health_override ? "#7c3aed" : "#0891b2",
                    border: `1px solid ${project.health_override ? "rgba(124,58,237,0.3)" : "rgba(8,145,178,0.3)"}`,
                  }}>
                    {project.health_override ? "Manual" : "Auto"}
                  </span>
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
      {(() => {
        const platform = detectPlatform(project.vendor);
        const platformLabel = platform === "ringcentral" ? "RingCentral" : "Zoom";
        const managedInAsana = !!project.managed_in_asana;
        const hasCrm = !!project.dynamics_account_id;
        const visibleTabs: DetailTab[] = managedInAsana
          ? ["overview", "asana", ...(hasCrm ? ["sharepoint" as const] : ["documents" as const]), "activity", "zoom"]
          : ["overview", "timeline", "tasks", "risks", "milestones", ...(hasCrm ? ["sharepoint" as const] : ["documents" as const]), "activity", "zoom"];
        return (
          <div className="ms-tabs">
            {visibleTabs.map((t) => (
              <button
                key={t}
                className={`ms-tab-btn${tab === t ? " active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t === "zoom" ? platformLabel : t === "asana" ? "Asana" : t === "sharepoint" ? "SharePoint" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        );
      })()}

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
                  <div key="pm" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, rgba(0,120,212,0.3), rgba(99,193,234,0.2))", border: "1px solid rgba(99,193,234,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#63c1ea" }}>{abbr}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 2 }}>Project Manager</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{pm.name ?? pm.email}</div>
                      <a href={`mailto:${pm.email}`} style={{ fontSize: 12, color: "#63c1ea", textDecoration: "none" }}>{pm.email}</a>
                    </div>
                  </div>
                );
              })()}
              {/* Additional PF staff (excludes partner AEs — shown in their own section below) */}
              {projectStaff.filter(s => s.staff_role !== "partner_ae").map((s) => {
                const abbr = s.name ? s.name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase() : s.email.slice(0, 2).toUpperCase();
                const roleLabel: Record<string, string> = { ae: "Account Executive", sa: "Solution Architect", csm: "Client Success Manager", engineer: "Implementation Engineer", pm: "Project Manager" };
                const photo = staffPhotoMap[s.email] ?? s.avatar_url;
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)", position: "relative" }}>
                    {photo
                      ? <img src={photo} alt={s.name ?? s.email} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, rgba(0,120,212,0.3), rgba(99,193,234,0.2))", border: "1px solid rgba(99,193,234,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#63c1ea" }}>{abbr}</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 2 }}>{roleLabel[s.staff_role] ?? s.staff_role}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{s.name ?? s.email}</div>
                      <a href={`mailto:${s.email}`} style={{ fontSize: 12, color: "#63c1ea", textDecoration: "none" }}>{s.email}</a>
                    </div>
                    {canEdit && (
                      <button onClick={() => handleRemoveStaff(s.id)} style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "rgba(209,52,56,0.6)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "2px 4px" }} title="Remove">✕</button>
                    )}
                  </div>
                );
              })}
              {projectStaff.filter(s => s.staff_role !== "partner_ae").length === 0 && !project.pm_user_id && (
                <div style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic", gridColumn: "1 / -1" }}>No staff assigned.</div>
              )}
            </div>
            {canEdit && (
              <div style={{ paddingTop: 12, borderTop: "1px solid #f1f5f9", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {project.dynamics_account_id && (
                  <button className="ms-btn-secondary" style={{ fontSize: 12 }} disabled={crmSyncing} onClick={handleCrmSync}>
                    {crmSyncing ? "Syncing…" : "Sync from CRM"}
                  </button>
                )}
                <button className="ms-btn-secondary" onClick={() => { setShowStaffModal(true); setAddStaffUserId(""); setAddStaffRole(""); }}>
                  + Add Staff Member
                </button>
              </div>
            )}
          </div>

          {/* ── Partner AE Access ────────────────────────────────────────────── */}
          {(() => {
            const partnerStaff = projectStaff.filter(s => s.staff_role === "partner_ae");
            const assignablePartners = users.filter(u => u.role === "partner_ae" && !partnerStaff.some(s => s.user_id === u.id));
            if (!canEdit && partnerStaff.length === 0) return null;
            return (
              <div className="ms-section-card">
                <div className="ms-section-title">Partner Access</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginBottom: partnerStaff.length > 0 ? 14 : 0 }}>
                  {partnerStaff.map((s) => {
                    const abbr = s.name ? s.name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase() : s.email.slice(0, 2).toUpperCase();
                    const photo = staffPhotoMap[s.email] ?? s.avatar_url;
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)", position: "relative" }}>
                        {photo
                          ? <img src={photo} alt={s.name ?? s.email} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                          : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, rgba(16,124,16,0.25), rgba(16,124,16,0.1))", border: "1px solid rgba(16,124,16,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#107c10" }}>{abbr}</div>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 2 }}>{s.organization_name ?? "Partner AE"}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{s.name ?? s.email}</div>
                          <a href={`mailto:${s.email}`} style={{ fontSize: 12, color: "#63c1ea", textDecoration: "none" }}>{s.email}</a>
                        </div>
                        {canEdit && (
                          <button onClick={() => handleRemovePartner(s.id)} style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "rgba(209,52,56,0.6)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "2px 4px" }} title="Remove">✕</button>
                        )}
                      </div>
                    );
                  })}
                  {partnerStaff.length === 0 && (
                    <div style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic", gridColumn: "1 / -1" }}>No partner AEs assigned.</div>
                  )}
                </div>
                {canEdit && (
                  <div style={{ paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                    <button className="ms-btn-secondary" onClick={() => { setShowPartnerModal(true); setAddPartnerUserId(""); }} disabled={assignablePartners.length === 0}>
                      + Add Partner AE
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {canEdit && <div className="ms-section-card">
            <div className="ms-section-title">Asana Integration</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {project.managed_in_asana ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f06a35", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 500 }}>Managed in Asana</span>
                    {project.asana_project_id && (
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>GID: {project.asana_project_id}</span>
                    )}
                  </div>
                  <button
                    className="ms-btn-secondary"
                    style={{ fontSize: 12 }}
                    onClick={async () => {
                      try {
                        const updated = await api.unlinkAsanaProject(project.id);
                        setProject(updated);
                        showToast("Asana project unlinked.", "success");
                      } catch {
                        showToast("Failed to unlink Asana project", "error");
                      }
                    }}
                  >
                    Unlink Asana
                  </button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>Not managed in Asana</span>
                  <button
                    className="ms-btn-secondary"
                    style={{ fontSize: 12 }}
                    onClick={async () => {
                      setShowAsanaModal(true);
                      setAsanaProjects([]);
                      setAsanaSelectedWorkspace("");
                      const status = await api.asanaStatus().catch(() => ({ connected: false }));
                      setAsanaConnected(status.connected);
                      if (status.connected) {
                        const ws = await api.asanaWorkspaces().catch(() => []);
                        setAsanaWorkspaces(ws);
                        if (ws.length === 1) {
                          setAsanaSelectedWorkspace(ws[0].gid);
                          setAsanaLoadingProjects(true);
                          const projects = await api.asanaSearchProjects(ws[0].gid).catch(() => []);
                          setAsanaProjects(projects);
                          setAsanaLoadingProjects(false);
                        }
                      }
                    }}
                  >
                    Link to Asana Project
                  </button>
                </>
              )}
            </div>
          </div>}

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
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Health
                  {project.health_override && (
                    <button
                      type="button"
                      onClick={handleClearHealthOverride}
                      style={{ fontSize: 11, fontWeight: 600, color: "#0891b2", background: "rgba(8,145,178,0.08)", border: "1px solid rgba(8,145,178,0.25)", borderRadius: 4, padding: "1px 8px", cursor: "pointer" }}
                    >
                      Reset to Auto
                    </button>
                  )}
                </span>
                <select className="ms-input" value={editHealth} onChange={(e) => setEditHealth(e.target.value)}>
                  <option value="">Select health</option>
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="off_track">Off Track</option>
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
              {saveMessage && <span style={{ fontSize: 13, color: "#64748b" }}>{saveMessage}</span>}
            </div>

            {templateList.length > 0 && (
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 10 }}>Apply Template</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <select
                    className="ms-input"
                    style={{ flex: 1 }}
                    value={selectedTemplateId}
                    onChange={(e) => { setSelectedTemplateId(e.target.value); setApplyResult(null); }}
                  >
                    <option value="">— Select a template —</option>
                    {templateList.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <button
                    className="ms-btn-secondary"
                    disabled={!selectedTemplateId || applyingTemplate}
                    onClick={() => setShowApplyConfirm(true)}
                  >
                    Apply
                  </button>
                </div>
                {applyResult && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#059669" }}>
                    Applied: {applyResult.phases_created} phases, {applyResult.tasks_created} tasks added.
                  </div>
                )}
              </div>
            )}
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
              <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
                No customer contacts added yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {contacts.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "#f8fafc", borderRadius: 6, border: "1px solid #f1f5f9" }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(99,193,234,0.12)", border: "1px solid rgba(99,193,234,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 15, fontWeight: 700, color: "#63c1ea" }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{c.name}</span>
                        {c.contact_role && (
                          <span className="ms-badge" style={{ background: "rgba(99,193,234,0.1)", color: "#63c1ea", border: "1px solid rgba(99,193,234,0.2)", fontSize: 11 }}>
                            {c.contact_role}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
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

          {/* ── Asana Phase Progress ──────────────────────────────────────── */}
          {!!project.managed_in_asana && asanaSectionSummaries.length > 0 && (
            <div className="ms-section-card">
              <div className="ms-section-title">Phase Progress</div>
              <div style={{ display: "grid", gap: 10 }}>
                {asanaSectionSummaries.map((s) => {
                  const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
                  const status = s.total === 0 ? "not_started"
                    : s.completed === s.total ? "completed"
                    : s.completed > 0 ? "in_progress"
                    : "not_started";
                  const statusColor: Record<string, string> = {
                    completed: "#059669", in_progress: "#0891b2", not_started: "#94a3b8",
                  };
                  const color = statusColor[status];
                  return (
                    <div key={s.gid}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{s.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>{s.completed}/{s.total} tasks</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
                        </div>
                      </div>
                      <div style={{ height: 6, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="ms-section-card">
            <div className="ms-section-title">Quick Counts</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
              {[["Phases", phases.length], ["Milestones", milestones.length], ["Tasks", tasks.length], ["Risks", risks.length], ["Notes", notes.length]].map(
                ([label, value]) => (
                  <div key={label as string} className="ms-info-item" style={{ textAlign: "center" }}>
                    <div className="ms-info-label">{label}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#63c1ea", lineHeight: 1.2 }}>{value}</div>
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
                <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1e293b", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
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
                        <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: 3 }}>{task.title}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
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
                      style={{ alignSelf: "start", border: "1px dashed rgba(255,255,255,0.2)", color: "#64748b" }}
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
                    <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>{risk.title}</div>
                    {risk.description && <div style={{ color: "#64748b", fontSize: 13, marginBottom: 4 }}>{risk.description}</div>}
                    <div style={{ fontSize: 12, color: "#64748b" }}>Severity: {risk.severity ?? "—"} · Owner: {userName(risk.owner_user_id)}</div>
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
                    <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>{ms.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
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

      {/* ── SharePoint ────────────────────────────────────────────────────── */}
      {tab === "sharepoint" && project.dynamics_account_id && (
        <SharePointDocs recordId={project.dynamics_account_id} />
      )}

      {/* ── Activity ──────────────────────────────────────────────────────── */}
      {tab === "activity" && (() => {
        const isPartnerAe = currentUserRole === "partner_ae";
        const isPfAe = currentUserRole === "pf_ae";
        const canComment = canEdit || isPartnerAe || isPfAe;
        return (
          <div style={{ display: "grid", gap: 16 }}>
            {canComment && (
              <div className="ms-section-card">
                <div className="ms-section-title">{isPartnerAe ? "Add Comment" : "Add Note"}</div>
                <div style={{ display: "grid", gap: 12 }}>
                  {!isPartnerAe && (
                    <label className="ms-label">
                      <span>Visibility</span>
                      <select className="ms-input" value={newNoteVisibility} onChange={(e) => setNewNoteVisibility(e.target.value as "internal" | "partner" | "public")}>
                        {!isPfAe && <option value="internal">Internal</option>}
                        <option value="partner">Partner</option>
                        {!isPfAe && <option value="public">Public</option>}
                      </select>
                    </label>
                  )}
                  <label className="ms-label">
                    <span>{isPartnerAe ? "Comment" : "Note"}</span>
                    <textarea
                      className="ms-input"
                      value={newNoteBody}
                      onChange={(e) => setNewNoteBody(e.target.value)}
                      rows={4}
                      style={{ resize: "vertical", minHeight: 90 }}
                      placeholder={isPartnerAe ? "Share an update with the project team..." : "Add a project update..."}
                    />
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button className="ms-btn-primary" onClick={handleAddNote} disabled={savingNote}>
                      {savingNote ? "Posting..." : isPartnerAe ? "Post Comment" : "Add Note"}
                    </button>
                    {noteMessage && <span style={{ fontSize: 13, color: "#64748b" }}>{noteMessage}</span>}
                  </div>
                </div>
              </div>
            )}

            <div className="ms-section-card">
              <div className="ms-section-title">Activity</div>
              {notes.length === 0 ? (
                <div style={{ color: "#a19f9d", fontSize: 14 }}>No activity yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {notes.map((note) => {
                    const initials = note.author_name
                      ? note.author_name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
                      : "?";
                    const isPartner = note.author_org && note.author_org !== "Packet Fusion";
                    const visibilityColor: Record<string, string> = { internal: "#94a3b8", partner: "#63c1ea", public: "#107c10" };
                    return (
                      <div key={note.id} style={{ display: "flex", gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: "50%", flexShrink: 0, display: "flex",
                          alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                          background: isPartner ? "linear-gradient(135deg, rgba(16,124,16,0.25), rgba(16,124,16,0.1))" : "linear-gradient(135deg, rgba(0,120,212,0.25), rgba(99,193,234,0.15))",
                          border: isPartner ? "1px solid rgba(16,124,16,0.25)" : "1px solid rgba(99,193,234,0.25)",
                          color: isPartner ? "#107c10" : "#63c1ea",
                        }}>
                          {initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>
                              {note.author_name ?? "Unknown"}
                            </span>
                            {note.author_org && (
                              <span style={{ fontSize: 11, color: "#94a3b8" }}>{note.author_org}</span>
                            )}
                            <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: "auto" }}>
                              {formatDate(note.created_at)}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {note.body}
                          </div>
                          {canEdit && note.visibility && (
                            <div style={{ marginTop: 6 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: visibilityColor[note.visibility] ?? "#94a3b8" }}>
                                {note.visibility}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Zoom ──────────────────────────────────────────────────────────── */}
      {tab === "zoom" && (() => {
        const platform = detectPlatform(project.vendor);
        return platform === "ringcentral"
          ? <RingCentralTab projectId={project.id} />
          : <ZoomTab projectId={project.id} />;
      })()}

      {/* ── Asana ─────────────────────────────────────────────────────────── */}
      {tab === "asana" && <AsanaProjectView projectId={project.id} />}

      {/* ── Asana Link Modal ──────────────────────────────────────────────── */}
      {showAsanaModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAsanaModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 520 }}>
            <h2>Link to Asana Project</h2>

            {asanaConnected === false && (
              <div style={{ display: "grid", gap: 14 }}>
                <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
                  Asana is not connected. An admin needs to authorize FusionFlow360 to access Asana.
                </p>
                <button
                  className="ms-btn-primary"
                  onClick={async () => {
                    try {
                      const { url } = await api.asanaAuthUrl();
                      window.location.href = url;
                    } catch {
                      showToast("Failed to get Asana auth URL. Check that ASANA_CLIENT_ID is configured.", "error");
                    }
                  }}
                >
                  Connect Asana
                </button>
              </div>
            )}

            {asanaConnected === true && (
              <div style={{ display: "grid", gap: 16 }}>
                {asanaWorkspaces.length > 1 && (
                  <label className="ms-label">
                    <span>Workspace</span>
                    <select
                      className="ms-input"
                      value={asanaSelectedWorkspace}
                      onChange={async (e) => {
                        const ws = e.target.value;
                        setAsanaSelectedWorkspace(ws);
                        if (ws) {
                          setAsanaLoadingProjects(true);
                          const projects = await api.asanaSearchProjects(ws).catch(() => []);
                          setAsanaProjects(projects);
                          setAsanaLoadingProjects(false);
                        }
                      }}
                    >
                      <option value="">Select workspace</option>
                      {asanaWorkspaces.map((w) => (
                        <option key={w.gid} value={w.gid}>{w.name}</option>
                      ))}
                    </select>
                  </label>
                )}

                {asanaLoadingProjects && (
                  <div style={{ color: "#94a3b8", fontSize: 13 }}>Loading projects...</div>
                )}

                {!asanaLoadingProjects && asanaSelectedWorkspace && asanaProjects.length === 0 && (
                  <div style={{ color: "#94a3b8", fontSize: 13 }}>No projects found in this workspace.</div>
                )}

                {asanaProjects.length > 0 && (
                  <div style={{ display: "grid", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                    {asanaProjects.map((p) => (
                      <button
                        key={p.gid}
                        disabled={asanaLinking}
                        onClick={async () => {
                          setAsanaLinking(true);
                          try {
                            const updated = await api.linkAsanaProject(project.id, p.gid);
                            setProject(updated);
                            setTab("asana");
                            setShowAsanaModal(false);
                            showToast(`Linked to "${p.name}" in Asana.`, "success");
                          } catch {
                            showToast("Failed to link Asana project", "error");
                          } finally {
                            setAsanaLinking(false);
                          }
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 14px",
                          background: "#f8fafc",
                          border: "1px solid rgba(0,0,0,0.06)",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#1e293b",
                        }}
                      >
                        {p.name}
                        {p.due_on && <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400, marginLeft: 8 }}>Due {p.due_on}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {asanaConnected === null && (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>Checking connection...</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="ms-btn-secondary" onClick={() => setShowAsanaModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>{editingTask.id === "" ? "New Task" : "Task Details"}</h2>
              <button onClick={() => setEditingTask(null)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
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
              <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>
                  Comments {taskComments.length > 0 && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({taskComments.length})</span>}
                </div>

                {taskComments.length === 0 && (
                  <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", marginBottom: 10 }}>No comments yet.</div>
                )}

                {taskComments.map((c) => {
                  const canDeleteComment = c.author_user_id === currentUserId || canEdit;
                  const authorLabel = c.author_name ?? c.author_email ?? "Unknown";
                  const ago = taskCommentTimeAgo(c.created_at);
                  return (
                    <div key={c.id} style={{ marginBottom: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 6, border: "1px solid #f1f5f9" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#63c1ea" }}>{authorLabel}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>{ago}</span>
                          {canDeleteComment && (
                            <button
                              onClick={() => handleDeleteTaskComment(c.id)}
                              style={{ background: "none", border: "none", color: "rgba(209,52,56,0.6)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                              title="Delete comment"
                            >×</button>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{c.body}</div>
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
              <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>
                  Attachments
                </div>

                {documents.filter((d) => d.task_id === editingTask.id).length === 0 && (
                  <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", marginBottom: 10 }}>No attachments yet.</div>
                )}

                {documents.filter((d) => d.task_id === editingTask.id).map((doc) => (
                  <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#f8fafc", borderRadius: 6, border: "1px solid #f1f5f9", marginBottom: 6 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>📎</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "#334155", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.name}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                        {doc.uploader_name ?? "—"} · {doc.size_bytes ? fmtBytes(doc.size_bytes) : ""}
                      </div>
                    </div>
                    <a
                      href={api.downloadDocumentUrl(project!.id, doc.id)}
                      download
                      style={{ fontSize: 12, color: "#63c1ea", textDecoration: "none", flexShrink: 0 }}
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
              <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Add Staff Member</h2>
              <button onClick={() => setShowStaffModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
              <label className="ms-label">
                <span>Role on Project</span>
                <select className="ms-input" value={addStaffRole} onChange={(e) => setAddStaffRole(e.target.value)}>
                  <option value="">— Select role —</option>
                  {!project?.dynamics_account_id && <option value="ae">Account Executive</option>}
                  {!project?.dynamics_account_id && <option value="sa">Solution Architect</option>}
                  {!project?.dynamics_account_id && <option value="csm">Client Success Manager</option>}
                  <option value="engineer">Implementation Engineer</option>
                  <option value="pm">Project Manager</option>
                </select>
                {project?.dynamics_account_id && (
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>AE, SA, and CSM are managed via CRM sync.</div>
                )}
              </label>
              <label className="ms-label">
                <span>Team Member</span>
                <select className="ms-input" value={addStaffUserId} onChange={(e) => setAddStaffUserId(e.target.value)}>
                  <option value="">— Select team member —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <button className="ms-btn-primary" disabled={!addStaffUserId || !addStaffRole || addingStaff} onClick={handleAddStaff}>
                {addingStaff ? "Adding…" : "Add Staff Member"}
              </button>
              <button className="ms-btn-secondary" onClick={() => setShowStaffModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Partner AE Modal ─────────────────────────────────────────── */}
      {showPartnerModal && (() => {
        const assignablePartners = users.filter(u => u.role === "partner_ae" && !projectStaff.some(s => s.staff_role === "partner_ae" && s.user_id === u.id));
        return (
          <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowPartnerModal(false); }}>
            <div className="ms-modal" style={{ maxWidth: 480, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Add Partner AE</h2>
                <button onClick={() => setShowPartnerModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
              </div>
              <div style={{ padding: "20px 24px" }}>
                <label className="ms-label">
                  <span>Partner AE</span>
                  <select className="ms-input" value={addPartnerUserId} onChange={(e) => setAddPartnerUserId(e.target.value)}>
                    <option value="">— Select partner AE —</option>
                    {assignablePartners.map((u) => (
                      <option key={u.id} value={u.id}>{u.name ?? u.email}{u.organization_name ? ` (${u.organization_name})` : ""}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
                <button className="ms-btn-primary" disabled={!addPartnerUserId || addingPartner} onClick={handleAddPartner}>
                  {addingPartner ? "Adding…" : "Add Partner AE"}
                </button>
                <button className="ms-btn-secondary" onClick={() => setShowPartnerModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add Contact Modal ──────────────────────────────────────────────── */}
      {showContactModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowContactModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 580, display: "flex", flexDirection: "column", maxHeight: "85vh" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Add Customer Contact</h2>
              <button onClick={() => setShowContactModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
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
                      borderBottom: `2px solid ${contactModalTab === t ? "#63c1ea" : "transparent"}`,
                      color: contactModalTab === t ? "#63c1ea" : "#94a3b8",
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
                    <div style={{ color: "#94a3b8", fontSize: 13, padding: "20px 0" }}>Loading CRM contacts…</div>
                  ) : crmContacts.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic", padding: "20px 0" }}>No contacts found in CRM for this account.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {crmContacts
                        .filter((c) => !contacts.some((p) => p.dynamics_contact_id === c.contactid))
                        .map((c) => {
                          const fullName = [c.firstname, c.lastname].filter(Boolean).join(" ");
                          return (
                            <div key={c.contactid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 6 }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{fullName || "—"}</div>
                                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
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
              <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
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

      {/* Apply Template Confirm */}
      {showApplyConfirm && selectedTemplateId && (() => {
        const tmpl = templateList.find((t) => t.id === selectedTemplateId);
        return (
          <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowApplyConfirm(false); }}>
            <div className="ms-modal" style={{ maxWidth: 440 }}>
              <h2>Apply Template</h2>
              <p style={{ color: "#475569", margin: "12px 0 20px" }}>
                This will add <strong>{tmpl?.phase_count ?? "?"} phases</strong> and{" "}
                <strong>{tmpl?.task_count ?? "?"} tasks</strong> from{" "}
                <strong style={{ color: "#1e293b" }}>{tmpl?.name}</strong> to this project. Continue?
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="ms-btn-primary"
                  disabled={applyingTemplate}
                  onClick={handleApplyTemplate}
                >
                  {applyingTemplate ? "Applying..." : "Apply Template"}
                </button>
                <button className="ms-btn-secondary" onClick={() => setShowApplyConfirm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

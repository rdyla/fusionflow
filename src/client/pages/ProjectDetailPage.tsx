import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  type CaseComplianceData,
  type Document,
  type DynamicsContact,
  type Milestone,
  type Note,
  type Phase,
  type Project,
  type ProjectChain,
  type ProjectContact,
  type ProjectStaffMember,
  type Risk,
  type SupportCase,
  type Task,
  type TaskComment,
  type User,
  type ZoomRecording,
  type ZoomRecordingSuggestion,
  type ZoomRecordingFile,
} from "../lib/api";
import LifecycleChain from "../components/ui/LifecycleChain";
import ProjectTimeline from "../components/timeline/ProjectTimeline";
import ProjectDocuments from "../components/documents/ProjectDocuments";
import ZoomTab from "../components/zoom/ZoomTab";
import RingCentralTab from "../components/ringcentral/RingCentralTab";
import SharePointDocs from "../components/sharepoint/SharePointDocs";
import { useToast } from "../components/ui/ToastProvider";

type DetailTab = "overview" | "timeline" | "tasks" | "risks" | "milestones" | "documents" | "sharepoint" | "activity" | "zoom" | "case";

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
  const [timeEntryTask, setTimeEntryTask] = useState<Task | null>(null);
  const [timeEntrySetup, setTimeEntrySetup] = useState<import("../lib/api").TimeEntrySetup | null>(null);
  const [timeEntryLoadingSetup, setTimeEntryLoadingSetup] = useState(false);
  const [timeEntryForm, setTimeEntryForm] = useState({ date: "", startTime: "", endTime: "", payCodeId: "", costCodeId: "", useCostCode: false });
  const [submittingTimeEntry, setSubmittingTimeEntry] = useState(false);
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

  // Zoom recordings
  const [recordings, setRecordings] = useState<ZoomRecording[]>([]);
  const [syncingSuggestions, setSyncingSuggestions] = useState(false);
  const [syncSuggestions, setSyncSuggestions] = useState<ZoomRecordingSuggestion[] | null>(null);
  const [confirmingRecordings, setConfirmingRecordings] = useState(false);
  const [suggestionPhaseOverrides, setSuggestionPhaseOverrides] = useState<Record<number, string | null>>({});
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [suggestionTaskOverrides, setSuggestionTaskOverrides] = useState<Record<number, string | null>>({});

  const [addStaffUserId, setAddStaffUserId] = useState("");
  const [addStaffRole, setAddStaffRole] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const [crmSyncing, setCrmSyncing] = useState(false);
  const [staffPhotoMap, setStaffPhotoMap] = useState<Record<string, string | null>>({});
  const [customerTeamPhotoMap, setCustomerTeamPhotoMap] = useState<Record<string, string | null>>({});

  // CRM case compliance
  const [caseCompliance, setCaseCompliance] = useState<CaseComplianceData | null>(null);
  const [caseComplianceLoading, setCaseComplianceLoading] = useState(false);
  const [caseSearchQuery, setCaseSearchQuery] = useState("");
  const [caseSearchResults, setCaseSearchResults] = useState<SupportCase[]>([]);
  const [caseSearching, setCaseSearching] = useState(false);
  const [savingCaseLink, setSavingCaseLink] = useState(false);

  // Lifecycle chain
  const [chain, setChain] = useState<ProjectChain | null>(null);
  const [showLinkSolutionModal, setShowLinkSolutionModal] = useState(false);
  const [allSolutions, setAllSolutions] = useState<{ id: string; name: string; customer_name: string }[]>([]);
  const [linkSolutionId, setLinkSolutionId] = useState("");
  const [linkingSolution, setLinkingSolution] = useState(false);

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
            api.risks(id), api.notes(id), api.users().catch(() => [] as User[]), api.documents(id),
            api.projectStaff(id),
            api.me(),
          ]);
        api.projectContacts(id).then(setContacts).catch(() => {});
        api.projectChain(id).then(setChain).catch(() => {});
        setProject(projectData);
        setEditStatus(projectData.status ?? "");
        setEditHealth(projectData.health ?? "");
        setEditTargetGoLiveDate(projectData.target_go_live_date ?? "");
        api.zoomRecordings(id).then(setRecordings).catch(() => {});
        setProjectStaff(staffData);
        if (staffData.length > 0) {
          const emails = staffData.map((s: { email: string }) => s.email);
          api.staffPhotos(emails).then(setStaffPhotoMap).catch(() => {});
        }
        // Fetch photos for customer PF team
        const customerEmails = [projectData.customer_pf_ae_email, projectData.customer_pf_sa_email, projectData.customer_pf_csm_email].filter(Boolean) as string[];
        if (customerEmails.length > 0) {
          api.staffPhotos(customerEmails).then(setCustomerTeamPhotoMap).catch(() => {});
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

  // Load template list for apply-template panel (admin + pm)
  useEffect(() => {
    api.templatesList().then(setTemplateList).catch(() => {});
  }, []);

  // Load case compliance data when the case tab is opened
  useEffect(() => {
    if (tab !== "case" || !project?.id) return;
    setCaseComplianceLoading(true);
    api.projectCaseCompliance(project.id)
      .then(setCaseCompliance)
      .catch(() => setCaseCompliance(null))
      .finally(() => setCaseComplianceLoading(false));
  }, [tab, project?.id]);

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
      const { staff, crm, project: updatedProject } = await api.projectCrmSync(project.id);
      setProjectStaff(staff);
      if (updatedProject) setProject(p => p ? { ...p, ...updatedProject } : updatedProject);
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
      {/* Back */}
      <div style={{ marginBottom: 12 }}>
        <Link to={project.customer_id ? `/customers/${project.customer_id}` : "/projects"} style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>
          ← {project.customer_id ? (project.customer_name ?? project.customer_display_name ?? "Customer") : "Projects"}
        </Link>
      </div>

      {/* Customer Metadata Section — shown when linked to a customer */}
      {project.customer_id && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid rgba(0,0,0,0.07)", marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)", background: "rgba(11,154,173,0.03)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 4 }}>Customer</div>
              <Link to={`/customers/${project.customer_id}`} style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", textDecoration: "none" }}>
                {project.customer_name ?? project.customer_display_name} <span style={{ fontSize: 13, color: "#0b9aad" }}>↗</span>
              </Link>
            </div>
            {project.customer_sharepoint_url && (
              <a href={project.customer_sharepoint_url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#0b9aad", textDecoration: "none", fontWeight: 600 }}>
                SharePoint ↗
              </a>
            )}
          </div>
          {(project.customer_pf_ae_name || project.customer_pf_sa_name || project.customer_pf_csm_name) && (
            <div style={{ padding: "14px 20px", display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { role: "Account Executive", name: project.customer_pf_ae_name, email: project.customer_pf_ae_email },
                { role: "Solution Architect", name: project.customer_pf_sa_name, email: project.customer_pf_sa_email },
                { role: "Client Success Manager", name: project.customer_pf_csm_name, email: project.customer_pf_csm_email },
              ].filter(m => m.name).map((m) => {
                const photo = m.email ? customerTeamPhotoMap[m.email] : null;
                const abbr = m.name!.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
                return (
                  <div key={m.role} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
                    {photo
                      ? <img src={photo} alt={m.name!} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      : <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, rgba(0,120,212,0.3), rgba(99,193,234,0.2))", border: "1px solid rgba(99,193,234,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#63c1ea" }}>{abbr}</div>
                    }
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 2 }}>{m.role}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{m.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Project header card */}
      <div className="ms-card" style={{ padding: "20px 24px", marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 14px", fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{project.name}</h1>

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
        const hasCrm = !!project.dynamics_account_id;
        const visibleTabs: DetailTab[] = ["overview", "timeline", "tasks", "risks", "milestones", ...(hasCrm ? ["sharepoint" as const] : ["documents" as const]), "activity", "case", "zoom"];
        return (
          <div className="ms-tabs">
            {visibleTabs.map((t) => (
              <button
                key={t}
                className={`ms-tab-btn${tab === t ? " active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t === "zoom" ? platformLabel : t === "sharepoint" ? "SharePoint" : t === "case" ? "CRM Case" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        );
      })()}

      {/* ── Overview ──────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div style={{ display: "grid", gap: 16 }}>
          {/* ── Lifecycle Chain ──────────────────────────────────────────── */}
          <LifecycleChain
            current="project"
            currentLabel={project.name}
            solution={chain?.solution ?? null}
            optimization={chain?.optimizeAccount ?? null}
            actions={canEdit && (
              <>
                {!chain?.solution && (
                  <button
                    className="ms-btn-secondary"
                    style={{ fontSize: 12 }}
                    onClick={() => {
                      setShowLinkSolutionModal(true);
                      setLinkSolutionId("");
                      api.solutions().then(setAllSolutions).catch(() => {});
                    }}
                  >
                    + Link to Solution
                  </button>
                )}
                {chain?.solution && (
                  <button
                    className="ms-btn-ghost"
                    style={{ fontSize: 12, color: "#94a3b8" }}
                    onClick={async () => {
                      try {
                        await api.unlinkProjectFromSolution(chain.solution!.id, project.id);
                        setChain((c) => c ? { ...c, solution: null } : null);
                        showToast("Solution unlinked.", "success");
                      } catch {
                        showToast("Failed to unlink solution", "error");
                      }
                    }}
                  >
                    Unlink Solution
                  </button>
                )}
              </>
            )}
          />

          {/* ── Project Team ──────────────────────────────────────────────── */}
          <div className="ms-section-card">
            <div className="ms-section-title">PF Team</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginBottom: 14 }}>
              {/* Primary PM */}
              {project.pm_user_id && (() => {
                // Use userMap if available (admin); fall back to pm_name/pm_email joined on the project
                const pmFromMap = userMap.get(project.pm_user_id);
                const pmName = pmFromMap?.name ?? (project as unknown as Record<string, unknown>).pm_name as string | null ?? null;
                const pmEmail = pmFromMap?.email ?? (project as unknown as Record<string, unknown>).pm_email as string | null ?? null;
                if (!pmName && !pmEmail) return null;
                const abbr = pmName ? pmName.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase() : (pmEmail ?? "PM").slice(0, 2).toUpperCase();
                return (
                  <div key="pm" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, rgba(0,120,212,0.3), rgba(99,193,234,0.2))", border: "1px solid rgba(99,193,234,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#63c1ea" }}>{abbr}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 2 }}>Project Manager</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{pmName ?? pmEmail}</div>
                      {pmEmail && <a href={`mailto:${pmEmail}`} style={{ fontSize: 12, color: "#63c1ea", textDecoration: "none" }}>{pmEmail}</a>}
                    </div>
                  </div>
                );
              })()}
              {/* Additional PF staff (excludes partner AEs and AE/SA/CSM — owned by customer) */}
              {projectStaff.filter(s => s.staff_role !== "partner_ae" && !["ae", "sa", "csm"].includes(s.staff_role)).map((s) => {
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
              {projectStaff.filter(s => s.staff_role !== "partner_ae" && !["ae", "sa", "csm"].includes(s.staff_role)).length === 0 && !project.pm_user_id && (
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
          recordings={recordings}
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

                  {phaseTasks.map((task) => {
                    const taskRecordings = recordings.filter((r) => r.task_id === task.id);
                    return (
                      <div key={task.id}>
                        <div
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
                            {task.status !== "completed" && (task.assignee_user_id === project?.id || canEdit || task.assignee_user_id === project?.pm_user_id || true) && (
                              <button
                                className="ms-btn-secondary"
                                style={{ fontSize: 11, padding: "3px 10px" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const today = new Date().toISOString().slice(0, 10);
                                  setTimeEntryForm({ date: today, startTime: "08:00", endTime: "09:00", payCodeId: "", costCodeId: "", useCostCode: false });
                                  setTimeEntrySetup(null);
                                  setTimeEntryTask(task);
                                  setTimeEntryLoadingSetup(true);
                                  api.timeEntrySetup(project!.id).then(setTimeEntrySetup).catch(() => showToast("Failed to load CRM data", "error")).finally(() => setTimeEntryLoadingSetup(false));
                                }}
                              >
                                Log Time
                              </button>
                            )}
                            {task.crm_time_entry_id && (
                              <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ Logged</span>
                            )}
                          </div>
                        </div>
                        {taskRecordings.length > 0 && (
                          <div style={{ paddingLeft: 16, paddingBottom: 6, display: "grid", gap: 3 }}>
                            {taskRecordings.map((rec) => (
                              <div key={rec.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#7c3aed" }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed", flexShrink: 0, display: "inline-block" }} />
                                <span style={{ fontWeight: 500 }}>{rec.topic}</span>
                                <span style={{ color: "#94a3b8" }}>
                                  {new Date(rec.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  {" · "}{rec.duration_mins}m
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {canEdit && (
                    <button
                      className="ms-btn-ghost"
                      onClick={() => setEditingTask({ id: "", project_id: project.id, phase_id: phase.id, title: "", assignee_user_id: null, due_date: null, completed_at: null, status: "not_started", priority: null, scheduled_start: null, scheduled_end: null, pay_code_id: null, cost_code_id: null, crm_time_entry_id: null })}
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

            {/* ── Zoom Recordings ─────────────────────────────────────── */}
            {detectPlatform(project.vendor) === "zoom" && (
              <div className="ms-section-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: recordings.length > 0 ? 14 : 0 }}>
                  <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>Zoom Recordings</div>
                  {canEdit && (
                    <button
                      className="ms-btn-secondary"
                      style={{ fontSize: 12 }}
                      disabled={syncingSuggestions}
                      onClick={async () => {
                        setSyncingSuggestions(true);
                        setSyncSuggestions(null);
                        setSuggestionPhaseOverrides({});
                        setSuggestionTaskOverrides({});
                        setSelectedSuggestions(new Set());
                        try {
                          const result = await api.zoomSyncRecordings(project.id);
                          const matchPriority = (r: ZoomRecordingSuggestion) => {
                            if (!r.match_reason) return 99;
                            if (r.match_reason === "customer_name") return 0;
                            if (r.match_reason === "case_number") return 1;
                            if (r.match_reason.startsWith("keyword:")) return 2;
                            if (r.match_reason === "date_range") return 3;
                            return 4;
                          };
                          const sorted = [...result.suggestions].sort((a, b) => matchPriority(a) - matchPriority(b));
                          // Default-select all matched recordings
                          const defaultSelected = new Set(
                            sorted.map((s, i) => s.match_reason ? i : -1).filter((i) => i >= 0)
                          );
                          setSyncSuggestions(sorted);
                          setSelectedSuggestions(defaultSelected);
                          setRecordings(result.already_linked);
                        } catch (err) {
                          showToast(err instanceof Error ? err.message : "Failed to sync recordings", "error");
                        } finally {
                          setSyncingSuggestions(false);
                        }
                      }}
                    >
                      {syncingSuggestions ? "Syncing..." : "Sync Recordings"}
                    </button>
                  )}
                </div>

                {recordings.length > 0 && (
                  <div style={{ display: "grid", gap: 8 }}>
                    {recordings.map((rec) => (
                      <div key={rec.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", background: "#f8fafc", borderRadius: 6, border: "1px solid #f1f5f9" }}>
                        <div style={{ fontSize: 20, flexShrink: 0 }}>🎥</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", marginBottom: 3 }}>{rec.topic}</div>
                          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                            {new Date(rec.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {" · "}{rec.duration_mins}m
                            {rec.host_email && <> · {rec.host_email}</>}
                            {rec.match_reason && (
                              <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", background: rec.manually_assigned ? "rgba(124,58,237,0.12)" : "rgba(8,145,178,0.12)", color: rec.manually_assigned ? "#7c3aed" : "#0891b2", border: `1px solid ${rec.manually_assigned ? "rgba(124,58,237,0.3)" : "rgba(8,145,178,0.3)"}` }}>
                                {rec.manually_assigned ? "manual" : rec.match_reason.replace("keyword:", "")}
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            {rec.recording_files.filter((f) => f.play_url).slice(0, 1).map((f) => (
                              <a key={f.id} href={f.play_url!} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#63c1ea", textDecoration: "none", fontWeight: 500 }}>
                                Watch recording ↗
                              </a>
                            ))}
                            {canEdit && (
                              <select
                                className="ms-input"
                                style={{ fontSize: 12, padding: "2px 6px", height: "auto", width: "auto" }}
                                value={rec.phase_id ?? ""}
                                onChange={async (e) => {
                                  const newPhaseId = e.target.value || null;
                                  try {
                                    const updated = await api.zoomReassignRecording(project.id, rec.id, newPhaseId);
                                    setRecordings((prev) => prev.map((r) => r.id === updated.id ? updated : r));
                                    showToast("Recording reassigned.", "success");
                                  } catch {
                                    showToast("Failed to reassign recording", "error");
                                  }
                                }}
                              >
                                <option value="">— unassigned —</option>
                                {phases.map((ph) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
                              </select>
                            )}
                            {canEdit && (
                              <button
                                className="ms-btn-ghost"
                                style={{ fontSize: 11, color: "#d13438", borderColor: "rgba(209,52,56,0.3)" }}
                                onClick={async () => {
                                  if (!confirm("Remove this recording link?")) return;
                                  await api.zoomDeleteRecording(project.id, rec.id);
                                  setRecordings((prev) => prev.filter((r) => r.id !== rec.id));
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          {rec.phase_name && (
                            <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>Phase: {rec.phase_name}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {recordings.length === 0 && !syncSuggestions && (
                  <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", marginTop: 8 }}>
                    No recordings linked yet. Click "Sync Recordings" to import from Zoom.
                  </div>
                )}
              </div>
            )}

            {/* ── Sync suggestions modal ────────────────────────────── */}
            {syncSuggestions !== null && (
              <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSyncSuggestions(null); }}>
                <div className="ms-modal" style={{ maxWidth: 640 }}>
                  <h2>Sync Recordings</h2>
                  {syncSuggestions.length === 0 ? (
                    <div>
                      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>No new recordings found in the last year.</p>
                      <button className="ms-btn-secondary" onClick={() => setSyncSuggestions(null)}>Close</button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
                          Found {syncSuggestions.length} new recording{syncSuggestions.length !== 1 ? "s" : ""}. Select the ones to link.
                        </p>
                        <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
                          <button
                            type="button"
                            style={{ background: "none", border: "none", color: "#0078d4", cursor: "pointer", padding: 0, fontSize: 12 }}
                            onClick={() => setSelectedSuggestions(new Set(syncSuggestions.map((_, i) => i)))}
                          >Select all</button>
                          <button
                            type="button"
                            style={{ background: "none", border: "none", color: "#0078d4", cursor: "pointer", padding: 0, fontSize: 12 }}
                            onClick={() => setSelectedSuggestions(new Set())}
                          >Deselect all</button>
                        </div>
                      </div>
                      <div style={{ display: "grid", gap: 10, maxHeight: 420, overflowY: "auto" }}>
                        {syncSuggestions.map((s, idx) => {
                          const isSelected = selectedSuggestions.has(idx);
                          const overridePhaseId = idx in suggestionPhaseOverrides ? suggestionPhaseOverrides[idx] : s.suggested_phase_id;
                          return (
                            <div
                              key={s.meeting_id}
                              style={{
                                padding: "12px 14px", borderRadius: 6, display: "grid", gap: 8,
                                background: isSelected ? "#f0f9ff" : "#f8fafc",
                                border: `1px solid ${isSelected ? "rgba(8,145,178,0.3)" : "#f1f5f9"}`,
                                opacity: isSelected ? 1 : 0.6,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    setSelectedSuggestions((prev) => {
                                      const next = new Set(prev);
                                      e.target.checked ? next.add(idx) : next.delete(idx);
                                      return next;
                                    });
                                  }}
                                  style={{ marginTop: 2, flexShrink: 0, cursor: "pointer" }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>{s.topic}</div>
                                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                                    {new Date(s.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                    {" · "}{s.duration_mins}m
                                    {s.host_email && <> · {s.host_email}</>}
                                    {s.match_reason && (
                                      <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", background: "rgba(8,145,178,0.12)", color: "#0891b2", border: "1px solid rgba(8,145,178,0.3)" }}>
                                        {s.match_reason.replace("keyword:", "")}
                                      </span>
                                    )}
                                    {!s.match_reason && (
                                      <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", background: "rgba(148,163,184,0.15)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.3)" }}>
                                        no match
                                      </span>
                                    )}
                                  </div>
                                  {isSelected && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0 }}>Phase:</span>
                                        <select
                                          className="ms-input"
                                          style={{ fontSize: 12, padding: "3px 8px", height: "auto" }}
                                          value={overridePhaseId ?? ""}
                                          onChange={(e) => {
                                            setSuggestionPhaseOverrides((prev) => ({ ...prev, [idx]: e.target.value || null }));
                                            // Clear task when phase changes
                                            setSuggestionTaskOverrides((prev) => ({ ...prev, [idx]: null }));
                                          }}
                                        >
                                          <option value="">— Unassigned —</option>
                                          {phases.map((ph) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
                                        </select>
                                      </div>
                                      {overridePhaseId && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0 }}>Task:</span>
                                          <select
                                            className="ms-input"
                                            style={{ fontSize: 12, padding: "3px 8px", height: "auto" }}
                                            value={suggestionTaskOverrides[idx] ?? ""}
                                            onChange={(e) => setSuggestionTaskOverrides((prev) => ({ ...prev, [idx]: e.target.value || null }))}
                                          >
                                            <option value="">— None —</option>
                                            {tasks
                                              .filter((t) => t.phase_id === overridePhaseId)
                                              .map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                                          </select>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
                        {selectedSuggestions.size === 0 && (
                          <span style={{ fontSize: 12, color: "#94a3b8", marginRight: "auto" }}>Select at least one recording to link.</span>
                        )}
                        <button className="ms-btn-secondary" onClick={() => setSyncSuggestions(null)}>Cancel</button>
                        <button
                          className="ms-btn-primary"
                          disabled={confirmingRecordings || selectedSuggestions.size === 0}
                          onClick={async () => {
                            setConfirmingRecordings(true);
                            try {
                              const confirmations = [...selectedSuggestions].map((idx) => {
                                const s = syncSuggestions[idx];
                                const phaseId = (idx in suggestionPhaseOverrides ? suggestionPhaseOverrides[idx] : s.suggested_phase_id) ?? null;
                                const taskId = suggestionTaskOverrides[idx] ?? null;
                                const isManual = (idx in suggestionPhaseOverrides && suggestionPhaseOverrides[idx] !== s.suggested_phase_id) || !!taskId;
                                return {
                                  meeting_id: s.meeting_id,
                                  phase_id: phaseId,
                                  task_id: taskId,
                                  topic: s.topic,
                                  start_time: s.start_time,
                                  duration_mins: s.duration_mins,
                                  host_email: s.host_email ?? null,
                                  recording_files: s.recording_files as ZoomRecordingFile[],
                                  match_reason: isManual ? "manual" : s.match_reason ?? null,
                                };
                              });
                              const saved = await api.zoomConfirmRecordings(project.id, confirmations);
                              setRecordings((prev) => {
                                const map = new Map(prev.map((r) => [r.id, r]));
                                saved.forEach((r) => map.set(r.id, r));
                                return [...map.values()].sort((a, b) => b.start_time.localeCompare(a.start_time));
                              });
                              setSyncSuggestions(null);
                              showToast(`${saved.length} recording${saved.length !== 1 ? "s" : ""} linked successfully.`, "success");
                            } catch (err) {
                              showToast(err instanceof Error ? err.message : "Failed to confirm recordings", "error");
                            } finally {
                              setConfirmingRecordings(false);
                            }
                          }}
                        >
                          {confirmingRecordings ? "Saving..." : `Link ${selectedSuggestions.size} Recording${selectedSuggestions.size !== 1 ? "s" : ""}`}
                        </button>
                      </div>
                    </div>
                  )}
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

      {/* ── CRM Case ──────────────────────────────────────────────────────── */}
      {tab === "case" && (() => {
        if (!project) return null;
        const p = project;
        const caseStateColor: Record<number, string> = { 0: "#0891b2", 1: "#059669", 2: "#94a3b8" };

        async function handleCaseSearch() {
          if (!caseSearchQuery.trim()) return;
          setCaseSearching(true);
          setCaseSearchResults([]);
          try {
            const accountId = p.customer_id
              ? (caseCompliance as any)?._accountId ?? undefined
              : undefined;
            const results = await api.searchDynamicsCases({ q: caseSearchQuery.trim(), accountId });
            setCaseSearchResults(results);
          } catch {
            showToast("Failed to search cases", "error");
          } finally {
            setCaseSearching(false);
          }
        }

        async function handleLinkCase(caseId: string, ticketNumber: string | null) {
          setSavingCaseLink(true);
          try {
            const updated = await api.updateProject(p.id, { crm_case_id: caseId });
            setProject(updated);
            setCaseSearchResults([]);
            setCaseSearchQuery("");
            // Reload compliance data
            setCaseComplianceLoading(true);
            api.projectCaseCompliance(p.id)
              .then(setCaseCompliance)
              .catch(() => {})
              .finally(() => setCaseComplianceLoading(false));
            showToast(`Linked to case ${ticketNumber ?? caseId}`, "success");
          } catch {
            showToast("Failed to link case", "error");
          } finally {
            setSavingCaseLink(false);
          }
        }

        async function handleUnlinkCase() {
          if (!window.confirm("Unlink this case from the project?")) return;
          setSavingCaseLink(true);
          try {
            const updated = await api.updateProject(p.id, { crm_case_id: null });
            setProject(updated);
            setCaseCompliance(null);
            showToast("Case unlinked.", "success");
          } catch {
            showToast("Failed to unlink case", "error");
          } finally {
            setSavingCaseLink(false);
          }
        }

        async function handleLinkOpportunity(opportunityId: string, opportunityName: string) {
          setSavingCaseLink(true);
          try {
            const updated = await api.updateProject(p.id, { crm_opportunity_id: opportunityId });
            setProject(updated);
            setCaseComplianceLoading(true);
            api.projectCaseCompliance(p.id)
              .then(setCaseCompliance)
              .catch(() => {})
              .finally(() => setCaseComplianceLoading(false));
            showToast(`Linked to opportunity: ${opportunityName}`, "success");
          } catch {
            showToast("Failed to link opportunity", "error");
          } finally {
            setSavingCaseLink(false);
          }
        }

        async function handleUnlinkOpportunity() {
          if (!window.confirm("Unlink this opportunity?")) return;
          setSavingCaseLink(true);
          try {
            const updated = await api.updateProject(p.id, { crm_opportunity_id: null });
            setProject(updated);
            setCaseComplianceLoading(true);
            api.projectCaseCompliance(p.id)
              .then(setCaseCompliance)
              .catch(() => {})
              .finally(() => setCaseComplianceLoading(false));
            showToast("Opportunity unlinked.", "success");
          } catch {
            showToast("Failed to unlink opportunity", "error");
          } finally {
            setSavingCaseLink(false);
          }
        }

        // Compute hours totals
        const actualHours = (caseCompliance?.timeEntries ?? []).reduce((sum, e) => sum + (e.durationHours ?? 0), 0);
        const quotedExpected = caseCompliance?.quotedHours?.total_expected ?? null;
        // SOW hours: from the linked quote's am_sow field
        const sowQuote = caseCompliance?.sowQuote ?? null;
        const sowHours = sowQuote?.am_sow ?? null;
        const referenceHours = sowHours ?? quotedExpected;
        const pctUsed = referenceHours && referenceHours > 0 ? Math.round((actualHours / referenceHours) * 100) : null;
        const complianceColor = pctUsed == null ? "#94a3b8" : pctUsed > 110 ? "#d13438" : pctUsed > 90 ? "#ff8c00" : "#059669";

        return (
          <div style={{ display: "grid", gap: 16 }}>

            {/* ── CRM Links ── */}
            <div className="ms-section-card" style={{ padding: "16px 20px" }}>
              <div className="ms-section-title" style={{ marginBottom: 12 }}>CRM Links</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>

                {/* Case tile */}
                <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: "10px 12px", background: "#f8fafc" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Case</span>
                    {caseCompliance?.case && canEdit && (
                      <button className="ms-btn-ghost" style={{ fontSize: 11, color: "#94a3b8", padding: "1px 7px" }} disabled={savingCaseLink} onClick={handleUnlinkCase}>Unlink</button>
                    )}
                  </div>
                  {caseComplianceLoading ? (
                    <span style={{ fontSize: 13, color: "#94a3b8" }}>Loading…</span>
                  ) : caseCompliance?.case ? (
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 5, alignItems: "baseline" }}>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>Number</span>
                      <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: "#0891b2" }}>{caseCompliance.case.ticketNumber ?? "—"}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>Title</span>
                      <span style={{ fontSize: 13, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caseCompliance.case.title}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>Owner</span>
                      <span style={{ fontSize: 13, color: "#1e293b" }}>{caseCompliance.case.ownerName ?? "—"}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>Status</span>
                      <span className="ms-badge" style={{ fontSize: 11, width: "fit-content", background: caseStateColor[caseCompliance.case.statecode] + "1a", color: caseStateColor[caseCompliance.case.statecode], border: `1px solid ${caseStateColor[caseCompliance.case.statecode]}40` }}>
                        {caseCompliance.case.status}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: canEdit ? 10 : 0 }}>Not linked</div>
                      {canEdit && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <input
                            className="ms-input"
                            style={{ flex: "1 1 180px", minWidth: 0 }}
                            placeholder="Search by case # or keyword…"
                            value={caseSearchQuery}
                            onChange={(e) => setCaseSearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleCaseSearch(); }}
                          />
                          <button className="ms-btn-secondary" disabled={caseSearching || !caseSearchQuery.trim()} onClick={handleCaseSearch}>
                            {caseSearching ? "Searching…" : "Search"}
                          </button>
                        </div>
                      )}
                      {caseSearchResults.length > 0 && (
                        <div style={{ marginTop: 8, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, overflow: "hidden" }}>
                          {caseSearchResults.map((cs) => (
                            <div key={cs.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderBottom: "1px solid rgba(0,0,0,0.05)", background: "#fff" }}>
                              <div style={{ overflow: "hidden" }}>
                                <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 12, color: "#0891b2", marginRight: 8 }}>{cs.ticketNumber}</span>
                                <span style={{ fontSize: 12, color: "#1e293b" }}>{cs.title}</span>
                                <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>{cs.status}</span>
                              </div>
                              <button className="ms-btn-primary" style={{ fontSize: 11, padding: "3px 10px", flexShrink: 0, marginLeft: 8 }} disabled={savingCaseLink} onClick={() => handleLinkCase(cs.id, cs.ticketNumber)}>Link</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Opportunity tile — only visible once a case is linked */}
                {caseCompliance?.case && (
                  <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: "10px 12px", background: "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Opportunity</span>
                      {p.crm_opportunity_id && canEdit && (
                        <button className="ms-btn-ghost" style={{ fontSize: 11, color: "#94a3b8", padding: "1px 7px" }} disabled={savingCaseLink} onClick={handleUnlinkOpportunity}>Unlink</button>
                      )}
                    </div>
                    {p.crm_opportunity_id && sowQuote ? (
                      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 5, alignItems: "baseline" }}>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>Name</span>
                        <span style={{ fontSize: 13, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {(caseCompliance.accountOpportunities.find(o => o.opportunityid === p.crm_opportunity_id)?.name) ?? "—"}
                        </span>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>Status</span>
                        <span className="ms-badge" style={{ fontSize: 11, width: "fit-content", background: sowQuote.statecode === 2 ? "#05966926" : "rgba(0,0,0,0.06)", color: sowQuote.statecode === 2 ? "#059669" : "#64748b", border: "none" }}>
                          {sowQuote.stateLabel}
                        </span>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>SOW Hrs</span>
                        <span style={{ fontSize: 13, color: "#1e293b" }}>{sowQuote.am_sow != null ? String(sowQuote.am_sow) : "—"}</span>
                      </div>
                    ) : p.crm_opportunity_id && !sowQuote ? (
                      <div style={{ fontSize: 13, color: "#64748b" }}>Linked — no quote with SOW hours found.</div>
                    ) : (caseCompliance.accountOpportunities ?? []).length > 0 ? (
                      <>
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Select the opportunity this project was sold under:</div>
                        <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, overflow: "hidden" }}>
                          {caseCompliance.accountOpportunities.map((opp) => (
                            <div key={opp.opportunityid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderBottom: "1px solid rgba(0,0,0,0.05)", background: "#fff" }}>
                              <div style={{ overflow: "hidden" }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opp.name}</div>
                                {opp.estimatedclosedate && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>Close: {formatDate(opp.estimatedclosedate)}</div>}
                              </div>
                              {canEdit && (
                                <button className="ms-btn-primary" style={{ fontSize: 11, padding: "3px 10px", flexShrink: 0, marginLeft: 8 }} disabled={savingCaseLink} onClick={() => handleLinkOpportunity(opp.opportunityid, opp.name)}>Link</button>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: "#94a3b8" }}>No opportunities found for this account.</div>
                    )}
                  </div>
                )}

              </div>
            </div>

            {/* ── Hours Compliance ── */}
            {(referenceHours != null || actualHours > 0) && (
              <div className="ms-section-card">
                <div className="ms-section-title">Hours Compliance</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
                  {quotedExpected != null && (
                    <div className="ms-info-item">
                      <div className="ms-info-label">Estimated Hours (Labor Model)</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <div className="ms-info-value" style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{quotedExpected}</div>
                        {caseCompliance?.quotedHours?.total_low != null && caseCompliance?.quotedHours?.total_high != null && (
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>({caseCompliance.quotedHours.total_low}–{caseCompliance.quotedHours.total_high})</div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="ms-info-item">
                    <div className="ms-info-label">Hours Logged (CRM)</div>
                    <div className="ms-info-value" style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{actualHours.toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{(caseCompliance?.timeEntries ?? []).length} entries</div>
                  </div>
                  {pctUsed != null && (
                    <div className="ms-info-item">
                      <div className="ms-info-label">% of {sowHours != null ? "SOW" : "Estimate"} Used</div>
                      <div className="ms-info-value" style={{ fontSize: 22, fontWeight: 700, color: complianceColor }}>{pctUsed}%</div>
                      <div style={{ fontSize: 11, color: complianceColor, marginTop: 2 }}>
                        {pctUsed > 110 ? "Over budget" : pctUsed > 90 ? "Approaching limit" : "On track"}
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {pctUsed != null && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ height: 8, background: "rgba(0,0,0,0.06)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(pctUsed, 100)}%`, background: complianceColor, borderRadius: 4, transition: "width 0.3s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                      <span>0h</span>
                      <span>{referenceHours}h</span>
                    </div>
                  </div>
                )}

                {/* Workstream breakdown if labor model is available */}
                {quotedExpected != null && Object.keys(caseCompliance?.quotedHours?.final_hours ?? {}).length > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ fontSize: 12, color: "#64748b", cursor: "pointer", userSelect: "none" }}>Labor model breakdown by workstream</summary>
                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
                      {Object.entries(caseCompliance!.quotedHours!.final_hours).map(([ws, hrs]) => (
                        <div key={ws} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#f8fafc", borderRadius: 6, fontSize: 12 }}>
                          <span style={{ color: "#475569" }}>{ws.replace(/_/g, " ")}</span>
                          <span style={{ fontWeight: 600, color: "#1e293b" }}>{hrs}h</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* ── Time Entries ── */}
            {caseCompliance?.case && (
              <div className="ms-section-card">
                <div className="ms-section-title">
                  Time Entries
                  <span style={{ fontWeight: 400, fontSize: 12, color: "#94a3b8", marginLeft: 8 }}>{(caseCompliance.timeEntries ?? []).length} entries</span>
                </div>
                {(caseCompliance.timeEntries ?? []).length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
                    No time entries found on this case in Dynamics 365.
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                          <th style={{ textAlign: "left", padding: "6px 10px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</th>
                          <th style={{ textAlign: "left", padding: "6px 10px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Resource</th>
                          <th style={{ textAlign: "left", padding: "6px 10px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Description / Cost Code</th>
                          <th style={{ textAlign: "right", padding: "6px 10px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Hours</th>
                          <th style={{ textAlign: "left", padding: "6px 10px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caseCompliance.timeEntries.map((entry) => (
                          <tr key={entry.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                            <td style={{ padding: "8px 10px", color: "#475569", whiteSpace: "nowrap" }}>{entry.date ? formatDate(entry.date) : "—"}</td>
                            <td style={{ padding: "8px 10px", color: "#1e293b", fontWeight: 500, whiteSpace: "nowrap" }}>{entry.resourceName ?? "—"}</td>
                            <td style={{ padding: "8px 10px", color: "#64748b", maxWidth: 380 }}>{entry.description ?? "—"}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#1e293b" }}>{entry.durationHours?.toFixed(2) ?? "—"}</td>
                            <td style={{ padding: "8px 10px" }}>
                              {entry.entryStatus && (
                                <span className="ms-badge" style={{ fontSize: 11, background: entry.entryStatus === "Completed" ? "#05966926" : "rgba(0,0,0,0.06)", color: entry.entryStatus === "Completed" ? "#059669" : "#64748b", border: "none" }}>
                                  {entry.entryStatus}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid rgba(0,0,0,0.08)" }}>
                          <td colSpan={3} style={{ padding: "8px 10px", fontSize: 12, color: "#94a3b8" }}>Total logged</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#1e293b" }}>{actualHours.toFixed(2)}h</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

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
      {/* ── Time Entry Modal ──────────────────────────────────────────────── */}
      {timeEntryTask && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setTimeEntryTask(null); }}>
          <div className="ms-modal" style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Log Time</h2>
              <button onClick={() => setTimeEntryTask(null)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16, fontWeight: 500 }}>{timeEntryTask.title}</div>

            {timeEntryLoadingSetup ? (
              <div style={{ color: "#64748b", fontSize: 13, padding: "16px 0" }}>Loading CRM data…</div>
            ) : !timeEntrySetup?.case_id || !timeEntrySetup?.job_id ? (
              <div style={{ color: "#d13438", fontSize: 13, padding: "8px 0" }}>
                {!timeEntrySetup ? "Could not load CRM data." : "This project has no CRM case or job linked. Time entries cannot be submitted."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {/* Date */}
                <label className="ms-label">
                  <span>Date</span>
                  <input type="date" className="ms-input" value={timeEntryForm.date} onChange={(e) => setTimeEntryForm((f) => ({ ...f, date: e.target.value }))} />
                </label>

                {/* Start / End time */}
                <div>
                  <span className="ms-label" style={{ display: "block", marginBottom: 6 }}><span>Time</span></span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="time" className="ms-input" style={{ flex: 1 }} value={timeEntryForm.startTime} onChange={(e) => setTimeEntryForm((f) => ({ ...f, startTime: e.target.value }))} />
                    <span style={{ color: "#94a3b8", fontSize: 13 }}>→</span>
                    <input type="time" className="ms-input" style={{ flex: 1 }} value={timeEntryForm.endTime} onChange={(e) => setTimeEntryForm((f) => ({ ...f, endTime: e.target.value }))} />
                    {timeEntryForm.startTime && timeEntryForm.endTime && (() => {
                      const [sh, sm] = timeEntryForm.startTime.split(":").map(Number);
                      const [eh, em] = timeEntryForm.endTime.split(":").map(Number);
                      const mins = (eh * 60 + em) - (sh * 60 + sm);
                      if (mins <= 0) return null;
                      const h = Math.floor(mins / 60), m = mins % 60;
                      return <span style={{ fontSize: 12, color: "#0891b2", fontWeight: 600, whiteSpace: "nowrap" }}>{h > 0 ? `${h}h ` : ""}{m > 0 ? `${m}m` : ""}</span>;
                    })()}
                  </div>
                </div>

                {/* Pay Code */}
                <label className="ms-label">
                  <span>Pay Code</span>
                  <select className="ms-input" value={timeEntryForm.payCodeId} onChange={(e) => setTimeEntryForm((f) => ({ ...f, payCodeId: e.target.value }))}>
                    <option value="">— Select —</option>
                    {timeEntrySetup.pay_codes.map((pc) => (
                      <option key={pc.amc_paycodeid} value={pc.amc_paycodeid}>{pc.amc_name}</option>
                    ))}
                  </select>
                </label>

                {/* Cost Code (optional) */}
                {timeEntrySetup.cost_codes.length > 0 && (
                  <div style={{ display: "grid", gap: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#475569" }}>
                      <input type="checkbox" checked={timeEntryForm.useCostCode} onChange={(e) => setTimeEntryForm((f) => ({ ...f, useCostCode: e.target.checked, costCodeId: "" }))} />
                      Include cost code
                    </label>
                    {timeEntryForm.useCostCode && (
                      <select className="ms-input" value={timeEntryForm.costCodeId} onChange={(e) => setTimeEntryForm((f) => ({ ...f, costCodeId: e.target.value }))}>
                        <option value="">— Select cost code —</option>
                        {timeEntrySetup.cost_codes.map((cc) => (
                          <option key={cc.amc_costcodeid} value={cc.amc_costcodeid}>{cc.amc_name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button
                    className="ms-btn-primary"
                    style={{ flex: 1 }}
                    disabled={submittingTimeEntry || !timeEntryForm.date || !timeEntryForm.startTime || !timeEntryForm.endTime || !timeEntryForm.payCodeId || (timeEntryForm.useCostCode && !timeEntryForm.costCodeId)}
                    onClick={async () => {
                      if (!project || !timeEntryTask || !timeEntrySetup?.case_id || !timeEntrySetup?.job_id) return;
                      setSubmittingTimeEntry(true);
                      try {
                        // Build ISO datetimes from local date + time (treat as UTC for submission)
                        const start = `${timeEntryForm.date}T${timeEntryForm.startTime}:00Z`;
                        const end = `${timeEntryForm.date}T${timeEntryForm.endTime}:00Z`;
                        const updated = await api.completeTaskWithTimeEntry(project.id, timeEntryTask.id, {
                          scheduled_start: start,
                          scheduled_end: end,
                          pay_code_id: timeEntryForm.payCodeId,
                          cost_code_id: timeEntryForm.useCostCode ? timeEntryForm.costCodeId || null : null,
                          case_id: timeEntrySetup.case_id!,
                          job_id: timeEntrySetup.job_id!,
                          account_id: timeEntrySetup.account_id ?? null,
                        });
                        setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t));
                        setTimeEntryTask(null);
                        showToast("Time entry submitted to CRM.", "success");
                      } catch (err) {
                        showToast(err instanceof Error ? err.message : "Failed to submit time entry", "error");
                      } finally {
                        setSubmittingTimeEntry(false);
                      }
                    }}
                  >
                    {submittingTimeEntry ? "Submitting…" : "Complete Task & Submit to CRM"}
                  </button>
                  <button className="ms-btn-secondary" onClick={() => setTimeEntryTask(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* ── Link Solution Modal ──────────────────────────────────────────── */}
      {showLinkSolutionModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowLinkSolutionModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 480, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Link to Solution</h2>
              <button onClick={() => setShowLinkSolutionModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
              <label className="ms-label">
                <span>Solution</span>
                <select className="ms-input" value={linkSolutionId} onChange={(e) => setLinkSolutionId(e.target.value)}>
                  <option value="">— Select a solution —</option>
                  {allSolutions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.customer_name ? ` — ${s.customer_name}` : ""}</option>
                  ))}
                </select>
              </label>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Associates this project with a solutioning record for lifecycle tracking. Existing project data will not be overwritten.</p>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <button
                className="ms-btn-primary"
                disabled={!linkSolutionId || linkingSolution}
                onClick={async () => {
                  if (!linkSolutionId || !project) return;
                  setLinkingSolution(true);
                  try {
                    await api.linkProjectToSolution(linkSolutionId, project.id);
                    const updatedChain = await api.projectChain(project.id);
                    setChain(updatedChain);
                    setShowLinkSolutionModal(false);
                    showToast("Linked to solution.", "success");
                  } catch {
                    showToast("Failed to link solution", "error");
                  } finally {
                    setLinkingSolution(false);
                  }
                }}
              >
                {linkingSolution ? "Linking…" : "Link Solution"}
              </button>
              <button className="ms-btn-secondary" onClick={() => setShowLinkSolutionModal(false)}>Cancel</button>
            </div>
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
                <select className="ms-input" value={addStaffRole} onChange={(e) => { setAddStaffRole(e.target.value); setAddStaffUserId(""); }}>
                  <option value="">— Select role —</option>
                  <option value="engineer">Implementation Engineer</option>
                  <option value="pm">Project Manager</option>
                </select>
              </label>
              <label className="ms-label">
                <span>Team Member</span>
                <select className="ms-input" value={addStaffUserId} onChange={(e) => setAddStaffUserId(e.target.value)}>
                  <option value="">— Select team member —</option>
                  {users.filter((u) => {
                    if (addStaffRole === "pm") return u.role === "pm";
                    if (addStaffRole === "engineer") return u.role === "pf_engineer";
                    if (addStaffRole === "ae")  return u.role === "pf_ae";
                    if (addStaffRole === "sa")  return u.role === "pf_sa";
                    if (addStaffRole === "csm") return u.role === "pf_csm";
                    return true;
                  }).map((u) => (
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

import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  type CaseComplianceData,
  type Document,
  type DynamicsContact,
  type Note,
  type Phase,
  type Stage,
  type Project,
  type ProjectContact,
  type ProjectStaffMember,
  type Risk,
  type SupportCase,
  type Task,
  type StageTimeEntry,
  type User,
  type ZoomRecording,
  type ZoomRecordingSuggestion,
  type ZoomRecordingFile,
} from "../lib/api";
import ProjectTimeline from "../components/timeline/ProjectTimeline";
import TimelineBuilder from "../components/timeline/TimelineBuilder";
import ProjectDashboardTab from "../components/project/ProjectDashboardTab";
import ExternalResourcesTab from "../components/project/ExternalResourcesTab";
import ShipmentsPane from "../components/project/ShipmentsPane";
import PhasesPanel from "../components/project/PhasesPanel";
import StatusMeetingPanel from "../components/project/StatusMeetingPanel";
import ProjectDocuments from "../components/documents/ProjectDocuments";
import ZoomTab from "../components/zoom/ZoomTab";
import RingCentralTab from "../components/ringcentral/RingCentralTab";
import SharePointDocs from "../components/sharepoint/SharePointDocs";
import { SolutionTypePills } from "../components/ui/SolutionTypePills";
import { SolutionTypePicker } from "../components/ui/SolutionTypePicker";
import { SolutionTypeFilterPills } from "../components/ui/SolutionTypeFilterPills";
import { parseSolutionTypes, parseTaggedTitle, SOLUTION_TYPES, SOLUTION_TYPE_COLORS, SOLUTION_TYPE_LABELS, type SolutionType } from "../../shared/solutionTypes";
import { VENDOR_OPTIONS, vendorLabel } from "../../shared/vendors";
import MeetingPrepCard from "../components/meetingPrep/MeetingPrepCard";
import { useToast } from "../components/ui/ToastProvider";
import { humanize } from "../lib/format";
import CascadeModal from "../components/project/CascadeModal";

type DetailTab = "dashboard" | "overview" | "timeline" | "builder" | "tasks" | "blockers" | "documents" | "sharepoint" | "activity" | "zoom" | "case" | "external";

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

// Contact role classification — split the otherwise-flat project_contacts
// rows into Customer-side and Partner/Provider-side sections in the UI.
// Partner roles are the small list; everything else (including null role
// and "Other") falls into the Customer section by default.
const CUSTOMER_CONTACT_ROLES = [
  "Customer Project Manager",
  "Technical Contact",
  "Executive Sponsor",
  "Billing Contact",
  "End User Champion",
  "Other",
];
const PARTNER_CONTACT_ROLES = [
  "Porting Coordinator",
];
const isPartnerContactRole = (role: string | null | undefined): boolean =>
  Boolean(role) && PARTNER_CONTACT_ROLES.includes(role as string);
const RISK_COLOR: Record<string, string> = {
  open: "#d13438",
  mitigated: "#ff8c00",
  closed: "#059669",
};
function formatDate(d: string | null) {
  if (!d) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T00:00:00" : d;
  return new Date(normalized).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Badge({ label, color, style }: { label: string; color: string; style?: React.CSSProperties }) {
  return (
    <span className="ms-badge" style={{ background: color + "1a", color, border: `1px solid ${color}40`, ...style }}>
      {label}
    </span>
  );
}

// Inline contact-method icons used inside team chips in the project meta
// section. Each populated method renders as its own clickable link so users
// can see at a glance which contact paths are available (and one click is
// enough to invoke any of them). Falls back to render nothing when a user
// has no contact info on file.
function ContactIcons({ email, phone, schedulerUrl, accent }: {
  email?: string | null;
  phone?: string | null;
  schedulerUrl?: string | null;
  accent: string;
}) {
  if (!email && !phone && !schedulerUrl) return null;
  const iconStyle: React.CSSProperties = {
    color: "#94a3b8",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    borderRadius: 4,
    textDecoration: "none",
    transition: "color 0.1s, background 0.1s",
  };
  const hoverIn  = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = accent; e.currentTarget.style.background = "rgba(0,0,0,0.04)"; };
  const hoverOut = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "transparent"; };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 1, marginLeft: 4 }}>
      {email && (
        <a href={`mailto:${email}`} title={`Email ${email}`} style={iconStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut} aria-label={`Email ${email}`}>
          <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor"><path d="M2 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Zm1 .5 5 3 5-3V4H3v.5Zm10 1.2L8.3 8.5a1 1 0 0 1-1.1 0L3 5.7V12h10V5.7Z"/></svg>
        </a>
      )}
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} title={`Call ${phone}`} style={iconStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut} aria-label={`Call ${phone}`}>
          <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor"><path d="M3.7 1.2a1.5 1.5 0 0 1 1.6.2L7 3.1c.5.4.7 1.1.4 1.7L6.7 6.2a8 8 0 0 0 3.1 3.1l1.4-.7c.6-.3 1.3-.1 1.7.4l1.7 1.7a1.5 1.5 0 0 1 .2 1.6c-.5 1-1.5 1.7-2.6 1.7C7.7 14 2 8.3 2 3.4c0-1.1.6-2.1 1.7-2.6Z"/></svg>
        </a>
      )}
      {schedulerUrl && (
        <a href={schedulerUrl} target="_blank" rel="noopener noreferrer" title="Schedule a meeting" style={iconStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut} aria-label="Schedule a meeting">
          <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor"><path d="M5 1.5a.5.5 0 0 1 1 0V3h4V1.5a.5.5 0 0 1 1 0V3h1.5A1.5 1.5 0 0 1 14 4.5v9A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-9A1.5 1.5 0 0 1 3.5 3H5V1.5ZM3 6v7.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V6H3Z"/></svg>
        </a>
      )}
    </span>
  );
}

// Phase tab picker — rendered above Tasks + Timeline on multi-phase
// projects. "Initiate" is a synthetic tab for the shared (phase_id IS
// NULL) stages; the rest are phase rows in display_order.
function PhasePicker({
  phases, hasSharedStages, selected, onSelect,
}: {
  phases: Phase[];
  hasSharedStages: boolean;
  selected: string;
  onSelect: (v: string) => void;
}) {
  const tab = (key: string, label: string) => {
    const active = key === selected;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onSelect(key)}
        style={{
          padding: "5px 14px",
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 999,
          border: `1px solid ${active ? "#0078d4" : "#cbd5e1"}`,
          background: active ? "#0078d4" : "#fff",
          color: active ? "#fff" : "#475569",
          cursor: "pointer",
          transition: "background 0.1s, color 0.1s, border-color 0.1s",
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
      {hasSharedStages && tab("shared", "Initiate")}
      {phases.map((p) => tab(p.id, p.name))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  // Multi-phase projects (phases.length >= 2) render a phase picker above
  // Tasks + Timeline; the picker filters by phase. Selection uses "shared"
  // for the Initiate (phase_id IS NULL) view, or the phase row's id.
  const [phases, setPhases] = useState<Phase[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>("");
  const [risks, setRisks] = useState<Risk[]>([]);
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [crmContacts, setCrmContacts] = useState<DynamicsContact[]>([]);
  const [crmContactsLoading, setCrmContactsLoading] = useState(false);
  const [contactModalTab, setContactModalTab] = useState<"crm" | "manual">("crm");
  const [contactSide, setContactSide] = useState<"customer" | "partner">("customer");
  const [contactRole, setContactRole] = useState("");
  const [manualContact, setManualContact] = useState({ name: "", email: "", phone: "", job_title: "" });
  const [savingContact, setSavingContact] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tab, setTab] = useState<DetailTab>("dashboard");
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTech, setEditingTech] = useState(false);
  const [editSolutionTypes, setEditSolutionTypes] = useState<SolutionType[]>([]);
  // Captured at Edit-open so the Save flow can detect removed solution
  // types and offer to clean up tasks tagged with them.
  const [originalSolutionTypes, setOriginalSolutionTypes] = useState<SolutionType[]>([]);
  // Solution-type cleanup confirm state. Non-null while the modal is open;
  // captures the delete/retag counts so the dialog can display them. MUST
  // live up here with the other useStates — declaring it down by
  // saveEditTech would put it AFTER the loading/error/no-project early
  // returns and trip React error #310 (hooks order mismatch).
  const [solutionCleanup, setSolutionCleanup] = useState<{ removed: SolutionType[]; deleteCount: number; retagCount: number } | null>(null);
  const [editVendor, setEditVendor] = useState("");
  const [savingTech, setSavingTech] = useState(false);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newNoteVisibility, setNewNoteVisibility] = useState<"internal" | "partner" | "public">("internal");
  const [savingNote, setSavingNote] = useState(false);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);

  // Time is logged per STAGE (one Log Time action per stage group), not per task.
  const [timeEntryStage, setTimeEntryStage] = useState<Stage | null>(null);
  // Stage whose logged time entries are being viewed/managed in the list popup.
  const [viewEntriesStage, setViewEntriesStage] = useState<Stage | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  // PM-initiated date cascade — which task is the shift anchor (null = closed).
  const [cascadeFromTask, setCascadeFromTask] = useState<Task | null>(null);
  const [timeEntrySetup, setTimeEntrySetup] = useState<import("../lib/api").TimeEntrySetup | null>(null);
  const [timeEntryLoadingSetup, setTimeEntryLoadingSetup] = useState(false);
  const [timeEntryForm, setTimeEntryForm] = useState({ date: "", startTime: "", endTime: "", payCodeId: "", costCodeId: "", note: "" });
  const [submittingTimeEntry, setSubmittingTimeEntry] = useState(false);
  const [stageTimeEntries, setStageTimeEntries] = useState<Record<string, StageTimeEntry[]>>({});
  // Project-scoped solution-type filter — shared between Gantt and the Tasks tab via localStorage.
  // Stored as an array of canonical types; persisted per project id.
  const [selectedTypes, setSelectedTypes] = useState<Set<SolutionType>>(() => new Set(SOLUTION_TYPES));

  // Inline-create state for the Tasks table — stageId currently being added to + the typed title
  const [newTaskStageId, setNewTaskStageId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  // When the Tasks-page assignee dropdown opens the contact modal via "+ Add new contact",
  // remember which task to auto-assign the newly-created contact to.
  const [assignNewContactToTaskId, setAssignNewContactToTaskId] = useState<string | null>(null);

  const [showRiskModal, setShowRiskModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [riskForm, setRiskForm] = useState({ title: "", description: "", severity: "medium", status: "open", owner_user_id: "", owner_contact_id: "", task_id: "" });
  const [savingRisk, setSavingRisk] = useState(false);

  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [projectStaff, setProjectStaff] = useState<ProjectStaffMember[]>([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [addPartnerUserId, setAddPartnerUserId] = useState("");
  const [addingPartner, setAddingPartner] = useState(false);
  // "existing" picks a partner_ae user already in the system; "new" invites a
  // net-new partner AE (name + email → created + invited as a partner_ae user).
  const [partnerMode, setPartnerMode] = useState<"existing" | "new">("existing");
  const [newPartnerName, setNewPartnerName] = useState("");
  const [newPartnerEmail, setNewPartnerEmail] = useState("");
  const [newPartnerOrg, setNewPartnerOrg] = useState("");

  // Edit project meta — rename + (re)link a CRM customer. Staff-only.
  const [showEditMeta, setShowEditMeta] = useState(false);
  const [metaName, setMetaName] = useState("");
  const [metaOnHold, setMetaOnHold] = useState(false);
  const [metaCrmQuery, setMetaCrmQuery] = useState("");
  const [metaCrmResults, setMetaCrmResults] = useState<{ id: string; name: string }[]>([]);
  const [metaCrmSearching, setMetaCrmSearching] = useState(false);
  const [metaPickedAccount, setMetaPickedAccount] = useState<{ id: string; name: string } | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Zoom recordings
  const [recordings, setRecordings] = useState<ZoomRecording[]>([]);
  const [syncingSuggestions, setSyncingSuggestions] = useState(false);
  const [syncSuggestions, setSyncSuggestions] = useState<ZoomRecordingSuggestion[] | null>(null);
  const [confirmingRecordings, setConfirmingRecordings] = useState(false);
  const [suggestionStageOverrides, setSuggestionStageOverrides] = useState<Record<number, string | null>>({});
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [suggestionTaskOverrides, setSuggestionTaskOverrides] = useState<Record<number, string | null>>({});

  const [addStaffUserId, setAddStaffUserId] = useState("");
  const [addStaffRole, setAddStaffRole] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffPhotoMap, setStaffPhotoMap] = useState<Record<string, string | null>>({});
  const [customerTeamPhotoMap, setCustomerTeamPhotoMap] = useState<Record<string, string | null>>({});

  // CRM case compliance
  const [caseCompliance, setCaseCompliance] = useState<CaseComplianceData | null>(null);
  const [caseComplianceLoading, setCaseComplianceLoading] = useState(false);
  const [caseSearchQuery, setCaseSearchQuery] = useState("");
  const [caseSearchResults, setCaseSearchResults] = useState<SupportCase[]>([]);
  const [caseSearching, setCaseSearching] = useState(false);
  const [savingCaseLink, setSavingCaseLink] = useState(false);
  // Opportunity picker can be long (some accounts have 100+); preview a subset
  // with a "show more" toggle.
  const [showAllOpps, setShowAllOpps] = useState(false);

  // Apply template

  // Manual stage creation
  const [newStageName, setNewStageName] = useState("");
  const [creatingStage, setCreatingStage] = useState(false);
  const [showNewStageInput, setShowNewStageInput] = useState(false);

  const { showToast } = useToast();

  // Solution types actually present in this project's tasks (from [Tag] title prefixes)
  const availableTypes = useMemo<SolutionType[]>(() => {
    const present = new Set<SolutionType>();
    for (const t of tasks) {
      for (const tag of parseTaggedTitle(t.title).types) present.add(tag);
    }
    return SOLUTION_TYPES.filter((s) => present.has(s));
  }, [tasks]);

  // Untagged tasks always pass; tagged tasks pass if any of their tags is selected.
  // Safety: empty selectedTypes is treated as "no filter active" so tasks aren't
  // silently invisible when localStorage gets into a stuck-empty state (or the
  // user toggled all pills off and now can't toggle them back because they're
  // hidden on a single-type project).
  const taskMatchesTypeFilter = (task: Task): boolean => {
    if (selectedTypes.size === 0) return true;
    const { types } = parseTaggedTitle(task.title);
    if (types.length === 0) return true;
    return types.some((t) => selectedTypes.has(t));
  };

  // Strip the [Tag] prefix for cleaner display in lists/charts
  const taskDisplayTitle = (task: Task): string => parseTaggedTitle(task.title).rawTitle || task.title;

  const toggleSolutionType = (type: SolutionType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      // Persist inline so we don't race against the hydration useEffect on initial mount
      if (project) {
        window.localStorage.setItem(`cloudconnect:project:typeFilter:${project.id}`, JSON.stringify([...next]));
      }
      return next;
    });
  };

  const filteredTasks = useMemo(() => tasks.filter(taskMatchesTypeFilter), [tasks, selectedTypes]);

  // Curated assignee picker — Tasks page dropdowns pull from the project's PF staff
  // (PM/AE/SA/CSM/IE/partner AE) + project contacts (customer & partner-side, incl. porting).
  // Drops the global users list so PMs aren't paging through every account.
  const ASSIGNEE_ROLE_LABEL: Record<string, string> = {
    pm: "PM", ae: "AE", sa: "SA", csm: "CSM", ie: "IE", engineer: "IE", partner_ae: "Partner AE",
  };
  const projectStaffUnique = useMemo(() => {
    // Same user can appear under multiple staff_roles — keep the first seen.
    const seen = new Set<string>();
    return projectStaff.filter((s) => {
      if (seen.has(s.user_id)) return false;
      seen.add(s.user_id);
      return true;
    });
  }, [projectStaff]);
  function assigneeLabelForUser(userId: string): string {
    const staff = projectStaffUnique.find((s) => s.user_id === userId);
    if (staff) return `${staff.name ?? staff.email} · ${ASSIGNEE_ROLE_LABEL[staff.staff_role] ?? staff.staff_role}`;
    // Stale: user once assigned, no longer on project — keep visible so the data isn't silently lost
    const u = users.find((x) => x.id === userId);
    return u ? `${u.name ?? u.email} · (off project)` : "(unknown user)";
  }

  // Multi-phase project detection drives the phase-picker visibility on
  // Tasks + Timeline. Single-phase projects (the default after PR E2's
  // unification) render no picker — there's only one phase to look at.
  const multiPhase = phases.length >= 2;
  const hasSharedStages = useMemo(() => stages.some((s) => s.phase_id === null), [stages]);
  const phasePickerLsKey = id ? `cloudconnect:project:selectedPhase:${id}` : null;

  // Initialize / repair selectedPhaseId when phases load (or change). Falls
  // back to "shared" (Initiate tab) if shared stages exist, else the first
  // phase row. Persisted choice wins as long as it still references a live
  // phase.
  useEffect(() => {
    if (!multiPhase) return;
    if (phases.length === 0) return;
    const phaseIds = new Set(phases.map((p) => p.id));
    const persisted = phasePickerLsKey ? localStorage.getItem(phasePickerLsKey) : null;
    const isValid = (v: string) => v === "shared" ? hasSharedStages : phaseIds.has(v);
    if (selectedPhaseId && isValid(selectedPhaseId)) return;
    if (persisted && isValid(persisted)) {
      setSelectedPhaseId(persisted);
      return;
    }
    setSelectedPhaseId(hasSharedStages ? "shared" : phases[0].id);
  }, [multiPhase, phases, hasSharedStages, selectedPhaseId, phasePickerLsKey]);

  useEffect(() => {
    if (!phasePickerLsKey || !selectedPhaseId) return;
    try { localStorage.setItem(phasePickerLsKey, selectedPhaseId); } catch { /* private mode etc. */ }
  }, [phasePickerLsKey, selectedPhaseId]);

  // Stages filtered to the selected phase for Tasks + Timeline tabs.
  // Single-phase projects skip the filter entirely.
  const visibleStages = useMemo(() => {
    if (!multiPhase) return stages;
    if (selectedPhaseId === "shared") return stages.filter((s) => s.phase_id === null);
    if (!selectedPhaseId) return stages;
    return stages.filter((s) => s.phase_id === selectedPhaseId);
  }, [stages, multiPhase, selectedPhaseId]);

  // Tasks restricted to the visible stages — so the Timeline's internal
  // datedTasks / summary / date-bounds math doesn't include tasks from
  // hidden phases.
  const visibleStageIds = useMemo(() => new Set(visibleStages.map((s) => s.id)), [visibleStages]);
  const visibleTasks = useMemo(
    () => multiPhase ? tasks.filter((t) => t.stage_id !== null && visibleStageIds.has(t.stage_id)) : tasks,
    [tasks, multiPhase, visibleStageIds]
  );

  const groupedTasks = useMemo(
    () => visibleStages.map((stage) => ({ stage, tasks: filteredTasks.filter((t) => t.stage_id === stage.id) })),
    [visibleStages, filteredTasks]
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
        const [projectData, stageData, taskData, riskData, noteData, userData, docData, staffData, meData] =
          await Promise.all([
            api.project(id), api.stages(id), api.tasks(id),
            api.risks(id), api.notes(id), api.users().catch(() => [] as User[]), api.documents(id),
            api.projectStaff(id),
            api.me(),
          ]);
        api.projectContacts(id).then(setContacts).catch(() => {});
        setProject(projectData);
        api.phases(id).then(setPhases).catch(() => {});
        api.zoomRecordings(id).then(setRecordings).catch(() => {});
        setProjectStaff(staffData);
        // Auto-sync from CRM in the background so the Account Team chips
        // are populated on first paint instead of waiting for a manual
        // "Sync CRM" click. Fire-and-forget — failures are silent (the
        // page still works with stored data) and the page renders
        // immediately with what's already cached on the project row.
        if (projectData.dynamics_account_id) {
          api.projectCrmSync(id)
            .then(({ staff: freshStaff, project: updatedProject }) => {
              setProjectStaff(freshStaff);
              if (updatedProject) setProject((p) => p ? { ...p, ...updatedProject } : updatedProject);
              // If CRM filled in new customer-team emails, fetch their photos too.
              const refreshedEmails = [
                updatedProject?.customer_pf_ae_email,
                updatedProject?.customer_pf_sa_email,
                updatedProject?.customer_pf_csm_email,
              ].filter(Boolean) as string[];
              if (refreshedEmails.length > 0) {
                api.staffPhotos(refreshedEmails).then(setCustomerTeamPhotoMap).catch(() => {});
              }
            })
            .catch(() => { /* CRM unreachable / token expired — keep stored values */ });
        }
        if (staffData.length > 0) {
          const emails = staffData.map((s: { email: string }) => s.email);
          api.staffPhotos(emails).then(setStaffPhotoMap).catch(() => {});
        }
        // Fetch photos for customer PF team
        const customerEmails = [projectData.customer_pf_ae_email, projectData.customer_pf_sa_email, projectData.customer_pf_csm_email].filter(Boolean) as string[];
        if (customerEmails.length > 0) {
          api.staffPhotos(customerEmails).then(setCustomerTeamPhotoMap).catch(() => {});
        }
        setStages(stageData);
        setTasks(taskData);
        // Load time entries for all stages (time is logged per stage, not per task).
        if (stageData.length > 0) {
          Promise.all(stageData.map((s) => api.getStageTimeEntries(id, s.id).then((entries) => ({ id: s.id, entries })).catch(() => ({ id: s.id, entries: [] }))))
            .then((results) => setStageTimeEntries(Object.fromEntries(results.map((r) => [r.id, r.entries]))));
        }
        setRisks(riskData);
        setNotes(noteData);
        setUsers(userData);
        setDocuments(docData);
        setCurrentUserRole(meData.role);
        setCurrentUserId(meData.user.id);

        const tabParam = searchParams.get("tab") as DetailTab | null;
        if (tabParam) setTab(tabParam);

      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load project");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Load case compliance data when the case tab is opened
  useEffect(() => {
    if (tab !== "case" || !project?.id) return;
    setCaseComplianceLoading(true);
    api.projectCaseCompliance(project.id)
      .then(setCaseCompliance)
      .catch(() => setCaseCompliance(null))
      .finally(() => setCaseComplianceLoading(false));
  }, [tab, project?.id]);

  // Persist solution-type filter per project (shared by Gantt + Tasks table)
  useEffect(() => {
    if (!project) return;
    const raw = window.localStorage.getItem(`cloudconnect:project:typeFilter:${project.id}`);
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSelectedTypes(new Set(parsed.filter((s): s is SolutionType => typeof s === "string" && (SOLUTION_TYPES as readonly string[]).includes(s))));
      }
    } catch {
      /* ignore — fall back to default all-on */
    }
  }, [project?.id]);

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading project...</div>;
  if (error) return <div style={{ color: "#d13438", padding: 32 }}>Error: {error}</div>;
  if (!project) return <div style={{ color: "#64748b", padding: 32 }}>Project not found.</div>;

  const canEdit = currentUserRole === "admin" || currentUserRole === "pm";
  // IEs staffed on this project can manage its tasks (assign + complete + edit),
  // mirrored server-side. Scoped to engineers actually on the project_staff list.
  const isStaffedEngineer = currentUserRole === "pf_engineer" && projectStaff.some((s) => s.user_id === currentUserId);
  const canManageTasks = canEdit || isStaffedEngineer;

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Project-level Save was retired with the Project Settings card — status
  // is auto-derived and target_go_live_date follows the canonical go-live
  // task. handleSaveProject and its surrounding state intentionally
  // removed.

  function startEditTech() {
    if (!project) return;
    setEditSolutionTypes(parseSolutionTypes(project.solution_types));
    setOriginalSolutionTypes(parseSolutionTypes(project.solution_types));
    setEditVendor(project.vendor ?? "");
    setEditingTech(true);
  }

  type CleanupSummary = { removed: SolutionType[]; deleteCount: number; retagCount: number };

  /** Compute how many project tasks would be deleted / re-tagged if the
   *  given solution types were removed. Stays entirely client-side so the
   *  Edit Save flow doesn't add a server round-trip when there's nothing
   *  to clean up. */
  function previewSolutionCleanup(removed: SolutionType[]): CleanupSummary {
    if (removed.length === 0) return { removed, deleteCount: 0, retagCount: 0 };
    const removedSet = new Set(removed);
    let deleteCount = 0;
    let retagCount = 0;
    for (const t of tasks) {
      const parsed = parseTaggedTitle(t.title);
      if (parsed.types.length === 0) continue;
      const surviving = parsed.types.filter((tp) => !removedSet.has(tp));
      if (surviving.length === 0) deleteCount++;
      else if (surviving.length !== parsed.types.length) retagCount++;
    }
    return { removed, deleteCount, retagCount };
  }

  async function persistEditTech(includeCleanup: boolean) {
    if (!project) return;
    setSavingTech(true);
    try {
      const payload: Parameters<typeof api.updateProject>[1] = {
        vendor: editVendor || null,
        solution_types: editSolutionTypes,
      };
      if (includeCleanup && solutionCleanup && solutionCleanup.removed.length > 0) {
        payload.cleanup_solution_types = solutionCleanup.removed;
      }
      const updated = await api.updateProject(project.id, payload);
      // Merge so joined fields (account team, customer/SharePoint) survive.
      setProject((prev) => prev ? { ...prev, ...updated } : updated);
      setEditingTech(false);
      setSolutionCleanup(null);
      if (includeCleanup && solutionCleanup) {
        const parts: string[] = [];
        if (solutionCleanup.deleteCount > 0) parts.push(`${solutionCleanup.deleteCount} deleted`);
        if (solutionCleanup.retagCount > 0) parts.push(`${solutionCleanup.retagCount} re-tagged`);
        showToast(`Project details updated; tasks: ${parts.join(", ")}.`, "success");
        // Reload tasks since the cleanup may have removed or re-tagged some.
        const newTasks = await api.tasks(project.id);
        setTasks(newTasks);
      } else {
        showToast("Project details updated.", "success");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update project details", "error");
    } finally {
      setSavingTech(false);
    }
  }

  function openEditMeta() {
    if (!project) return;
    setMetaName(project.name ?? "");
    setMetaOnHold(project.on_hold === 1);
    setMetaCrmQuery(project.customer_name ?? "");
    setMetaCrmResults([]);
    setMetaPickedAccount(null);
    setShowEditMeta(true);
  }

  async function handleMetaCrmSearch(q: string) {
    setMetaCrmQuery(q);
    setMetaPickedAccount(null);
    if (q.trim().length < 2) { setMetaCrmResults([]); return; }
    setMetaCrmSearching(true);
    try {
      const results = await api.searchDynamicsAccounts(q);
      setMetaCrmResults(results.map((r) => ({ id: r.accountid, name: r.name })));
    } catch {
      setMetaCrmResults([]);
    } finally {
      setMetaCrmSearching(false);
    }
  }

  async function saveMeta() {
    if (!project) return;
    const payload: Parameters<typeof api.updateProject>[1] = {};
    const trimmedName = metaName.trim();
    if (trimmedName && trimmedName !== project.name) payload.name = trimmedName;
    if (metaOnHold !== (project.on_hold === 1)) payload.on_hold = metaOnHold ? 1 : 0;
    if (metaPickedAccount && metaPickedAccount.id !== project.dynamics_account_id) {
      payload.dynamics_account_id = metaPickedAccount.id;
      payload.customer_name = metaPickedAccount.name;
    }
    if (Object.keys(payload).length === 0) { setShowEditMeta(false); return; }
    setSavingMeta(true);
    try {
      await api.updateProject(project.id, payload);
      // Refetch to pull joined customer fields (display name, SharePoint URL)
      // that the PATCH response (raw projects row) doesn't include.
      const refreshed = await api.project(project.id);
      setProject(refreshed);
      setShowEditMeta(false);
      showToast(payload.dynamics_account_id ? "Project updated and linked to CRM customer." : "Project updated.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update project", "error");
    } finally {
      setSavingMeta(false);
    }
  }

  // Manual refresh — re-pull the project (joined) + its core data and re-sync
  // from CRM. Gives the user a one-click way to recover from a stale view
  // (e.g. account team chips after a CRM edit) without a full page reload.
  async function refreshAll() {
    if (!id) return;
    setRefreshing(true);
    try {
      const [projectData, stageData, taskData, riskData, noteData, docData, staffData] = await Promise.all([
        api.project(id), api.stages(id), api.tasks(id), api.risks(id), api.notes(id), api.documents(id), api.projectStaff(id),
      ]);
      setProject(projectData);
      setStages(stageData);
      setTasks(taskData);
      setRisks(riskData);
      setNotes(noteData);
      setDocuments(docData);
      setProjectStaff(staffData);
      api.projectContacts(id).then(setContacts).catch(() => {});
      api.phases(id).then(setPhases).catch(() => {});
      api.zoomRecordings(id).then(setRecordings).catch(() => {});
      if (projectData.dynamics_account_id) {
        api.projectCrmSync(id)
          .then(({ staff: freshStaff, project: updatedProject }) => {
            setProjectStaff(freshStaff);
            if (updatedProject) setProject((p) => p ? { ...p, ...updatedProject } : updatedProject);
          })
          .catch(() => { /* CRM unreachable — keep stored values */ });
      }
      showToast("Refreshed.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to refresh", "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function saveEditTech() {
    if (!project) return;
    const removed = originalSolutionTypes.filter((t) => !editSolutionTypes.includes(t));
    if (removed.length === 0) {
      await persistEditTech(false);
      return;
    }
    const summary = previewSolutionCleanup(removed);
    if (summary.deleteCount === 0 && summary.retagCount === 0) {
      // Types removed but no tagged tasks reference them — silently save.
      await persistEditTech(false);
      return;
    }
    setSolutionCleanup(summary);
  }

  // Project-level handleApplyTemplate retired with the Project Settings
  // card. Phase-scoped template apply lives in the Phases panel's
  // ApplyTemplateModal (src/client/components/project/PhasesPanel.tsx).

  async function handleAddStaff() {
    if (!addStaffUserId || !addStaffRole || !project) return;
    setAddingStaff(true);
    try {
      const added = await api.addProjectStaff(project.id, { user_id: addStaffUserId, staff_role: addStaffRole });
      setProjectStaff((prev) => [...prev, added]);
      // When assigning a PM via staff, also set pm_user_id so it surfaces in their project list
      if (addStaffRole === "pm") {
        const updated = await api.updateProject(project.id, { pm_user_id: addStaffUserId });
        setProject((prev) => prev ? { ...prev, ...updated } : updated);
      }
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

  // handleCrmSync retired — the project load useEffect now fires
  // api.projectCrmSync in the background so the Account Team chips
  // are populated without a manual click.

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

  function resetPartnerModal() {
    setShowPartnerModal(false);
    setAddPartnerUserId("");
    setPartnerMode("existing");
    setNewPartnerName("");
    setNewPartnerEmail("");
    setNewPartnerOrg("");
  }

  async function handleAddPartner() {
    if (!project) return;
    if (partnerMode === "existing" && !addPartnerUserId) return;
    if (partnerMode === "new" && (!newPartnerName.trim() || !newPartnerEmail.trim())) return;
    setAddingPartner(true);
    try {
      const added = partnerMode === "new"
        ? await api.inviteProjectPartnerAe(project.id, { name: newPartnerName.trim(), email: newPartnerEmail.trim(), organization_name: newPartnerOrg.trim() || null })
        : await api.addProjectStaff(project.id, { user_id: addPartnerUserId, staff_role: "partner_ae" });
      // De-dupe: invite-by-email may resolve to a partner AE already on the project.
      setProjectStaff((prev) => prev.some((s) => s.id === added.id) ? prev : [...prev, added]);
      resetPartnerModal();
      showToast(partnerMode === "new" ? "Partner AE invited and added." : "Partner AE added.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add partner AE", "error");
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

  // Inline-edit save — optimistic update + PATCH, with toast + revert on failure.
  async function patchTask(taskId: string, patch: Parameters<typeof api.updateTask>[2]) {
    if (!project) return;
    const prev = tasks.find((t) => t.id === taskId);
    if (!prev) return;
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
    try {
      const updated = await api.updateTask(project.id, taskId, patch);
      setTasks((ts) => ts.map((t) => (t.id === taskId ? updated : t)));
      // When a go-live event task's date moves, the server auto-syncs
      // projects.target_go_live_date — refetch the project so the meta
      // header reflects the new value in-session.
      const touchedGoLive = (prev.is_go_live_event === 1 || updated.is_go_live_event === 1)
        && (patch.due_date !== undefined || patch.scheduled_end !== undefined);
      if (touchedGoLive) {
        try {
          const refreshed = await api.project(project.id);
          setProject(refreshed);
        } catch { /* swallow — meta header just stays at the previous value */ }
      }
    } catch (err) {
      setTasks((ts) => ts.map((t) => (t.id === taskId ? prev : t)));
      showToast(err instanceof Error ? err.message : "Failed to update task", "error");
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!project) return;
    const prev = tasks.find((t) => t.id === taskId);
    try {
      await api.deleteTask(project.id, taskId);
      setTasks((p) => p.filter((t) => t.id !== taskId));
      // If the deleted task was the canonical go-live event, refetch the
      // project so the meta header drops the stale Go-Live date.
      if (prev?.is_go_live_event === 1) {
        try {
          const refreshed = await api.project(project.id);
          setProject(refreshed);
        } catch { /* swallow */ }
      }
      showToast("Task deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete task", "error");
    }
  }

  async function commitInlineNewTask(stageId: string) {
    if (!project) return;
    const title = newTaskTitle.trim();
    if (!title) return;
    setCreatingTask(true);
    try {
      const created = await api.createTask(project.id, { title, stage_id: stageId, status: "not_started" });
      setTasks((prev) => [...prev, created]);
      setNewTaskTitle("");
      // Leave the row open + focused for rapid entry
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create task", "error");
    } finally {
      setCreatingTask(false);
    }
  }

  function openNewRisk() {
    setEditingRisk(null);
    setRiskForm({ title: "", description: "", severity: "medium", status: "open", owner_user_id: "", owner_contact_id: "", task_id: "" });
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
      owner_contact_id: risk.owner_contact_id ?? "",
      task_id: risk.task_id ?? "",
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
        severity: riskForm.severity as "low" | "medium" | "high" | "critical",
        status: riskForm.status as "open" | "mitigated" | "closed",
        owner_user_id: riskForm.owner_user_id || null,
        owner_contact_id: riskForm.owner_contact_id || null,
        task_id: riskForm.task_id || null,
      };
      if (editingRisk) {
        const updated = await api.updateRisk(project.id, editingRisk.id, payload);
        setRisks((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        showToast("Blocker updated.", "success");
      } else {
        const created = await api.createRisk(project.id, payload);
        setRisks((prev) => [...prev, created]);
        showToast("Blocker added.", "success");
      }
      setShowRiskModal(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save blocker", "error");
    } finally {
      setSavingRisk(false);
    }
  }
  async function handleDeleteRisk(riskId: string) {
    if (!project || !window.confirm("Delete this blocker?")) return;
    try {
      await api.deleteRisk(project.id, riskId);
      setRisks((prev) => prev.filter((r) => r.id !== riskId));
      showToast("Blocker deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete blocker", "error");
    }
  }

  async function handleAddNote() {
    if (!project) return;
    if (!newNoteBody.trim()) { setNoteMessage("Please enter a note."); return; }
    setSavingNote(true);
    setNoteMessage(null);
    try {
      // Partner AEs always post at partner visibility, clients always at public
      // (server also enforces both)
      const visibility = currentUserRole === "partner_ae" ? "partner"
        : currentUserRole === "client" ? "public"
        : newNoteVisibility;
      const created = await api.createNote(project.id, { body: newNoteBody.trim(), visibility });
      setNotes((prev) => [created, ...prev]);
      setNewNoteBody("");
      setNewNoteVisibility("internal");
      const externalPoster = currentUserRole === "partner_ae" || currentUserRole === "client";
      showToast(externalPoster ? "Comment posted." : "Note added.", "success");
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
        <Link to="/projects" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>
          ← Projects
        </Link>
      </div>

      {/* Slim project meta — name + customer + Go-Live + SharePoint only.
          All other context (vendor/tech, account team, project team,
          customer/partner contacts) lives on the Overview tab. */}
      <div className="ms-card" style={{ padding: "16px 24px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 10 }}>
              {project.health && (
                <span
                  title={`Health: ${humanize(project.health)}`}
                  style={{ width: 12, height: 12, borderRadius: "50%", background: HEALTH_COLOR[project.health] ?? "#94a3b8", flexShrink: 0 }}
                />
              )}
              {project.name}
              {project.on_hold === 1 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 10, padding: "2px 10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>On Hold</span>
              )}
            </h1>
            {project.customer_id ? (
              <Link to={`/customers/${project.customer_id}`} style={{ fontSize: 13, color: "#0b9aad", textDecoration: "none", fontWeight: 600 }}>
                {project.customer_name ?? project.customer_display_name} <span style={{ fontSize: 11 }}>↗</span>
              </Link>
            ) : canEdit ? (
              <button onClick={openEditMeta} style={{ fontSize: 13, color: "#0b9aad", background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600 }}>
                + Link CRM customer
              </button>
            ) : (
              <span style={{ fontSize: 13, color: "#94a3b8" }}>No CRM customer linked</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {project.created_at && (
              <span style={{ fontSize: 12, color: "#94a3b8" }} title="When this project was created in CloudConnect">
                <span style={{ fontWeight: 600, marginRight: 4 }}>Created:</span>
                {formatDate(project.created_at)}
              </span>
            )}
            {project.target_go_live_date && (
              <span style={{ fontSize: 12, color: "#64748b" }}>
                <span style={{ fontWeight: 600, marginRight: 4 }}>Go-Live:</span>
                {formatDate(project.target_go_live_date)}
              </span>
            )}
            {project.customer_sharepoint_url && (
              <a href={project.customer_sharepoint_url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#0b9aad", textDecoration: "none", fontWeight: 600 }}>
                SharePoint ↗
              </a>
            )}
            <button onClick={refreshAll} disabled={refreshing} className="ms-btn-secondary" style={{ fontSize: 12, padding: "4px 12px" }} title="Refresh this project's data from the server">
              {refreshing ? "Refreshing…" : "↻ Refresh"}
            </button>
            {canEdit && (
              <button onClick={openEditMeta} className="ms-btn-secondary" style={{ fontSize: 12, padding: "4px 12px" }}>
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      {(() => {
        // The API-connection tab only shows for vendors with an actual
        // integration (detectPlatform → zoom | ringcentral). Mitel has no API
        // connectivity, so the tab is hidden. A future Dialpad connector would
        // add 'dialpad' to detectPlatform + a tab body, and the tab lights up.
        const platform = detectPlatform(project.vendor);
        const platformLabel = platform === "ringcentral" ? "RingCentral" : "Zoom";
        const hasCrm = !!project.dynamics_account_id;
        // External roles (Customer clients + Zoom/RC partner AEs) get the same
        // read-only set: Dashboard/Overview/Timeline/Tasks/Blockers, SharePoint
        // (upload discovery workbooks, phone bills, CSRs, etc.), and an Activity
        // tab. The notes endpoint scopes what each sees — clients see public
        // notes, partner AEs see partner+public. Internal staff see everything.
        const isExternal = currentUserRole === "partner_ae" || currentUserRole === "client";
        const externalSPTab: DetailTab[] = hasCrm ? ["sharepoint"] : [];
        const visibleTabs: DetailTab[] = isExternal
          ? ["dashboard", "overview", "timeline", "tasks", "blockers", ...externalSPTab, "activity"]
          // Timeline Builder is hidden now that phase + kickoff date auto-generate
          // the dated timeline (the builder code is kept, just not surfaced).
          // External Resources is PM/admin only (canEdit === admin || pm).
          : ["dashboard", "overview", "timeline", "tasks", "blockers", ...(hasCrm ? ["sharepoint" as const] : ["documents" as const]), "activity", "case", ...(canEdit ? ["external" as const] : []), ...(platform ? ["zoom" as const] : [])];
        return (
          <div className="ms-tabs">
            {visibleTabs.map((t) => (
              <button
                key={t}
                className={`ms-tab-btn${tab === t ? " active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t === "zoom" ? platformLabel : t === "sharepoint" ? "SharePoint" : t === "case" ? "CRM Case" : t === "external" ? "External Resources" : t === "builder" ? "Timeline Builder" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        );
      })()}

      {/* ── Timeline Builder (PM-only, spreadsheet-style template applier) ── */}
      {tab === "builder" && canEdit && (
        <TimelineBuilder
          project={project}
          phases={phases}
          stages={stages}
          tasks={tasks}
          onApplied={async () => {
            // Reload stages + tasks after a rebuild
            const [newStages, newTasks] = await Promise.all([api.stages(project.id), api.tasks(project.id)]);
            setStages(newStages);
            setTasks(newTasks);
            setTab("timeline");
          }}
        />
      )}

      {/* ── External Resources (PM/admin only) ───────────────────────────── */}
      {tab === "external" && canEdit && <ExternalResourcesTab projectId={project.id} canEdit={canEdit} />}

      {/* ── Dashboard (stakeholder view) ─────────────────────────────────── */}
      {tab === "dashboard" && <ProjectDashboardTab projectId={project.id} currentUserRole={currentUserRole} onChangeTab={(t) => setTab(t as DetailTab)} />}

      {/* ── Timeline (gantt) ──────────────────────────────────────────────── */}
      {tab === "timeline" && (
        <>
        {multiPhase && (
          <PhasePicker
            phases={phases}
            hasSharedStages={hasSharedStages}
            selected={selectedPhaseId}
            onSelect={setSelectedPhaseId}
          />
        )}
        <ProjectTimeline
          stages={visibleStages}
          tasks={visibleTasks}
          // Hide recording markers for external roles (clients + partner AEs) —
          // meeting topics on the Gantt could surface internal discussion names.
          recordings={currentUserRole === "client" || currentUserRole === "partner_ae" ? [] : recordings}
          projectId={project.id}
          availableTypes={availableTypes}
          selectedTypes={selectedTypes}
          onToggleType={toggleSolutionType}
          ganttOnly
          onUpdateStage={async (stageId, updates) => {
            if (!project) return;
            const updated = await api.updateStage(project.id, stageId, updates);
            setStages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          }}
          onClickStage={(stageId) => {
            setCollapsedStages((prev) => { const next = new Set(prev); next.delete(stageId); return next; });
            setTab("tasks");
          }}
          onClickTask={(taskId, stageId) => {
            if (stageId) setCollapsedStages((prev) => { const next = new Set(prev); next.delete(stageId); return next; });
            setTab("tasks");
            // Scroll the row into view after the tab mounts
            setTimeout(() => {
              const el = document.querySelector(`[data-task-row=\"${taskId}\"]`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 50);
          }}
        />
        </>
      )}

      {/* ── Overview ────────────────────────────────────────────────────── */}
      {tab === "overview" && (() => {
        // External roles (clients + partner AEs) get the read-only Overview;
        // internal-only sections (e.g. Status Meeting / Meeting Prep) are gated
        // on !isExternal so they stay hidden from both.
        const isExternal = currentUserRole === "client" || currentUserRole === "partner_ae";

        // Per-section accent palette. Each contact card gets a left-border stripe
        // + matching avatar-fallback color so the four sections are visually
        // distinct at a glance.
        type Accent = { fg: string; border: string; pill: string };
        const ACCENT_TEAL:  Accent = { fg: "#0b9aad", border: "rgba(11,154,173,0.25)", pill: "rgba(11,154,173,0.12)" };
        const ACCENT_BLUE:  Accent = { fg: "#0078d4", border: "rgba(0,120,212,0.25)",  pill: "rgba(0,120,212,0.12)"  };
        const ACCENT_GREEN: Accent = { fg: "#107c10", border: "rgba(16,124,16,0.25)",  pill: "rgba(16,124,16,0.12)"  };
        const ACCENT_CYAN:  Accent = { fg: "#63c1ea", border: "rgba(99,193,234,0.3)",  pill: "rgba(99,193,234,0.14)" };
        const ACCENT_AMBER: Accent = { fg: "#d97706", border: "rgba(217,119,6,0.3)",   pill: "rgba(217,119,6,0.14)"  };

        // Normalized person row used by all 4 contact sections.
        // `accent` lets an individual row override the section color — used to
        // keep Partner AEs visually distinct (green) inside the otherwise-blue
        // Project Team section.
        type PersonRow = {
          key: string;
          name: string;
          label?: string | null;
          jobTitle?: string | null;
          email?: string | null;
          phone?: string | null;
          scheduler?: string | null;
          photo?: string | null;
          accent?: Accent;
          onRemove?: () => void;
        };

        const renderPerson = (p: PersonRow, accent: Accent) => {
          const abbr = (p.name || p.email || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
          return (
            <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#f8fafc", borderRadius: 6, border: "1px solid #f1f5f9" }}>
              {p.photo
                ? <img src={p.photo} alt={p.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                : <span style={{ width: 40, height: 40, borderRadius: "50%", background: accent.pill, color: accent.fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{abbr}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{p.name}</span>
                  {p.label && (
                    <span className="ms-badge" style={{ background: accent.pill, color: accent.fg, border: `1px solid ${accent.border}`, fontSize: 10, padding: "1px 8px" }}>
                      {p.label}
                    </span>
                  )}
                </div>
                {p.jobTitle && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{p.jobTitle}</div>}
              </div>
              <ContactIcons email={p.email} phone={p.phone} schedulerUrl={p.scheduler} accent={accent.fg} />
              {p.onRemove && (
                <button onClick={p.onRemove} title="Remove" style={{ background: "none", border: "none", color: "rgba(209,52,56,0.5)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "4px 8px", flexShrink: 0 }}>✕</button>
              )}
            </div>
          );
        };

        const renderSection = (props: { title: string; accent: Accent; rows: PersonRow[]; empty: string; action?: React.ReactNode }) => (
          <div className="ms-section-card" style={{ borderLeft: `3px solid ${props.accent.fg}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
              <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0, color: props.accent.fg }}>{props.title}</div>
              {props.action}
            </div>
            {props.rows.length === 0
              ? <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>{props.empty}</div>
              : <div style={{ display: "grid", gap: 8 }}>{props.rows.map((r) => renderPerson(r, r.accent ?? props.accent))}</div>}
          </div>
        );

        // ── Account Team: PF AE / SA / CSM tied to the customer record ─────────────
        // CRM-pulled primaries (read-only) followed by any ad-hoc AEs added on
        // THIS project. The ad-hoc ones live on project_staff (role 'ae'), are
        // local-only, and are never synced to/from CRM — the CRM AE lives on the
        // customer record, so crm-sync leaves these untouched.
        const accountTeamRows: PersonRow[] = [
          ...([
            { role: "AE",  name: project.customer_pf_ae_name,  email: project.customer_pf_ae_email,  phone: project.customer_pf_ae_phone,  scheduler: project.customer_pf_ae_scheduler_url  },
            { role: "SA",  name: project.customer_pf_sa_name,  email: project.customer_pf_sa_email,  phone: project.customer_pf_sa_phone,  scheduler: project.customer_pf_sa_scheduler_url  },
            { role: "CSM", name: project.customer_pf_csm_name, email: project.customer_pf_csm_email, phone: project.customer_pf_csm_phone, scheduler: project.customer_pf_csm_scheduler_url },
          ] as const).filter((m) => !!m.name).map((m) => ({
            key: m.role,
            name: m.name!,
            label: m.role,
            email: m.email,
            phone: m.phone,
            scheduler: m.scheduler,
            photo: m.email ? customerTeamPhotoMap[m.email] : null,
          })),
          ...projectStaff
            .filter((s) => s.staff_role === "ae")
            .map((s) => ({
              key: s.id,
              name: s.name ?? s.email,
              label: "AE",
              email: s.email,
              phone: s.phone,
              scheduler: s.scheduler_url,
              photo: staffPhotoMap[s.email] ?? s.avatar_url,
              onRemove: canEdit ? () => handleRemoveStaff(s.id) : undefined,
            })),
        ];

        // ── Project Team: PM + internal staff + partner AEs ────────────────────────
        const pmRow: PersonRow | null = (() => {
          if (!project.pm_user_id) return null;
          const pmFromMap = userMap.get(project.pm_user_id);
          const pmName = pmFromMap?.name ?? (project as unknown as Record<string, unknown>).pm_name as string | null ?? null;
          const pmEmail = pmFromMap?.email ?? (project as unknown as Record<string, unknown>).pm_email as string | null ?? null;
          if (!pmName && !pmEmail) return null;
          return {
            key: "pm",
            name: pmName ?? pmEmail ?? "",
            label: "PM",
            email: pmEmail,
            phone: pmFromMap?.phone ?? project.pm_phone ?? null,
            scheduler: pmFromMap?.scheduler_url ?? project.pm_scheduler_url ?? null,
            photo: (pmEmail ? staffPhotoMap[pmEmail] : null) ?? pmFromMap?.avatar_url ?? null,
          };
        })();
        const roleLabel: Record<string, string> = { engineer: "Engineer", pm: "PM" };
        const internalStaffRows: PersonRow[] = projectStaff
          .filter((s) => s.staff_role !== "partner_ae"
            && !["ae", "sa", "csm"].includes(s.staff_role)
            && !(s.staff_role === "pm" && s.user_id === project.pm_user_id))
          .map((s) => ({
            key: s.id,
            name: s.name ?? s.email,
            label: roleLabel[s.staff_role] ?? s.staff_role,
            email: s.email,
            phone: s.phone,
            scheduler: s.scheduler_url,
            photo: staffPhotoMap[s.email] ?? s.avatar_url,
            onRemove: canEdit ? () => handleRemoveStaff(s.id) : undefined,
          }));
        const partnerAeRows: PersonRow[] = projectStaff
          .filter((s) => s.staff_role === "partner_ae")
          .map((s) => ({
            key: s.id,
            name: s.name ?? s.email,
            label: "Partner AE",
            email: s.email,
            phone: s.phone,
            scheduler: s.scheduler_url,
            photo: staffPhotoMap[s.email] ?? s.avatar_url,
            accent: ACCENT_GREEN,
            onRemove: canEdit ? () => handleRemovePartner(s.id) : undefined,
          }));

        // ── Customer + Partner contacts (project_contacts, split UI-side) ──────────
        const customerContacts = contacts.filter((c) => !isPartnerContactRole(c.contact_role));
        const partnerContacts  = contacts.filter((c) =>  isPartnerContactRole(c.contact_role));

        function openAddContactModal(side: "customer" | "partner") {
          setContactSide(side);
          setShowContactModal(true);
          const useCrm = side === "customer" && !!project!.dynamics_account_id;
          setContactModalTab(useCrm ? "crm" : "manual");
          setContactRole("");
          setManualContact({ name: "", email: "", phone: "", job_title: "" });
          if (useCrm && project!.dynamics_account_id && crmContacts.length === 0) {
            setCrmContactsLoading(true);
            api.getDynamicsContacts(project!.dynamics_account_id)
              .then(setCrmContacts)
              .catch(() => {})
              .finally(() => setCrmContactsLoading(false));
          }
        }

        const projectContactToRow = (c: typeof contacts[number]): PersonRow => ({
          key: c.id,
          name: c.name,
          label: c.contact_role,
          jobTitle: c.job_title,
          email: c.email,
          phone: c.phone,
          onRemove: canEdit ? async () => {
            await api.removeProjectContact(project!.id, c.id);
            setContacts((prev) => prev.filter((x) => x.id !== c.id));
          } : undefined,
        });
        const customerContactRows = customerContacts.map(projectContactToRow);
        const partnerContactRows  = partnerContacts.map(projectContactToRow);

        // Two-column layout that collapses to one column on narrow viewports.
        const twoCol: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16 };
        const ghostBtn: React.CSSProperties = { fontSize: 11, padding: "3px 10px", borderRadius: 4 };

        return (
          <div style={{ display: "grid", gap: 16 }}>
            {/* Project Settings card retired (May-2026). Status is auto-derived
                (PR E1); Template apply moved into the Phases panel below
                (PR E2 — every project owns at least one Main phase). */}

            {/* ── Project Details (vendor + Solution Types) ────────────────── */}
            <div className="ms-section-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
                <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>Project Details</div>
                {!editingTech && canEdit && (
                  <button className="ms-btn-ghost" onClick={startEditTech} style={{ fontSize: 12, padding: "2px 10px" }}>Edit</button>
                )}
              </div>
              {editingTech ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 520 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Vendor</span>
                    <select className="ms-input" value={editVendor} onChange={(e) => setEditVendor(e.target.value)} disabled={savingTech} style={{ fontSize: 13, padding: "6px 10px" }}>
                      <option value="">— Not set —</option>
                      {VENDOR_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Solution Types</span>
                    <SolutionTypePicker value={editSolutionTypes} onChange={setEditSolutionTypes} disabled={savingTech} />
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ms-btn-primary" onClick={saveEditTech} disabled={savingTech}>{savingTech ? "Saving…" : "Save"}</button>
                    <button className="ms-btn-ghost" onClick={() => setEditingTech(false)} disabled={savingTech}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {project.vendor ? (
                    <span className="ms-badge" style={{ background: "rgba(0,120,212,0.15)", color: "#4fc3f7", border: "1px solid rgba(0,120,212,0.35)", fontSize: 12, padding: "4px 12px" }}>
                      {vendorLabel(project.vendor)}
                    </span>
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: 12, fontStyle: "italic" }}>No vendor set</span>
                  )}
                  <SolutionTypePills types={project.solution_types} emptyFallback={<span style={{ color: "#94a3b8", fontSize: 12, fontStyle: "italic" }}>No solution types set</span>} />
                </div>
              )}
            </div>

            {/* ── Account Team │ Project Team (2-column) ───────────────────── */}
            <div style={twoCol}>
              {renderSection({
                title: "Account Team",
                accent: ACCENT_TEAL,
                rows: accountTeamRows,
                empty: "No customer Account Team set in CRM.",
                action: canEdit ? (
                  <button className="ms-btn-ghost" style={ghostBtn} onClick={() => { setShowStaffModal(true); setAddStaffUserId(""); setAddStaffRole("ae"); }}>+ AE</button>
                ) : undefined,
              })}
              {renderSection({
                title: "Project Team",
                accent: ACCENT_BLUE,
                rows: [...(pmRow ? [pmRow] : []), ...internalStaffRows],
                empty: "No project team assigned yet.",
                action: canEdit ? (
                  <button className="ms-btn-ghost" style={ghostBtn} onClick={() => { setShowStaffModal(true); setAddStaffUserId(""); setAddStaffRole(""); }}>+ Staff</button>
                ) : undefined,
              })}
            </div>

            {/* ── Customer Contacts │ Partner/Provider (2-column) ───────────
                Partner/Provider panel groups Partner AE rows (project_staff)
                with partner-side project_contacts under one "non-PF external
                partners" header. Partner AE rows keep their green accent;
                contact rows use the section amber. */}
            <div style={twoCol}>
              {renderSection({
                title: "Customer Contacts",
                accent: ACCENT_CYAN,
                rows: customerContactRows,
                empty: "No customer contacts added yet.",
                action: canEdit ? (
                  <button className="ms-btn-ghost" style={ghostBtn} onClick={() => openAddContactModal("customer")}>+ Add Contact</button>
                ) : undefined,
              })}
              {renderSection({
                title: "Partner / Provider",
                accent: ACCENT_AMBER,
                rows: [...partnerAeRows, ...partnerContactRows],
                empty: "No partner AEs or partner/provider contacts yet.",
                action: canEdit ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(() => {
                      const partnerStaff = projectStaff.filter((s) => s.staff_role === "partner_ae");
                      const hasAssignable = users.some((u) => u.role === "partner_ae" && !partnerStaff.some((s) => s.user_id === u.id));
                      // Always enabled — even with no existing partner AEs, you can invite a net-new one.
                      return <button className="ms-btn-ghost" style={ghostBtn} onClick={() => { setShowPartnerModal(true); setAddPartnerUserId(""); setPartnerMode(hasAssignable ? "existing" : "new"); }}>+ Partner AE</button>;
                    })()}
                    <button className="ms-btn-ghost" style={ghostBtn} onClick={() => openAddContactModal("partner")}>+ Add Contact</button>
                  </div>
                ) : undefined,
              })}
            </div>

            {/* ── Phases (multi-phase projects) — full width ─────────────────── */}
            <PhasesPanel
              projectId={project.id}
              canEdit={canEdit}
              onChange={async () => {
                // Phase add/delete/edit can move stages between phase_id values
                // and may flip the project between single-phase and multi-phase
                // — keep our cache fresh on all three.
                const [newPhases, newStages, newTasks] = await Promise.all([api.phases(project.id), api.stages(project.id), api.tasks(project.id)]);
                setPhases(newPhases);
                setStages(newStages);
                setTasks(newTasks);
              }}
            />

            {/* ── Status Meeting │ Meeting Prep (internal only, 2-column) ──── */}
            {!isExternal && (
              <div style={twoCol}>
                <StatusMeetingPanel
                  project={project}
                  canEdit={canEdit}
                  onSaved={(updated) => setProject((prev) => prev ? { ...prev, ...updated } : updated)}
                />
                <div className="ms-section-card" style={{ padding: "12px 16px" }}>
                  <div className="ms-section-title" style={{ marginBottom: 6 }}>Meeting Prep</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {(["kickoff", "discovery", "design_review", "uat", "go_live"] as const).map((mt, i) => (
                      <div key={mt} style={{ borderTop: i === 0 ? "none" : "1px solid #f1f5f9" }}>
                        <MeetingPrepCard projectId={project.id} meetingType={mt} canSend={canEdit} compact />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Shipment tracking — internal logistics (FedEx incl. drop-ships). */}
            {!isExternal && <ShipmentsPane projectId={project.id} canEdit={canEdit} />}
          </div>
        );
      })()}

      {/* ── Tasks ─────────────────────────────────────────────────────────── */}
      {tab === "tasks" && (
        <>
        {multiPhase && (
          <PhasePicker
            phases={phases}
            hasSharedStages={hasSharedStages}
            selected={selectedPhaseId}
            onSelect={setSelectedPhaseId}
          />
        )}
        <div className="ms-section-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>Tasks by Stage</div>
            <SolutionTypeFilterPills available={availableTypes} selected={selectedTypes} onToggle={toggleSolutionType} />
          </div>
          {tasks.length > 0 && filteredTasks.length === 0 && (
            <div style={{ padding: "8px 12px", marginBottom: 12, background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, fontSize: 12, color: "#854d0e", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span>Filter is hiding all {tasks.length} task{tasks.length === 1 ? "" : "s"} on this project.</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedTypes(new Set(availableTypes.length > 0 ? availableTypes : SOLUTION_TYPES));
                  if (project) {
                    window.localStorage.setItem(`cloudconnect:project:typeFilter:${project.id}`, JSON.stringify(availableTypes.length > 0 ? availableTypes : [...SOLUTION_TYPES]));
                  }
                }}
                style={{ background: "#fff", border: "1px solid #fde68a", color: "#854d0e", borderRadius: 4, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
              >
                Show all
              </button>
            </div>
          )}
          <div style={{ display: "grid", gap: 24 }}>
            {visibleStages.length === 0 && (
              <div style={{ padding: "20px 16px", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 6, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                {multiPhase
                  ? "No stages on this phase yet — apply a template via the Overview tab."
                  : "No stages yet. Apply a template above, or add stages manually below."}
              </div>
            )}
            {groupedTasks.map(({ stage, tasks: stageTasks }) => {
              const isCollapsed = collapsedStages.has(stage.id);
              const toggleCollapse = () => setCollapsedStages((prev) => {
                const next = new Set(prev);
                next.has(stage.id) ? next.delete(stage.id) : next.add(stage.id);
                return next;
              });
              const isAddingHere = newTaskStageId === stage.id;
              const cellStyle: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" };
              const inputBase: React.CSSProperties = { width: "100%", padding: "3px 6px", border: "1px solid transparent", borderRadius: 4, background: "transparent", fontSize: 13, color: "#1e293b", boxSizing: "border-box" };
              const cellInputStyle: React.CSSProperties = canManageTasks ? { ...inputBase, cursor: "text" } : { ...inputBase, cursor: "default" };
              return (
              <div key={stage.id}>
                {/* Stage header with inline editing — unchanged */}
                <div style={{ marginBottom: isCollapsed ? 0 : 10, paddingBottom: 8, borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                  <div
                    style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1e293b", marginBottom: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}
                    onClick={toggleCollapse}
                  >
                    <span style={{ fontSize: 10, color: "#94a3b8", transition: "transform 0.15s", display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
                    {stage.name}
                    <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8", textTransform: "none", letterSpacing: 0 }}>({stageTasks.length} task{stageTasks.length !== 1 ? "s" : ""})</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                      Start
                      <input
                        type="date"
                        value={stage.planned_start ?? ""}
                        disabled={!canManageTasks}
                        style={{ fontSize: 11, padding: "2px 6px", border: "1px solid #d1d5db", borderRadius: 4, background: canManageTasks ? "#fff" : "#f8fafc", color: "#1e293b" }}
                        onChange={async (e) => {
                          if (!project) return;
                          const updated = await api.updateStage(project.id, stage.id, { planned_start: e.target.value || null });
                          setStages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                        }}
                      />
                    </label>
                    <label style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                      End
                      <input
                        type="date"
                        value={stage.planned_end ?? ""}
                        disabled={!canManageTasks}
                        style={{ fontSize: 11, padding: "2px 6px", border: "1px solid #d1d5db", borderRadius: 4, background: canManageTasks ? "#fff" : "#f8fafc", color: "#1e293b" }}
                        onChange={async (e) => {
                          if (!project) return;
                          const updated = await api.updateStage(project.id, stage.id, { planned_end: e.target.value || null });
                          setStages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                        }}
                      />
                    </label>
                    {/* Stage status is now auto-derived from task statuses on
                        the server; PMs don't toggle it directly. Badge stays
                        for at-a-glance read. */}
                    <Badge label={humanize(stage.status ?? "not_started")} color={STATUS_COLOR[stage.status ?? "not_started"] ?? "#94a3b8"} style={{ textTransform: "none" }} />
                    {/* Stage-level time entry — PFI only. Server enforces via
                        canEditProject + pf_engineer-on-project on POST. */}
                    {currentUserRole !== "client" && currentUserRole !== "partner_ae" && (() => {
                      const stageEntries = stageTimeEntries[stage.id] ?? [];
                      const totalMins = stageEntries.reduce((acc, e) => {
                        if (!e.scheduled_start || !e.scheduled_end) return acc;
                        return acc + Math.round((new Date(e.scheduled_end).getTime() - new Date(e.scheduled_start).getTime()) / 60000);
                      }, 0);
                      const h = Math.floor(totalMins / 60), m = totalMins % 60;
                      return (
                        <>
                          <button
                            type="button"
                            className="ms-btn-secondary"
                            title="Log time for this stage"
                            style={{ fontSize: 11, padding: "2px 10px" }}
                            onClick={() => {
                              const today = new Date().toISOString().slice(0, 10);
                              setTimeEntryForm({ date: today, startTime: "08:00", endTime: "09:00", payCodeId: "", costCodeId: "", note: "" });
                              setTimeEntrySetup(null);
                              setTimeEntryStage(stage);
                              setTimeEntryLoadingSetup(true);
                              api.timeEntrySetup(project!.id).then(setTimeEntrySetup).catch(() => showToast("Failed to load CRM data", "error")).finally(() => setTimeEntryLoadingSetup(false));
                            }}
                          >
                            ⏱ Log time
                          </button>
                          {stageEntries.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setViewEntriesStage(stage)}
                              title={`View ${stageEntries.length} time ${stageEntries.length === 1 ? "entry" : "entries"} logged to CRM`}
                              style={{ fontSize: 11, color: "#0369a1", fontWeight: 600, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                            >
                              {totalMins === 0 ? "0m" : `${h > 0 ? `${h}h ` : ""}${m > 0 ? `${m}m` : ""}`} logged ({stageEntries.length})
                            </button>
                          )}
                        </>
                      );
                    })()}
                    {canManageTasks && (
                      <button
                        type="button"
                        title="Delete stage"
                        onClick={async () => {
                          if (!project) return;
                          const taskCount = stageTasks.length;
                          const msg = taskCount === 0
                            ? `Delete stage "${stage.name}"?`
                            : `Delete stage "${stage.name}" and its ${taskCount} task${taskCount === 1 ? "" : "s"}? Documents tied to this stage will move to the project level; other data stays put.`;
                          if (!confirm(msg)) return;
                          try {
                            await api.deleteStage(project.id, stage.id);
                            setStages((prev) => prev.filter((p) => p.id !== stage.id));
                            setTasks((prev) => prev.filter((t) => t.stage_id !== stage.id));
                          } catch {
                            showToast("Failed to delete stage", "error");
                          }
                        }}
                        style={{ marginLeft: "auto", background: "none", border: "1px solid #fecaca", color: "#d13438", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer", lineHeight: 1.4 }}
                      >
                        × Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline CRUD table */}
                {!isCollapsed && (
                  <div>
                    {stageTasks.length === 0 && !isAddingHere && (
                      <div style={{ color: "#a19f9d", fontSize: 13, padding: "8px 0" }}>No tasks</div>
                    )}

                    {(stageTasks.length > 0 || isAddingHere) && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <colgroup>
                            <col />
                            <col style={{ width: 160 }} />
                            <col style={{ width: 130 }} />
                            <col style={{ width: 130 }} />
                            <col style={{ width: 100 }} />
                            <col style={{ width: 140 }} />
                            <col style={{ width: 96 }} />
                          </colgroup>
                          <thead>
                            <tr style={{ color: "#64748b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #e2e8f0" }}>
                              <th style={{ textAlign: "left", padding: "6px 8px" }}>Title</th>
                              <th style={{ textAlign: "left", padding: "6px 8px" }}>Assignee</th>
                              <th style={{ textAlign: "left", padding: "6px 8px" }}>Due</th>
                              <th style={{ textAlign: "left", padding: "6px 8px" }}>Status</th>
                              <th style={{ textAlign: "left", padding: "6px 8px" }}>Priority</th>
                              <th style={{ textAlign: "left", padding: "6px 8px" }}>Done</th>
                              <th style={{ textAlign: "right", padding: "6px 8px" }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {stageTasks.map((task) => {
                              const taskRecordings = recordings.filter((r) => r.task_id === task.id);
                              const isDone = task.status === "completed";
                              const todayIso = new Date().toISOString().slice(0, 10);
                              const isOverdue = !!task.due_date && !isDone && task.due_date < todayIso;
                              const subRowCount = taskRecordings.length;
                              return (
                                <React.Fragment key={task.id}>
                                  <tr data-task-row={task.id}>
                                    <td style={cellStyle}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <input
                                          type="text"
                                          defaultValue={taskDisplayTitle(task)}
                                          disabled={!canManageTasks}
                                          style={{ ...cellInputStyle, flex: 1, minWidth: 0 }}
                                          title={task.title}
                                          onBlur={(e) => {
                                            const newRaw = e.target.value.trim();
                                            if (!newRaw) { e.target.value = taskDisplayTitle(task); return; }
                                            if (newRaw === taskDisplayTitle(task)) return;
                                            // Preserve any [Tag] prefix from the original title
                                            const { types } = parseTaggedTitle(task.title);
                                            const newTitle = types.length > 0
                                              ? `[${types.map((t) => t.toUpperCase()).join("+")}] ${newRaw}`
                                              : newRaw;
                                            patchTask(task.id, { title: newTitle });
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                            else if (e.key === "Escape") (e.target as HTMLInputElement).value = taskDisplayTitle(task);
                                          }}
                                        />
                                        {(() => {
                                          const taskTypes = parseTaggedTitle(task.title).types;
                                          if (taskTypes.length === 0) return null;
                                          return (
                                            <span style={{ display: "inline-flex", gap: 3, flexShrink: 0 }}>
                                              {taskTypes.map((t) => (
                                                <span
                                                  key={t}
                                                  title={SOLUTION_TYPE_LABELS[t]}
                                                  style={{ width: 7, height: 7, borderRadius: "50%", background: SOLUTION_TYPE_COLORS[t], flexShrink: 0 }}
                                                />
                                              ))}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </td>
                                    <td style={cellStyle}>
                                      {(() => {
                                        const currentValue = task.assignee_user_id ? `u:${task.assignee_user_id}` : task.assignee_contact_id ? `c:${task.assignee_contact_id}` : "";
                                        const userIsOnProject = task.assignee_user_id ? projectStaffUnique.some((s) => s.user_id === task.assignee_user_id) : true;
                                        return (
                                          <select
                                            value={currentValue}
                                            disabled={!canManageTasks}
                                            style={cellInputStyle}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              if (v === "__add_contact__") {
                                                // Open the contact modal pre-set to customer side; remember the task so
                                                // the newly-created contact is auto-assigned on save.
                                                setAssignNewContactToTaskId(task.id);
                                                setContactSide("customer");
                                                setContactRole("");
                                                setManualContact({ name: "", email: "", phone: "", job_title: "" });
                                                const useCrm = !!project?.dynamics_account_id;
                                                setContactModalTab(useCrm ? "crm" : "manual");
                                                if (useCrm && project!.dynamics_account_id && crmContacts.length === 0) {
                                                  setCrmContactsLoading(true);
                                                  api.getDynamicsContacts(project!.dynamics_account_id)
                                                    .then(setCrmContacts)
                                                    .catch(() => {})
                                                    .finally(() => setCrmContactsLoading(false));
                                                }
                                                setShowContactModal(true);
                                                return;
                                              }
                                              if (!v) patchTask(task.id, { assignee_user_id: null, assignee_contact_id: null });
                                              else if (v.startsWith("u:")) patchTask(task.id, { assignee_user_id: v.slice(2), assignee_contact_id: null });
                                              else if (v.startsWith("c:")) patchTask(task.id, { assignee_contact_id: v.slice(2), assignee_user_id: null });
                                            }}
                                          >
                                            <option value="">— Unassigned</option>
                                            {projectStaffUnique.length > 0 && (
                                              <optgroup label="Project Staff">
                                                {projectStaffUnique.map((s) => (
                                                  <option key={s.user_id} value={`u:${s.user_id}`}>
                                                    {s.name ?? s.email} · {ASSIGNEE_ROLE_LABEL[s.staff_role] ?? s.staff_role}
                                                  </option>
                                                ))}
                                              </optgroup>
                                            )}
                                            {contacts.length > 0 && (
                                              <optgroup label="Contacts">
                                                {contacts.map((c) => (
                                                  <option key={c.id} value={`c:${c.id}`}>
                                                    {c.name}{c.contact_role ? ` · ${c.contact_role}` : ""}
                                                  </option>
                                                ))}
                                              </optgroup>
                                            )}
                                            {canManageTasks && (
                                              <option value="__add_contact__">+ Add new contact…</option>
                                            )}
                                            {/* Stale: assigned user no longer on project — surface so PM can see + reassign */}
                                            {task.assignee_user_id && !userIsOnProject && (
                                              <option value={`u:${task.assignee_user_id}`}>
                                                {assigneeLabelForUser(task.assignee_user_id)}
                                              </option>
                                            )}
                                          </select>
                                        );
                                      })()}
                                    </td>
                                    <td style={cellStyle}>
                                      <input
                                        type="date"
                                        value={task.due_date ?? ""}
                                        disabled={!canManageTasks}
                                        style={cellInputStyle}
                                        onChange={(e) => patchTask(task.id, { due_date: e.target.value || null })}
                                      />
                                    </td>
                                    <td style={cellStyle}>
                                      <select
                                        value={task.status ?? "not_started"}
                                        disabled={!canManageTasks}
                                        style={{ ...cellInputStyle, color: STATUS_COLOR[task.status ?? "not_started"] ?? "#1e293b", fontWeight: 600 }}
                                        onChange={(e) => patchTask(task.id, { status: e.target.value as "not_started" | "in_progress" | "completed" | "blocked" })}
                                      >
                                        <option value="not_started">Not Started</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
                                        <option value="blocked">Blocked</option>
                                      </select>
                                    </td>
                                    <td style={cellStyle}>
                                      <select
                                        value={task.priority ?? ""}
                                        disabled={!canManageTasks}
                                        style={cellInputStyle}
                                        onChange={(e) => patchTask(task.id, { priority: (e.target.value || null) as "low" | "medium" | "high" | null })}
                                      >
                                        <option value="">—</option>
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                      </select>
                                    </td>
                                    <td style={cellStyle}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <input
                                          type="checkbox"
                                          checked={isDone}
                                          disabled={!canManageTasks}
                                          onChange={(e) => patchTask(task.id, { status: e.target.checked ? "completed" : "not_started" })}
                                          style={{ cursor: canManageTasks ? "pointer" : "default" }}
                                          title="Toggle status to/from completed"
                                        />
                                        {isDone && (
                                          <input
                                            type="date"
                                            value={task.completed_at?.slice(0, 10) ?? ""}
                                            disabled={!canManageTasks}
                                            onChange={(e) => patchTask(task.id, { completed_at: e.target.value || null })}
                                            style={{ ...cellInputStyle, color: "#059669", fontWeight: 500, padding: "3px 4px" }}
                                            title="Edit completion date"
                                          />
                                        )}
                                      </div>
                                    </td>
                                    <td style={{ ...cellStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                                      {/* Time is logged at the stage level now — see the
                                          "Log time" button on each stage header. */}
                                      {canManageTasks && task.due_date && (
                                        <button
                                          title="Cascade dates downstream from this task"
                                          onClick={() => setCascadeFromTask(task)}
                                          style={{
                                            background: isOverdue ? "rgba(253,224,71,0.15)" : "none",
                                            border: `1px solid ${isOverdue ? "#fde68a" : "#cbd5e1"}`,
                                            color: isOverdue ? "#b45309" : "#64748b",
                                            borderRadius: 4, padding: "3px 8px", fontSize: 11, cursor: "pointer", marginRight: 4,
                                          }}
                                        >
                                          ↪
                                        </button>
                                      )}
                                      {canManageTasks && (
                                        <button
                                          title="Delete task"
                                          onClick={async () => {
                                            if (!confirm(`Delete task "${taskDisplayTitle(task)}"?`)) return;
                                            await handleDeleteTask(task.id);
                                          }}
                                          style={{ background: "none", border: "1px solid #fecaca", color: "#d13438", borderRadius: 4, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                  {subRowCount > 0 && (
                                    <tr>
                                      <td colSpan={7} style={{ padding: "0 8px 6px 24px", borderBottom: "1px solid #f1f5f9" }}>
                                        {taskRecordings.map((rec) => (
                                          <div key={rec.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#7c3aed" }}>
                                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#7c3aed" }} />
                                            <span style={{ fontWeight: 500 }}>{rec.topic}</span>
                                            <span style={{ color: "#94a3b8" }}>
                                              {new Date(rec.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {rec.duration_mins}m
                                            </span>
                                          </div>
                                        ))}
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            {isAddingHere && (
                              <tr>
                                <td colSpan={7} style={{ padding: "6px 8px" }}>
                                  <form
                                    onSubmit={(e) => { e.preventDefault(); commitInlineNewTask(stage.id); }}
                                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                                  >
                                    <input
                                      type="text"
                                      autoFocus
                                      placeholder="Task title — Enter or Add to save, Esc to close"
                                      value={newTaskTitle}
                                      onChange={(e) => setNewTaskTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") { setNewTaskTitle(""); setNewTaskStageId(null); }
                                      }}
                                      disabled={creatingTask}
                                      style={{ flex: 1, padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, background: "#fff", color: "#1e293b" }}
                                    />
                                    <button
                                      type="submit"
                                      disabled={creatingTask || !newTaskTitle.trim()}
                                      style={{ fontSize: 11, padding: "4px 12px", background: newTaskTitle.trim() ? "#0891b2" : "#94a3b8", border: "none", color: "#fff", borderRadius: 4, cursor: newTaskTitle.trim() ? "pointer" : "default", fontWeight: 600 }}
                                    >
                                      {creatingTask ? "Adding…" : "Add"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setNewTaskTitle(""); setNewTaskStageId(null); }}
                                      style={{ fontSize: 11, padding: "4px 10px", background: "none", border: "1px solid #cbd5e1", color: "#64748b", borderRadius: 4, cursor: "pointer" }}
                                    >
                                      Done
                                    </button>
                                  </form>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {canManageTasks && !isAddingHere && (
                      <button
                        className="ms-btn-ghost"
                        onClick={() => { setNewTaskTitle(""); setNewTaskStageId(stage.id); }}
                        style={{ marginTop: 8, fontSize: 12, border: "1px dashed #cbd5e1", color: "#64748b" }}
                      >
                        + Add Task
                      </button>
                    )}
                  </div>
                )}
              </div>
              );
            })}

            {canManageTasks && (
              showNewStageInput ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 8, borderTop: stages.length > 0 ? "1px dashed #e2e8f0" : "none" }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Stage name"
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && newStageName.trim() && !creatingStage && project) {
                        setCreatingStage(true);
                        try {
                          const created = await api.createStage(project.id, { name: newStageName.trim() });
                          setStages((prev) => [...prev, created]);
                          setNewStageName("");
                          setShowNewStageInput(false);
                        } catch {
                          showToast("Failed to create stage", "error");
                        } finally {
                          setCreatingStage(false);
                        }
                      } else if (e.key === "Escape") {
                        setNewStageName("");
                        setShowNewStageInput(false);
                      }
                    }}
                    style={{ flex: 1, fontSize: 13, padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: "#1e293b" }}
                  />
                  <button
                    className="ms-btn-primary"
                    disabled={!newStageName.trim() || creatingStage}
                    onClick={async () => {
                      if (!project) return;
                      setCreatingStage(true);
                      try {
                        const created = await api.createStage(project.id, { name: newStageName.trim() });
                        setStages((prev) => [...prev, created]);
                        setNewStageName("");
                        setShowNewStageInput(false);
                      } catch {
                        showToast("Failed to create stage", "error");
                      } finally {
                        setCreatingStage(false);
                      }
                    }}
                    style={{ fontSize: 12, padding: "5px 14px" }}
                  >
                    {creatingStage ? "Creating…" : "Create"}
                  </button>
                  <button
                    className="ms-btn-ghost"
                    onClick={() => { setNewStageName(""); setShowNewStageInput(false); }}
                    style={{ fontSize: 12, padding: "5px 12px" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="ms-btn-ghost"
                  onClick={() => setShowNewStageInput(true)}
                  style={{ alignSelf: "start", border: "1px dashed #cbd5e1", color: "#64748b", marginTop: stages.length > 0 ? 8 : 0 }}
                >
                  + Add Stage
                </button>
              )
            )}
          </div>
        </div>
        </>
      )}

      {/* ── Blockers ───────────────────────────────────────────────────────── */}
      {tab === "blockers" && (
        <div className="ms-section-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>Blockers</div>
            {canEdit && <button className="ms-btn-primary" onClick={openNewRisk}>+ Add Blocker</button>}
          </div>
          {risks.length === 0 ? (
            <div style={{ color: "#a19f9d", fontSize: 14, padding: "8px 0" }}>No blockers recorded.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {risks.map((risk) => {
                const ownerContact = risk.owner_contact_id ? contacts.find((c) => c.id === risk.owner_contact_id) : null;
                const ownerLabel = ownerContact
                  ? ownerContact.name
                  : risk.owner_user_id ? userName(risk.owner_user_id) : "Unassigned";
                // A client who is the assigned project_contact (matched via
                // dynamics_contact_id == their auth id) can edit this blocker.
                const isAssignedToCurrentClient = currentUserRole === "client"
                  && !!ownerContact?.dynamics_contact_id
                  && ownerContact.dynamics_contact_id === currentUserId;
                const canEditThisRisk = canEdit || isAssignedToCurrentClient;
                return (
                  <div key={risk.id} className="ms-row-item">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>{risk.title}</div>
                      {risk.description && <div style={{ color: "#64748b", fontSize: 13, marginBottom: 4 }}>{risk.description}</div>}
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        Severity: {risk.severity ?? "—"} · Owner: {ownerLabel}
                        {risk.task_id && (() => {
                          const t = tasks.find((t) => t.id === risk.task_id);
                          return t ? <> · Blocking: <span style={{ fontWeight: 600, color: "#d13438" }}>{t.title}</span></> : null;
                        })()}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      <Badge label={risk.status ?? "open"} color={RISK_COLOR[risk.status ?? "open"] ?? "#94a3b8"} />
                      {canEditThisRisk && <button className="ms-btn-ghost" onClick={() => openEditRisk(risk)}>Edit</button>}
                      {canEdit && <button className="ms-btn-danger" onClick={() => handleDeleteRisk(risk.id)}>Delete</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Documents ─────────────────────────────────────────────────────── */}
      {tab === "documents" && (
        <ProjectDocuments
          projectId={project.id}
          documents={documents}
          stages={stages}
          tasks={tasks}
          onDocumentsChange={setDocuments}
        />
      )}

      {/* ── SharePoint ────────────────────────────────────────────────────── */}
      {tab === "sharepoint" && project.dynamics_account_id && (
        <SharePointDocs
          recordId={project.dynamics_account_id}
          sharepointUrl={project.customer_sharepoint_url}
          folderUrl={project.sharepoint_folder_url}
          owner={{ kind: "project", id: project.id }}
          canEdit={canEdit || isStaffedEngineer}
          isExternal={currentUserRole === "client" || currentUserRole === "partner_ae"}
          onFolderCreated={(url) => setProject({ ...project, sharepoint_folder_url: url })}
        />
      )}

      {/* ── Activity ──────────────────────────────────────────────────────── */}
      {tab === "activity" && (() => {
        const isPartnerAe = currentUserRole === "partner_ae";
        const isPfAe = currentUserRole === "pf_ae";
        const isClient = currentUserRole === "client";
        const canComment = canEdit || isPartnerAe || isPfAe || isClient;
        const externalPoster = isPartnerAe || isClient;
        return (
          <div style={{ display: "grid", gap: 16 }}>
            {canComment && (
              <div className="ms-section-card">
                <div className="ms-section-title">{externalPoster ? "Add Comment" : "Add Note"}</div>
                <div style={{ display: "grid", gap: 12 }}>
                  {!externalPoster && (
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
                    <span>{externalPoster ? "Comment" : "Note"}</span>
                    <textarea
                      className="ms-input"
                      value={newNoteBody}
                      onChange={(e) => setNewNoteBody(e.target.value)}
                      rows={4}
                      spellCheck
                      style={{ resize: "vertical", minHeight: 90 }}
                      placeholder={externalPoster ? "Share an update with the project team..." : "Add a project update..."}
                    />
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button className="ms-btn-primary" onClick={handleAddNote} disabled={savingNote}>
                      {savingNote ? "Posting..." : externalPoster ? "Post Comment" : "Add Note"}
                    </button>
                    {noteMessage && <span style={{ fontSize: 13, color: "#64748b" }}>{noteMessage}</span>}
                  </div>
                </div>
              </div>
            )}

            {/* ── Zoom Recordings — hidden for clients ─────────────────────── */}
            {!isClient && detectPlatform(project.vendor) === "zoom" && (
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
                        setSuggestionStageOverrides({});
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
                            {(() => {
                              if (rec.share_url) {
                                return (
                                  <a href={rec.share_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#63c1ea", textDecoration: "none", fontWeight: 500 }}>
                                    Watch recording ↗
                                  </a>
                                );
                              }
                              const file = rec.recording_files.find((f) => f.play_url && ["MP4", "M4A"].includes((f.file_type ?? "").toUpperCase()));
                              if (!file) return null;
                              const url = rec.recording_password
                                ? `${file.play_url}?pwd=${rec.recording_password}`
                                : file.play_url!;
                              return (
                                <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#63c1ea", textDecoration: "none", fontWeight: 500 }}>
                                  Watch recording ↗
                                </a>
                              );
                            })()}
                            {canEdit && (
                              <select
                                className="ms-input"
                                style={{ fontSize: 12, padding: "2px 6px", height: "auto", width: "auto" }}
                                value={rec.stage_id ?? ""}
                                onChange={async (e) => {
                                  const newStageId = e.target.value || null;
                                  try {
                                    const updated = await api.zoomReassignRecording(project.id, rec.id, newStageId);
                                    setRecordings((prev) => prev.map((r) => r.id === updated.id ? updated : r));
                                    showToast("Recording reassigned.", "success");
                                  } catch {
                                    showToast("Failed to reassign recording", "error");
                                  }
                                }}
                              >
                                <option value="">— unassigned —</option>
                                {stages.map((ph) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
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
                          {rec.stage_name && (
                            <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>Stage: {rec.stage_name}</div>
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
                          const overrideStageId = idx in suggestionStageOverrides ? suggestionStageOverrides[idx] : s.suggested_stage_id;
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
                                        <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0 }}>Stage:</span>
                                        <select
                                          className="ms-input"
                                          style={{ fontSize: 12, padding: "3px 8px", height: "auto" }}
                                          value={overrideStageId ?? ""}
                                          onChange={(e) => {
                                            setSuggestionStageOverrides((prev) => ({ ...prev, [idx]: e.target.value || null }));
                                            // Clear task when stage changes
                                            setSuggestionTaskOverrides((prev) => ({ ...prev, [idx]: null }));
                                          }}
                                        >
                                          <option value="">— Unassigned —</option>
                                          {stages.map((ph) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
                                        </select>
                                      </div>
                                      {overrideStageId && (
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
                                              .filter((t) => t.stage_id === overrideStageId)
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
                                const stageId = (idx in suggestionStageOverrides ? suggestionStageOverrides[idx] : s.suggested_stage_id) ?? null;
                                const taskId = suggestionTaskOverrides[idx] ?? null;
                                const isManual = (idx in suggestionStageOverrides && suggestionStageOverrides[idx] !== s.suggested_stage_id) || !!taskId;
                                return {
                                  meeting_id: s.meeting_id,
                                  stage_id: stageId,
                                  task_id: taskId,
                                  topic: s.topic,
                                  start_time: s.start_time,
                                  duration_mins: s.duration_mins,
                                  host_email: s.host_email ?? null,
                                  recording_files: s.recording_files as ZoomRecordingFile[],
                                  recording_password: s.recording_password ?? null,
                                  share_url: s.share_url ?? null,
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
            // Merge, don't replace — the PATCH response is the raw projects row
            // without joined fields (account team, customer display name,
            // SharePoint URL). Replacing would blank those until a refresh.
            setProject((prev) => prev ? { ...prev, ...updated } : updated);
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
            setProject((prev) => prev ? { ...prev, ...updated } : updated);
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
            setProject((prev) => prev ? { ...prev, ...updated } : updated);
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
            setProject((prev) => prev ? { ...prev, ...updated } : updated);
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
        const engineerHours = (caseCompliance?.timeEntries ?? []).reduce((sum, e) => sum + (e.durationHours ?? 0), 0);
        // External-resource spend converts to hours used at the blended rate and
        // adds to the actual hours (see External Resources tab). $1,650 → 10h.
        const EXTERNAL_RATE = 165;
        const externalTotal = caseCompliance?.externalResourcesTotal ?? 0;
        const externalHours = externalTotal / EXTERNAL_RATE;
        const actualHours = engineerHours + externalHours;
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
                        <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, overflow: "hidden", maxHeight: 380, overflowY: "auto" }}>
                          {(showAllOpps ? caseCompliance.accountOpportunities : caseCompliance.accountOpportunities.slice(0, 25)).map((opp) => (
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
                        {caseCompliance.accountOpportunities.length > 25 && (
                          <button
                            type="button"
                            onClick={() => setShowAllOpps((v) => !v)}
                            style={{ marginTop: 8, fontSize: 12, color: "#0891b2", background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600 }}
                          >
                            {showAllOpps ? "Show fewer" : `Show all ${caseCompliance.accountOpportunities.length} opportunities`}
                          </button>
                        )}
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
                    <div className="ms-info-value" style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{engineerHours.toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{(caseCompliance?.timeEntries ?? []).length} entries</div>
                  </div>
                  {externalTotal > 0 && (
                    <div className="ms-info-item">
                      <div className="ms-info-label">External Resources</div>
                      <div className="ms-info-value" style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{externalHours.toFixed(1)}<span style={{ fontSize: 13, fontWeight: 400, color: "#94a3b8" }}> h</span></div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>${externalTotal.toLocaleString("en-US")} @ $165/hr</div>
                    </div>
                  )}
                  {externalTotal > 0 && (
                    <div className="ms-info-item">
                      <div className="ms-info-label">Total Hours Used</div>
                      <div className="ms-info-value" style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{actualHours.toFixed(1)}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>engineer + external</div>
                    </div>
                  )}
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

      {/* ── Blocker Modal ─────────────────────────────────────────────────── */}
      {showRiskModal && (() => {
        // Client edit mode: customer is editing a blocker assigned to them.
        // They can only change status + description; everything else is locked.
        const clientEditMode = !canEdit && currentUserRole === "client" && !!editingRisk;
        // Owner dropdown encodes the picked value as "user:<id>" or
        // "contact:<id>" so a single select can switch between the two owner
        // dimensions. handleOwnerChange writes back to the matching field.
        const ownerValue = riskForm.owner_user_id
          ? `user:${riskForm.owner_user_id}`
          : riskForm.owner_contact_id ? `contact:${riskForm.owner_contact_id}` : "";
        const handleOwnerChange = (raw: string) => {
          if (raw.startsWith("user:"))    setRiskForm({ ...riskForm, owner_user_id: raw.slice(5), owner_contact_id: "" });
          else if (raw.startsWith("contact:")) setRiskForm({ ...riskForm, owner_user_id: "", owner_contact_id: raw.slice(8) });
          else                              setRiskForm({ ...riskForm, owner_user_id: "", owner_contact_id: "" });
        };
        const customerSideContacts = contacts.filter((c) => !isPartnerContactRole(c.contact_role));
        const partnerSideContacts  = contacts.filter((c) =>  isPartnerContactRole(c.contact_role));

        return (
          <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowRiskModal(false); }}>
            <div className="ms-modal">
              <h2>{editingRisk ? "Edit Blocker" : "Add Blocker"}</h2>
              <form onSubmit={handleSaveRisk} style={{ display: "grid", gap: 14 }}>
                {clientEditMode ? (
                  // Customer view: title shown read-only for context, plus the
                  // two fields they can change.
                  <div style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: 6, border: "1px solid #f1f5f9", fontSize: 13, color: "#475569" }}>
                    {riskForm.title}
                  </div>
                ) : (
                  <label className="ms-label">
                    <span>Title *</span>
                    <input autoFocus required className="ms-input" value={riskForm.title} onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })} />
                  </label>
                )}
                <label className="ms-label">
                  <span>Description</span>
                  <textarea className="ms-input" value={riskForm.description} onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })} rows={3} style={{ resize: "vertical" }} />
                </label>
                {!clientEditMode && (
                  <label className="ms-label">
                    <span>Blocking Task</span>
                    <select className="ms-input" value={riskForm.task_id} onChange={(e) => setRiskForm({ ...riskForm, task_id: e.target.value })}>
                      <option value="">— Not task-specific —</option>
                      {tasks.filter((t) => t.status !== "completed").map((t) => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div style={{ display: "grid", gridTemplateColumns: clientEditMode ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
                  {!clientEditMode && (
                    <label className="ms-label">
                      <span>Severity</span>
                      <select className="ms-input" value={riskForm.severity} onChange={(e) => setRiskForm({ ...riskForm, severity: e.target.value })}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </label>
                  )}
                  <label className="ms-label">
                    <span>Status</span>
                    <select className="ms-input" value={riskForm.status} onChange={(e) => setRiskForm({ ...riskForm, status: e.target.value })}>
                      <option value="open">Open</option>
                      <option value="mitigated">Mitigated</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                  {!clientEditMode && (
                    <label className="ms-label">
                      <span>Owner</span>
                      <select className="ms-input" value={ownerValue} onChange={(e) => handleOwnerChange(e.target.value)}>
                        <option value="">Unassigned</option>
                        <optgroup label="PF Staff">
                          {users.map((u) => <option key={u.id} value={`user:${u.id}`}>{u.name ?? u.email}</option>)}
                        </optgroup>
                        {customerSideContacts.length > 0 && (
                          <optgroup label="Customer Contacts">
                            {customerSideContacts.map((c) => <option key={c.id} value={`contact:${c.id}`}>{c.name}</option>)}
                          </optgroup>
                        )}
                        {partnerSideContacts.length > 0 && (
                          <optgroup label="Partner / Provider Contacts">
                            {partnerSideContacts.map((c) => <option key={c.id} value={`contact:${c.id}`}>{c.name}</option>)}
                          </optgroup>
                        )}
                      </select>
                    </label>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button type="submit" className="ms-btn-primary" disabled={savingRisk || !riskForm.title.trim()}>
                    {savingRisk ? "Saving..." : editingRisk ? "Save Changes" : "Add Blocker"}
                  </button>
                  <button type="button" className="ms-btn-secondary" onClick={() => setShowRiskModal(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ── Solution-type removal cleanup confirm ─────────────────────────── */}
      {solutionCleanup && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSolutionCleanup(null); }}>
          <div className="ms-modal" style={{ maxWidth: 500 }}>
            <h2>Clean up tagged tasks?</h2>
            <p style={{ color: "#475569", margin: "12px 0 8px", fontSize: 13 }}>
              Removing {solutionCleanup.removed.map((t) => SOLUTION_TYPE_LABELS[t]).join(", ")} from this project's solution types.
            </p>
            <p style={{ color: "#475569", margin: "0 0 16px", fontSize: 13 }}>
              {solutionCleanup.deleteCount > 0 && <><strong>{solutionCleanup.deleteCount}</strong> task{solutionCleanup.deleteCount === 1 ? " is" : "s are"} tagged only with the removed type{solutionCleanup.removed.length === 1 ? "" : "s"} — they'll be <strong>deleted</strong>.</>}
              {solutionCleanup.deleteCount > 0 && solutionCleanup.retagCount > 0 && <br />}
              {solutionCleanup.retagCount > 0 && <><strong>{solutionCleanup.retagCount}</strong> task{solutionCleanup.retagCount === 1 ? "" : "s"} carry combo tags (e.g. [UCaaS+CCaaS]) — they'll be <strong>re-tagged</strong> with the surviving type{editSolutionTypes.length === 1 ? "" : "s"}.</>}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="ms-btn-ghost" onClick={() => setSolutionCleanup(null)} disabled={savingTech}>Cancel</button>
              <button className="ms-btn-secondary" onClick={() => persistEditTech(false)} disabled={savingTech}>
                Skip cleanup
              </button>
              <button className="ms-btn-primary" onClick={() => persistEditTech(true)} disabled={savingTech}>
                {savingTech ? "Saving…" : "Save and clean up"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cascade Modal ─────────────────────────────────────────────────── */}
      {cascadeFromTask && project && (
        <CascadeModal
          projectId={project.id}
          fromTask={cascadeFromTask}
          onClose={() => setCascadeFromTask(null)}
          onApplied={async () => {
            // Refetch tasks + project so the page reflects shifted dates and
            // the new target go-live in the header. Toast is already fired
            // by the modal before this callback runs.
            const [refreshedTasks, refreshedProject] = await Promise.all([
              api.tasks(project.id),
              api.project(project.id),
            ]);
            setTasks(refreshedTasks);
            setProject(refreshedProject);
          }}
        />
      )}

      {/* ── Task Modal ─────────────────────────────────────────────────────── */}
      {/* ── Time Entry Modal ──────────────────────────────────────────────── */}
      {timeEntryStage && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setTimeEntryStage(null); }}>
          <div className="ms-modal" style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Log Time</h2>
              <button onClick={() => setTimeEntryStage(null)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16, fontWeight: 500 }}>{timeEntryStage.name} stage</div>

            {timeEntryLoadingSetup ? (
              <div style={{ color: "#64748b", fontSize: 13, padding: "16px 0" }}>Loading CRM data…</div>
            ) : !timeEntrySetup?.case_id || !timeEntrySetup?.job_id ? (
              <div style={{ color: "#d13438", fontSize: 13, padding: "8px 0" }}>
                {!timeEntrySetup ? "Could not load CRM data." : "This project has no CRM case or job linked. Time entries cannot be submitted."}
              </div>
            ) : timeEntrySetup.cost_codes.length === 0 ? (
              <div style={{ color: "#d13438", fontSize: 13, padding: "8px 0" }}>
                This project's CRM job has no cost codes. A cost code is required to submit time — add cost codes to the job in Dynamics, then try again.
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

                {/* Cost Code — required, both labor (pay) and cost code go to CRM. */}
                <label className="ms-label">
                  <span>Cost Code</span>
                  <select className="ms-input" value={timeEntryForm.costCodeId} onChange={(e) => setTimeEntryForm((f) => ({ ...f, costCodeId: e.target.value }))}>
                    <option value="">— Select —</option>
                    {timeEntrySetup.cost_codes.map((cc) => (
                      <option key={cc.amc_costcodeid} value={cc.amc_costcodeid}>{cc.amc_name}</option>
                    ))}
                  </select>
                </label>

                {/* Note — free text, appended to the CRM subject. */}
                <label className="ms-label">
                  <span>Note</span>
                  <input
                    type="text"
                    className="ms-input"
                    maxLength={500}
                    placeholder="e.g. Kick off meeting with client"
                    value={timeEntryForm.note}
                    onChange={(e) => setTimeEntryForm((f) => ({ ...f, note: e.target.value }))}
                  />
                  <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "block" }}>
                    CRM subject: <span style={{ color: "#64748b" }}>{timeEntryStage.name}{timeEntryForm.note.trim() ? ` | ${timeEntryForm.note.trim()}` : ""}</span>
                  </span>
                </label>

                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button
                    className="ms-btn-primary"
                    style={{ flex: 1 }}
                    disabled={submittingTimeEntry || !timeEntryForm.date || !timeEntryForm.startTime || !timeEntryForm.endTime || !timeEntryForm.payCodeId || !timeEntryForm.costCodeId}
                    onClick={async () => {
                      if (!project || !timeEntryStage || !timeEntrySetup?.case_id || !timeEntrySetup?.job_id) return;
                      setSubmittingTimeEntry(true);
                      try {
                        // The <input type="time"> value is wall-clock time in
                        // the SA's local zone ("08:00" means 8am local). Build
                        // the Date by appending the local time without a `Z`
                        // suffix — JS then parses it as LOCAL time — and call
                        // toISOString() to convert to UTC for the wire. The
                        // previous version stamped `Z` directly onto the local
                        // string, which sent "8am UTC" instead of "8am PT" and
                        // showed up in D365 as 1am during DST.
                        const start = new Date(`${timeEntryForm.date}T${timeEntryForm.startTime}:00`).toISOString();
                        const end   = new Date(`${timeEntryForm.date}T${timeEntryForm.endTime}:00`).toISOString();
                        const entry = await api.logStageTime(project.id, timeEntryStage.id, {
                          scheduled_start: start,
                          scheduled_end: end,
                          pay_code_id: timeEntryForm.payCodeId,
                          cost_code_id: timeEntryForm.costCodeId,
                          note: timeEntryForm.note.trim() || undefined,
                          case_id: timeEntrySetup.case_id!,
                          job_id: timeEntrySetup.job_id!,
                          account_id: timeEntrySetup.account_id ?? null,
                        });
                        setStageTimeEntries((prev) => ({ ...prev, [timeEntryStage.id]: [...(prev[timeEntryStage.id] ?? []), entry] }));
                        setTimeEntryStage(null);
                        showToast("Time entry submitted to CRM.", "success");
                      } catch (err) {
                        showToast(err instanceof Error ? err.message : "Failed to submit time entry", "error");
                      } finally {
                        setSubmittingTimeEntry(false);
                      }
                    }}
                  >
                    {submittingTimeEntry ? "Submitting…" : "Submit Time Entry to CRM"}
                  </button>
                  <button className="ms-btn-secondary" onClick={() => setTimeEntryStage(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Stage time-entry list (view / delete) ───────────────────────────── */}
      {viewEntriesStage && (() => {
        const entries = (stageTimeEntries[viewEntriesStage.id] ?? []).slice().sort((a, b) => (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? ""));
        return (
          <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewEntriesStage(null); }}>
            <div className="ms-modal" style={{ maxWidth: 560 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Time entries</h2>
                <button onClick={() => setViewEntriesStage(null)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16, fontWeight: 500 }}>{viewEntriesStage.name} stage</div>

              {entries.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: 13, padding: "8px 0" }}>No time entries logged for this stage.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {entries.map((entry) => {
                    const startDt = entry.scheduled_start ? new Date(entry.scheduled_start) : null;
                    const endDt = entry.scheduled_end ? new Date(entry.scheduled_end) : null;
                    const mins = startDt && endDt ? Math.round((endDt.getTime() - startDt.getTime()) / 60000) : null;
                    const h = mins !== null ? Math.floor(mins / 60) : 0;
                    const m = mins !== null ? mins % 60 : 0;
                    return (
                      <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 600 }}>
                            {startDt ? startDt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                            {mins !== null && <span style={{ color: "#0891b2", marginLeft: 8 }}>{h > 0 ? `${h}h ` : ""}{m > 0 ? `${m}m` : ""}{mins === 0 ? "0m" : ""}</span>}
                          </div>
                          {entry.note && <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{entry.note}</div>}
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                            {entry.user_name ?? "Unknown"}
                            {startDt && endDt ? ` · ${startDt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–${endDt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
                            {entry.crm_time_entry_id ? " · in CRM" : " · not in CRM"}
                          </div>
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            disabled={deletingEntryId === entry.id}
                            title="Delete this entry from the app and CRM"
                            onClick={async () => {
                              if (!project) return;
                              if (!confirm("Delete this time entry? It will be removed from the app and from Dynamics CRM.")) return;
                              setDeletingEntryId(entry.id);
                              try {
                                await api.deleteStageTimeEntry(project.id, viewEntriesStage.id, entry.id);
                                setStageTimeEntries((prev) => ({
                                  ...prev,
                                  [viewEntriesStage.id]: (prev[viewEntriesStage.id] ?? []).filter((e) => e.id !== entry.id),
                                }));
                                showToast("Time entry deleted from CRM.", "success");
                              } catch (err) {
                                showToast(err instanceof Error ? err.message : "Failed to delete time entry", "error");
                              } finally {
                                setDeletingEntryId(null);
                              }
                            }}
                            style={{ background: "none", border: "1px solid #fecaca", color: "#d13438", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}
                          >
                            {deletingEntryId === entry.id ? "Deleting…" : "Delete"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button className="ms-btn-secondary" onClick={() => setViewEntriesStage(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}


      {/* ── Add Staff Modal ──────────────────────────────────────────────── */}
      {/* ── Edit Project (rename + CRM customer link) ────────────────────── */}
      {showEditMeta && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowEditMeta(false); }}>
          <div className="ms-modal" style={{ maxWidth: 520, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Edit Project</h2>
              <button onClick={() => setShowEditMeta(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
              <label className="ms-label">
                <span>Project Name</span>
                <input className="ms-input" value={metaName} onChange={(e) => setMetaName(e.target.value)} placeholder="Project name" />
              </label>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={metaOnHold} onChange={(e) => setMetaOnHold(e.target.checked)} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>On hold</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    Greys the project out and shows an <strong>On Hold</strong> badge in the project lists. Doesn't change tasks or dates.
                  </div>
                </div>
              </label>
              <div>
                <div className="ms-label" style={{ marginBottom: 4 }}><span>CRM Customer</span></div>
                {project.customer_id && !metaPickedAccount && (
                  <div style={{ fontSize: 12, color: "#64748b", margin: "0 0 6px" }}>
                    Currently linked: <strong>{project.customer_name ?? project.customer_display_name}</strong>. Search to change.
                  </div>
                )}
                {metaPickedAccount ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid #bae6fd", background: "#f0f9ff", borderRadius: 6, padding: "8px 12px" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#0369a1" }}>{metaPickedAccount.name}</span>
                    <button onClick={() => { setMetaPickedAccount(null); setMetaCrmQuery(""); }} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12 }}>Change</button>
                  </div>
                ) : (
                  <>
                    <input className="ms-input" value={metaCrmQuery} onChange={(e) => handleMetaCrmSearch(e.target.value)} placeholder="Search Dynamics accounts…" />
                    {metaCrmSearching && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>Searching…</div>}
                    {metaCrmResults.length > 0 && (
                      <div style={{ marginTop: 6, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, overflow: "hidden", maxHeight: 200, overflowY: "auto" }}>
                        {metaCrmResults.map((r) => (
                          <button key={r.id} onClick={() => { setMetaPickedAccount(r); setMetaCrmResults([]); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "#fff", border: "none", borderBottom: "1px solid rgba(0,0,0,0.05)", cursor: "pointer", fontSize: 13 }}>
                            {r.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <button className="ms-btn-primary" disabled={savingMeta} onClick={saveMeta}>
                {savingMeta ? "Saving…" : "Save"}
              </button>
              <button className="ms-btn-secondary" onClick={() => setShowEditMeta(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
                  <option value="ae">Account Executive (Account Team)</option>
                  <option value="engineer">Implementation Engineer</option>
                  <option value="pm">Project Manager</option>
                </select>
              </label>
              <label className="ms-label">
                <span>Team Member</span>
                <select className="ms-input" value={addStaffUserId} onChange={(e) => setAddStaffUserId(e.target.value)}>
                  <option value="">— Select team member —</option>
                  {users.filter((u) => {
                    if (addStaffRole === "pm") return u.role === "pm" || u.is_project_resource === 1 || u.is_pm_eligible === 1;
                    if (addStaffRole === "engineer") return u.role === "pf_engineer" || u.is_project_resource === 1;
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
          <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) resetPartnerModal(); }}>
            <div className="ms-modal" style={{ maxWidth: 480, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Add Partner AE</h2>
                <button onClick={resetPartnerModal} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
              </div>
              <div style={{ padding: "20px 24px", display: "grid", gap: 12 }}>
                {/* Existing vs net-new toggle */}
                <div style={{ display: "flex", gap: 6 }}>
                  {(["existing", "new"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPartnerMode(mode)}
                      style={{
                        flex: 1, padding: "6px 0", fontSize: 13, borderRadius: 6,
                        border: `1px solid ${partnerMode === mode ? "#107c10" : "rgba(0,0,0,0.12)"}`,
                        background: partnerMode === mode ? "rgba(16,124,16,0.08)" : "transparent",
                        color: partnerMode === mode ? "#107c10" : "#64748b", cursor: "pointer", fontWeight: 600,
                      }}
                    >
                      {mode === "existing" ? "Select Existing" : "Invite New"}
                    </button>
                  ))}
                </div>
                {partnerMode === "existing" ? (
                  <label className="ms-label">
                    <span>Partner AE</span>
                    <select className="ms-input" value={addPartnerUserId} onChange={(e) => setAddPartnerUserId(e.target.value)}>
                      <option value="">— Select partner AE —</option>
                      {assignablePartners.map((u) => (
                        <option key={u.id} value={u.id}>{u.name ?? u.email}{u.organization_name ? ` (${u.organization_name})` : ""}</option>
                      ))}
                    </select>
                    {assignablePartners.length === 0 && (
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>No unassigned partner AEs — use Invite New.</span>
                    )}
                  </label>
                ) : (
                  <>
                    <label className="ms-label">
                      <span>Name *</span>
                      <input className="ms-input" value={newPartnerName} onChange={(e) => setNewPartnerName(e.target.value)} placeholder="Full name" disabled={addingPartner} />
                    </label>
                    <label className="ms-label">
                      <span>Email *</span>
                      <input className="ms-input" type="email" value={newPartnerEmail} onChange={(e) => setNewPartnerEmail(e.target.value)} placeholder="ae@partner.com" disabled={addingPartner} />
                    </label>
                    <label className="ms-label">
                      <span>Organization</span>
                      <input className="ms-input" value={newPartnerOrg} onChange={(e) => setNewPartnerOrg(e.target.value)} placeholder="e.g. Zoom" disabled={addingPartner} />
                    </label>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>Creates a partner AE user and emails them an invite to CloudConnect.</span>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
                <button
                  className="ms-btn-primary"
                  disabled={addingPartner || (partnerMode === "existing" ? !addPartnerUserId : (!newPartnerName.trim() || !newPartnerEmail.trim()))}
                  onClick={handleAddPartner}
                >
                  {addingPartner ? (partnerMode === "new" ? "Inviting…" : "Adding…") : (partnerMode === "new" ? "Invite & Add" : "Add Partner AE")}
                </button>
                <button className="ms-btn-secondary" onClick={resetPartnerModal}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add Contact Modal ──────────────────────────────────────────────── */}
      {showContactModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowContactModal(false); setAssignNewContactToTaskId(null); } }}>
          <div className="ms-modal" style={{ maxWidth: 580, display: "flex", flexDirection: "column", maxHeight: "85vh" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>
                Add {contactSide === "partner" ? "Partner / Provider" : "Customer"} Contact
              </h2>
              <button onClick={() => { setShowContactModal(false); setAssignNewContactToTaskId(null); }} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>

            {/* Role selector — always shown. Options filtered by side. */}
            <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
              <label className="ms-label">
                <span>Role on Project</span>
                <select className="ms-input" value={contactRole} onChange={(e) => setContactRole(e.target.value)}>
                  <option value="">— Select role —</option>
                  {(contactSide === "partner" ? PARTNER_CONTACT_ROLES : CUSTOMER_CONTACT_ROLES).map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Tab toggle — only customer + CRM-linked projects offer the CRM lookup tab. */}
            {contactSide === "customer" && project.dynamics_account_id && (
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
                                    if (assignNewContactToTaskId) {
                                      patchTask(assignNewContactToTaskId, { assignee_contact_id: added.id, assignee_user_id: null });
                                      setAssignNewContactToTaskId(null);
                                      setShowContactModal(false);
                                    }
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
                      if (assignNewContactToTaskId) {
                        patchTask(assignNewContactToTaskId, { assignee_contact_id: added.id, assignee_user_id: null });
                        setAssignNewContactToTaskId(null);
                        setShowContactModal(false);
                      }
                    } catch {
                      showToast("Failed to add contact", "error");
                    } finally {
                      setSavingContact(false);
                    }
                  }}
                >
                  {savingContact ? "Adding…" : "Add Contact"}
                </button>
                <button className="ms-btn-secondary" onClick={() => { setShowContactModal(false); setAssignNewContactToTaskId(null); }}>Cancel</button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Project-level Apply-Template confirm modal retired with the
          Project Settings card. Phase-scoped template apply lives in
          components/project/PhasesPanel.tsx → ApplyTemplateModal. */}

    </div>
  );
}

const API_BASE = "/api";
const DEV_HEADERS: Record<string, string> = import.meta.env.DEV ? { "x-dev-user-email": "rdyla@packetfusion.com" } : {};

export const IMPERSONATE_KEY = "impersonate_email";

function getImpersonationHeaders(): Record<string, string> {
  try {
    const email = localStorage.getItem(IMPERSONATE_KEY);
    return email ? { "x-impersonate-email": email } : {};
  } catch {
    return {};
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...DEV_HEADERS,
      ...getImpersonationHeaders(),
    },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

export type User = {
  id: string;
  email: string;
  name: string | null;
  organization_name: string | null;
  role: string;
  is_active: number;
};

export type SolutionType = "ucaas" | "ccaas" | "zoom_ra" | "zoom_va" | "rc_ace" | "rc_air";

export type GapCategory = "Feature" | "Integration" | "Infrastructure" | "Process" | "Compliance";
export type RiskCategory = "Technical" | "Commercial" | "Operational" | "Timeline" | "Compliance";
export type Priority = "high" | "medium" | "low";

export type GapItem = {
  id: string;
  category: GapCategory;
  description: string;
  current_state: string;
  required_state: string;
  priority: Priority;
  notes: string;
};

export type RiskItem = {
  id: string;
  category: RiskCategory;
  description: string;
  probability: Priority;
  impact: Priority;
  mitigation: string;
};

export type GapAnalysis = { gaps: GapItem[]; risks: RiskItem[] };
export type SolutionStatus = "draft" | "assessment" | "requirements" | "scope" | "handoff" | "won" | "lost";
export type SolutionVendor = "zoom" | "ringcentral";

export type Solution = {
  id: string;
  name: string;
  customer_name: string;
  dynamics_account_id: string | null;
  vendor: SolutionVendor;
  solution_type: SolutionType;
  status: SolutionStatus;
  pf_ae_user_id: string | null;
  partner_ae_user_id: string | null;
  partner_ae_name: string | null;
  partner_ae_email: string | null;
  needs_assessment: string | null;
  requirements: string | null;
  scope_of_work: string | null;
  handoff_notes: string | null;
  gap_analysis: string | null;
  linked_project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  pf_ae_name: string | null;
  pf_ae_email_addr: string | null;
  partner_ae_display_name: string | null;
};

export type DashboardTask = Task & { project_name: string };
export type DashboardRisk = Risk & { project_name: string };

export type DashboardSummaryResponse = {
  user: User;
  summary: {
    activeProjects: number;
    atRiskProjects: number;
    openTasks: number;
    openRisks: number;
  };
  projects: Project[];
  openTasks: DashboardTask[];
  openRisks: DashboardRisk[];
  phaseDistribution: { phase_name: string; count: number }[];
  vendorDistribution: { label: string; count: number }[];
  typeDistribution: { label: string; count: number }[];
};

export type Project = {
  id: string;
  name: string;
  customer_name: string | null;
  vendor: string | null;
  solution_type: string | null;
  status: string | null;
  health: string | null;
  kickoff_date: string | null;
  target_go_live_date: string | null;
  actual_go_live_date: string | null;
  pm_user_id: string | null;
  pm_name: string | null;
  ae_user_id: string | null;
  ae_name: string | null;
  sa_name: string | null;
  csm_name: string | null;
  engineer_name: string | null;
  dynamics_account_id: string | null;
  archived: number | null;
  created_at: string;
  updated_at: string;
};

export type DynamicsAccount = {
  accountid: string;
  name: string;
  emailaddress1: string | null;
  telephone1: string | null;
  websiteurl: string | null;
  address1_city: string | null;
  address1_stateorprovince: string | null;
};

export type DynamicsContact = {
  contactid: string;
  firstname: string | null;
  lastname: string | null;
  emailaddress1: string | null;
  telephone1: string | null;
  jobtitle: string | null;
};

export type DynamicsUser = {
  systemuserid: string;
  firstname: string | null;
  lastname: string | null;
  internalemailaddress: string | null;
  title: string | null;
};

export type DynamicsOpportunity = {
  opportunityid: string;
  name: string;
  estimatedclosedate: string | null;
  statecode: number;
};

export type ProjectContact = {
  id: string;
  project_id: string;
  dynamics_contact_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  contact_role: string | null;
  added_at: string;
};

export type SolutionContact = {
  id: string;
  solution_id: string;
  dynamics_contact_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  contact_role: string | null;
  added_at: string;
};

export type Phase = {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: string | null;
};

export type Milestone = {
  id: string;
  project_id: string;
  phase_id: string | null;
  name: string;
  target_date: string | null;
  actual_date: string | null;
  status: string | null;
};

export type Task = {
  id: string;
  project_id: string;
  phase_id: string | null;
  title: string;
  assignee_user_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  status: string | null;
  priority: string | null;
};

export type Risk = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  severity: string | null;
  status: string | null;
  owner_user_id: string | null;
};

export type Document = {
  id: string;
  project_id: string;
  phase_id: string | null;
  task_id: string | null;
  name: string;
  content_type: string | null;
  size_bytes: number | null;
  category: string | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  created_at: string;
};

export const DOCUMENT_CATEGORIES = ["LOA", "Cut Sheet", "CSR", "Contract", "Design Doc", "Test Plan", "Other"] as const;

export type ZoomDevice = {
  id: string;
  display_name: string;
  mac_address: string | null;
  model: string | null;
  status: string | null;
  assignee: { name: string; extension_number: string | null } | null;
};

export type ZoomStatus = {
  configured: boolean;
  error?: string;
  account?: { id: string; account_name: string; account_type: number };
  plans?: Record<string, unknown>;
  total_users?: number | null;
  devices?: ZoomDevice[];
  devices_total?: number;
  warnings?: string[];
};
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export type ProjectAccess = {
  id: string;
  project_id: string;
  user_id: string;
  access_level: string | null;
  name: string | null;
  email: string;
  role: string;
  organization_name: string | null;
};

export type Note = {
  id: string;
  project_id: string;
  author_user_id: string | null;
  body: string;
  visibility: string | null;
  created_at: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  project_id: string;
  author_user_id: string | null;
  author_name: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
};

export type MeResponse = {
  user: User;
  role: string;
  organization: string | null;
};

export type ComponentStatus =
  | "operational"
  | "degraded_performance"
  | "partial_outage"
  | "major_outage"
  | "under_maintenance";

export type VendorComponentStatus = {
  name: string;
  label: string;
  status: ComponentStatus;
};

export type VendorStatus = {
  overall: "operational" | "degraded" | "outage";
  components: VendorComponentStatus[];
  fetched_at: number;
};

export type SystemStatusResponse = {
  vendors: ("zoom" | "ringcentral")[];
  zoom: VendorStatus | null;
  ringcentral: VendorStatus | null;
};

// ── Optimize types ───────────────────────────────────────────────────────────

export type OptimizeAccount = {
  id: string;
  project_id: string;
  project_name: string;
  customer_name: string | null;
  graduated_at: string;
  graduation_method: "auto" | "manual";
  optimize_status: "active" | "paused" | "churned";
  sa_user_id: string | null;
  sa_name: string | null;
  csm_user_id: string | null;
  csm_name: string | null;
  next_review_date: string | null;
  notes: string | null;
  last_assessment_date: string | null;
  last_assessment_score: number | null;
};

export type OptimizeEligible = {
  id: string;
  name: string;
  customer_name: string | null;
  vendor: string | null;
  actual_go_live_date: string | null;
};

export type Assessment = {
  id: string;
  project_id: string;
  assessment_type: "impact" | "adoption" | "qbr" | "other";
  conducted_date: string;
  conducted_by_user_id: string | null;
  conducted_by_name: string | null;
  overall_score: number | null;
  adoption_score: number | null;
  satisfaction_score: number | null;
  notes: string | null;
  action_items: string | null;
  next_review_date: string | null;
  created_at: string;
};

export type TechStackItem = {
  id: string;
  project_id: string;
  tech_area: "uc" | "security" | "network" | "datacenter" | "backup_dr" | "tem" | "other";
  tech_area_label: string | null;
  current_vendor: string | null;
  current_solution: string | null;
  time_rating: "tolerate" | "invest" | "migrate" | "eliminate" | null;
  notes: string | null;
  last_reviewed: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_name: string | null;
};

export type RoadmapItem = {
  id: string;
  project_id: string;
  tech_stack_id: string | null;
  title: string;
  description: string | null;
  category: "enhancement" | "new_project" | "optimization" | "replacement";
  priority: "high" | "medium" | "low";
  time_rating: "tolerate" | "invest" | "migrate" | "eliminate" | null;
  status: "identified" | "evaluating" | "approved" | "in_progress" | "completed" | "deferred";
  target_date: string | null;
  linked_solution_id: string | null;
  linked_project_id: string | null;
  created_at: string;
};

export type UtilizationSnapshot = {
  id: string;
  project_id: string;
  platform: "zoom" | "ringcentral";
  snapshot_date: string;
  licenses_purchased: number | null;
  licenses_assigned: number | null;
  active_users_30d: number | null;
  active_users_90d: number | null;
  total_meetings: number | null;
  total_call_minutes: number | null;
  raw_data: string | null;
  created_at: string;
};

export const api = {
  me: () => request<MeResponse>("/me"),
  systemStatus: () => request<SystemStatusResponse>("/status"),
  staffPhotos: (emails: string[]) =>
    request<Record<string, string | null>>(`/staff/photos?emails=${emails.map(encodeURIComponent).join(",")}`),
  users: () => request<User[]>("/users"),
  dashboardSummary: () => request<DashboardSummaryResponse>("/dashboard/summary"),
  projects: () => request<Project[]>("/projects"),
  project: (id: string) => request<Project>(`/projects/${id}`),

  phases: (projectId: string) => request<Phase[]>(`/projects/${projectId}/phases`),
  milestones: (projectId: string) => request<Milestone[]>(`/projects/${projectId}/milestones`),
  tasks: (projectId: string) => request<Task[]>(`/projects/${projectId}/tasks`),
  risks: (projectId: string) => request<Risk[]>(`/projects/${projectId}/risks`),
  notes: (projectId: string) => request<Note[]>(`/projects/${projectId}/notes`),

  updatePhase: (
    projectId: string,
    phaseId: string,
    payload: {
      status?: "not_started" | "in_progress" | "completed";
      planned_start?: string | null;
      planned_end?: string | null;
      actual_start?: string | null;
      actual_end?: string | null;
    }
  ) =>
    request<Phase>(`/projects/${projectId}/phases/${phaseId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  searchDynamicsAccounts: (q: string) =>
    request<DynamicsAccount[]>(`/dynamics/accounts?q=${encodeURIComponent(q)}`),

  getDynamicsContacts: (accountId: string) =>
    request<DynamicsContact[]>(`/dynamics/accounts/${accountId}/contacts`),

  getDynamicsOpportunities: (accountId: string) =>
    request<DynamicsOpportunity[]>(`/dynamics/accounts/${accountId}/opportunities`),

  getDynamicsPMs: () =>
    request<DynamicsUser[]>(`/dynamics/staff/project-managers`),

  getDynamicsAEs: () =>
    request<DynamicsUser[]>(`/dynamics/staff/account-executives`),

  getDynamicsSAs: () =>
    request<DynamicsUser[]>(`/dynamics/staff/solution-architects`),

  getDynamicsCSMs: () =>
    request<DynamicsUser[]>(`/dynamics/staff/client-success-managers`),

  getDynamicsEngineers: () =>
    request<DynamicsUser[]>(`/dynamics/staff/engineers`),

  createProject: (payload: {
    name: string;
    customer_name?: string;
    vendor?: string;
    solution_type?: string;
    kickoff_date?: string;
    target_go_live_date?: string;
    pm_user_id?: string | null;
    pm_name?: string | null;
    ae_user_id?: string | null;
    ae_name?: string | null;
    sa_name?: string | null;
    csm_name?: string | null;
    engineer_name?: string | null;
    dynamics_account_id?: string | null;
  }) =>
    request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateProject: (
    id: string,
    payload: {
      status?: string;
      health?: string;
      target_go_live_date?: string;
      actual_go_live_date?: string;
      pm_user_id?: string | null;
      pm_name?: string | null;
      ae_user_id?: string | null;
      ae_name?: string | null;
      sa_name?: string | null;
      csm_name?: string | null;
      engineer_name?: string | null;
    }
  ) =>
    request<Project>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  createRisk: (
    projectId: string,
    payload: {
      title: string;
      description?: string;
      severity?: "low" | "medium" | "high";
      status?: "open" | "mitigated" | "closed";
      owner_user_id?: string | null;
    }
  ) =>
    request<Risk>(`/projects/${projectId}/risks`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateRisk: (
    projectId: string,
    riskId: string,
    payload: {
      title?: string;
      description?: string;
      severity?: "low" | "medium" | "high";
      status?: "open" | "mitigated" | "closed";
      owner_user_id?: string | null;
    }
  ) =>
    request<Risk>(`/projects/${projectId}/risks/${riskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteRisk: (projectId: string, riskId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/risks/${riskId}`, {
      method: "DELETE",
    }),

  createMilestone: (
    projectId: string,
    payload: {
      name: string;
      phase_id?: string | null;
      target_date?: string | null;
      actual_date?: string | null;
      status?: "not_started" | "in_progress" | "completed";
    }
  ) =>
    request<Milestone>(`/projects/${projectId}/milestones`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateMilestone: (
    projectId: string,
    milestoneId: string,
    payload: {
      name?: string;
      phase_id?: string | null;
      target_date?: string | null;
      actual_date?: string | null;
      status?: "not_started" | "in_progress" | "completed";
    }
  ) =>
    request<Milestone>(`/projects/${projectId}/milestones/${milestoneId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteMilestone: (projectId: string, milestoneId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/milestones/${milestoneId}`, {
      method: "DELETE",
    }),

  taskComments: (projectId: string, taskId: string) =>
    request<TaskComment[]>(`/projects/${projectId}/tasks/${taskId}/comments`),

  addTaskComment: (projectId: string, taskId: string, body: string) =>
    request<TaskComment>(`/projects/${projectId}/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  deleteTaskComment: (projectId: string, taskId: string, commentId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/tasks/${taskId}/comments/${commentId}`, {
      method: "DELETE",
    }),

  createNote: (
    projectId: string,
    payload: {
      body: string;
      visibility: "internal" | "partner" | "public";
    }
  ) =>
    request<Note>(`/projects/${projectId}/notes`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  createTask: (
    projectId: string,
    payload: {
      title: string;
      phase_id?: string | null;
      assignee_user_id?: string | null;
      due_date?: string | null;
      priority?: "low" | "medium" | "high" | null;
      status?: "not_started" | "in_progress" | "completed" | "blocked";
    }
  ) =>
    request<Task>(`/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateTask: (
    projectId: string,
    taskId: string,
    payload: {
      title?: string;
      phase_id?: string | null;
      assignee_user_id?: string | null;
      due_date?: string | null;
      priority?: "low" | "medium" | "high" | null;
      status?: "not_started" | "in_progress" | "completed" | "blocked";
    }
  ) =>
    request<Task>(`/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteTask: (projectId: string, taskId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/tasks/${taskId}`, {
      method: "DELETE",
    }),

  // Project Contacts
  projectContacts: (projectId: string) =>
    request<ProjectContact[]>(`/projects/${projectId}/contacts`),

  addProjectContact: (projectId: string, contact: {
    dynamics_contact_id?: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    job_title?: string | null;
    contact_role?: string | null;
  }) =>
    request<ProjectContact>(`/projects/${projectId}/contacts`, {
      method: "POST",
      body: JSON.stringify(contact),
    }),

  removeProjectContact: (projectId: string, contactId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/contacts/${contactId}`, {
      method: "DELETE",
    }),

  // Documents
  documents: (projectId: string) =>
    request<Document[]>(`/projects/${projectId}/documents`),

  uploadDocument: async (
    projectId: string,
    payload: {
      file: File;
      category: string;
      phase_id?: string | null;
      task_id?: string | null;
    }
  ): Promise<Document> => {
    const form = new FormData();
    form.append("file", payload.file);
    form.append("category", payload.category);
    if (payload.phase_id) form.append("phase_id", payload.phase_id);
    if (payload.task_id) form.append("task_id", payload.task_id);

    const res = await fetch(`${API_BASE}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { ...DEV_HEADERS, ...getImpersonationHeaders() },
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },

  downloadDocumentUrl: (projectId: string, docId: string) =>
    `${API_BASE}/projects/${projectId}/documents/${docId}/download`,

  deleteDocument: (projectId: string, docId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/documents/${docId}`, {
      method: "DELETE",
    }),

  // Zoom
  zoomConfigured: (projectId: string) =>
    request<{ configured: boolean }>(`/projects/${projectId}/zoom/configured`),
  zoomStatus: (projectId: string) =>
    request<ZoomStatus>(`/projects/${projectId}/zoom/status`),
  zoomSaveCredentials: (projectId: string, creds: { account_id: string; client_id: string; client_secret: string }) =>
    request<{ ok: boolean }>(`/projects/${projectId}/zoom/credentials`, {
      method: "PUT",
      body: JSON.stringify(creds),
    }),
  zoomDeleteCredentials: (projectId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/zoom/credentials`, { method: "DELETE" }),

  // Admin
  adminProjects: () => request<Project[]>("/admin/projects"),

  adminArchiveProject: (id: string, archived: boolean) =>
    request<Project>(`/admin/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: archived ? 1 : 0 }),
    }),

  adminDeleteProject: (id: string) =>
    request<{ success: boolean }>(`/admin/projects/${id}`, { method: "DELETE" }),

  adminUsers: () => request<User[]>("/admin/users"),

  adminDeleteUser: (id: string) =>
    request<{ success: boolean }>(`/admin/users/${id}`, { method: "DELETE" }),

  adminCreateUser: (payload: {
    email: string;
    name?: string;
    organization_name?: string;
    role: "admin" | "pm" | "pf_ae" | "pf_sa" | "pf_csm" | "partner_ae";
  }) =>
    request<User>("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  adminUpdateUser: (
    id: string,
    payload: {
      email?: string;
      name?: string;
      organization_name?: string;
      role?: "admin" | "pm" | "pf_ae" | "pf_sa" | "pf_csm" | "partner_ae";
      is_active?: number;
    }
  ) =>
    request<User>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  adminProjectAccess: (projectId: string) =>
    request<ProjectAccess[]>(`/admin/projects/${projectId}/access`),

  adminGrantAccess: (projectId: string, payload: { user_id: string; access_level?: string }) =>
    request<ProjectAccess>(`/admin/projects/${projectId}/access`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  adminRevokeAccess: (projectId: string, userId: string) =>
    request<{ success: boolean }>(`/admin/projects/${projectId}/access/${userId}`, {
      method: "DELETE",
    }),

  // ── Solutions ───────────────────────────────────────────────────────────────

  solutions: () => request<Solution[]>("/solutions"),

  solution: (id: string) => request<Solution>(`/solutions/${id}`),

  createSolution: (payload: {
    customer_name: string;
    dynamics_account_id?: string;
    vendor: SolutionVendor;
    solution_type: SolutionType;
    pf_ae_user_id?: string;
    partner_ae_user_id?: string;
    partner_ae_name?: string;
    partner_ae_email?: string;
  }) =>
    request<Solution>("/solutions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateSolution: (
    id: string,
    payload: Partial<{
      name: string;
      customer_name: string;
      dynamics_account_id: string | null;
      vendor: SolutionVendor;
      solution_type: SolutionType;
      status: SolutionStatus;
      pf_ae_user_id: string | null;
      partner_ae_user_id: string | null;
      partner_ae_name: string | null;
      partner_ae_email: string | null;
      needs_assessment: string | null;
      requirements: string | null;
      scope_of_work: string | null;
      handoff_notes: string | null;
      gap_analysis: string | null;
      linked_project_id: string | null;
    }>
  ) =>
    request<Solution>(`/solutions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteSolution: (id: string) =>
    request<{ success: boolean }>(`/solutions/${id}`, { method: "DELETE" }),

  createProjectFromSolution: (id: string) =>
    request<Project>(`/solutions/${id}/create-project`, { method: "POST" }),

  // Solution Contacts
  solutionContacts: (solutionId: string) =>
    request<SolutionContact[]>(`/solutions/${solutionId}/contacts`),

  addSolutionContact: (solutionId: string, contact: {
    dynamics_contact_id?: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    job_title?: string | null;
    contact_role?: string | null;
  }) =>
    request<SolutionContact>(`/solutions/${solutionId}/contacts`, {
      method: "POST",
      body: JSON.stringify(contact),
    }),

  removeSolutionContact: (solutionId: string, contactId: string) =>
    request<{ success: boolean }>(`/solutions/${solutionId}/contacts/${contactId}`, {
      method: "DELETE",
    }),

  // ── Optimize ─────────────────────────────────────────────────────────────
  optimizeAccounts: () => request<OptimizeAccount[]>("/optimize/accounts"),
  optimizeEligible: () => request<OptimizeEligible[]>("/optimize/eligible"),
  optimizeAccount: (projectId: string) => request<OptimizeAccount>(`/optimize/accounts/${projectId}`),
  optimizeGraduate: (projectId: string) =>
    request<OptimizeAccount>(`/optimize/accounts/${projectId}/graduate`, { method: "POST" }),
  optimizeUpdateAccount: (projectId: string, payload: {
    sa_user_id?: string | null;
    csm_user_id?: string | null;
    optimize_status?: "active" | "paused" | "churned";
    next_review_date?: string | null;
    notes?: string | null;
  }) =>
    request<OptimizeAccount>(`/optimize/accounts/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  optimizeAssessments: (projectId: string) => request<Assessment[]>(`/optimize/assessments?project_id=${projectId}`),
  optimizeCreateAssessment: (payload: {
    project_id: string;
    assessment_type: string;
    conducted_date: string;
    overall_score?: number | null;
    adoption_score?: number | null;
    satisfaction_score?: number | null;
    notes?: string | null;
    action_items?: string | null;
    next_review_date?: string | null;
  }) =>
    request<Assessment>("/optimize/assessments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  optimizeUpdateAssessment: (id: string, payload: Partial<{
    assessment_type: string;
    conducted_date: string;
    overall_score: number | null;
    adoption_score: number | null;
    satisfaction_score: number | null;
    notes: string | null;
    action_items: string | null;
    next_review_date: string | null;
  }>) =>
    request<Assessment>(`/optimize/assessments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  optimizeDeleteAssessment: (id: string) =>
    request<{ success: boolean }>(`/optimize/assessments/${id}`, { method: "DELETE" }),

  optimizeTechStack: (projectId: string) => request<TechStackItem[]>(`/optimize/tech-stack?project_id=${projectId}`),
  optimizeCreateTechStack: (payload: {
    project_id: string;
    tech_area: string;
    tech_area_label?: string | null;
    current_vendor?: string | null;
    current_solution?: string | null;
    time_rating?: string | null;
    notes?: string | null;
  }) =>
    request<TechStackItem>("/optimize/tech-stack", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  optimizeUpdateTechStack: (id: string, payload: Partial<{
    tech_area: string;
    tech_area_label: string | null;
    current_vendor: string | null;
    current_solution: string | null;
    time_rating: string | null;
    notes: string | null;
  }>) =>
    request<TechStackItem>(`/optimize/tech-stack/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  optimizeDeleteTechStack: (id: string) =>
    request<{ success: boolean }>(`/optimize/tech-stack/${id}`, { method: "DELETE" }),

  optimizeRoadmap: (projectId: string) => request<RoadmapItem[]>(`/optimize/roadmap?project_id=${projectId}`),
  optimizeCreateRoadmapItem: (payload: {
    project_id: string;
    title: string;
    description?: string | null;
    category?: string;
    priority?: string;
    time_rating?: string | null;
    status?: string;
    target_date?: string | null;
    tech_stack_id?: string | null;
  }) =>
    request<RoadmapItem>("/optimize/roadmap", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  optimizeUpdateRoadmapItem: (id: string, payload: Partial<{
    title: string;
    description: string | null;
    category: string;
    priority: string;
    time_rating: string | null;
    status: string;
    target_date: string | null;
  }>) =>
    request<RoadmapItem>(`/optimize/roadmap/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  optimizeDeleteRoadmapItem: (id: string) =>
    request<{ success: boolean }>(`/optimize/roadmap/${id}`, { method: "DELETE" }),

  optimizeUtilization: (projectId: string) =>
    request<UtilizationSnapshot[]>(`/optimize/accounts/${projectId}/utilization`),
};
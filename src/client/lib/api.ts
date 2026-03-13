const API_BASE = "/api";
const DEV_HEADERS: Record<string, string> = import.meta.env.DEV ? { "x-dev-user-email": "rdyla@packetfusion.com" } : {};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...DEV_HEADERS,
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

export type MeResponse = {
  user: User;
  role: string;
  organization: string | null;
};

export const api = {
  me: () => request<MeResponse>("/me"),
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
      headers: { ...DEV_HEADERS },
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
  adminUsers: () => request<User[]>("/admin/users"),

  adminCreateUser: (payload: {
    email: string;
    name?: string;
    organization_name?: string;
    role: "admin" | "pm" | "pf_ae" | "partner_ae";
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
      role?: "admin" | "pm" | "pf_ae" | "partner_ae";
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
};
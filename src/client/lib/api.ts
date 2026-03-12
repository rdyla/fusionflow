const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "x-dev-user-email": "pm@packetfusion.com",
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

export type DashboardSummaryResponse = {
  user: User;
  summary: {
    activeProjects: number;
    atRiskProjects: number;
  };
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
  ae_user_id: string | null;
  created_at: string;
  updated_at: string;
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

export type Note = {
  id: string;
  project_id: string;
  author_user_id: string | null;
  body: string;
  visibility: string | null;
  created_at: string;
};

export const api = {
  me: () => request<User>("/me"),
  dashboardSummary: () => request<DashboardSummaryResponse>("/dashboard/summary"),
  projects: () => request<Project[]>("/projects"),
  project: (id: string) => request<Project>(`/projects/${id}`),

  phases: (projectId: string) => request<Phase[]>(`/projects/${projectId}/phases`),
  milestones: (projectId: string) => request<Milestone[]>(`/projects/${projectId}/milestones`),
  tasks: (projectId: string) => request<Task[]>(`/projects/${projectId}/tasks`),
  risks: (projectId: string) => request<Risk[]>(`/projects/${projectId}/risks`),
  notes: (projectId: string) => request<Note[]>(`/projects/${projectId}/notes`),

  createProject: (payload: {
    name: string;
    customer_name?: string;
    vendor?: string;
    solution_type?: string;
    kickoff_date?: string;
    target_go_live_date?: string;
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
    }
  ) =>
    request<Project>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
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
};
const API_BASE = "/api";

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
      ...getImpersonationHeaders(),
    },
    ...options,
  });

  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; message?: string } | null;
    throw new Error(body?.error ?? body?.message ?? `API error: ${res.status}`);
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
  avatar_url?: string | null;
  dynamics_account_id?: string | null;
  manager_id?: string | null;
  zoom_user_id?: string | null;
  can_open_cases?: boolean;
};

export type SolutionType = "ucaas" | "ccaas" | "ci" | "va" | (string & {});

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
export type SolutionVendor = "zoom" | "ringcentral" | "tbd" | (string & {});

export type Solution = {
  id: string;
  name: string;
  customer_name: string;
  dynamics_account_id: string | null;
  vendor: SolutionVendor;
  solution_type: SolutionType;
  status: SolutionStatus;
  partner_ae_user_id: string | null;
  partner_ae_name: string | null;
  partner_ae_email: string | null;
  needs_assessment: string | null;
  requirements: string | null;
  scope_of_work: string | null;
  handoff_notes: string | null;
  gap_analysis: string | null;
  linked_project_id: string | null;
  customer_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  partner_ae_display_name: string | null;
  linked_project_count: number | null;
  customer_pf_ae_name: string | null;
  customer_pf_ae_email: string | null;
  customer_pf_sa_name: string | null;
  customer_pf_sa_email: string | null;
  customer_pf_csm_name: string | null;
  customer_pf_csm_email: string | null;
  customer_sharepoint_url: string | null;
  journeys: string | null; // JSON array of journey keys
};

export type DashboardTask = Task & { project_name: string };
export type DashboardRisk = Risk & { project_name: string };

export type SPLocation = {
  id: string;
  name: string;
  absoluteUrl: string;
};

export type SPFile = {
  id: string;
  name: string;
  size: number | null;
  lastModified: string | null;
  webUrl: string;
  downloadUrl: string | null;
  isFolder: boolean;
  mimeType: string | null;
};

export type DashboardSummaryResponse = {
  user: User;
  summary: {
    activeProjects: number;
    atRiskProjects: number;
    openTasks: number;
    openRisks: number;
  };
  projects: Project[];
  projectPhases: { project_id: string; name: string; status: string; sort_order: number }[];
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
  health_override: string | null;
  kickoff_date: string | null;
  target_go_live_date: string | null;
  actual_go_live_date: string | null;
  pm_user_id: string | null;
  customer_id: string | null;
  dynamics_account_id: string | null;
  archived: number | null;
  solution_id: string | null;
  crm_case_id: string | null;
  crm_opportunity_id: string | null;
  customer_display_name: string | null;
  // Joined chain fields (detail + list)
  linked_solution_name: string | null;
  linked_solution_customer: string | null;
  linked_solution_status: string | null;
  linked_solution_type: string | null;
  has_optimization: number | null;
  customer_pf_ae_name: string | null;
  customer_pf_ae_email: string | null;
  customer_pf_sa_name: string | null;
  customer_pf_sa_email: string | null;
  customer_pf_csm_name: string | null;
  customer_pf_csm_email: string | null;
  customer_sharepoint_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectChain = {
  solution: Pick<Solution, "id" | "name" | "customer_name" | "status" | "solution_type" | "vendor"> | null;
  optimizeAccount: { project_id: string; optimize_status: string } | null;
};

export type ZoomRecordingFile = {
  id: string;
  file_type: string;
  file_size: number;
  play_url: string | null;
  download_url: string | null;
  recording_type: string;
  recording_start: string;
  recording_end: string;
};

export type ZoomRecording = {
  id: string;
  project_id: string;
  phase_id: string | null;
  phase_name: string | null;
  task_id: string | null;
  task_name: string | null;
  meeting_id: string;
  topic: string;
  start_time: string;
  duration_mins: number;
  host_email: string | null;
  recording_files: ZoomRecordingFile[];
  match_reason: string | null;
  manually_assigned: number;
  created_at: string;
};

export type ZoomRecordingSuggestion = {
  meeting_id: string;
  topic: string;
  start_time: string;
  duration_mins: number;
  host_email: string | null;
  recording_files: ZoomRecordingFile[];
  suggested_phase_id: string | null;
  suggested_phase_name: string | null;
  match_reason: string | null;
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

export type CrmAccountTeam = {
  ae_name: string | null;
  ae_email: string | null;
  ae_user_id: string | null;
  sa_name: string | null;
  sa_email: string | null;
  sa_user_id: string | null;
  csm_name: string | null;
  csm_email: string | null;
  csm_user_id: string | null;
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
  pfi_sowhours: number | null;
};

export type SupportCase = {
  id: string;
  ticketNumber: string | null;
  title: string;
  description: string | null;
  statecode: number;
  statuscode: number;
  status: string;
  prioritycode: number;
  priority: string;
  casetypecode: number | null;
  caseType: string | null;
  accountId: string | null;
  accountName: string | null;
  ownerName: string | null;
  createdOn: string;
  modifiedOn: string;
};

export type CaseTimeEntry = {
  id: string;
  description: string | null;
  date: string | null;
  durationMinutes: number | null;
  durationHours: number | null;
  resourceName: string | null;
  entryStatus: string | null;
  createdOn: string;
};

export type DynamicsQuote = {
  quoteid: string;
  name: string;
  statecode: number;
  stateLabel: string;
  am_sow: number | null;
  opportunityId: string | null;
};

export type CaseComplianceData = {
  case: SupportCase | null;
  timeEntries: CaseTimeEntry[];
  quotedHours: {
    total_low: number | null;
    total_expected: number | null;
    total_high: number | null;
    final_hours: Record<string, number>;
  } | null;
  sowQuote: DynamicsQuote | null;
  accountOpportunities: DynamicsOpportunity[];
};

// ── Prospecting ────────────────────────────────────────────────────────────

export type ProspectList = {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_org: string | null;
  created_by_id: string;
  created_by_name: string | null;
  domain_count: number;
  enriched_count: number;
  status: "pending" | "enriching" | "ready";
  created_at: string;
  updated_at: string;
};

export type Prospect = {
  id: string;
  list_id: string;
  domain: string;
  company_name: string | null;
  industry: string | null;
  employee_count: number | null;
  annual_revenue_printed: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  founded_year: number | null;
  website_url: string | null;
  linkedin_url: string | null;
  logo_url: string | null;
  technologies: string[];
  uc_provider: string | null;
  cc_provider: string | null;
  score: number | null;
  tier: "hot" | "warm" | "cold" | null;
  apollo_org_id: string | null;
  why_now: string | null;
  company_challenges: string | null;
  proposed_solution: string | null;
  store_rationale: string | null;
  email_sequence: string | null;
  talk_track: string | null;
  linkedin_inmail: string | null;
  enrichment_status: "pending" | "enriched" | "failed";
  ai_status: "none" | "generating" | "ready" | "failed";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProspectContact = {
  id: string;
  prospect_id: string;
  apollo_id: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  seniority: string | null;
  is_top_contact: number;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  crm_account_id: string;
  sharepoint_url: string | null;
  pf_ae_user_id: string | null;
  pf_sa_user_id: string | null;
  pf_csm_user_id: string | null;
  address_city: string | null;
  address_state: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  pf_ae_name: string | null;
  pf_ae_email: string | null;
  pf_sa_name: string | null;
  pf_sa_email: string | null;
  pf_csm_name: string | null;
  pf_csm_email: string | null;
};

export type CustomerContact = {
  id: string;
  customer_id: string;
  dynamics_contact_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  contact_role: string | null;
  added_at: string;
};

export type CustomerProviderAe = {
  id: string;
  customer_id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  added_at: string;
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
  scheduled_start: string | null;
  scheduled_end: string | null;
  pay_code_id: string | null;
  cost_code_id: string | null;
  crm_time_entry_id: string | null;
};

export type TimeEntrySetup = {
  pay_codes: Array<{ amc_paycodeid: string; amc_name: string; amc_description: string | null }>;
  cost_codes: Array<{ amc_costcodeid: string; amc_name: string; amc_description: string | null }>;
  case_id: string | null;
  job_id: string | null;
  account_id: string | null;
};

export type TaskTimeEntry = {
  id: string;
  task_id: string;
  project_id: string;
  crm_time_entry_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  pay_code_id: string | null;
  cost_code_id: string | null;
  user_id: string | null;
  user_name: string | null;
  created_at: string;
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

export type RCAnalytics = {
  total_calls: number;
  answered: number;
  missed: number;
  inbound: number;
  outbound: number;
  total_duration_sec: number;
  abandoned: number;
  business_hours: number;
  after_hours: number;
};

export type RCStatus = {
  configured: boolean;
  error?: string;
  account?: {
    name: string;
    main_number: string | null;
    brand: string | null;
    service_plan: string | null;
    billing_plan: string | null;
    included_lines: number | null;
    account_since: string | null;
    status: string | null;
  } | null;
  total_extensions?: number | null;
  extension_breakdown?: Record<string, number> | null;
  call_queues?: number | null;
  ivr_menus?: number | null;
  devices?: number | null;
  analytics_30d?: RCAnalytics | null;
  warnings?: string[];
};

export type ZoomDevice = {
  id: string;
  display_name: string;
  mac_address: string | null;
  model: string | null;
  status: string | null;
  assignee: { name: string; extension_number: string | null } | null;
};

export type ZoomCallingPlan = {
  name: string;
  type: number;
  subscribed: number;
  assigned: number;
  available: number;
};

export type ZoomStatus = {
  configured: boolean;
  error?: string;
  account?: { id: string; account_name: string; account_type: number };
  plans?: Record<string, unknown>;
  total_users?: number | null;
  active_users_30d?: number | null;
  devices?: ZoomDevice[];
  devices_total?: number;
  warnings?: string[];
  phone_users_total?: number | null;
  call_queues_total?: number | null;
  auto_receptionists_total?: number | null;
  cc_users_total?: number | null;
  cc_queues_total?: number | null;
  calling_plans?: ZoomCallingPlan[] | null;
  meeting_activity_30d?: { participants: number; meeting_minutes: number } | null;
  phone_calls_30d?: number | null;
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
  author_name: string | null;
  author_org: string | null;
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

// ── Staff types ──────────────────────────────────────────────────────────────

export type ProjectStaffMember = {
  id: string;
  project_id: string;
  user_id: string;
  staff_role: string;
  name: string | null;
  email: string;
  role: string;
  avatar_url: string | null;
  organization_name: string | null;
  created_at: string;
};

export type SolutionStaffMember = {
  id: string;
  solution_id: string;
  user_id: string;
  staff_role: string;
  name: string | null;
  email: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
};

// ── Optimize types ───────────────────────────────────────────────────────────

export type OptimizeAccount = {
  id: string;
  project_id: string;
  project_name: string;
  customer_name: string | null;
  graduated_at: string;
  graduation_method: "auto" | "manual" | "direct";
  optimize_status: "active" | "paused" | "churned";
  next_review_date: string | null;
  notes: string | null;
  customer_id: string | null;
  // Team comes from the linked customer
  ae_user_id: string | null;
  ae_name: string | null;
  sa_user_id: string | null;
  sa_name: string | null;
  csm_user_id: string | null;
  csm_name: string | null;
  dynamics_account_id: string | null;
  solution_id: string | null;
  linked_solution_name: string | null;
  last_assessment_date: string | null;
  last_assessment_score: number | null;
  customer_pf_ae_name: string | null;
  customer_pf_ae_email: string | null;
  customer_pf_sa_name: string | null;
  customer_pf_sa_email: string | null;
  customer_pf_csm_name: string | null;
  customer_pf_csm_email: string | null;
  customer_sharepoint_url: string | null;
};

export type OptimizeEligible = {
  id: string;
  name: string;
  customer_name: string | null;
  vendor: string | null;
  actual_go_live_date: string | null;
};

export type ImpactAssessment = {
  id: string;
  project_id: string;
  survey_id: string;
  conducted_date: string;
  conducted_by_user_id: string | null;
  conducted_by_name: string | null;
  solution_types: string[];
  answers: Record<string, unknown>;
  section_scores: Record<string, number> | null;
  solution_scores: Record<string, number> | null;
  overall_score: number | null;
  confidence_score: number | null;
  health_band: string | null;
  recommended_actions: string[] | null;
  insights: string[] | null;
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

export type NeedsAssessment = {
  id: string;
  solution_id: string;
  survey_id: string;
  answers: Record<string, unknown>;
  readiness_score: number | null;
  readiness_status: string | null;
  created_at: string;
  updated_at: string;
};

export type LaborEstimate = {
  id: string;
  solution_id: string;
  model_version: string;
  solution_type_category: string;
  base_hours: Record<string, number>;
  driver_adjustments: Array<{
    driverId: string;
    field: string;
    workstreams: string[];
    hoursAdded: number;
    reason: string;
  }>;
  complexity: { score: number; band: string; multiplier: number; factors: Array<{ label: string; points: number; detail: string }> };
  pre_override_hours: Record<string, number>;
  final_hours: Record<string, number>;
  overrides: Record<string, number>;
  total_low: number;
  total_expected: number;
  total_high: number;
  confidence_score: number;
  confidence_band: string;
  risk_flags: string[];
  created_at: string;
  updated_at: string;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  project_id: string | null;
  read_at: string | null;
  created_at: string;
  sender_id: string | null;
  sender_name: string | null;
  sender_email: string | null;
};

export type InboxPage = {
  items: Notification[];
  total: number;
  page: number;
  hasMore: boolean;
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


// ── Template types ────────────────────────────────────────────────────────────

export type TemplateTask = {
  id: string;
  template_id: string;
  phase_id: string | null;
  title: string;
  priority: string | null;
  order_index: number;
};

export type TemplatePhase = {
  id: string;
  template_id: string;
  name: string;
  order_index: number;
  tasks: TemplateTask[];
};

export type Template = {
  id: string;
  name: string;
  solution_type: string | null;
  description: string | null;
  phase_count?: number;
  task_count?: number;
  phases?: TemplatePhase[];
  created_at: string;
  updated_at: string;
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

  searchDynamicsCases: (params: { accountId?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params.accountId) qs.set("accountId", params.accountId);
    if (params.q) qs.set("q", params.q);
    return request<SupportCase[]>(`/dynamics/cases/search?${qs.toString()}`);
  },

  projectCaseCompliance: (projectId: string) =>
    request<CaseComplianceData>(`/projects/${projectId}/case`),

  createProject: (payload: {
    name: string;
    customer_name?: string;
    customer_id?: string | null;
    vendor?: string;
    solution_type?: string;
    kickoff_date?: string;
    target_go_live_date?: string;
    pm_user_id?: string | null;
    dynamics_account_id?: string | null;
    solution_id?: string | null;
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
      clear_health_override?: boolean;
      target_go_live_date?: string;
      actual_go_live_date?: string;
      pm_user_id?: string | null;
      solution_id?: string | null;
      crm_case_id?: string | null;
      crm_opportunity_id?: string | null;
    }
  ) =>
    request<Project>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  projectChain: (projectId: string) =>
    request<ProjectChain>(`/projects/${projectId}/chain`),

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

  timeEntrySetup: (projectId: string) =>
    request<TimeEntrySetup>(`/projects/${projectId}/time-entry/setup`),

  getTaskTimeEntries: (projectId: string, taskId: string) =>
    request<TaskTimeEntry[]>(`/projects/${projectId}/tasks/${taskId}/time-entries`),

  logTaskTime: (
    projectId: string,
    taskId: string,
    payload: {
      scheduled_start: string;
      scheduled_end: string;
      pay_code_id: string;
      cost_code_id?: string | null;
      case_id: string;
      job_id: string;
      account_id?: string | null;
    }
  ) =>
    request<TaskTimeEntry>(`/projects/${projectId}/tasks/${taskId}/time-entries`, {
      method: "POST",
      body: JSON.stringify(payload),
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
      headers: { ...getImpersonationHeaders() },
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

  // RingCentral
  rcStatus: (projectId: string) =>
    request<RCStatus>(`/projects/${projectId}/ringcentral/status`),
  rcSaveCredentials: (projectId: string, creds: { client_id: string; client_secret: string; jwt_token: string }) =>
    request<{ ok: boolean }>(`/projects/${projectId}/ringcentral/credentials`, { method: "PUT", body: JSON.stringify(creds) }),
  rcDeleteCredentials: (projectId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/ringcentral/credentials`, { method: "DELETE" }),

  // SharePoint
  spLocations: (recordId: string) =>
    request<{ locations: SPLocation[] }>(`/sharepoint/locations?recordId=${encodeURIComponent(recordId)}`),
  spFiles: (folderUrl: string) =>
    request<{ files: SPFile[] }>(`/sharepoint/files?url=${encodeURIComponent(folderUrl)}`),
  spUpload: async (folderUrl: string, file: File): Promise<{ file: SPFile }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/sharepoint/upload?url=${encodeURIComponent(folderUrl)}`, {
      method: "POST",
      headers: { ...getImpersonationHeaders() },
      body: form,
    });
    if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? `Upload failed: ${res.status}`);
    }
    return res.json();
  },
  spDelete: (webUrl: string) =>
    request<{ ok: boolean }>(`/sharepoint/file?webUrl=${encodeURIComponent(webUrl)}`, { method: "DELETE" }),

  // Admin
  adminProjects: () => request<Project[]>("/admin/projects"),

  adminArchiveProject: (id: string, archived: boolean) =>
    request<Project>(`/admin/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: archived ? 1 : 0 }),
    }),

  adminDeleteProject: (id: string) =>
    request<{ success: boolean }>(`/admin/projects/${id}`, { method: "DELETE" }),

  adminRunHealthScoring: () =>
    request<{ scored: number }>("/admin/run-health-scoring", { method: "POST" }),

  adminUsers: () => request<User[]>("/admin/users"),

  adminDeleteUser: (id: string) =>
    request<{ success: boolean }>(`/admin/users/${id}`, { method: "DELETE" }),

  adminCreateUser: (payload: {
    email: string;
    name?: string;
    organization_name?: string;
    role: "admin" | "executive" | "pm" | "pf_ae" | "pf_sa" | "pf_csm" | "pf_engineer" | "partner_ae" | "client";
    dynamics_account_id?: string;
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
      role?: "admin" | "executive" | "pm" | "pf_ae" | "pf_sa" | "pf_csm" | "pf_engineer" | "partner_ae" | "client";
      is_active?: number;
      dynamics_account_id?: string | null;
      manager_id?: string | null;
      zoom_user_id?: string | null;
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
    customer_id?: string;
    dynamics_account_id?: string;
    vendor?: SolutionVendor;
    solution_type?: SolutionType;
    journeys?: string[];
    pf_ae_user_id?: string;
    pf_sa_user_id?: string;
    pf_csm_user_id?: string;
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

  solutionProjects: (solutionId: string) =>
    request<Project[]>(`/solutions/${solutionId}/projects`),

  linkProjectToSolution: (solutionId: string, projectId: string) =>
    request<{ success: boolean }>(`/solutions/${solutionId}/link-project`, {
      method: "POST",
      body: JSON.stringify({ project_id: projectId }),
    }),

  unlinkProjectFromSolution: (solutionId: string, projectId: string) =>
    request<{ success: boolean }>(`/solutions/${solutionId}/link-project/${projectId}`, {
      method: "DELETE",
    }),

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

  // ── Project Staff ─────────────────────────────────────────────────────────
  projectStaff: (projectId: string) => request<ProjectStaffMember[]>(`/projects/${projectId}/staff`),
  addProjectStaff: (projectId: string, payload: { user_id: string; staff_role: string }) =>
    request<ProjectStaffMember>(`/projects/${projectId}/staff`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removeProjectStaff: (projectId: string, staffId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/staff/${staffId}`, { method: "DELETE" }),
  projectCrmSync: (projectId: string) =>
    request<{ staff: ProjectStaffMember[]; crm: { ae_name: string | null; sa_name: string | null; csm_name: string | null }; project: Project }>(`/projects/${projectId}/crm-sync`, { method: "POST" }),

  // ── Solution Staff ────────────────────────────────────────────────────────
  solutionStaff: (solutionId: string) => request<SolutionStaffMember[]>(`/solutions/${solutionId}/staff`),
  addSolutionStaff: (solutionId: string, payload: { user_id: string; staff_role: string }) =>
    request<SolutionStaffMember>(`/solutions/${solutionId}/staff`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removeSolutionStaff: (solutionId: string, staffId: string) =>
    request<{ success: boolean }>(`/solutions/${solutionId}/staff/${staffId}`, { method: "DELETE" }),
  solutionCrmSync: (solutionId: string) =>
    request<{ staff: SolutionStaffMember[]; crm: { ae_name: string | null; sa_name: string | null; csm_name: string | null } }>(`/solutions/${solutionId}/crm-sync`, { method: "POST" }),

  // ── Optimize ─────────────────────────────────────────────────────────────
  optimizeCrmSearch: (q: string) =>
    request<DynamicsAccount[]>(`/optimize/crm/accounts?q=${encodeURIComponent(q)}`),
  optimizeCrmAccountTeam: (accountId: string) =>
    request<CrmAccountTeam>(`/optimize/crm/accounts/${accountId}/team`),
  optimizeAccounts: () => request<OptimizeAccount[]>("/optimize/accounts"),
  optimizeEligible: () => request<OptimizeEligible[]>("/optimize/eligible"),
  optimizeAccount: (projectId: string) => request<OptimizeAccount>(`/optimize/accounts/${projectId}`),
  optimizeGraduate: (projectId: string) =>
    request<OptimizeAccount>(`/optimize/accounts/${projectId}/graduate`, { method: "POST" }),
  optimizeDirectEnroll: (payload: {
    customer_name: string;
    vendor?: string | null;
    solution_type?: string | null;
    actual_go_live_date?: string | null;
    ae_user_id?: string | null;
    sa_user_id?: string | null;
    csm_user_id?: string | null;
    next_review_date?: string | null;
    notes?: string | null;
    dynamics_account_id?: string | null;
    project_id?: string | null;
  }) =>
    request<OptimizeAccount>("/optimize/accounts/direct", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  optimizeLinkedSolution: (projectId: string) =>
    request<Pick<Solution, "id" | "name" | "customer_name" | "status" | "solution_type" | "vendor"> | null>(
      `/optimize/accounts/${projectId}/linked-solution`
    ),
  optimizeUpdateAccount: (projectId: string, payload: {
    ae_user_id?: string | null;
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
  optimizeCrmSync: (projectId: string) =>
    request<{ account: OptimizeAccount; crm: { ae_name: string | null; sa_name: string | null; csm_name: string | null } }>(
      `/optimize/accounts/${projectId}/crm-sync`, { method: "POST" }
    ),

  optimizeDeleteAccount: (projectId: string) =>
    request<{ success: boolean }>(`/optimize/accounts/${projectId}`, { method: "DELETE" }),

  optimizeAssessments: (projectId: string) => request<ImpactAssessment[]>(`/optimize/accounts/${projectId}/assessments`),
  optimizeCreateAssessment: (payload: {
    project_id: string;
    conducted_date: string;
    conducted_by_user_id?: string | null;
    solution_types: string[];
    answers: Record<string, unknown>;
  }) =>
    request<ImpactAssessment>(`/optimize/accounts/${payload.project_id}/assessments`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  optimizeDeleteAssessment: (projectId: string, assessmentId: string) =>
    request<{ success: boolean }>(`/optimize/accounts/${projectId}/assessments/${assessmentId}`, { method: "DELETE" }),

  optimizeTechStack: (projectId: string) => request<TechStackItem[]>(`/optimize/accounts/${projectId}/tech-stack`),
  optimizeCreateTechStack: (payload: {
    project_id: string;
    tech_area: string;
    tech_area_label?: string | null;
    current_vendor?: string | null;
    current_solution?: string | null;
    time_rating?: string | null;
    notes?: string | null;
  }) =>
    request<TechStackItem>(`/optimize/accounts/${payload.project_id}/tech-stack`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  optimizeUpdateTechStack: (projectId: string, areaId: string, payload: Partial<{
    tech_area: string;
    tech_area_label: string | null;
    current_vendor: string | null;
    current_solution: string | null;
    time_rating: string | null;
    notes: string | null;
  }>) =>
    request<TechStackItem>(`/optimize/accounts/${projectId}/tech-stack/${areaId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  optimizeDeleteTechStack: (projectId: string, areaId: string) =>
    request<{ success: boolean }>(`/optimize/accounts/${projectId}/tech-stack/${areaId}`, { method: "DELETE" }),

  optimizeRoadmap: (projectId: string) => request<RoadmapItem[]>(`/optimize/accounts/${projectId}/roadmap`),
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
    request<RoadmapItem>(`/optimize/accounts/${payload.project_id}/roadmap`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  optimizeUpdateRoadmapItem: (projectId: string, itemId: string, payload: Partial<{
    title: string;
    description: string | null;
    category: string;
    priority: string;
    time_rating: string | null;
    status: string;
    target_date: string | null;
  }>) =>
    request<RoadmapItem>(`/optimize/accounts/${projectId}/roadmap/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  optimizeDeleteRoadmapItem: (projectId: string, itemId: string) =>
    request<{ success: boolean }>(`/optimize/accounts/${projectId}/roadmap/${itemId}`, { method: "DELETE" }),

  optimizeUtilization: (projectId: string) =>
    request<UtilizationSnapshot[]>(`/optimize/accounts/${projectId}/utilization`),

  optimizeUtilizationSync: (projectId: string) =>
    request<UtilizationSnapshot>(`/optimize/accounts/${projectId}/utilization/sync`, { method: "POST" }),

  // ── Zoom Recordings ──────────────────────────────────────────────────────────

  zoomRecordings: (projectId: string) =>
    request<ZoomRecording[]>(`/projects/${projectId}/zoom/recordings`),
  zoomSyncRecordings: (projectId: string) =>
    request<{ suggestions: ZoomRecordingSuggestion[]; already_linked: ZoomRecording[] }>(`/projects/${projectId}/zoom/recordings/sync`, { method: "POST" }),
  zoomConfirmRecordings: (projectId: string, confirmations: { meeting_id: string; phase_id: string | null; task_id?: string | null; topic: string; start_time: string; duration_mins: number; host_email: string | null; recording_files: ZoomRecordingFile[]; match_reason: string | null }[]) =>
    request<ZoomRecording[]>(`/projects/${projectId}/zoom/recordings/confirm`, {
      method: "POST",
      body: JSON.stringify({ confirmations }),
    }),
  zoomReassignRecording: (projectId: string, recordingId: string, phase_id: string | null, task_id?: string | null) =>
    request<ZoomRecording>(`/projects/${projectId}/zoom/recordings/${recordingId}`, {
      method: "PATCH",
      body: JSON.stringify({ phase_id, task_id }),
    }),
  zoomDeleteRecording: (projectId: string, recordingId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/zoom/recordings/${recordingId}`, { method: "DELETE" }),

  // ── Labor Estimates ──────────────────────────────────────────────────────────
  laborEstimate: (solutionId: string) =>
    request<LaborEstimate>(`/solutions/${solutionId}/labor-estimate`),
  upsertLaborEstimate: (solutionId: string, body: { overrides?: Record<string, number> }) =>
    request<LaborEstimate>(`/solutions/${solutionId}/labor-estimate`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteLaborEstimate: (solutionId: string) =>
    request<{ success: boolean }>(`/solutions/${solutionId}/labor-estimate`, { method: "DELETE" }),

  // ── Labor Config (admin) ──────────────────────────────────────────────────────
  laborConfig: () =>
    request<{ categories: Record<string, Record<string, number>>; defaults: Record<string, Record<string, number>> }>("/admin/labor-config"),
  updateLaborConfig: (category: string, base_hours: Record<string, number>) =>
    request<{ ok: boolean }>("/admin/labor-config", { method: "PUT", body: JSON.stringify({ category, base_hours }) }),
  resetLaborConfig: (category: string) =>
    request<{ ok: boolean }>(`/admin/labor-config/${category}`, { method: "DELETE" }),

  // ── Needs Assessments ────────────────────────────────────────────────────────
  needsAssessment: (solutionId: string) =>
    request<NeedsAssessment>(`/solutions/${solutionId}/needs-assessment`),
  upsertNeedsAssessment: (solutionId: string, body: { answers: Record<string, unknown> }) =>
    request<NeedsAssessment>(`/solutions/${solutionId}/needs-assessment`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteNeedsAssessment: (solutionId: string) =>
    request<{ success: boolean }>(`/solutions/${solutionId}/needs-assessment`, { method: "DELETE" }),

  // ── Templates ────────────────────────────────────────────────────────────────
  templatesList: () => request<Template[]>("/admin/templates-list"), // admin + pm
  adminTemplates: () => request<Template[]>("/admin/templates"),
  adminTemplate: (id: string) => request<Template>(`/admin/templates/${id}`),
  adminCreateTemplate: (payload: { name: string; solution_type?: string; description?: string }) =>
    request<Template>("/admin/templates", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateTemplate: (id: string, payload: { name?: string; solution_type?: string; description?: string }) =>
    request<Template>(`/admin/templates/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminDeleteTemplate: (id: string) =>
    request<{ success: boolean }>(`/admin/templates/${id}`, { method: "DELETE" }),
  adminAddTemplatePhase: (templateId: string, payload: { name: string; order_index: number }) =>
    request<TemplatePhase>(`/admin/templates/${templateId}/phases`, { method: "POST", body: JSON.stringify(payload) }),
  adminDeleteTemplatePhase: (templateId: string, phaseId: string) =>
    request<{ success: boolean }>(`/admin/templates/${templateId}/phases/${phaseId}`, { method: "DELETE" }),
  adminAddTemplateTask: (templateId: string, payload: { title: string; priority?: string; phase_id?: string; order_index?: number }) =>
    request<TemplateTask>(`/admin/templates/${templateId}/tasks`, { method: "POST", body: JSON.stringify(payload) }),
  adminDeleteTemplateTask: (templateId: string, taskId: string) =>
    request<{ success: boolean }>(`/admin/templates/${templateId}/tasks/${taskId}`, { method: "DELETE" }),
  applyTemplate: (projectId: string, templateId: string) =>
    request<{ phases_created: number; tasks_created: number }>(`/projects/${projectId}/apply-template`, {
      method: "POST",
      body: JSON.stringify({ template_id: templateId }),
    }),

  // ── Inbox ─────────────────────────────────────────────────────────────────
  inboxUnreadCount: () =>
    request<{ count: number }>("/inbox/unread-count"),
  inbox: (tab: "all" | "notifications" | "messages" = "all", page = 1) =>
    request<InboxPage>(`/inbox?tab=${tab}&page=${page}`),
  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/inbox/${id}/read`, { method: "PATCH" }),
  markAllRead: () =>
    request<{ ok: boolean }>("/inbox/read-all", { method: "POST" }),
  sendMessage: (recipientUserId: string, body: string) =>
    request<{ ok: boolean }>("/inbox/messages", {
      method: "POST",
      body: JSON.stringify({ recipient_user_id: recipientUserId, body }),
    }),
  deleteNotification: (id: string) =>
    request<{ ok: boolean }>(`/inbox/${id}`, { method: "DELETE" }),

  // ── Customers ──────────────────────────────────────────────────────────────
  customers: () =>
    request<Customer[]>("/customers"),
  customer: (id: string) =>
    request<Customer>(`/customers/${id}`),
  createCustomer: (data: { name: string; crm_account_id: string; sharepoint_url?: string | null; pf_ae_user_id?: string | null; pf_sa_user_id?: string | null; pf_csm_user_id?: string | null }) =>
    request<Customer>("/customers", { method: "POST", body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: Partial<{ name: string; sharepoint_url: string | null; pf_ae_user_id: string | null; pf_sa_user_id: string | null; pf_csm_user_id: string | null }>) =>
    request<Customer>(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCustomer: (id: string) =>
    request<{ success: boolean }>(`/customers/${id}`, { method: "DELETE" }),
  customerCrmSync: (id: string) =>
    request<{ customer: Customer; crm: { ae_name: string | null; sa_name: string | null; csm_name: string | null } }>(`/customers/${id}/crm-sync`, { method: "POST" }),
  customerContacts: (id: string) =>
    request<CustomerContact[]>(`/customers/${id}/contacts`),
  addCustomerContact: (id: string, data: { name: string; email?: string | null; phone?: string | null; job_title?: string | null; contact_role?: string | null; dynamics_contact_id?: string }) =>
    request<CustomerContact>(`/customers/${id}/contacts`, { method: "POST", body: JSON.stringify(data) }),
  deleteCustomerContact: (id: string, contactId: string) =>
    request<{ success: boolean }>(`/customers/${id}/contacts/${contactId}`, { method: "DELETE" }),
  customerProviderAes: (id: string) =>
    request<CustomerProviderAe[]>(`/customers/${id}/provider-aes`),
  addCustomerProviderAe: (id: string, data: { name: string; company?: string | null; email?: string | null; phone?: string | null }) =>
    request<CustomerProviderAe>(`/customers/${id}/provider-aes`, { method: "POST", body: JSON.stringify(data) }),
  updateCustomerProviderAe: (id: string, aeId: string, data: Partial<{ name: string; company: string | null; email: string | null; phone: string | null }>) =>
    request<CustomerProviderAe>(`/customers/${id}/provider-aes/${aeId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCustomerProviderAe: (id: string, aeId: string) =>
    request<{ success: boolean }>(`/customers/${id}/provider-aes/${aeId}`, { method: "DELETE" }),
  customerSolutions: (id: string) =>
    request<Pick<Solution, "id" | "name" | "vendor" | "solution_type" | "status" | "created_at" | "updated_at" | "linked_project_id" | "dynamics_account_id">[]>(`/customers/${id}/solutions`),
  customerProjects: (id: string) =>
    request<Pick<Project, "id" | "name" | "vendor" | "solution_type" | "status" | "health" | "kickoff_date" | "target_go_live_date" | "actual_go_live_date" | "pm_user_id" | "solution_id" | "created_at" | "updated_at"> & { has_optimization: number | null }>(`/customers/${id}/projects`),
  customerOptimizations: (id: string) =>
    request<{ id: string; project_id: string; optimize_status: string; graduated_at: string | null; next_review_date: string | null; project_name: string; vendor: string | null; solution_type: string | null; actual_go_live_date: string | null }[]>(`/customers/${id}/optimizations`),

  // ── Prospecting ──────────────────────────────────────────────────────────
  prospectingLists: () =>
    request<ProspectList[]>("/prospecting/lists"),
  prospectingList: (id: string) =>
    request<{ list: ProspectList; prospects: Prospect[] }>(`/prospecting/lists/${id}`),
  createProspectingList: (data: { name: string; owner_id?: string; domains: string[] }) =>
    request<ProspectList>("/prospecting/lists", { method: "POST", body: JSON.stringify(data) }),
  deleteProspectingList: (id: string) =>
    request<{ ok: boolean }>(`/prospecting/lists/${id}`, { method: "DELETE" }),
  prospectingProspect: (id: string) =>
    request<Prospect>(`/prospecting/prospects/${id}`),
  prospectContacts: (prospectId: string) =>
    request<ProspectContact[]>(`/prospecting/prospects/${prospectId}/contacts`),
  generateProspectAI: (prospectId: string) =>
    request<{ ok: boolean; status: string }>(`/prospecting/prospects/${prospectId}/generate`, { method: "POST" }),
  patchProspect: (id: string, data: { notes?: string; tier?: "hot" | "warm" | "cold" }) =>
    request<{ ok: boolean }>(`/prospecting/prospects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  prospectingAssignableUsers: () =>
    request<Array<{ id: string; name: string | null; email: string; organization_name: string | null }>>("/prospecting/assignable-users"),

};
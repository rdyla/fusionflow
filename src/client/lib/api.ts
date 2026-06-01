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

/**
 * Error thrown by `request()` for any non-2xx response. Carries the HTTP
 * status and the parsed response body so callers can switch on the status
 * (e.g. 409 with structured data for the solution-types orphan-cleanup
 * confirm dialog).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = "ApiError";
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
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    const message = (typeof body?.error === "string" ? body.error : null)
      ?? (typeof body?.message === "string" ? body.message : null)
      ?? `API error: ${res.status}`;
    throw new ApiError(res.status, message, body);
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
  is_support_supervisor?: number;
  is_project_resource?: number;
  avatar_url?: string | null;
  title?: string | null;
  phone?: string | null;
  scheduler_url?: string | null;
  dynamics_account_id?: string | null;
  manager_id?: string | null;
  zoom_user_id?: string | null;
  can_open_cases?: boolean;
  cs_permission?: "none" | "user" | "power_user";
};

export type MyProfile = {
  id: string;
  email: string;
  role: string;
  organization_name: string | null;
  name: string | null;
  title: string | null;
  phone: string | null;
  scheduler_url: string | null;
  avatar_url: string | null;
  has_custom_avatar: boolean;
};

// Re-exported from the shared canonical source so every call phase lines up
// with the same enum used across the app.
import type { SolutionType, OtherTechnology } from "../../shared/solutionTypes";
import type { AddOn } from "../../shared/sowAddOns";
import type { UcaasBasicInputs } from "../../shared/ucaasBasicPricing";
export type { SolutionType, OtherTechnology };
export type { AddOn };

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
  /** D365 opportunity id (statecode=0 at creation time). Required on new
   *  solutions; nullable here to keep legacy pre-migration rows representable. */
  crm_opportunity_id: string | null;
  vendor: SolutionVendor;
  solution_types: SolutionType[];
  other_technologies: OtherTechnology[];
  status: SolutionStatus;
  partner_ae_user_id: string | null;
  partner_ae_name: string | null;
  partner_ae_email: string | null;
  needs_assessment: string | null;
  requirements: string | null;
  scope_of_work: string | null;
  handoff_notes: string | null;
  phd_data: string | null;
  sow_data: string | null;
  /** JSON blob: { msa_date?, revisions[] }. Mutated only via the SOW
   *  metadata endpoints — `generateSowVersion` appends a revision and
   *  `updateSowMetadata` patches the msa_date. */
  sow_metadata: string | null;
  gap_analysis: string | null;
  linked_project_id: string | null;
  customer_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** 1 = SOW renders a "BUDGETARY" diagonal watermark + solution shows the
   *  "Budgetary Only" banner. For pre-contract quotes. */
  is_budgetary: number;
  /** 1 = SOW cover-page legal blurb references the Zoom Services Reseller
   *  Customer Agreement instead of the Packet Fusion MSA. Required for SLED
   *  and other Zoom-reseller-channel deals. */
  is_zoom_reseller: number;
  /** 1 when the CRM account was created via the inline "Create new account
   *  in CRM" form during this solution's New Solution flow (vs. picked from
   *  existing CRM search). Drives am_revenuesource = New Logo on the bound
   *  D365 opportunity. */
  is_new_logo: number;
  /** Partner deal-registration id (Zoom / RC vendor portal). Free text,
   *  always editable on the solution detail page. Synced to D365 opportunity
   *  field cr495_dealregistrationid on every PATCH. */
  deal_registration_id: string | null;
  /** When the customer's existing cloud contract expires (drives the
   *  renewal-window conversation). ISO YYYY-MM-DD. Maps to
   *  am_cloudcontractexpiration on the bound D365 opportunity. */
  cloud_contract_expiration_date: string | null;
  // SOW pricing
  add_ons: AddOn[];
  blended_rate: number;
  sow_total_amount: number | null;
  pricing_mode: "tiered" | "basic" | "advanced";
  /** Legacy seat-count column — preserved for one release while basic_inputs takes over. */
  basic_seat_count: number | null;
  /** Formula-driven basic-mode inputs. Replaces basic_seat_count going forward. */
  basic_inputs: UcaasBasicInputs | null;
  // Joined fields
  partner_ae_display_name: string | null;
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
  description: string | null;
  /** SharePoint createdDateTime — when the file first landed in SP. */
  createdAt: string | null;
  /** Display name of the SP identity that created the item. With app-only
   *  auth that's typically the app's name (e.g. "FusionFlow"); we surface
   *  it anyway so users have at least a "by what process" hint. */
  createdByName: string | null;
  modifiedByName: string | null;
  /** Folders only: whether shared with client/partner roles. Set by the server
   *  overlay; undefined for files. */
  visibleToClient?: boolean;
};

export type DashboardSummaryResponse = {
  user: User;
  summary: {
    activeProjects: number;
    atRiskProjects: number;
    openTasks: number;
    openBlockers: number;
  };
  projects: Project[];
  projectStages: { project_id: string; name: string; status: string; sort_order: number }[];
  openTasks: DashboardTask[];
  openBlockers: DashboardRisk[];
  stageDistribution: { stage_name: string; count: number }[];
  vendorDistribution: { label: string; count: number }[];
  typeDistribution: { label: string; count: number }[];
  aeDistribution: { id: string | null; label: string; count: number }[];
  isSalesLeader: boolean;
};

export type Project = {
  id: string;
  name: string;
  customer_name: string | null;
  vendor: string | null;
  solution_types: string[];
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
  in_optimize?: number | null;
  crm_case_id: string | null;
  crm_opportunity_id: string | null;
  customer_display_name: string | null;
  has_optimization: number | null;
  customer_pf_ae_name: string | null;
  customer_pf_ae_email: string | null;
  customer_pf_ae_phone: string | null;
  customer_pf_ae_scheduler_url: string | null;
  customer_pf_sa_name: string | null;
  customer_pf_sa_email: string | null;
  customer_pf_sa_phone: string | null;
  customer_pf_sa_scheduler_url: string | null;
  customer_pf_csm_name: string | null;
  customer_pf_csm_email: string | null;
  customer_pf_csm_phone: string | null;
  customer_pf_csm_scheduler_url: string | null;
  pm_email?: string | null;
  pm_phone?: string | null;
  pm_scheduler_url?: string | null;
  customer_sharepoint_url: string | null;
  /** Project's own SharePoint folder URL — a subfolder under the customer's
   *  sharepoint_url created on project insert (best-effort). NULL on projects
   *  created before this feature, or when folder creation failed. The
   *  SharePoint tab uses this URL as its root when present. */
  sharepoint_folder_url: string | null;
  // Recurring status-meeting cadence (drives "Next call" on the Dashboard when
  // no closer milestone meeting is on the calendar). Persisted across all six
  // status_meeting_* columns on the projects table; null on either side means
  // no recurring cadence is configured.
  status_meeting_title: string | null;
  status_meeting_dow: number | null;          // 0 = Sun … 6 = Sat
  status_meeting_time_local: string | null;   // "HH:MM"
  status_meeting_timezone: string | null;     // IANA tz (e.g. "America/Los_Angeles")
  status_meeting_duration_min: number | null;
  status_meeting_join_url: string | null;
  created_at: string;
  updated_at: string;
};

export type AsanaSectionSummary = {
  gid: string;
  name: string;
  sort_order: number;
  total: number;
  completed: number;
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
  stage_id: string | null;
  stage_name: string | null;
  task_id: string | null;
  task_name: string | null;
  meeting_id: string;
  topic: string;
  start_time: string;
  duration_mins: number;
  host_email: string | null;
  recording_files: ZoomRecordingFile[];
  recording_password: string | null;
  share_url: string | null;
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
  recording_password: string | null;
  share_url: string | null;
  suggested_stage_id: string | null;
  suggested_stage_name: string | null;
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

export type Stage = {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: string | null;
  /** Which deployment phase this stage belongs to. NULL = shared
   *  (project-level Initiate on multi-phase projects). The Tasks +
   *  Timeline tabs use this for per-phase filtering. */
  phase_id: string | null;
};

/** Preview shape returned by GET /projects/:id/cascade/preview. */
export type CascadeAffectedTask = {
  id: string;
  stage_id: string | null;
  title: string;
  due_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  assignee_user_id: string | null;
  new_due_date: string | null;
  new_scheduled_start: string | null;
  new_scheduled_end: string | null;
};

export type CascadePreview = {
  from_task: { id: string; title: string; due_date: string | null };
  slip_days: number;
  affected_tasks: CascadeAffectedTask[];
  current_target_go_live: string | null;
  new_target_go_live: string | null;
};

export type Task = {
  id: string;
  project_id: string;
  stage_id: string | null;
  title: string;
  assignee_user_id: string | null;
  /** Optional non-user assignee (currently the porting coordinator for
   *  UCaaS projects). Set by apply-template; displayed alongside the
   *  user assignee on the task row. */
  assignee_contact_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  status: string | null;
  priority: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  pay_code_id: string | null;
  cost_code_id: string | null;
  crm_time_entry_id: string | null;
  /** Canonical go-live event flag (mirrors template_tasks.is_go_live_event
   *  from migration 0081, carried into tasks by migration 0095). When set,
   *  the task's due_date drives projects.target_go_live_date. */
  is_go_live_event: number | null;
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

export type StageTimeEntry = {
  id: string;
  stage_id: string;
  project_id: string;
  crm_time_entry_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  pay_code_id: string | null;
  cost_code_id: string | null;
  note: string | null;
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
  owner_contact_id: string | null;
  task_id: string | null;
};

export type Document = {
  id: string;
  project_id: string;
  stage_id: string | null;
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
  phone: string | null;
  scheduler_url: string | null;
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
  // Team comes from the linked customer — joined in via cust.pf_*_user_id
  // in GET /api/optimize/accounts/:projectId. The customer_pf_* keys further
  // below are kept on the type for legacy callers but are not returned by
  // the optimize endpoints; new readers should use ae_name/ae_email etc.
  ae_user_id: string | null;
  ae_name: string | null;
  ae_email: string | null;
  sa_user_id: string | null;
  sa_name: string | null;
  sa_email: string | null;
  csm_user_id: string | null;
  csm_name: string | null;
  csm_email: string | null;
  dynamics_account_id: string | null;
  last_assessment_date: string | null;
  last_assessment_score: number | null;
  customer_pf_ae_name: string | null;
  customer_pf_ae_email: string | null;
  customer_pf_sa_name: string | null;
  customer_pf_sa_email: string | null;
  customer_pf_csm_name: string | null;
  customer_pf_csm_email: string | null;
  customer_sharepoint_url: string | null;
  vendor: string | null;
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
  solution_type: string;
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
  solution_type: string;
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
  /** When non-null, the engine used these values instead of the per-type
   *  needs_assessments answers. Same key/value shape as NA answers. */
  direct_inputs: Record<string, unknown> | null;
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
  stage_id: string | null;
  title: string;
  priority: string | null;
  order_index: number;
  /** Hint about who owns this task by default (e.g. "pm", "ie", "customer",
   *  "zoom_porting", "pf", "all", "customer/ie"). Surfaced in the admin
   *  template view; not yet propagated to project tasks at apply time. */
  default_assignee_role: string | null;
  /** True (1 in SQLite) for the canonical go-live event task. Exactly one
   *  per template. The Timeline Builder anchors the project's target
   *  go-live date to this task's end. */
  is_go_live_event?: number;
};

export type TemplateStage = {
  id: string;
  template_id: string;
  name: string;
  order_index: number;
  /** Workdays the stage takes; drives the Timeline Builder date math. */
  working_days: number;
  tasks: TemplateTask[];
};

export type Template = {
  id: string;
  name: string;
  solution_type: string | null;
  description: string | null;
  stage_count?: number;
  task_count?: number;
  stages?: TemplateStage[];
  created_at: string;
  updated_at: string;
};

export type FeatureStatus = "submitted" | "under_review" | "planned" | "in_progress" | "released" | "declined";
export type FeaturePriority = "low" | "medium" | "high" | "critical";
export type FeatureCategory = "ui_ux" | "performance" | "integration" | "reporting" | "security" | "other";

export type FeatureRequest = {
  id: string;
  title: string;
  description: string | null;
  status: FeatureStatus;
  priority: FeaturePriority;
  category: FeatureCategory | null;
  submitter_id: string | null;
  submitter_name: string | null;
  submitter_email: string | null;
  admin_notes: string | null;
  vote_count: number;
  user_has_voted: number;
  created_at: string;
  updated_at: string;
};

// ── Multi-phase model ─────────────────────────────────────────────────────────
export type Phase = {
  id: string;
  project_id: string;
  name: string;
  target_go_live_date: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
};

// ── Stakeholder Dashboard ────────────────────────────────────────────────────
export type StakeholderHealth = "on_track" | "at_risk" | "off_track";

export type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  title: string | null;
  phone: string | null;
  scheduler_url: string | null;
  avatar_url: string | null;
};

export type StakeholderSummary = {
  project: {
    id: string;
    name: string;
    customer_name: string | null;
    customer_id: string | null;
    crm_case_id: string | null;
    updated_at: string | null;
  };
  stats: {
    overall_complete_pct: number;
    tasks: { total: number; done: number; in_progress: number; not_started: number };
    blockers: { total: number; critical: number };
    days_to_final_go_live: number | null;
    target_go_live_date: string | null;
    next_call: {
      scheduled_at: string;
      title: string;
      join_url: string | null;
      source: "milestone" | "status";
    } | null;
    site_count: number;
  };
  /** Deployment phases inside the project (Libraries / Treatment / HQ-style).
   *  Empty array means this project is single-phase and the UI hides the
   *  Phases row entirely. */
  phases: Array<{
    id: string;
    name: string;
    target_go_live_date: string | null;
    completion_pct: number;
    task_count: number;
    done_count: number;
    days_left: number | null;
    health: StakeholderHealth;
  }>;
  open_tasks: Array<{
    id: string;
    title: string;
    due_date: string | null;
    priority: string | null;
    phase_id: string | null;
    phase_name: string | null;
    assignee_name: string | null;
  }>;
  assignee_breakdown: Array<{
    user_id: string;
    name: string;
    /** Open-task counts keyed by phase_id. Shared-stage tasks (Initiate)
     *  surface separately under `shared`. Single-phase projects use only
     *  `total`. */
    counts: Record<string, number>;
    shared: number;
    total: number;
  }>;
  /** Per-assignee × stage-name pivot for the "By assignee" table on the
   *  Open Tasks panel. Stage names are rolled up across phases so multi-
   *  phase projects show one "Plan" column instead of one per phase. */
  assignee_stage_breakdown: {
    stage_columns: string[];
    rows: Array<{
      user_id: string;
      name: string;
      counts: Record<string, number>;
      total: number;
    }>;
  };
  blockers: Array<{
    id: string;
    title: string;
    description: string | null;
    severity: string | null;
    status: string | null;
    owner_name: string | null;
  }>;
  key_updates: Array<{
    id: string;
    kind: "note" | "document";
    body: string;
    author_name: string | null;
    created_at: string;
  }>;
  team: {
    pm: TeamMember | null;
    engineers: TeamMember[];
    primary_contact: { name: string; email: string | null; job_title: string | null } | null;
    partner_ae: TeamMember | null;
  };
  links: {
    sharepoint_url: string | null;
    crm_case_id: string | null;
    timeline_url: string;
    next_call_join_url: string | null;
  };
  /** Stage-progress sliders shown on the dashboard. One entry per
   *  "column" — shared first (Initiate on multi-phase projects), then one
   *  per phase in display order. Single-phase projects have one entry with
   *  `phase_id = null` containing all stages. */
  stage_progress: Array<{
    phase_id: string | null;
    phase_name: string | null;
    stages: Array<{
      id: string;
      name: string;
      sort_order: number | null;
      status: string | null;
      planned_start: string | null;
      planned_end: string | null;
      total_tasks: number;
      done_tasks: number;
      pct: number;
    }>;
  }>;
};

export const api = {
  me: () => request<MeResponse>("/me"),
  systemStatus: () => request<SystemStatusResponse>("/status"),
  staffPhotos: (emails: string[]) =>
    request<Record<string, string | null>>(`/staff/photos?emails=${emails.map(encodeURIComponent).join(",")}`),
  users: () => request<User[]>("/users"),
  dashboardSummary: () => request<DashboardSummaryResponse>("/dashboard/summary"),
  myTasks: (params: { status?: string; priority?: string; search?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params.status)   q.set("status",   params.status);
    if (params.priority) q.set("priority", params.priority);
    if (params.search)   q.set("search",   params.search);
    if (params.page)     q.set("page",     String(params.page));
    return request<{ items: (Task & { project_name: string; stage_name: string | null; assignee_name: string | null })[]; total: number; page: number; hasMore: boolean }>(`/my-tasks?${q.toString()}`);
  },
  projects: (filters?: { pf_ae_id?: string; partner_ae_id?: string }) => {
    const qs = new URLSearchParams();
    if (filters?.pf_ae_id) qs.set("pf_ae_id", filters.pf_ae_id);
    if (filters?.partner_ae_id) qs.set("partner_ae_id", filters.partner_ae_id);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<Project[]>(`/projects${suffix}`);
  },
  project: (id: string) => request<Project>(`/projects/${id}`),

  stages: (projectId: string) => request<Stage[]>(`/projects/${projectId}/stages`),
  tasks: (projectId: string) => request<Task[]>(`/projects/${projectId}/tasks`),
  risks: (projectId: string) => request<Risk[]>(`/projects/${projectId}/risks`),
  notes: (projectId: string) => request<Note[]>(`/projects/${projectId}/notes`),

  updateStage: (
    projectId: string,
    stageId: string,
    payload: {
      status?: "not_started" | "in_progress" | "completed";
      planned_start?: string | null;
      planned_end?: string | null;
      actual_start?: string | null;
      actual_end?: string | null;
    }
  ) =>
    request<Stage>(`/projects/${projectId}/stages/${stageId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  createStage: (
    projectId: string,
    payload: {
      name: string;
      planned_start?: string | null;
      planned_end?: string | null;
      status?: "not_started" | "in_progress" | "completed";
    }
  ) =>
    request<Stage>(`/projects/${projectId}/stages`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** Delete a stage and its dependents:
   *   - tasks within the stage: DELETED
   *   - milestones within the stage: DELETED
   *   - documents tied to the stage: orphaned to project level (stage_id = NULL)
   *   - zoom_recordings: stage_id set to NULL via FK */
  deleteStage: (projectId: string, stageId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/stages/${stageId}`, { method: "DELETE" }),

  searchDynamicsAccounts: (q: string) =>
    request<DynamicsAccount[]>(`/dynamics/accounts?q=${encodeURIComponent(q)}`),

  /** Create a new D365 Account. SA + admin only on the server. Returns the
   *  created account in the same shape as a search result so the caller can
   *  drop it straight into the customer picker. owner_systemuserid is the
   *  D365 systemuserid of the PF AE who owns the new account (required — D365
   *  defaults the owner to our app-reg's service principal otherwise). */
  createDynamicsAccount: (payload: {
    name: string;
    emailaddress1: string;
    websiteurl?: string;
    owner_systemuserid: string;
    /** Provider (partner) AE name + email — land in cr495_provideraename /
     *  cr495_provideraeemail on the D365 account. Optional. */
    provider_ae_name?: string;
    provider_ae_email?: string;
  }) =>
    request<DynamicsAccount>("/dynamics/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** Live list of PF AEs (D365 systemusers filtered by title). Used by the
   *  inline create-account form to populate the AE owner dropdown. */
  getDynamicsAEs: () => request<DynamicsUser[]>("/dynamics/staff/account-executives"),

  /** Create a new D365 Opportunity bound to an account. SA + admin only.
   *  Minimal payload — name + account; pfi_sowhours and
   *  pfi_solutionarchitect get populated downstream as the solution
   *  progresses. Returns the new row so the caller can push it straight
   *  into the picker. */
  createDynamicsOpportunity: (payload: { name: string; parent_account_id: string }) =>
    request<DynamicsOpportunity>("/dynamics/opportunities", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getDynamicsContacts: (accountId: string) =>
    request<DynamicsContact[]>(`/dynamics/accounts/${accountId}/contacts`),

  /** `state` defaults to "open_or_won" (statecode in 0, 1) — solution creation
   *  binds to in-flight or recently-won deals (implementation often kicks off
   *  right after a deal is marked Won). Pass "open" to restrict further, or
   *  "all" to include lost opps too. */
  getDynamicsOpportunities: (accountId: string, state: "open" | "open_or_won" | "all" = "open_or_won") =>
    request<DynamicsOpportunity[]>(`/dynamics/accounts/${accountId}/opportunities?state=${state}`),

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
    solution_types?: string[];
    kickoff_date?: string;
    target_go_live_date?: string;
    pm_user_id?: string | null;
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
      clear_health_override?: boolean;
      target_go_live_date?: string;
      actual_go_live_date?: string;
      pm_user_id?: string | null;
      vendor?: string | null;
      solution_types?: SolutionType[];
      crm_case_id?: string | null;
      crm_opportunity_id?: string | null;
      status_meeting_title?: string | null;
      status_meeting_dow?: number | null;
      status_meeting_time_local?: string | null;
      status_meeting_timezone?: string | null;
      status_meeting_duration_min?: number | null;
      status_meeting_join_url?: string | null;
      /** Bundles a solution-type-removal task cleanup with the project
       *  update — see PATCH /:id handler in routes/projects.ts. */
      cleanup_solution_types?: SolutionType[];
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
      severity?: "low" | "medium" | "high" | "critical";
      status?: "open" | "mitigated" | "closed";
      owner_user_id?: string | null;
      owner_contact_id?: string | null;
      task_id?: string | null;
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
      severity?: "low" | "medium" | "high" | "critical";
      status?: "open" | "mitigated" | "closed";
      owner_user_id?: string | null;
      owner_contact_id?: string | null;
      task_id?: string | null;
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
      stage_id?: string | null;
      assignee_user_id?: string | null;
      due_date?: string | null;
      scheduled_start?: string | null;
      scheduled_end?: string | null;
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
      stage_id?: string | null;
      assignee_user_id?: string | null;
      assignee_contact_id?: string | null;
      due_date?: string | null;
      scheduled_start?: string | null;
      scheduled_end?: string | null;
      completed_at?: string | null;
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

  // Date cascade — see src/server/routes/cascade.ts
  cascadePreview: (projectId: string, fromTaskId: string, slipDays: number) =>
    request<CascadePreview>(
      `/projects/${projectId}/cascade/preview?from_task_id=${encodeURIComponent(fromTaskId)}&slip_days=${slipDays}`
    ),

  cascadeApply: (projectId: string, payload: { from_task_id: string; slip_days: number; exclude_task_ids?: string[] }) =>
    request<{ tasks_shifted: number; stages_shifted: number; new_target_go_live: string | null; recipients_notified: number }>(
      `/projects/${projectId}/cascade/apply`,
      { method: "POST", body: JSON.stringify(payload) }
    ),

  timeEntrySetup: (projectId: string) =>
    request<TimeEntrySetup>(`/projects/${projectId}/time-entry/setup`),

  getStageTimeEntries: (projectId: string, stageId: string) =>
    request<StageTimeEntry[]>(`/projects/${projectId}/stages/${stageId}/time-entries`),

  // Stage-level time entry. Both pay code (labor) and cost code are required.
  logStageTime: (
    projectId: string,
    stageId: string,
    payload: {
      scheduled_start: string;
      scheduled_end: string;
      pay_code_id: string;
      cost_code_id: string;
      note?: string;
      case_id: string;
      job_id: string;
      account_id?: string | null;
    }
  ) =>
    request<StageTimeEntry>(`/projects/${projectId}/stages/${stageId}/time-entries`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteStageTimeEntry: (projectId: string, stageId: string, entryId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/stages/${stageId}/time-entries/${entryId}`, {
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
      stage_id?: string | null;
      task_id?: string | null;
    }
  ): Promise<Document> => {
    const form = new FormData();
    form.append("file", payload.file);
    form.append("category", payload.category);
    if (payload.stage_id) form.append("stage_id", payload.stage_id);
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
  rcConfigured: (projectId: string) =>
    request<{ configured: boolean }>(`/projects/${projectId}/ringcentral/configured`),
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
  /** Upload a file to a SharePoint folder. When `projectId` is provided, the
   *  server shadows the upload in sharepoint_uploads so the file list can
   *  show the real uploader (Graph runs app-only, so its createdBy is the
   *  app principal). */
  spUpload: async (folderUrl: string, file: File, opts?: { description?: string | null; projectId?: string | null }): Promise<{ file: SPFile }> => {
    const form = new FormData();
    form.append("file", file);
    const params = new URLSearchParams({ url: folderUrl });
    if (opts?.description?.trim()) params.set("description", opts.description.trim());
    if (opts?.projectId) params.set("projectId", opts.projectId);
    const res = await fetch(`${API_BASE}/sharepoint/upload?${params.toString()}`, {
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
  /** PATCH the description on an existing SharePoint file. Used by the inline
   *  "Edit description" UI on the SharePoint tab so PMs can backfill context
   *  on files uploaded via SP web directly. */
  spUpdateDescription: (webUrl: string, description: string | null) =>
    request<{ file: SPFile }>(`/sharepoint/file/description?webUrl=${encodeURIComponent(webUrl)}`, {
      method: "PATCH",
      body: JSON.stringify({ description }),
    }),

  /** Create (or adopt) a child folder under the given parent folder URL. New
   *  folders are internal by default (not visible to client/partner). */
  spCreateFolder: (parentUrl: string, name: string, projectId?: string | null) =>
    request<{ folder: { webUrl: string; id: string; reused: boolean } }>(
      `/sharepoint/folder?url=${encodeURIComponent(parentUrl)}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}`,
      { method: "POST", body: JSON.stringify({ name }) }
    ),

  /** Toggle whether a folder is visible to client/partner roles. Editor-only. */
  spSetFolderVisibility: (input: { sp_item_id: string; web_url: string; project_id?: string | null; visible: boolean }) =>
    request<{ ok: boolean; visible: boolean }>(`/sharepoint/folder/visibility`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  /** Create (or adopt an existing) per-project SharePoint folder under the
   *  customer's SP root. Idempotent — server returns the existing URL if the
   *  folder is already wired up. Used by the "Create project folder" button
   *  on the SharePoint tab for projects created before the auto-create. */
  ensureProjectSharePointFolder: (projectId: string) =>
    request<{ sharepoint_folder_url: string; reused: boolean }>(`/projects/${projectId}/sharepoint-folder`, {
      method: "POST",
    }),

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

  // Stakeholder view aggregation (one round-trip for the whole page)
  stakeholderSummary: (projectId: string) =>
    request<StakeholderSummary>(`/projects/${projectId}/stakeholder-summary`),

  // Multi-phase CRUD (Libraries / Treatment / HQ-style deployment targets)
  phases: (projectId: string) =>
    request<Phase[]>(`/projects/${projectId}/phases`),
  createPhase: (projectId: string, payload: { name: string; target_go_live_date?: string | null }) =>
    request<Phase>(`/projects/${projectId}/phases`, { method: "POST", body: JSON.stringify(payload) }),
  updatePhase: (projectId: string, phaseId: string, payload: { name?: string; target_go_live_date?: string | null; display_order?: number }) =>
    request<Phase>(`/projects/${projectId}/phases/${phaseId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deletePhase: (projectId: string, phaseId: string) =>
    request<{ success: boolean; deleted_stage_count: number }>(`/projects/${projectId}/phases/${phaseId}`, { method: "DELETE" }),

  // Staging → Prod promotion (prod-only; staging worker returns 503)
  adminStagingInventory: () =>
    request<{
      solutions: Array<{ id: string; name: string; customer_name: string | null; vendor: string | null; status: string | null; created_at: string; needs_assessment_count: number; labor_estimate_count: number; contact_count: number; already_on_prod: boolean }>;
      projects: Array<{ id: string; name: string; customer_name: string | null; vendor: string | null; status: string | null; created_at: string; stage_count: number; task_count: number; risk_count: number; document_count: number; already_on_prod: boolean }>;
      optimize_accounts: Array<{ id: string; project_id: string; project_name: string; customer_name: string | null; graduated_at: string; impact_assessment_count: number; tech_stack_count: number; roadmap_count: number; utilization_count: number; already_on_prod: boolean }>;
    }>("/admin/staging/inventory"),

  adminStagingPromote: (payload: { solution_ids: string[]; project_ids: string[]; optimize_account_ids: string[] }) =>
    request<Record<string, number | Array<{ kind: string; id: string; reason: string }>>>("/admin/staging/promote", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  adminUsers: () => request<User[]>("/admin/users"),

  adminDeleteUser: (id: string) =>
    request<{ success: boolean }>(`/admin/users/${id}`, { method: "DELETE" }),

  adminUserReferences: (id: string) =>
    request<{
      blocked: boolean;
      buckets: { entity: string; count: number; blocking: boolean; samples: { id: string; label: string }[] }[];
    }>(`/admin/users/${id}/references`),

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
      is_support_supervisor?: number;
      is_project_resource?: number;
      dynamics_account_id?: string | null;
      manager_id?: string | null;
      zoom_user_id?: string | null;
      cs_permission?: "none" | "user" | "power_user";
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
    /** D365 account id — now required server-side. */
    dynamics_account_id: string;
    /** D365 opportunity id scoped to dynamics_account_id — now required. */
    crm_opportunity_id: string;
    vendor?: SolutionVendor;
    solution_types?: SolutionType[];
    other_technologies?: OtherTechnology[];
    journeys?: string[];
    pf_ae_user_id?: string;
    pf_sa_user_id?: string;
    pf_csm_user_id?: string;
    partner_ae_user_id?: string;
    partner_ae_name?: string;
    partner_ae_email?: string;
    /** Set true when the SA used the inline "Create new account in CRM"
     *  affordance — drives am_revenuesource=New Logo on the bound D365
     *  opportunity. Defaults to false (Installed Base) server-side. */
    is_new_logo?: boolean;
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
      crm_opportunity_id: string | null;
      vendor: SolutionVendor;
      solution_types: SolutionType[];
      other_technologies: OtherTechnology[];
      status: SolutionStatus;
      pf_ae_user_id: string | null;
      partner_ae_user_id: string | null;
      partner_ae_name: string | null;
      partner_ae_email: string | null;
      needs_assessment: string | null;
      requirements: string | null;
      scope_of_work: string | null;
      handoff_notes: string | null;
      phd_data: string | null;
      sow_data: string | null;
      gap_analysis: string | null;
      linked_project_id: string | null;
      add_ons: AddOn[];
      blended_rate: number;
      pricing_mode: "tiered" | "basic" | "advanced";
      basic_seat_count: number | null;
      basic_inputs: UcaasBasicInputs | null;
      is_budgetary: number;
      is_zoom_reseller: number;
      /** Partner deal-registration id — synced to D365 cr495_dealregistrationid. */
      deal_registration_id: string | null;
      /** Cloud contract expiration — synced to D365 am_cloudcontractexpiration. */
      cloud_contract_expiration_date: string | null;
      /** If a solution_types update would orphan needs_assessments / labor_estimates rows
       *  for removed types, the server returns 409 unless this flag is set. The client
       *  surfaces the 409 as a confirm dialog and retries with force=true on accept. */
      force: boolean;
    }>
  ) =>
    request<Solution>(`/solutions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteSolution: (id: string) =>
    request<{ success: boolean }>(`/solutions/${id}`, { method: "DELETE" }),

  /** Snapshot the current SOW as a new version (V1, V2, ...). Captures the
   *  current user as the author. Optional note becomes the "Description"
   *  column in the cover page's revision-history table. */
  generateSowVersion: (id: string, payload: { note?: string | null }) =>
    request<{
      sow_metadata: { msa_date?: string | null; revisions: Array<{ version: string; saved_at: string; saved_by_user_id: string | null; saved_by_name: string | null; note?: string | null }> };
      new_revision: { version: string; saved_at: string; saved_by_user_id: string | null; saved_by_name: string | null; note?: string | null };
    }>(`/solutions/${id}/sow-version`, { method: "POST", body: JSON.stringify(payload) }),

  /** Update SOW cover-page metadata (msa_date, target_go_live_date,
   *  duration_band, custom_weeks). Doesn't touch revisions — those are
   *  append-only via generateSowVersion. */
  updateSowMetadata: (id: string, payload: {
    msa_date?: string | null;
    target_go_live_date?: string | null;
    duration_band?: "4_6_weeks" | "6_8_weeks" | "8_12_weeks" | "custom" | null;
    custom_weeks?: number | null;
  }) =>
    request<{ sow_metadata: { msa_date?: string | null; target_go_live_date?: string | null; duration_band?: string | null; custom_weeks?: number | null; revisions: unknown[] } }>(
      `/solutions/${id}/sow-metadata`, { method: "PATCH", body: JSON.stringify(payload) }
    ),

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
  inviteSolutionPartnerAe: (solutionId: string, payload: { email: string; name: string; organization_name?: string | null }) =>
    request<SolutionStaffMember>(`/solutions/${solutionId}/invite-partner-ae`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
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
    solution_types?: string[];
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
    request<Pick<Solution, "id" | "name" | "customer_name" | "status" | "solution_types" | "vendor"> | null>(
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

  // Move an Optimize account's project_id to point at a different (existing)
  // project. Moves impact_assessments / tech_stack / roadmap / utilization
  // snapshots / KV creds with it. Deletes the shell project if it had no
  // attached work. Returns the new project_id (URL changes after relink).
  optimizeRelink: (projectId: string, targetProjectId: string) =>
    request<{ project_id: string; previous_project_id: string; shell_deleted: boolean; credentials_moved: ("zoom" | "ringcentral")[] }>(
      `/optimize/accounts/${projectId}/relink`,
      { method: "POST", body: JSON.stringify({ target_project_id: targetProjectId }) }
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
  zoomConfirmRecordings: (projectId: string, confirmations: { meeting_id: string; stage_id: string | null; task_id?: string | null; topic: string; start_time: string; duration_mins: number; host_email: string | null; recording_files: ZoomRecordingFile[]; recording_password?: string | null; share_url?: string | null; match_reason: string | null }[]) =>
    request<ZoomRecording[]>(`/projects/${projectId}/zoom/recordings/confirm`, {
      method: "POST",
      body: JSON.stringify({ confirmations }),
    }),
  zoomReassignRecording: (projectId: string, recordingId: string, stage_id: string | null, task_id?: string | null) =>
    request<ZoomRecording>(`/projects/${projectId}/zoom/recordings/${recordingId}`, {
      method: "PATCH",
      body: JSON.stringify({ stage_id, task_id }),
    }),
  zoomDeleteRecording: (projectId: string, recordingId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/zoom/recordings/${recordingId}`, { method: "DELETE" }),

  // ── Labor Estimates ──────────────────────────────────────────────────────────
  laborEstimates: (solutionId: string) =>
    request<LaborEstimate[]>(`/solutions/${solutionId}/labor-estimates`),
  laborEstimate: (solutionId: string, solutionType: string) =>
    request<LaborEstimate>(`/solutions/${solutionId}/labor-estimates/${solutionType}`),
  upsertLaborEstimate: (solutionId: string, solutionType: string, body: {
    overrides?: Record<string, number>;
    /** Pass an object to set/update direct inputs (used in place of NA).
     *  Pass null to clear them and fall back to the NA. Omit to leave
     *  whatever's currently stored alone. */
    direct_inputs?: Record<string, unknown> | null;
  }) =>
    request<LaborEstimate>(`/solutions/${solutionId}/labor-estimates/${solutionType}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteLaborEstimate: (solutionId: string, solutionType: string) =>
    request<{ success: boolean }>(`/solutions/${solutionId}/labor-estimates/${solutionType}`, { method: "DELETE" }),

  // ── Labor Config (admin) ──────────────────────────────────────────────────────
  laborConfig: () =>
    request<{ categories: Record<string, Record<string, number>>; defaults: Record<string, Record<string, number>> }>("/admin/labor-config"),
  updateLaborConfig: (category: string, base_hours: Record<string, number>) =>
    request<{ ok: boolean }>("/admin/labor-config", { method: "PUT", body: JSON.stringify({ category, base_hours }) }),
  resetLaborConfig: (category: string) =>
    request<{ ok: boolean }>(`/admin/labor-config/${category}`, { method: "DELETE" }),

  // ── Needs Assessments (one per (solution, solution_type) pair) ─────────────
  needsAssessments: (solutionId: string) =>
    request<NeedsAssessment[]>(`/solutions/${solutionId}/needs-assessments`),
  needsAssessment: (solutionId: string, solutionType: string) =>
    request<NeedsAssessment>(`/solutions/${solutionId}/needs-assessments/${solutionType}`),
  upsertNeedsAssessment: (solutionId: string, solutionType: string, body: { answers: Record<string, unknown> }) =>
    request<NeedsAssessment>(`/solutions/${solutionId}/needs-assessments/${solutionType}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteNeedsAssessment: (solutionId: string, solutionType: string) =>
    request<{ success: boolean }>(`/solutions/${solutionId}/needs-assessments/${solutionType}`, { method: "DELETE" }),

  // ── Templates ────────────────────────────────────────────────────────────────
  templatesList: () => request<Template[]>("/admin/templates-list"), // admin + pm
  /** Fetch one template with its stages + tasks. PM-accessible (for Timeline Builder). */
  template: (id: string) => request<Template>(`/admin/templates/${id}`),
  adminTemplates: () => request<Template[]>("/admin/templates"),
  adminTemplate: (id: string) => request<Template>(`/admin/templates/${id}`),
  adminCreateTemplate: (payload: { name: string; solution_type?: string; description?: string }) =>
    request<Template>("/admin/templates", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateTemplate: (id: string, payload: { name?: string; solution_type?: string; description?: string }) =>
    request<Template>(`/admin/templates/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminDeleteTemplate: (id: string) =>
    request<{ success: boolean }>(`/admin/templates/${id}`, { method: "DELETE" }),
  adminAddTemplateStage: (templateId: string, payload: { name: string; order_index: number }) =>
    request<TemplateStage>(`/admin/templates/${templateId}/stages`, { method: "POST", body: JSON.stringify(payload) }),
  adminDeleteTemplateStage: (templateId: string, stageId: string) =>
    request<{ success: boolean }>(`/admin/templates/${templateId}/stages/${stageId}`, { method: "DELETE" }),
  adminAddTemplateTask: (templateId: string, payload: { title: string; priority?: string; stage_id?: string; order_index?: number }) =>
    request<TemplateTask>(`/admin/templates/${templateId}/tasks`, { method: "POST", body: JSON.stringify(payload) }),
  adminDeleteTemplateTask: (templateId: string, taskId: string) =>
    request<{ success: boolean }>(`/admin/templates/${templateId}/tasks/${taskId}`, { method: "DELETE" }),
  /**
   * Apply a template to a project, optionally scoped to a specific phase
   * (so e.g. the ZCC template can land under the "Zoom Contact Center" phase
   * without colliding with the "Zoom Phone" phase's same-named stages).
   *
   * When `targetGoLiveDate` (YYYY-MM-DD) is provided, the server uses the
   * same workday math the Timeline Builder uses to chain stage dates
   * backward from the go-live and stamp each new task with its stage's
   * window for scheduled_start / scheduled_end / due_date.
   */
  applyTemplate: (projectId: string, templateId: string, phaseId?: string | null, targetGoLiveDate?: string | null) =>
    request<{ stages_created: number; tasks_created: number; tasks_merged: number }>(`/projects/${projectId}/apply-template`, {
      method: "POST",
      body: JSON.stringify({
        template_id: templateId,
        phase_id: phaseId ?? null,
        target_go_live_date: targetGoLiveDate ?? null,
      }),
    }),
  applyTimeline: (projectId: string, payload: { phase_id?: string | null; stages: Array<{ name: string; start: string; end: string; tasks: Array<{ title: string; role: string | null; priority: string | null; start: string; end: string; isGoLiveEvent?: boolean }> }> }) =>
    request<{ stages_created: number; tasks_created: number }>(`/projects/${projectId}/apply-timeline`, {
      method: "POST",
      body: JSON.stringify(payload),
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
    request<Pick<Solution, "id" | "name" | "vendor" | "solution_types" | "other_technologies" | "status" | "created_at" | "updated_at" | "linked_project_id" | "dynamics_account_id">[]>(`/customers/${id}/solutions`),
  customerProjects: (id: string) =>
    request<Pick<Project, "id" | "name" | "vendor" | "solution_types" | "status" | "health" | "kickoff_date" | "target_go_live_date" | "actual_go_live_date" | "pm_user_id" | "created_at" | "updated_at"> & { has_optimization: number | null }>(`/customers/${id}/projects`),
  customerOptimizations: (id: string) =>
    request<{ id: string; project_id: string; optimize_status: string; graduated_at: string | null; next_review_date: string | null; project_name: string; vendor: string | null; solution_types: string[]; actual_go_live_date: string | null }[]>(`/customers/${id}/optimizations`),

  customerLastVendor: (id: string) =>
    request<{ vendor: string | null; vendorId?: string | null; techType?: string | null; soldOn?: string | null }>(`/customers/${id}/last-vendor`),

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

  // ── Feature Requests ─────────────────────────────────────────────────────
  featureRequests: () =>
    request<FeatureRequest[]>("/features"),
  createFeatureRequest: (data: { title: string; description?: string; category?: FeatureCategory }) =>
    request<FeatureRequest>("/features", { method: "POST", body: JSON.stringify(data) }),
  updateFeatureRequest: (id: string, data: Partial<{ title: string; description: string | null; status: FeatureStatus; priority: FeaturePriority; category: FeatureCategory | null; admin_notes: string | null }>) =>
    request<{ ok: boolean }>(`/features/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteFeatureRequest: (id: string) =>
    request<{ ok: boolean }>(`/features/${id}`, { method: "DELETE" }),
  toggleFeatureVote: (id: string) =>
    request<{ voted: boolean }>(`/features/${id}/vote`, { method: "POST" }),

  // ── Meeting prep emails (generic over meeting type) ──────────────────────
  meetingPrepOptions: (projectId: string, meetingType: MeetingType) =>
    request<MeetingPrepOptions>(`/projects/${projectId}/meeting-prep/${meetingType}/options`),
  meetingPrepPreview: (projectId: string, meetingType: MeetingType, draft: MeetingPrepDraft) =>
    request<{ subject: string; html: string; recipientCount: number }>(
      `/projects/${projectId}/meeting-prep/${meetingType}/preview`,
      { method: "POST", body: JSON.stringify(draft) }
    ),
  meetingPrepTest: (projectId: string, meetingType: MeetingType, draft: MeetingPrepDraft) =>
    request<{ ok: boolean; sentTo: string }>(
      `/projects/${projectId}/meeting-prep/${meetingType}/test`,
      { method: "POST", body: JSON.stringify(draft) }
    ),
  meetingPrepSendHtml: (projectId: string, meetingType: MeetingType, sendId: string) =>
    request<{ subject: string; html: string; sentAt: string }>(
      `/projects/${projectId}/meeting-prep/${meetingType}/sends/${sendId}/html`
    ),
  meetingPrepSend: (projectId: string, meetingType: MeetingType, draft: MeetingPrepDraft) =>
    request<{ ok: boolean; sentTo: string[]; sentAt: string }>(
      `/projects/${projectId}/meeting-prep/${meetingType}/send`,
      { method: "POST", body: JSON.stringify(draft) }
    ),

  // ── Settings ─────────────────────────────────────────────────────────────────
  publicSettings: () => request<{ demoVendor: "zoom" | "ringcentral" | null }>("/settings/public"),
  adminGetDemoMode: () => request<{ vendor: "zoom" | "ringcentral" | null }>("/admin/settings/demo-mode"),
  adminSetDemoMode: (vendor: "zoom" | "ringcentral" | null) =>
    request<{ vendor: "zoom" | "ringcentral" | null }>("/admin/settings/demo-mode", {
      method: "PUT",
      body: JSON.stringify({ vendor }),
    }),

  // ── Self-service profile ─────────────────────────────────────────────────────
  getMyProfile: () => request<MyProfile>("/me/profile"),
  updateMyProfile: (payload: {
    name?: string;
    title?: string | null;
    phone?: string | null;
    scheduler_url?: string | null;
  }) =>
    request<{ ok: true }>("/me/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  uploadMyAvatar: async (file: File): Promise<{ avatar_url: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/me/avatar`, {
      method: "POST",
      body: form,
      headers: { ...getImpersonationHeaders() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as Record<string, unknown> | null;
      const message = (typeof body?.error === "string" ? body.error : null)
        ?? (typeof body?.message === "string" ? body.message : null)
        ?? `API error: ${res.status}`;
      throw new ApiError(res.status, message, body);
    }
    return res.json();
  },
  deleteMyAvatar: () =>
    request<{ ok: true }>("/me/avatar", { method: "DELETE" }),
};

// ── Meeting prep types ─────────────────────────────────────────────────────

import type { MeetingType, MeetingPrepSectionMeta } from "../../shared/meetingPrep";
export type { MeetingType, MeetingPrepSectionMeta };

export type MeetingPrepSendRecord = {
  id: string;
  label: string | null;
  subject: string;
  sentBy: string | null;
  sentAt: string;
  recipientCount: number;
  /** True if the rendered HTML body was persisted (sends from before the
   *  body_html column was added will be false). */
  hasBody?: boolean;
  /** For per-phase sends (UAT / go_live on multi-phase projects). NULL on
   *  project-wide sends and on single-phase projects. */
  phaseId?: string | null;
  phaseName?: string | null;
};

export type MeetingPrepOptions = {
  meetingType: MeetingType;
  catalog: readonly MeetingPrepSectionMeta[];
  project: {
    id: string;
    name: string;
    customerName: string | null;
    solutionTypes: string[];
    vendor: string | null;
    kickoffDate: string | null;
    targetGoLiveDate: string | null;
    kickoffMeetingUrl: string | null;
    suggestedDistributionListEmail: string | null;
  };
  recipients: {
    contacts: Array<{ id: string; name: string; email: string; jobTitle: string | null }>;
    staff: Array<{ id: string; name: string; email: string; role: string; isPartner: boolean }>;
  };
  sharepoint: {
    folderUrl: string | null;
    files: Array<{ name: string; webUrl: string; size: number | null; mimeType: string | null }>;
  };
  /** Past sends of this meeting type for this project, newest first. */
  history: MeetingPrepSendRecord[];
  /** Deployment phases for this project. Empty on single-phase projects.
   *  Only meaningful for UAT / go-live meeting types — the UI shows a
   *  required phase picker for those types when this array has entries. */
  phases: Array<{ id: string; name: string }>;
};

export type MeetingPrepDraft = {
  pmCustomNote: string;
  /** Optional per-send label distinguishing multiple sends of the same type
   *  (e.g. "Network Architecture" / "Call Flows" for split discoveries). */
  label?: string | null;
  /** For UAT / go-live on multi-phase projects: scope this send to a phase.
   *  Server folds the phase name into the subject's label suffix. */
  phaseId?: string | null;
  /** Kickoff-specific. Other meeting types ignore. */
  kickoffMeetingUrl?: string | null;
  /** Kickoff-specific. Other meeting types ignore. */
  kickoffWhen?: string | null;
  distributionListEmail?: string | null;
  /**
   * Map of section-id → enabled. Server walks the meeting-type catalog and
   * fills in defaults for any applicable keys this payload omits.
   */
  sections: Record<string, boolean>;
  recipients: {
    contactIds: string[];
    staffUserIds: string[];
    zoomRep?: { name: string; email: string } | null;
    extraEmails: string[];
  };
  attachmentUrls: string[];
};
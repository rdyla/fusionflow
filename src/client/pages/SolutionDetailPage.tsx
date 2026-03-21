import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, type Solution, type SolutionStatus, type SolutionType, type User, type DynamicsContact, type SolutionContact, type GapItem, type RiskItem, type GapCategory, type RiskCategory, type Priority, type GapAnalysis, type SolutionStaffMember, type NeedsAssessment, type LaborEstimate } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";
import { generateSOR } from "../lib/generateSOR";
import NeedsAssessmentWizard from "../components/solutioning/NeedsAssessmentWizard";
import LaborEstimateView from "../components/solutioning/LaborEstimateView";
import NeedsAssessmentSOR from "../components/solutioning/NeedsAssessmentSOR";
import ciSurveyJson from "../assets/ci_needs_assessment_unified_v1.json";
import ccaasSurveyJson from "../assets/ccaas_needs_assessment_unified_v1.json";
import virtualAgentSurveyJson from "../assets/virtual_agent_needs_assessment_unified_v1.json";
import ucaasSurveyJson from "../assets/ucaas_needs_assessment_unified_v1.json";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SolutionStatus, string> = {
  draft: "Draft",
  assessment: "Needs Assessment",
  requirements: "Requirements",
  scope: "Scope of Work",
  handoff: "Handoff Ready",
  won: "Won",
  lost: "Lost",
};

const STATUS_COLOR: Record<SolutionStatus, string> = {
  draft: "#94a3b8",
  assessment: "#0891b2",
  requirements: "#8764b8",
  scope: "#ff8c00",
  handoff: "#63c1ea",
  won: "#107c10",
  lost: "#d13438",
};

const STATUS_FLOW: SolutionStatus[] = ["draft", "assessment", "requirements", "scope", "handoff"];

const TYPE_LABELS: Record<SolutionType, string> = {
  ucaas: "UCaaS",
  ccaas: "CCaaS",
  zoom_ra: "Zoom Revenue Accelerator",
  zoom_va: "Zoom Virtual Agent",
  rc_ace: "RingCentral ACE",
  rc_air: "RingCentral AIR",
};

// ── Gap & Risk helpers ────────────────────────────────────────────────────────

const GAP_CATEGORIES: GapCategory[] = ["Feature", "Integration", "Infrastructure", "Process", "Compliance"];
const RISK_CATEGORIES: RiskCategory[] = ["Technical", "Commercial", "Operational", "Timeline", "Compliance"];
const PRIORITIES: Priority[] = ["high", "medium", "low"];

const GAP_CATEGORY_COLOR: Record<GapCategory, string> = {
  Feature:        "#0891b2",
  Integration:    "#8764b8",
  Infrastructure: "#ff8c00",
  Process:        "#059669",
  Compliance:     "#d13438",
};

function riskScore(probability: Priority, impact: Priority): { label: string; color: string } {
  const rank: Record<Priority, number> = { high: 2, medium: 1, low: 0 };
  const score = rank[probability] + rank[impact];
  if (score >= 4) return { label: "Critical", color: "#991b1b" };
  if (score >= 3) return { label: "High",     color: "#d13438" };
  if (score >= 2) return { label: "Medium",   color: "#f59e0b" };
  return              { label: "Low",      color: "#22c55e" };
}

function parseGapAnalysis(raw: string | null | undefined): GapAnalysis {
  if (!raw) return { gaps: [], risks: [] };
  try { return JSON.parse(raw) as GapAnalysis; } catch { return { gaps: [], risks: [] }; }
}

const BLANK_GAP: Omit<GapItem, "id"> = {
  category: "Feature", description: "", current_state: "", required_state: "", priority: "medium", notes: "",
};
const BLANK_RISK: Omit<RiskItem, "id"> = {
  category: "Technical", description: "", probability: "medium", impact: "medium", mitigation: "",
};

// ── Assessment Schema ─────────────────────────────────────────────────────────

type FieldDef =
  | { type: "text" | "date" | "number" | "textarea"; key: string; label: string; placeholder?: string }
  | { type: "select"; key: string; label: string; options: string[] }
  | { type: "checkbox"; key: string; label: string };

type SectionDef = { title: string; fields: FieldDef[] };

const ASSESSMENT_SCHEMA: Record<SolutionType, SectionDef[]> = {
  ucaas: [
    {
      title: "Current Environment",
      fields: [
        { type: "text", key: "current_vendor", label: "Current Phone System / Vendor" },
        { type: "date", key: "current_contract_end", label: "Contract End Date" },
        { type: "text", key: "carrier", label: "Current Carrier" },
        { type: "number", key: "total_users", label: "Total Users / Seats" },
        { type: "number", key: "office_locations", label: "Number of Locations" },
      ],
    },
    {
      title: "Feature Requirements",
      fields: [
        { type: "checkbox", key: "feat_calling", label: "Voice Calling" },
        { type: "checkbox", key: "feat_sms", label: "SMS / Business Messaging" },
        { type: "checkbox", key: "feat_video", label: "Video Meetings" },
        { type: "checkbox", key: "feat_team_chat", label: "Team Chat" },
        { type: "checkbox", key: "feat_recording", label: "Call Recording" },
        { type: "checkbox", key: "feat_analytics", label: "Analytics & Reporting" },
        { type: "checkbox", key: "feat_ai", label: "AI Assistant" },
        { type: "checkbox", key: "feat_fax", label: "Fax" },
        { type: "checkbox", key: "feat_rooms", label: "Conference Room Systems" },
      ],
    },
    {
      title: "Compliance & Security",
      fields: [
        { type: "checkbox", key: "compliance_hipaa", label: "HIPAA Required" },
        { type: "checkbox", key: "compliance_pci", label: "PCI Compliance" },
        { type: "checkbox", key: "intl_calling", label: "International Calling Needed" },
      ],
    },
    {
      title: "Integrations",
      fields: [
        { type: "text", key: "crm_system", label: "CRM System" },
        { type: "select", key: "productivity_suite", label: "Productivity Suite", options: ["", "Microsoft 365", "Google Workspace", "Other", "None"] },
        { type: "textarea", key: "other_integrations", label: "Other Integration Requirements" },
      ],
    },
    {
      title: "Number Porting",
      fields: [
        { type: "number", key: "numbers_to_port", label: "Estimated Numbers to Port" },
        { type: "text", key: "porting_carrier", label: "Current Carrier for Porting" },
      ],
    },
    {
      title: "Timeline",
      fields: [
        { type: "date", key: "desired_go_live", label: "Desired Go-Live Date" },
        { type: "select", key: "urgency", label: "Urgency", options: ["", "Low", "Medium", "High", "ASAP"] },
        { type: "textarea", key: "notes", label: "Additional Notes" },
      ],
    },
  ],

  ccaas: [
    {
      title: "Current Environment",
      fields: [
        { type: "text", key: "current_platform", label: "Current Contact Center Platform" },
        { type: "date", key: "current_contract_end", label: "Contract End Date" },
        { type: "number", key: "total_agents", label: "Total Agents" },
        { type: "number", key: "supervisors", label: "Supervisors" },
        { type: "number", key: "part_time_agents", label: "Part-Time Agents" },
      ],
    },
    {
      title: "Channels Required",
      fields: [
        { type: "checkbox", key: "ch_voice", label: "Voice" },
        { type: "checkbox", key: "ch_email", label: "Email" },
        { type: "checkbox", key: "ch_chat", label: "Web Chat" },
        { type: "checkbox", key: "ch_sms", label: "SMS" },
        { type: "checkbox", key: "ch_social", label: "Social Media" },
        { type: "checkbox", key: "ch_video", label: "Video" },
      ],
    },
    {
      title: "Routing & IVR",
      fields: [
        { type: "select", key: "ivr_complexity", label: "IVR Complexity", options: ["", "Simple (basic menu)", "Moderate (multi-level)", "Complex (custom logic)"] },
        { type: "checkbox", key: "skill_routing", label: "Skill-Based Routing" },
        { type: "checkbox", key: "callback", label: "Callback / Queue Management" },
        { type: "checkbox", key: "wfm", label: "Workforce Management Needed" },
      ],
    },
    {
      title: "CRM Integration",
      fields: [
        { type: "text", key: "crm_system", label: "CRM System" },
        { type: "select", key: "crm_depth", label: "Integration Depth", options: ["", "Basic (screen pop)", "Advanced (2-way sync)", "Custom"] },
      ],
    },
    {
      title: "Quality & Compliance",
      fields: [
        { type: "checkbox", key: "call_recording", label: "Call Recording" },
        { type: "checkbox", key: "screen_recording", label: "Screen Recording" },
        { type: "checkbox", key: "quality_mgmt", label: "Quality Management / Scoring" },
        { type: "checkbox", key: "compliance_hipaa", label: "HIPAA Required" },
        { type: "checkbox", key: "compliance_pci", label: "PCI Compliance" },
      ],
    },
    {
      title: "AI Features",
      fields: [
        { type: "checkbox", key: "ai_virtual_agent", label: "Virtual Agent / Bot" },
        { type: "checkbox", key: "ai_assist", label: "Agent Assist / Real-Time Guidance" },
        { type: "checkbox", key: "ai_sentiment", label: "Sentiment Analysis" },
      ],
    },
    {
      title: "Timeline",
      fields: [
        { type: "date", key: "desired_go_live", label: "Desired Go-Live Date" },
        { type: "select", key: "urgency", label: "Urgency", options: ["", "Low", "Medium", "High", "ASAP"] },
        { type: "textarea", key: "notes", label: "Additional Notes" },
      ],
    },
  ],

  zoom_ra: [
    {
      title: "Current State",
      fields: [
        { type: "text", key: "current_ci_solution", label: "Current Conversation Intelligence Solution (if any)" },
        { type: "number", key: "sales_reps", label: "Number of Sales Reps" },
        { type: "number", key: "sales_managers", label: "Number of Sales Managers" },
      ],
    },
    {
      title: "Zoom Environment",
      fields: [
        { type: "checkbox", key: "has_zoom_phone", label: "Uses Zoom Phone" },
        { type: "checkbox", key: "has_zoom_meetings", label: "Uses Zoom Meetings" },
        { type: "number", key: "zoom_seat_count", label: "Zoom Seat Count" },
      ],
    },
    {
      title: "CRM",
      fields: [
        { type: "select", key: "crm_system", label: "CRM System", options: ["", "Salesforce", "HubSpot", "Microsoft Dynamics", "Pipedrive", "Other", "None"] },
        { type: "text", key: "crm_version", label: "CRM Version / Edition" },
      ],
    },
    {
      title: "Use Cases",
      fields: [
        { type: "checkbox", key: "uc_coaching", label: "Call Coaching & Scoring" },
        { type: "checkbox", key: "uc_deal_intel", label: "Deal Intelligence" },
        { type: "checkbox", key: "uc_forecasting", label: "Revenue Forecasting" },
        { type: "checkbox", key: "uc_competitive", label: "Competitive Intelligence" },
        { type: "checkbox", key: "uc_onboarding", label: "Rep Onboarding & Training" },
      ],
    },
    {
      title: "Timeline",
      fields: [
        { type: "date", key: "desired_go_live", label: "Desired Go-Live Date" },
        { type: "select", key: "urgency", label: "Urgency", options: ["", "Low", "Medium", "High", "ASAP"] },
        { type: "textarea", key: "notes", label: "Additional Notes" },
      ],
    },
  ],

  zoom_va: [
    {
      title: "Current State",
      fields: [
        { type: "text", key: "current_va_solution", label: "Current Virtual Agent / Chatbot Solution (if any)" },
        { type: "select", key: "primary_use_case", label: "Primary Use Case", options: ["", "Customer Support", "IT Helpdesk", "Sales Assistance", "HR Self-Service", "Other"] },
        { type: "number", key: "monthly_interactions", label: "Estimated Monthly Interactions" },
      ],
    },
    {
      title: "Zoom Environment",
      fields: [
        { type: "checkbox", key: "has_zoom_contact_center", label: "Zoom Contact Center" },
        { type: "checkbox", key: "has_zoom_phone", label: "Zoom Phone" },
        { type: "checkbox", key: "has_zoom_meetings", label: "Zoom Meetings" },
        { type: "number", key: "zoom_seat_count", label: "Zoom Seat Count" },
      ],
    },
    {
      title: "Channels",
      fields: [
        { type: "checkbox", key: "ch_web_chat", label: "Website Chat Widget" },
        { type: "checkbox", key: "ch_mobile", label: "Mobile App" },
        { type: "checkbox", key: "ch_sms", label: "SMS" },
        { type: "checkbox", key: "ch_voice", label: "Voice IVR" },
        { type: "checkbox", key: "ch_slack", label: "Slack" },
        { type: "checkbox", key: "ch_teams", label: "Microsoft Teams" },
      ],
    },
    {
      title: "Escalation & Routing",
      fields: [
        { type: "checkbox", key: "live_agent_escalation", label: "Live Agent Escalation Required" },
        { type: "select", key: "escalation_target", label: "Escalation Target", options: ["", "Zoom Contact Center", "External Contact Center", "Email Queue", "Other"] },
        { type: "checkbox", key: "context_handoff", label: "Conversation Context Passed on Escalation" },
      ],
    },
    {
      title: "Integrations & Knowledge",
      fields: [
        { type: "select", key: "crm_system", label: "CRM System", options: ["", "Salesforce", "HubSpot", "Microsoft Dynamics", "ServiceNow", "Zendesk", "Other", "None"] },
        { type: "checkbox", key: "ticketing_integration", label: "Ticketing System Integration (e.g. Zendesk, ServiceNow)" },
        { type: "text", key: "ticketing_platform", label: "Ticketing Platform" },
        { type: "checkbox", key: "knowledge_base", label: "Existing Knowledge Base to Connect" },
        { type: "textarea", key: "key_intents", label: "Key Topics / Intents to Handle" },
      ],
    },
    {
      title: "Compliance & Language",
      fields: [
        { type: "checkbox", key: "compliance_hipaa", label: "HIPAA Required" },
        { type: "checkbox", key: "compliance_pci", label: "PCI Compliance" },
        { type: "text", key: "languages", label: "Languages Required (e.g. English, Spanish)" },
      ],
    },
    {
      title: "Timeline",
      fields: [
        { type: "date", key: "desired_go_live", label: "Desired Go-Live Date" },
        { type: "select", key: "urgency", label: "Urgency", options: ["", "Low", "Medium", "High", "ASAP"] },
        { type: "textarea", key: "notes", label: "Additional Notes" },
      ],
    },
  ],

  rc_ace: [
    {
      title: "Current State",
      fields: [
        { type: "text", key: "current_ci_solution", label: "Current Conversation Intelligence Solution (if any)" },
        { type: "number", key: "sales_reps", label: "Number of Sales Reps" },
        { type: "number", key: "sales_managers", label: "Number of Sales Managers" },
      ],
    },
    {
      title: "RingCentral Environment",
      fields: [
        { type: "checkbox", key: "has_ring_ex", label: "RingEX (UCaaS)" },
        { type: "checkbox", key: "has_ring_cx", label: "RingCX (CCaaS)" },
        { type: "number", key: "rc_seat_count", label: "RingCentral Seat Count" },
      ],
    },
    {
      title: "CRM",
      fields: [
        { type: "select", key: "crm_system", label: "CRM System", options: ["", "Salesforce", "HubSpot", "Microsoft Dynamics", "Pipedrive", "Other", "None"] },
        { type: "text", key: "crm_version", label: "CRM Version / Edition" },
      ],
    },
    {
      title: "Use Cases",
      fields: [
        { type: "checkbox", key: "uc_coaching", label: "Call Coaching & Scoring" },
        { type: "checkbox", key: "uc_deal_intel", label: "Deal Intelligence" },
        { type: "checkbox", key: "uc_analytics", label: "Conversation Analytics" },
        { type: "checkbox", key: "uc_forecasting", label: "Revenue Forecasting" },
        { type: "checkbox", key: "uc_onboarding", label: "Rep Onboarding & Training" },
      ],
    },
    {
      title: "Timeline",
      fields: [
        { type: "date", key: "desired_go_live", label: "Desired Go-Live Date" },
        { type: "select", key: "urgency", label: "Urgency", options: ["", "Low", "Medium", "High", "ASAP"] },
        { type: "textarea", key: "notes", label: "Additional Notes" },
      ],
    },
  ],

  rc_air: [
    {
      title: "Current State",
      fields: [
        { type: "text", key: "current_va_solution", label: "Current Virtual Agent / Chatbot Solution (if any)" },
        { type: "select", key: "primary_use_case", label: "Primary Use Case", options: ["", "Customer Support", "IT Helpdesk", "Sales Assistance", "HR Self-Service", "Other"] },
        { type: "number", key: "monthly_interactions", label: "Estimated Monthly Interactions" },
      ],
    },
    {
      title: "RingCentral Environment",
      fields: [
        { type: "checkbox", key: "has_ring_cx", label: "RingCX (Contact Center)" },
        { type: "checkbox", key: "has_ring_ex", label: "RingEX (UCaaS)" },
        { type: "number", key: "rc_seat_count", label: "RingCentral Seat Count" },
      ],
    },
    {
      title: "Channels",
      fields: [
        { type: "checkbox", key: "ch_web_chat", label: "Website Chat Widget" },
        { type: "checkbox", key: "ch_mobile", label: "Mobile App" },
        { type: "checkbox", key: "ch_sms", label: "SMS" },
        { type: "checkbox", key: "ch_voice", label: "Voice IVR" },
        { type: "checkbox", key: "ch_social", label: "Social / Messaging Platforms" },
      ],
    },
    {
      title: "Escalation & Routing",
      fields: [
        { type: "checkbox", key: "live_agent_escalation", label: "Live Agent Escalation Required" },
        { type: "select", key: "escalation_target", label: "Escalation Target", options: ["", "RingCX Agents", "External Contact Center", "Email Queue", "Other"] },
        { type: "checkbox", key: "context_handoff", label: "Conversation Context Passed on Escalation" },
      ],
    },
    {
      title: "Integrations & Knowledge",
      fields: [
        { type: "select", key: "crm_system", label: "CRM System", options: ["", "Salesforce", "HubSpot", "Microsoft Dynamics", "ServiceNow", "Zendesk", "Other", "None"] },
        { type: "checkbox", key: "ticketing_integration", label: "Ticketing System Integration" },
        { type: "text", key: "ticketing_platform", label: "Ticketing Platform" },
        { type: "checkbox", key: "knowledge_base", label: "Existing Knowledge Base to Connect" },
        { type: "textarea", key: "key_intents", label: "Key Topics / Intents to Handle" },
      ],
    },
    {
      title: "Compliance & Language",
      fields: [
        { type: "checkbox", key: "compliance_hipaa", label: "HIPAA Required" },
        { type: "checkbox", key: "compliance_pci", label: "PCI Compliance" },
        { type: "text", key: "languages", label: "Languages Required (e.g. English, Spanish)" },
      ],
    },
    {
      title: "Timeline",
      fields: [
        { type: "date", key: "desired_go_live", label: "Desired Go-Live Date" },
        { type: "select", key: "urgency", label: "Urgency", options: ["", "Low", "Medium", "High", "ASAP"] },
        { type: "textarea", key: "notes", label: "Additional Notes" },
      ],
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJSON(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

// ── Main Component ────────────────────────────────────────────────────────────

type Tab = "overview" | "assessment" | "requirements" | "gap_risk" | "scope" | "handoff" | "labor";

export default function SolutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [solution, setSolution] = useState<Solution | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [currentRole, setCurrentRole] = useState("");

  // Contacts
  const [crmContacts, setCrmContacts] = useState<DynamicsContact[]>([]);
  const [solutionContacts, setSolutionContacts] = useState<SolutionContact[]>([]);
  const [savingContact, setSavingContact] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactModalTab, setContactModalTab] = useState<"crm" | "manual">("crm");
  const [contactRole, setContactRole] = useState("");
  const [manualContact, setManualContact] = useState({ name: "", email: "", phone: "", job_title: "" });

  // Tab-local state
  const [overview, setOverview] = useState({ name: "", customer_name: "", pf_ae_user_id: "", partner_ae_user_id: "", status: "" as SolutionStatus });
  const [assessment, setAssessment] = useState<Record<string, string>>({});
  const [requirements, setRequirements] = useState("");
  const [scope, setScope] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");

  // Gap & Risk state
  const [gapItems, setGapItems] = useState<GapItem[]>([]);
  const [riskItems, setRiskItems] = useState<RiskItem[]>([]);
  const [showGapModal, setShowGapModal] = useState(false);
  const [editingGap, setEditingGap] = useState<GapItem | null>(null);
  const [gapForm, setGapForm] = useState<Omit<GapItem, "id">>(BLANK_GAP);
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState<RiskItem | null>(null);
  const [riskForm, setRiskForm] = useState<Omit<RiskItem, "id">>(BLANK_RISK);
  const [savingGapRisk, setSavingGapRisk] = useState(false);

  // Needs Assessment (CI types)
  const [needsAssessment, setNeedsAssessment] = useState<NeedsAssessment | null>(null);
  const [naView, setNaView] = useState<"sor" | "wizard">("sor");

  // Labor Estimate
  const [laborEstimate, setLaborEstimate] = useState<LaborEstimate | null>(null);

  // Solution staff
  const [solutionStaff, setSolutionStaff] = useState<SolutionStaffMember[]>([]);
  const [showSolutionStaffModal, setShowSolutionStaffModal] = useState(false);
  const [addSolutionStaffUser, setAddSolutionStaffUser] = useState("");
  const [addSolutionStaffRole, setAddSolutionStaffRole] = useState("");
  const [addingSolutionStaff, setAddingSolutionStaff] = useState(false);
  const [solutionStaffPhotoMap, setSolutionStaffPhotoMap] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    if (!id) return;
    const [s, u, me] = await Promise.all([api.solution(id), api.users(), api.me()]);
    setSolution(s);
    setUsers(u);
    setCurrentRole(me.role);
    setOverview({
      name: s.name,
      customer_name: s.customer_name,
      pf_ae_user_id: s.pf_ae_user_id ?? "",
      partner_ae_user_id: s.partner_ae_user_id ?? "",
      status: s.status,
    });
    setAssessment(parseJSON(s.needs_assessment));
    setRequirements(s.requirements ?? "");
    setScope(s.scope_of_work ?? "");
    setHandoffNotes(s.handoff_notes ?? "");
    const ga = parseGapAnalysis(s.gap_analysis);
    setGapItems(ga.gaps);
    setRiskItems(ga.risks);

    // Load needs assessment for applicable solution types
    if (["zoom_ra", "rc_ace", "ccaas", "zoom_va", "rc_air", "ucaas"].includes(s.solution_type)) {
      api.needsAssessment(id).then(setNeedsAssessment).catch(() => {});
    }

    // Load labor estimate (all solution types)
    api.laborEstimate(id).then(setLaborEstimate).catch(() => {});

    // Load CRM contacts and solution contacts in parallel
    if (s.dynamics_account_id) {
      api.getDynamicsContacts(s.dynamics_account_id).then(setCrmContacts).catch(() => {});
    }
    api.solutionContacts(id).then(setSolutionContacts).catch(() => {});
    api.solutionStaff(id).then((staff) => {
      setSolutionStaff(staff);
      if (staff.length > 0) {
        const emails = staff.map((s) => s.email);
        api.staffPhotos(emails).then(setSolutionStaffPhotoMap).catch(() => {});
      }
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    load().catch(() => showToast("Failed to load solution", "error")).finally(() => setLoading(false));
  }, [load]);

  async function save(patch: Parameters<typeof api.updateSolution>[1]) {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await api.updateSolution(id, patch);
      setSolution(updated);
      showToast("Saved.", "success");
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function advanceStatus() {
    if (!solution) return;
    const idx = STATUS_FLOW.indexOf(solution.status);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    await save({ status: next });
  }

  async function markLost() {
    await save({ status: "lost" });
  }

  async function handleAddSolutionStaff() {
    if (!addSolutionStaffUser || !addSolutionStaffRole || !id) return;
    setAddingSolutionStaff(true);
    try {
      const added = await api.addSolutionStaff(id, { user_id: addSolutionStaffUser, staff_role: addSolutionStaffRole });
      setSolutionStaff((prev) => [...prev, added]);
      setAddSolutionStaffUser("");
      setAddSolutionStaffRole("");
      setShowSolutionStaffModal(false);
      showToast("Staff member added.", "success");
    } catch {
      showToast("Failed to add staff member", "error");
    } finally {
      setAddingSolutionStaff(false);
    }
  }

  async function handleRemoveSolutionStaff(staffId: string) {
    if (!id) return;
    try {
      await api.removeSolutionStaff(id, staffId);
      setSolutionStaff((prev) => prev.filter((s) => s.id !== staffId));
      showToast("Staff member removed.", "success");
    } catch {
      showToast("Failed to remove staff member", "error");
    }
  }

  async function handleCreateProject() {
    if (!id) return;
    setCreatingProject(true);
    try {
      const project = await api.createProjectFromSolution(id);
      showToast("Project created!", "success");
      navigate(`/projects/${project.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create project", "error");
    } finally {
      setCreatingProject(false);
    }
  }

  const canEdit = currentRole === "admin" || currentRole === "pm" || currentRole === "pf_ae";
  const partnerAes = users.filter((u) => u.role === "partner_ae");

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading…</div>;
  if (!solution) return <div style={{ color: "#d13438", padding: 32 }}>Solution not found.</div>;

  const statusIdx = STATUS_FLOW.indexOf(solution.status);
  const canAdvance = canEdit && statusIdx >= 0 && statusIdx < STATUS_FLOW.length - 1;
  const isTerminal = solution.status === "won" || solution.status === "lost";

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview",     label: "Overview"         },
    { key: "assessment",   label: "Needs Assessment" },
    { key: "requirements", label: "Requirements"     },
    { key: "gap_risk",     label: "Gap & Risk"       },
    { key: "scope",        label: "Scope of Work"    },
    { key: "handoff",      label: "Handoff"          },
    { key: "labor",        label: "Labor Estimate"   },
  ];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Back */}
      <Link to="/solutions" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 20 }}>
        ← Solutions
      </Link>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", margin: 0 }}>{solution.customer_name}</h1>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{solution.name}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span className="ms-badge" style={{ background: "rgba(99,193,234,0.12)", color: "#0891b2", border: "1px solid rgba(99,193,234,0.25)" }}>
              {TYPE_LABELS[solution.solution_type]}
            </span>
            <span className="ms-badge" style={{ background: `${STATUS_COLOR[solution.status]}18`, color: STATUS_COLOR[solution.status], border: `1px solid ${STATUS_COLOR[solution.status]}40` }}>
              {STATUS_LABELS[solution.status]}
            </span>
          </div>
        </div>

        {/* Status actions */}
        {canEdit && !isTerminal && (
          <div style={{ display: "flex", gap: 8 }}>
            {canAdvance && (
              <button className="ms-btn-primary" onClick={advanceStatus} disabled={saving}>
                Advance → {STATUS_LABELS[STATUS_FLOW[statusIdx + 1]]}
              </button>
            )}
            {solution.status !== "lost" && (
              <button
                className="ms-btn-ghost"
                onClick={markLost}
                style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}
              >
                Mark Lost
              </button>
            )}
          </div>
        )}
      </div>

      {/* Status progress bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28, background: "rgba(0,0,0,0.02)", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(0,0,0,0.07)" }}>
        {STATUS_FLOW.map((s, i) => {
          const isCurrent = solution.status === s;
          const isPast = statusIdx > i;
          return (
            <div
              key={s}
              style={{
                flex: 1, padding: "8px 4px", textAlign: "center", fontSize: 11, fontWeight: 600,
                color: isCurrent ? "#fff" : isPast ? "#475569" : "#cbd5e1",
                background: isCurrent ? STATUS_COLOR[s] : isPast ? `${STATUS_COLOR[s]}30` : "transparent",
                borderRight: i < STATUS_FLOW.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none",
                letterSpacing: "0.04em", textTransform: "uppercase",
              }}
            >
              {STATUS_LABELS[s]}
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(0,0,0,0.07)", marginBottom: 28 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 18px", background: "none", border: "none", borderBottom: `2px solid ${tab === t.key ? "#63c1ea" : "transparent"}`,
              color: tab === t.key ? "#63c1ea" : "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === "overview" && (
        <div style={{ display: "grid", gap: 24 }}>
          <div className="ms-card">
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Solution Details</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label className="ms-label">
                <span>Solution Name</span>
                {canEdit ? (
                  <input className="ms-input" value={overview.name} onChange={(e) => setOverview((o) => ({ ...o, name: e.target.value }))} />
                ) : (
                  <div style={{ fontSize: 14, color: "#334155", padding: "8px 0" }}>{solution.name}</div>
                )}
              </label>
              <label className="ms-label">
                <span>Customer Name</span>
                {canEdit ? (
                  <input className="ms-input" value={overview.customer_name} onChange={(e) => setOverview((o) => ({ ...o, customer_name: e.target.value }))} />
                ) : (
                  <div style={{ fontSize: 14, color: "#334155", padding: "8px 0" }}>{solution.customer_name}</div>
                )}
              </label>
              <label className="ms-label">
                <span>Vendor</span>
                <div style={{ fontSize: 14, color: "#334155", padding: "8px 0" }}>{solution.vendor === "zoom" ? "Zoom" : "RingCentral"}</div>
              </label>
              <label className="ms-label">
                <span>Solution Type</span>
                <div style={{ fontSize: 14, color: "#334155", padding: "8px 0" }}>{TYPE_LABELS[solution.solution_type]}</div>
              </label>
              {solution.dynamics_account_id && (
                <label className="ms-label">
                  <span>CRM Account</span>
                  <div style={{ fontSize: 13, color: "#63c1ea", padding: "8px 0" }}>✓ Linked to Dynamics CRM</div>
                </label>
              )}
            </div>
            {canEdit && (
              <button className="ms-btn-primary" style={{ marginTop: 16 }} disabled={saving}
                onClick={() => save({ name: overview.name, customer_name: overview.customer_name })}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            )}
          </div>

          <div className="ms-card">
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>PF Team</h3>

            {/* Staff list */}
            {solutionStaff.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
                {solutionStaff.map((s) => {
                  const abbr = s.name ? s.name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase() : s.email.slice(0, 2).toUpperCase();
                  const roleLabel: Record<string, string> = { pf_ae: "Account Executive", pf_sa: "Solution Architect", pf_csm: "Client Success Manager", pf_engineer: "Implementation Engineer", pm: "Project Manager" };
                  const photo = solutionStaffPhotoMap[s.email] ?? s.avatar_url;
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)", position: "relative" }}>
                      {photo
                        ? <img src={photo} alt={s.name ?? s.email} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                        : <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, rgba(0,120,212,0.3), rgba(99,193,234,0.2))", border: "1px solid rgba(99,193,234,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#63c1ea" }}>{abbr}</div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 2 }}>{roleLabel[s.staff_role] ?? s.staff_role}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{s.name ?? s.email}</div>
                      </div>
                      {canEdit && (
                        <button onClick={() => handleRemoveSolutionStaff(s.id)} style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", color: "rgba(209,52,56,0.6)", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "2px 4px" }} title="Remove">✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {solutionStaff.length === 0 && (
              <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", marginBottom: 16 }}>No PF staff assigned yet.</div>
            )}

            {canEdit && (
              <div style={{ paddingTop: 12, borderTop: "1px solid #f1f5f9", marginBottom: 16 }}>
                <button className="ms-btn-secondary" onClick={() => { setShowSolutionStaffModal(true); setAddSolutionStaffUser(""); setAddSolutionStaffRole(""); }}>
                  + Add Staff Member
                </button>
              </div>
            )}

            {/* Partner AE - unchanged */}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 14 }}>
              <label className="ms-label">
                <span>Partner AE</span>
                {canEdit ? (
                  <select className="ms-input" value={overview.partner_ae_user_id} onChange={(e) => setOverview((o) => ({ ...o, partner_ae_user_id: e.target.value }))}>
                    <option value="">— None —</option>
                    {partnerAes.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}{u.organization_name ? ` (${u.organization_name})` : ""}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: 14, color: "#334155", padding: "8px 0" }}>{solution.partner_ae_display_name ?? solution.partner_ae_name ?? "—"}</div>
                )}
              </label>
              {canEdit && (
                <button className="ms-btn-primary" style={{ marginTop: 12 }} disabled={saving}
                  onClick={() => save({ partner_ae_user_id: overview.partner_ae_user_id || null })}>
                  {saving ? "Saving…" : "Save Partner AE"}
                </button>
              )}
            </div>
          </div>

          {/* ── Customer Contacts ── */}
          <div className="ms-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Customer Contacts</h3>
              {canEdit && (
                <button
                  className="ms-btn-secondary"
                  onClick={() => {
                    setShowContactModal(true);
                    setContactModalTab(solution.dynamics_account_id ? "crm" : "manual");
                    setContactRole("");
                    setManualContact({ name: "", email: "", phone: "", job_title: "" });
                    if (solution.dynamics_account_id && crmContacts.length === 0) {
                      api.getDynamicsContacts(solution.dynamics_account_id).then(setCrmContacts).catch(() => {});
                    }
                  }}
                >
                  + Add Contact
                </button>
              )}
            </div>

            {solutionContacts.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No customer contacts added yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {solutionContacts.map((c) => (
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
                          if (!id) return;
                          await api.removeSolutionContact(id, c.id);
                          setSolutionContacts((prev) => prev.filter((x) => x.id !== c.id));
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
        </div>
      )}

      {/* ── Add Staff Modal ── */}
      {showSolutionStaffModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSolutionStaffModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 480, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Add PF Team Member</h2>
              <button onClick={() => setShowSolutionStaffModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
              <label className="ms-label">
                <span>Role on Solution</span>
                <select className="ms-input" value={addSolutionStaffRole} onChange={(e) => setAddSolutionStaffRole(e.target.value)}>
                  <option value="">— Select role —</option>
                  <option value="pf_ae">Account Executive</option>
                  <option value="pf_sa">Solution Architect</option>
                  <option value="pf_csm">Client Success Manager</option>
                  <option value="pf_engineer">Implementation Engineer</option>
                  <option value="pm">Project Manager</option>
                </select>
              </label>
              <label className="ms-label">
                <span>Team Member</span>
                <select className="ms-input" value={addSolutionStaffUser} onChange={(e) => setAddSolutionStaffUser(e.target.value)}>
                  <option value="">— Select team member —</option>
                  {users.filter((u) => u.role !== "partner_ae").map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <button className="ms-btn-primary" disabled={!addSolutionStaffUser || !addSolutionStaffRole || addingSolutionStaff} onClick={handleAddSolutionStaff}>
                {addingSolutionStaff ? "Adding…" : "Add Team Member"}
              </button>
              <button className="ms-btn-secondary" onClick={() => setShowSolutionStaffModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contact Modal ── */}
      {showContactModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowContactModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 580, display: "flex", flexDirection: "column", maxHeight: "85vh" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Add Customer Contact</h2>
              <button onClick={() => setShowContactModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>

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

            {solution.dynamics_account_id && (
              <div style={{ display: "flex", gap: 0, padding: "12px 24px 0", flexShrink: 0 }}>
                {(["crm", "manual"] as const).map((t) => (
                  <button key={t} onClick={() => setContactModalTab(t)} style={{ flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", background: "none", border: "none", borderBottom: `2px solid ${contactModalTab === t ? "#63c1ea" : "transparent"}`, color: contactModalTab === t ? "#63c1ea" : "#94a3b8", marginBottom: -1 }}>
                    {t === "crm" ? "From CRM" : "Enter Manually"}
                  </button>
                ))}
              </div>
            )}

            <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
              {contactModalTab === "crm" && (
                <div style={{ display: "grid", gap: 6 }}>
                  {crmContacts.filter((c) => !solutionContacts.some((s) => s.dynamics_contact_id === c.contactid)).map((c) => {
                    const fullName = [c.firstname, c.lastname].filter(Boolean).join(" ");
                    return (
                      <div key={c.contactid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 6 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{fullName || "—"}</div>
                          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{[c.jobtitle, c.emailaddress1, c.telephone1].filter(Boolean).join(" · ")}</div>
                        </div>
                        <button className="ms-btn-secondary" style={{ fontSize: 12, flexShrink: 0 }} disabled={savingContact || !contactRole} title={!contactRole ? "Select a role first" : ""}
                          onClick={async () => {
                            if (!id) return;
                            setSavingContact(true);
                            try {
                              const added = await api.addSolutionContact(id, { dynamics_contact_id: c.contactid, name: fullName || "Unknown", email: c.emailaddress1, phone: c.telephone1, job_title: c.jobtitle, contact_role: contactRole || null });
                              setSolutionContacts((prev) => [...prev, added]);
                              setContactRole("");
                            } catch { showToast("Failed to add contact", "error"); }
                            finally { setSavingContact(false); }
                          }}>
                          + Add
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {(!solution.dynamics_account_id || contactModalTab === "manual") && (
                <div style={{ display: "grid", gap: 14 }}>
                  <label className="ms-label"><span>Name *</span><input className="ms-input" placeholder="Full name" value={manualContact.name} onChange={(e) => setManualContact((m) => ({ ...m, name: e.target.value }))} /></label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label className="ms-label"><span>Email</span><input className="ms-input" type="email" value={manualContact.email} onChange={(e) => setManualContact((m) => ({ ...m, email: e.target.value }))} /></label>
                    <label className="ms-label"><span>Phone</span><input className="ms-input" value={manualContact.phone} onChange={(e) => setManualContact((m) => ({ ...m, phone: e.target.value }))} /></label>
                  </div>
                  <label className="ms-label"><span>Job Title</span><input className="ms-input" value={manualContact.job_title} onChange={(e) => setManualContact((m) => ({ ...m, job_title: e.target.value }))} /></label>
                </div>
              )}
            </div>

            {(!solution.dynamics_account_id || contactModalTab === "manual") && (
              <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
                <button className="ms-btn-primary" disabled={savingContact || !manualContact.name.trim() || !contactRole}
                  onClick={async () => {
                    if (!id) return;
                    setSavingContact(true);
                    try {
                      const added = await api.addSolutionContact(id, { name: manualContact.name.trim(), email: manualContact.email || null, phone: manualContact.phone || null, job_title: manualContact.job_title || null, contact_role: contactRole || null });
                      setSolutionContacts((prev) => [...prev, added]);
                      setManualContact({ name: "", email: "", phone: "", job_title: "" });
                      setContactRole("");
                    } catch { showToast("Failed to add contact", "error"); }
                    finally { setSavingContact(false); }
                  }}>
                  {savingContact ? "Adding…" : "Add Contact"}
                </button>
                <button className="ms-btn-secondary" onClick={() => setShowContactModal(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Assessment Tab ── */}
      {tab === "assessment" && ["zoom_ra", "rc_ace", "ccaas", "zoom_va", "rc_air", "ucaas"].includes(solution.solution_type) && (
        <div>
          {(() => {
            const surveyJson =
              solution.solution_type === "ccaas" ? ccaasSurveyJson :
              (solution.solution_type === "zoom_va" || solution.solution_type === "rc_air") ? virtualAgentSurveyJson :
              solution.solution_type === "ucaas" ? ucaasSurveyJson :
              ciSurveyJson;
            const solutionTypeLabel =
              solution.solution_type === "zoom_ra" ? "Zoom Revenue Accelerator" :
              solution.solution_type === "rc_ace" ? "RingCentral ACE" :
              solution.solution_type === "zoom_va" ? "Zoom Virtual Agent" :
              solution.solution_type === "rc_air" ? "RingCentral AIR" :
              solution.solution_type === "ucaas" ? "UCaaS" :
              "CCaaS";
            return (naView === "wizard" || needsAssessment === null) && naView !== "sor" ? (
              <NeedsAssessmentWizard
                solutionId={solution.id}
                customerName={solution.customer_name}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                surveyJson={surveyJson as any}
                initialAnswers={needsAssessment?.answers as Record<string, unknown> | undefined}
                onComplete={(na) => { setNeedsAssessment(na); setNaView("sor"); }}
                onCancel={() => { if (needsAssessment) setNaView("sor"); }}
              />
            ) : needsAssessment !== null && naView === "sor" ? (
              <NeedsAssessmentSOR
                assessment={needsAssessment}
                customerName={solution.customer_name}
                solutionType={solutionTypeLabel}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                surveyJson={surveyJson as any}
                onBack={() => setNaView("wizard")}
                onDelete={async () => {
                  try {
                    await api.deleteNeedsAssessment(solution.id);
                    setNeedsAssessment(null);
                    setNaView("sor");
                  } catch {
                    showToast("Failed to delete assessment", "error");
                  }
                }}
              />
            ) : (
              <div className="ms-card" style={{ textAlign: "center", padding: 40 }}>
                <p style={{ fontSize: 15, color: "#475569", marginBottom: 20 }}>
                  No needs assessment has been completed for this solution yet.
                </p>
                <button
                  className="ms-btn-primary"
                  onClick={() => setNaView("wizard")}
                >
                  Start Needs Assessment
                </button>
              </div>
            );
          })()}
        </div>
      )}
      {tab === "assessment" && !["zoom_ra", "rc_ace", "ccaas", "zoom_va", "rc_air", "ucaas"].includes(solution.solution_type) && (
        <div style={{ display: "grid", gap: 20 }}>
          {ASSESSMENT_SCHEMA[solution.solution_type].map((section) => {
            const checkboxFields = section.fields.filter((f) => f.type === "checkbox");
            const otherFields = section.fields.filter((f) => f.type !== "checkbox");
            return (
              <div key={section.title} className="ms-card">
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {section.title}
                </h3>

                {/* Non-checkbox fields in 2-col grid */}
                {otherFields.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: checkboxFields.length > 0 ? 16 : 0 }}>
                    {otherFields.map((field) => (
                      <label key={field.key} className="ms-label" style={field.type === "textarea" ? { gridColumn: "1 / -1" } : {}}>
                        <span>{field.label}</span>
                        {field.type === "textarea" ? (
                          <textarea
                            className="ms-input"
                            rows={3}
                            style={{ resize: "vertical" }}
                            value={assessment[field.key] ?? ""}
                            onChange={(e) => setAssessment((a) => ({ ...a, [field.key]: e.target.value }))}
                            disabled={!canEdit}
                          />
                        ) : field.type === "select" ? (
                          <select
                            className="ms-input"
                            value={assessment[field.key] ?? ""}
                            onChange={(e) => setAssessment((a) => ({ ...a, [field.key]: e.target.value }))}
                            disabled={!canEdit}
                          >
                            {field.options.map((o) => <option key={o} value={o}>{o || "— Select —"}</option>)}
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            className="ms-input"
                            value={assessment[field.key] ?? ""}
                            onChange={(e) => setAssessment((a) => ({ ...a, [field.key]: e.target.value }))}
                            disabled={!canEdit}
                            placeholder={"placeholder" in field ? field.placeholder : undefined}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                )}

                {/* Checkboxes in 3-col grid */}
                {checkboxFields.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {checkboxFields.map((field) => (
                      <label key={field.key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: canEdit ? "pointer" : "default" }}>
                        <input
                          type="checkbox"
                          checked={assessment[field.key] === "true"}
                          onChange={(e) => canEdit && setAssessment((a) => ({ ...a, [field.key]: e.target.checked ? "true" : "false" }))}
                          style={{ width: 15, height: 15, accentColor: "#63c1ea" }}
                          disabled={!canEdit}
                        />
                        <span style={{ fontSize: 13, color: "#475569" }}>{field.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {canEdit && (
            <button
              className="ms-btn-primary"
              disabled={saving}
              style={{ width: "fit-content" }}
              onClick={() => save({ needs_assessment: JSON.stringify(assessment) })}
            >
              {saving ? "Saving…" : "Save Assessment"}
            </button>
          )}
        </div>
      )}

      {/* ── Requirements Tab ── */}
      {tab === "requirements" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div className="ms-card">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
              <div>
                <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Statement of Requirements</h3>
                <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
                  Document the customer's specific technical and business requirements for this solution.
                </p>
              </div>
              <button
                className="ms-btn-secondary"
                style={{ flexShrink: 0 }}
                onClick={() => generateSOR(solution, assessment, requirements, solution.pf_ae_name ?? "Packet Fusion, Inc.")}
              >
                ↓ Export SOR
              </button>
            </div>
            <textarea
              className="ms-input"
              rows={18}
              style={{ resize: "vertical", fontFamily: "monospace", fontSize: 13, lineHeight: 1.6 }}
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="List the customer's requirements here. Include any specific compliance, integration, or performance requirements…"
              disabled={!canEdit}
            />
          </div>
          {canEdit && (
            <button className="ms-btn-primary" disabled={saving} style={{ width: "fit-content" }} onClick={() => save({ requirements })}>
              {saving ? "Saving…" : "Save Requirements"}
            </button>
          )}
        </div>
      )}

      {/* ── Gap & Risk Tab ── */}
      {tab === "gap_risk" && (
        <div style={{ display: "grid", gap: 28 }}>

          {/* Gaps */}
          <div className="ms-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Identified Gaps</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>Differences between current state and what the solution must deliver</p>
              </div>
              {canEdit && (
                <button className="ms-btn-primary" onClick={() => { setEditingGap(null); setGapForm(BLANK_GAP); setShowGapModal(true); }}>+ Add Gap</button>
              )}
            </div>

            {gapItems.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", padding: "12px 0" }}>No gaps identified yet.</div>
            ) : (
              <div className="ms-card" style={{ overflow: "hidden", padding: 0 }}>
                <table className="ms-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Current State</th>
                      <th>Required State</th>
                      <th>Priority</th>
                      {canEdit && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {gapItems.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <span className="ms-badge" style={{ background: GAP_CATEGORY_COLOR[g.category] + "1a", color: GAP_CATEGORY_COLOR[g.category], border: `1px solid ${GAP_CATEGORY_COLOR[g.category]}40`, whiteSpace: "nowrap" }}>
                            {g.category}
                          </span>
                        </td>
                        <td style={{ color: "#334155", fontWeight: 500 }}>
                          {g.description}
                          {g.notes && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{g.notes}</div>}
                        </td>
                        <td style={{ fontSize: 12, color: "#64748b" }}>{g.current_state || "—"}</td>
                        <td style={{ fontSize: 12, color: "#64748b" }}>{g.required_state || "—"}</td>
                        <td>
                          <span className="ms-badge" style={{
                            background: g.priority === "high" ? "#d1343818" : g.priority === "medium" ? "#f59e0b18" : "#22c55e18",
                            color: g.priority === "high" ? "#d13438" : g.priority === "medium" ? "#f59e0b" : "#22c55e",
                            border: `1px solid ${g.priority === "high" ? "#d1343840" : g.priority === "medium" ? "#f59e0b40" : "#22c55e40"}`,
                          }}>
                            {g.priority.charAt(0).toUpperCase() + g.priority.slice(1)}
                          </span>
                        </td>
                        {canEdit && (
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="ms-btn-ghost" onClick={() => { setEditingGap(g); setGapForm({ category: g.category, description: g.description, current_state: g.current_state, required_state: g.required_state, priority: g.priority, notes: g.notes }); setShowGapModal(true); }}>Edit</button>
                              <button className="ms-btn-ghost" style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }} onClick={() => {
                                const updated = gapItems.filter((x) => x.id !== g.id);
                                setGapItems(updated);
                                save({ gap_analysis: JSON.stringify({ gaps: updated, risks: riskItems }) });
                              }}>Delete</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Risks */}
          <div className="ms-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Risk Register</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>Factors that could impact the success or timeline of this solution</p>
              </div>
              {canEdit && (
                <button className="ms-btn-primary" onClick={() => { setEditingRisk(null); setRiskForm(BLANK_RISK); setShowRiskModal(true); }}>+ Add Risk</button>
              )}
            </div>

            {riskItems.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", padding: "12px 0" }}>No risks identified yet.</div>
            ) : (
              <div className="ms-card" style={{ overflow: "hidden", padding: 0 }}>
                <table className="ms-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Probability</th>
                      <th>Impact</th>
                      <th>Score</th>
                      <th>Mitigation</th>
                      {canEdit && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {riskItems.map((r) => {
                      const score = riskScore(r.probability, r.impact);
                      return (
                        <tr key={r.id}>
                          <td><span className="ms-badge" style={{ background: "#ffffff", color: "#475569", border: "1px solid rgba(255,255,255,0.1)", whiteSpace: "nowrap" }}>{r.category}</span></td>
                          <td style={{ color: "#334155", fontWeight: 500 }}>{r.description}</td>
                          <td style={{ fontSize: 12, color: "#475569", textTransform: "capitalize" }}>{r.probability}</td>
                          <td style={{ fontSize: 12, color: "#475569", textTransform: "capitalize" }}>{r.impact}</td>
                          <td>
                            <span className="ms-badge" style={{ background: score.color + "18", color: score.color, border: `1px solid ${score.color}40`, whiteSpace: "nowrap" }}>
                              {score.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: "#64748b" }}>{r.mitigation || "—"}</td>
                          {canEdit && (
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="ms-btn-ghost" onClick={() => { setEditingRisk(r); setRiskForm({ category: r.category, description: r.description, probability: r.probability, impact: r.impact, mitigation: r.mitigation }); setShowRiskModal(true); }}>Edit</button>
                                <button className="ms-btn-ghost" style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }} onClick={() => {
                                  const updated = riskItems.filter((x) => x.id !== r.id);
                                  setRiskItems(updated);
                                  save({ gap_analysis: JSON.stringify({ gaps: gapItems, risks: updated }) });
                                }}>Delete</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Summary counts */}
          {(gapItems.length > 0 || riskItems.length > 0) && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {(["high", "medium", "low"] as Priority[]).map((p) => {
                const gCount = gapItems.filter((g) => g.priority === p).length;
                const rCount = riskItems.filter((r) => riskScore(r.probability, r.impact).label.toLowerCase() === p || (p === "high" && riskScore(r.probability, r.impact).label === "Critical")).length;
                if (!gCount && !rCount) return null;
                const color = p === "high" ? "#d13438" : p === "medium" ? "#f59e0b" : "#22c55e";
                return (
                  <div key={p} style={{ padding: "8px 16px", background: color + "0f", border: `1px solid ${color}30`, borderRadius: 6, fontSize: 12 }}>
                    <span style={{ color, fontWeight: 700, textTransform: "capitalize" }}>{p}</span>
                    <span style={{ color: "#64748b", marginLeft: 8 }}>{gCount} gap{gCount !== 1 ? "s" : ""} · {rCount} risk{rCount !== 1 ? "s" : ""}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Scope Tab ── */}
      {tab === "scope" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div className="ms-card">
            <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Scope of Work</h3>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px" }}>
              Define what is included (and excluded) in this engagement. This document will accompany the project handoff.
            </p>
            <textarea
              className="ms-input"
              rows={18}
              style={{ resize: "vertical", fontFamily: "monospace", fontSize: 13, lineHeight: 1.6 }}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="Define the scope of work, deliverables, exclusions, and any assumptions…"
              disabled={!canEdit}
            />
          </div>
          {canEdit && (
            <button className="ms-btn-primary" disabled={saving} style={{ width: "fit-content" }} onClick={() => save({ scope_of_work: scope })}>
              {saving ? "Saving…" : "Save Scope"}
            </button>
          )}
        </div>
      )}

      {/* ── Handoff Tab ── */}
      {tab === "handoff" && (
        <div style={{ display: "grid", gap: 20 }}>
          {/* Summary */}
          <div className="ms-card">
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Solution Summary</h3>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {[
                  ["Customer", solution.customer_name],
                  ["Vendor", solution.vendor === "zoom" ? "Zoom" : "RingCentral"],
                  ["Solution Type", TYPE_LABELS[solution.solution_type]],
                  ["PF Account Executive", solution.pf_ae_name ?? "—"],
                  ["Partner AE", solution.partner_ae_display_name ?? solution.partner_ae_name ?? "—"],
                  ["Status", STATUS_LABELS[solution.status]],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ padding: "7px 16px 7px 0", fontSize: 13, color: "#94a3b8", width: 180, whiteSpace: "nowrap" }}>{label}</td>
                    <td style={{ padding: "7px 0", fontSize: 13, color: "#334155" }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Handoff notes */}
          <div className="ms-card">
            <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Handoff Notes</h3>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px" }}>
              Any additional context, special instructions, or important notes for the project team.
            </p>
            <textarea
              className="ms-input"
              rows={8}
              style={{ resize: "vertical", lineHeight: 1.6 }}
              value={handoffNotes}
              onChange={(e) => setHandoffNotes(e.target.value)}
              placeholder="Notes for the implementation team…"
              disabled={!canEdit}
            />
            {canEdit && (
              <button className="ms-btn-primary" disabled={saving} style={{ marginTop: 12 }} onClick={() => save({ handoff_notes: handoffNotes })}>
                {saving ? "Saving…" : "Save Notes"}
              </button>
            )}
          </div>

          {/* Customer Contacts summary */}
          <div className="ms-card">
            <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Customer Contacts</h3>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 14px" }}>
              Contacts tagged on this solution will be copied to the implementation project automatically.
            </p>
            {solutionContacts.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
                No contacts added yet — use the Overview tab to add customer contacts.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {solutionContacts.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", background: "rgba(99,193,234,0.05)", border: "1px solid rgba(99,193,234,0.12)", borderRadius: 6 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(99,193,234,0.12)", border: "1px solid rgba(99,193,234,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#63c1ea" }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{c.name}</span>
                        {c.contact_role && (
                          <span className="ms-badge" style={{ background: "rgba(99,193,234,0.1)", color: "#63c1ea", border: "1px solid rgba(99,193,234,0.2)", fontSize: 11 }}>{c.contact_role}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                        {[c.job_title, c.email, c.phone].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create Project */}
          {(currentRole === "admin" || currentRole === "pm") && (
            <div className="ms-card" style={{ border: solution.linked_project_id ? "1px solid rgba(16,124,16,0.35)" : "1px solid rgba(99,193,234,0.25)", background: solution.linked_project_id ? "rgba(16,124,16,0.06)" : "rgba(99,193,234,0.04)" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: solution.linked_project_id ? "#107c10" : "#63c1ea", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {solution.linked_project_id ? "✓ Project Created" : "Create Project"}
              </h3>
              {solution.linked_project_id ? (
                <div>
                  <p style={{ fontSize: 13, color: "rgba(240,246,255,0.55)", margin: "0 0 12px" }}>
                    This solution has been handed off. The project has been created and the partner AE has been granted access.
                  </p>
                  <Link
                    to={`/projects/${solution.linked_project_id}`}
                    style={{ display: "inline-block", padding: "8px 18px", background: "rgba(16,124,16,0.15)", border: "1px solid rgba(16,124,16,0.4)", borderRadius: 4, color: "#107c10", fontWeight: 600, fontSize: 13, textDecoration: "none" }}
                  >
                    View Project →
                  </Link>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: "rgba(240,246,255,0.55)", margin: "0 0 16px" }}>
                    When this solution is ready to proceed, create an implementation project. The project will be pre-populated with the solution data and the partner AE will automatically receive access.
                  </p>
                  <button
                    className="ms-btn-primary"
                    disabled={creatingProject}
                    onClick={handleCreateProject}
                    style={{ background: "#63c1ea", borderColor: "#63c1ea", color: "#021a2e" }}
                  >
                    {creatingProject ? "Creating Project…" : "Create Implementation Project →"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Labor Estimate Tab ── */}
      {tab === "labor" && (
        <LaborEstimateView
          solutionId={solution.id}
          estimate={laborEstimate}
          hasAssessment={needsAssessment !== null}
          canEdit={canEdit}
          onEstimateChange={setLaborEstimate}
        />
      )}

      {/* ── Gap Modal ── */}
      {showGapModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowGapModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 580 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>{editingGap ? "Edit Gap" : "Add Gap"}</h2>
              <button onClick={() => setShowGapModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ padding: 24, display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="ms-label">
                  <span>Category</span>
                  <select className="ms-input" value={gapForm.category} onChange={(e) => setGapForm({ ...gapForm, category: e.target.value as GapCategory })}>
                    {GAP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="ms-label">
                  <span>Priority</span>
                  <select className="ms-input" value={gapForm.priority} onChange={(e) => setGapForm({ ...gapForm, priority: e.target.value as Priority })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </label>
              </div>
              <label className="ms-label">
                <span>Description</span>
                <textarea className="ms-input" rows={2} value={gapForm.description} onChange={(e) => setGapForm({ ...gapForm, description: e.target.value })} placeholder="What is the gap?" style={{ resize: "vertical" }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label className="ms-label">
                  <span>Current State</span>
                  <textarea className="ms-input" rows={2} value={gapForm.current_state} onChange={(e) => setGapForm({ ...gapForm, current_state: e.target.value })} placeholder="What do they have today?" style={{ resize: "vertical" }} />
                </label>
                <label className="ms-label">
                  <span>Required State</span>
                  <textarea className="ms-input" rows={2} value={gapForm.required_state} onChange={(e) => setGapForm({ ...gapForm, required_state: e.target.value })} placeholder="What do they need?" style={{ resize: "vertical" }} />
                </label>
              </div>
              <label className="ms-label">
                <span>Notes / Proposed Approach</span>
                <textarea className="ms-input" rows={2} value={gapForm.notes} onChange={(e) => setGapForm({ ...gapForm, notes: e.target.value })} placeholder="How will this be addressed?" style={{ resize: "vertical" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)" }}>
              <button
                className="ms-btn-primary"
                disabled={savingGapRisk || !gapForm.description.trim()}
                onClick={async () => {
                  setSavingGapRisk(true);
                  const updated = editingGap
                    ? gapItems.map((g) => g.id === editingGap.id ? { ...gapForm, id: editingGap.id } : g)
                    : [...gapItems, { ...gapForm, id: crypto.randomUUID() }];
                  setGapItems(updated);
                  await save({ gap_analysis: JSON.stringify({ gaps: updated, risks: riskItems }) });
                  setSavingGapRisk(false);
                  setShowGapModal(false);
                }}
              >{savingGapRisk ? "Saving…" : editingGap ? "Save Changes" : "Add Gap"}</button>
              <button className="ms-btn-secondary" onClick={() => setShowGapModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Risk Modal ── */}
      {showRiskModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowRiskModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 560 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>{editingRisk ? "Edit Risk" : "Add Risk"}</h2>
              <button onClick={() => setShowRiskModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ padding: 24, display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label className="ms-label">
                  <span>Category</span>
                  <select className="ms-input" value={riskForm.category} onChange={(e) => setRiskForm({ ...riskForm, category: e.target.value as RiskCategory })}>
                    {RISK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="ms-label">
                  <span>Probability</span>
                  <select className="ms-input" value={riskForm.probability} onChange={(e) => setRiskForm({ ...riskForm, probability: e.target.value as Priority })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </label>
                <label className="ms-label">
                  <span>Impact</span>
                  <select className="ms-input" value={riskForm.impact} onChange={(e) => setRiskForm({ ...riskForm, impact: e.target.value as Priority })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </label>
              </div>
              {(riskForm.probability || riskForm.impact) && (
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Risk Score: {" "}
                  <span style={{ fontWeight: 700, color: riskScore(riskForm.probability, riskForm.impact).color }}>
                    {riskScore(riskForm.probability, riskForm.impact).label}
                  </span>
                </div>
              )}
              <label className="ms-label">
                <span>Description</span>
                <textarea className="ms-input" rows={2} value={riskForm.description} onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })} placeholder="What is the risk?" style={{ resize: "vertical" }} />
              </label>
              <label className="ms-label">
                <span>Mitigation Strategy</span>
                <textarea className="ms-input" rows={3} value={riskForm.mitigation} onChange={(e) => setRiskForm({ ...riskForm, mitigation: e.target.value })} placeholder="How will this risk be managed or reduced?" style={{ resize: "vertical" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)" }}>
              <button
                className="ms-btn-primary"
                disabled={savingGapRisk || !riskForm.description.trim()}
                onClick={async () => {
                  setSavingGapRisk(true);
                  const updated = editingRisk
                    ? riskItems.map((r) => r.id === editingRisk.id ? { ...riskForm, id: editingRisk.id } : r)
                    : [...riskItems, { ...riskForm, id: crypto.randomUUID() }];
                  setRiskItems(updated);
                  await save({ gap_analysis: JSON.stringify({ gaps: gapItems, risks: updated }) });
                  setSavingGapRisk(false);
                  setShowRiskModal(false);
                }}
              >{savingGapRisk ? "Saving…" : editingRisk ? "Save Changes" : "Add Risk"}</button>
              <button className="ms-btn-secondary" onClick={() => setShowRiskModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from "docx";
import type { Solution } from "./api";

// ── Types ──────────────────────────────────────────────────────────────────────

type FieldDef =
  | { type: "text" | "date" | "number" | "textarea"; key: string; label: string }
  | { type: "select"; key: string; label: string; options: string[] }
  | { type: "checkbox"; key: string; label: string };

type SectionDef = { title: string; fields: FieldDef[] };

// ── Assessment schema (mirrors SolutionDetailPage) ─────────────────────────────

const ASSESSMENT_SCHEMA: Record<string, SectionDef[]> = {
  ucaas: [
    { title: "Current Environment", fields: [
      { type: "text", key: "current_vendor", label: "Current Phone System / Vendor" },
      { type: "date", key: "current_contract_end", label: "Contract End Date" },
      { type: "text", key: "carrier", label: "Current Carrier" },
      { type: "number", key: "total_users", label: "Total Users / Seats" },
      { type: "number", key: "office_locations", label: "Number of Locations" },
    ]},
    { title: "Feature Requirements", fields: [
      { type: "checkbox", key: "feat_calling", label: "Voice Calling" },
      { type: "checkbox", key: "feat_sms", label: "SMS / Business Messaging" },
      { type: "checkbox", key: "feat_video", label: "Video Meetings" },
      { type: "checkbox", key: "feat_team_chat", label: "Team Chat" },
      { type: "checkbox", key: "feat_recording", label: "Call Recording" },
      { type: "checkbox", key: "feat_analytics", label: "Analytics & Reporting" },
      { type: "checkbox", key: "feat_ai", label: "AI Assistant" },
      { type: "checkbox", key: "feat_fax", label: "Fax" },
      { type: "checkbox", key: "feat_rooms", label: "Conference Room Systems" },
    ]},
    { title: "Compliance & Security", fields: [
      { type: "checkbox", key: "compliance_hipaa", label: "HIPAA Required" },
      { type: "checkbox", key: "compliance_pci", label: "PCI Compliance" },
      { type: "checkbox", key: "intl_calling", label: "International Calling Needed" },
    ]},
    { title: "Integrations", fields: [
      { type: "text", key: "crm_system", label: "CRM System" },
      { type: "select", key: "productivity_suite", label: "Productivity Suite", options: [] },
      { type: "textarea", key: "other_integrations", label: "Other Integration Requirements" },
    ]},
    { title: "Number Porting", fields: [
      { type: "number", key: "numbers_to_port", label: "Estimated Numbers to Port" },
      { type: "text", key: "porting_carrier", label: "Current Carrier for Porting" },
    ]},
    { title: "Timeline", fields: [
      { type: "date", key: "desired_go_live", label: "Desired Go-Live Date" },
      { type: "select", key: "urgency", label: "Urgency", options: [] },
      { type: "textarea", key: "notes", label: "Additional Notes" },
    ]},
  ],
  ccaas: [
    { title: "Current Environment", fields: [
      { type: "text", key: "current_platform", label: "Current Contact Center Platform" },
      { type: "date", key: "current_contract_end", label: "Contract End Date" },
      { type: "number", key: "total_agents", label: "Total Agents" },
      { type: "number", key: "supervisors", label: "Supervisors" },
      { type: "number", key: "part_time_agents", label: "Part-Time Agents" },
    ]},
    { title: "Channels Required", fields: [
      { type: "checkbox", key: "ch_voice", label: "Voice" },
      { type: "checkbox", key: "ch_email", label: "Email" },
      { type: "checkbox", key: "ch_chat", label: "Web Chat" },
      { type: "checkbox", key: "ch_sms", label: "SMS" },
      { type: "checkbox", key: "ch_social", label: "Social Media" },
      { type: "checkbox", key: "ch_video", label: "Video" },
    ]},
    { title: "Routing & IVR", fields: [
      { type: "select", key: "ivr_complexity", label: "IVR Complexity", options: [] },
      { type: "checkbox", key: "skill_routing", label: "Skill-Based Routing" },
      { type: "checkbox", key: "callback", label: "Callback / Queue Management" },
      { type: "checkbox", key: "wfm", label: "Workforce Management Needed" },
    ]},
    { title: "CRM Integration", fields: [
      { type: "text", key: "crm_system", label: "CRM System" },
      { type: "select", key: "crm_depth", label: "Integration Depth", options: [] },
    ]},
    { title: "Quality & Compliance", fields: [
      { type: "checkbox", key: "call_recording", label: "Call Recording" },
      { type: "checkbox", key: "screen_recording", label: "Screen Recording" },
      { type: "checkbox", key: "quality_mgmt", label: "Quality Management / Scoring" },
      { type: "checkbox", key: "compliance_hipaa", label: "HIPAA Required" },
      { type: "checkbox", key: "compliance_pci", label: "PCI Compliance" },
    ]},
    { title: "AI Features", fields: [
      { type: "checkbox", key: "ai_virtual_agent", label: "Virtual Agent / Bot" },
      { type: "checkbox", key: "ai_assist", label: "Agent Assist / Real-Time Guidance" },
      { type: "checkbox", key: "ai_sentiment", label: "Sentiment Analysis" },
    ]},
    { title: "Timeline", fields: [
      { type: "date", key: "desired_go_live", label: "Desired Go-Live Date" },
      { type: "select", key: "urgency", label: "Urgency", options: [] },
      { type: "textarea", key: "notes", label: "Additional Notes" },
    ]},
  ],
};

// Shared schema for other types
const SHARED_TIMELINE: SectionDef = {
  title: "Timeline",
  fields: [
    { type: "date", key: "desired_go_live", label: "Desired Go-Live Date" },
    { type: "select", key: "urgency", label: "Urgency", options: [] },
    { type: "textarea", key: "notes", label: "Additional Notes" },
  ],
};

["zoom_ra", "rc_ace"].forEach((t) => {
  ASSESSMENT_SCHEMA[t] = [
    { title: "Current State", fields: [
      { type: "text", key: "current_ci_solution", label: "Current Conversation Intelligence Solution" },
      { type: "number", key: "sales_reps", label: "Number of Sales Reps" },
      { type: "number", key: "sales_managers", label: "Number of Sales Managers" },
    ]},
    { title: "CRM", fields: [
      { type: "select", key: "crm_system", label: "CRM System", options: [] },
      { type: "text", key: "crm_version", label: "CRM Version / Edition" },
    ]},
    { title: "Use Cases", fields: [
      { type: "checkbox", key: "uc_coaching", label: "Call Coaching & Scoring" },
      { type: "checkbox", key: "uc_deal_intel", label: "Deal Intelligence" },
      { type: "checkbox", key: "uc_forecasting", label: "Revenue Forecasting" },
      { type: "checkbox", key: "uc_onboarding", label: "Rep Onboarding & Training" },
    ]},
    SHARED_TIMELINE,
  ];
});

["zoom_va", "rc_air"].forEach((t) => {
  ASSESSMENT_SCHEMA[t] = [
    { title: "Current State", fields: [
      { type: "text", key: "current_va_solution", label: "Current Virtual Agent / Chatbot Solution" },
      { type: "select", key: "primary_use_case", label: "Primary Use Case", options: [] },
      { type: "number", key: "monthly_interactions", label: "Estimated Monthly Interactions" },
    ]},
    { title: "Channels", fields: [
      { type: "checkbox", key: "ch_web_chat", label: "Website Chat Widget" },
      { type: "checkbox", key: "ch_mobile", label: "Mobile App" },
      { type: "checkbox", key: "ch_sms", label: "SMS" },
      { type: "checkbox", key: "ch_voice", label: "Voice IVR" },
    ]},
    { title: "Integrations & Knowledge", fields: [
      { type: "select", key: "crm_system", label: "CRM System", options: [] },
      { type: "text", key: "ticketing_platform", label: "Ticketing Platform" },
      { type: "textarea", key: "key_intents", label: "Key Topics / Intents to Handle" },
    ]},
    { title: "Compliance", fields: [
      { type: "checkbox", key: "compliance_hipaa", label: "HIPAA Required" },
      { type: "checkbox", key: "compliance_pci", label: "PCI Compliance" },
      { type: "text", key: "languages", label: "Languages Required" },
    ]},
    SHARED_TIMELINE,
  ];
});

// ── Helpers ────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  ucaas: "UCaaS", ccaas: "CCaaS",
  zoom_ra: "Zoom Revenue Accelerator", zoom_va: "Zoom Virtual Agent",
  rc_ace: "RingCentral ACE", rc_air: "RingCentral AIR",
};

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ text, heading: level, spacing: { before: 320, after: 120 } });
}

function body(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 120 },
  });
}

function sectionTable(rows: { label: string; value: string }[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      inside: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
    },
    rows: rows.map((r, i) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: "F5F7FA" } : undefined,
            children: [new Paragraph({ children: [new TextRun({ text: r.label, bold: true, size: 20 })], spacing: { before: 60, after: 60 } })],
          }),
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: "F5F7FA" } : undefined,
            children: [new Paragraph({ children: [new TextRun({ text: r.value || "—", size: 20 })], spacing: { before: 60, after: 60 } })],
          }),
        ],
      })
    ),
  });
}

// ── Main Export ────────────────────────────────────────────────────────────────

export async function generateSOR(
  solution: Solution,
  assessment: Record<string, string>,
  requirements: string,
  preparedBy: string,
) {
  const typeLabel = TYPE_LABELS[solution.solution_type] ?? solution.solution_type;
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const schema = ASSESSMENT_SCHEMA[solution.solution_type] ?? [];

  const children: (Paragraph | Table)[] = [];

  // ── Cover / Title ────────────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `${typeLabel} Statement of Requirements`, bold: true, size: 40, color: "1B3A5C" })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 480, after: 160 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `For ${solution.customer_name}`, size: 28, color: "444444" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "TRUSTED ADVISOR PROJECT: STATEMENT OF REQUIREMENTS", size: 18, color: "888888", allCaps: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "PREPARED BY: PACKET FUSION, INC.", size: 18, color: "888888", allCaps: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: preparedBy ? `${preparedBy}` : "Packet Fusion, Inc.", size: 18, color: "888888" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: today, size: 18, color: "AAAAAA" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
    }),
  );

  // ── 1.1 Introduction ─────────────────────────────────────────────────────────
  children.push(
    heading("1.1  Introduction", HeadingLevel.HEADING_1),
    body(
      `${solution.customer_name} has engaged Packet Fusion, Inc. to investigate and understand their needs and then present industry-best next-generation ${typeLabel} offerings for evaluation and procurement.`
    ),
  );

  // ── 1.2 Scope & Objectives ───────────────────────────────────────────────────
  children.push(
    heading("1.2  Scope & Objectives", HeadingLevel.HEADING_1),
    body(
      `The purpose of this document is to establish the desired functionality to be considered for the ${typeLabel} solution to be evaluated by ${solution.customer_name}. During several meetings and remote sessions, Packet Fusion has gathered the following communication and business user environment and functional requirements.`
    ),
  );

  // ── 1.3 Overview ─────────────────────────────────────────────────────────────
  children.push(
    heading("1.3  Overview", HeadingLevel.HEADING_1),
    body(
      `${solution.customer_name} is looking for a robust and reliable ${typeLabel} solution that will enhance collaboration and standardize on a cloud-based platform delivering all required functionality.`
    ),
  );

  // ── 1.4 Requirements — from needs assessment ─────────────────────────────────
  children.push(heading("1.4  Requirements", HeadingLevel.HEADING_1));

  for (const section of schema) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: section.title, bold: true, size: 24, color: "1B3A5C" })],
        spacing: { before: 240, after: 100 },
      }),
    );

    const checkboxFields = section.fields.filter((f) => f.type === "checkbox");
    const otherFields = section.fields.filter((f) => f.type !== "checkbox");

    if (otherFields.length > 0) {
      const rows = otherFields
        .map((f) => ({ label: f.label, value: assessment[f.key] ?? "" }))
        .filter((r) => r.value);
      if (rows.length > 0) children.push(sectionTable(rows), new Paragraph({ text: "", spacing: { after: 80 } }));
    }

    if (checkboxFields.length > 0) {
      const selected = checkboxFields.filter((f) => assessment[f.key] === "true").map((f) => f.label);
      const notSelected = checkboxFields.filter((f) => assessment[f.key] !== "true").map((f) => f.label);
      if (selected.length > 0) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: "Required: ", bold: true, size: 20 }), new TextRun({ text: selected.join(", "), size: 20 })], spacing: { after: 60 } }),
        );
      }
      if (notSelected.length > 0) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: "Not Required: ", bold: true, size: 20, color: "999999" }), new TextRun({ text: notSelected.join(", "), size: 20, color: "999999" })], spacing: { after: 80 } }),
        );
      }
    }
  }

  // ── 1.5 Special Requirements Notes ──────────────────────────────────────────
  if (requirements.trim()) {
    children.push(
      heading("1.5  Special Requirements & Notes", HeadingLevel.HEADING_1),
      ...requirements
        .split("\n")
        .map((line) => body(line)),
    );
  }

  // ── Build document ───────────────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
        },
      },
    },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${solution.customer_name} - ${typeLabel} SOR.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

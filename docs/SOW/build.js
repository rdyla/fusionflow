const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageOrientation, LevelFormat,
  TabStopType, TabStopPosition, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, ImageRun
} = require('docx');

// ====== BRAND COLORS (Packet Fusion) ======
const NAVY = "003B5C";
const GREEN = "17C662";
const BLUE = "63C1EA";
const GREY = "D9E1E2";
const DARK_TEXT = "1F1F1F";
const MUTED = "555555";
const WHITE = "FFFFFF";

// ====== HELPERS ======
const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: "BFC7CC" };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const cellBordersNone = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function cell(text, opts = {}) {
  const {
    width, bold = false, size = 20, color = DARK_TEXT, shading,
    align = AlignmentType.LEFT, italics = false, borders = cellBorders,
    vAlign = VerticalAlign.CENTER,
  } = opts;
  const lines = String(text).split("\n");
  const children = lines.map((line, i) => new Paragraph({
    alignment: align,
    spacing: { after: i === lines.length - 1 ? 0 : 60 },
    children: [new TextRun({ text: line, bold, size, color, italics, font: "Arial" })],
  }));
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: shading ? { fill: shading, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    verticalAlign: vAlign,
    children,
  });
}

function headerCell(text, width, align = AlignmentType.LEFT) {
  return cell(text, { width, bold: true, size: 20, color: WHITE, shading: NAVY, align });
}

function h1(text) {
  return new Paragraph({
    spacing: { before: 400, after: 180 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GREEN, space: 6 } },
    keepNext: true,
    keepLines: true,
    children: [new TextRun({ text, bold: true, size: 32, color: NAVY, font: "Arial" })],
  });
}

function h2(text, opts = {}) {
  const { breakBefore = false } = opts;
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    keepNext: true,
    keepLines: true,
    pageBreakBefore: breakBefore,
    children: [new TextRun({ text, bold: true, size: 26, color: NAVY, font: "Arial" })],
  });
}

function h3(text) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    keepNext: true,
    keepLines: true,
    children: [new TextRun({ text, bold: true, size: 22, color: NAVY, font: "Arial" })],
  });
}

function eyebrow(text) {
  return new Paragraph({
    spacing: { before: 120, after: 60 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: GREEN, font: "Arial", characterSpacing: 20 })],
  });
}

function p(text, opts = {}) {
  const { size = 20, color = DARK_TEXT, italics = false, bold = false, after = 140 } = opts;
  return new Paragraph({
    spacing: { after },
    children: [new TextRun({ text, size, color, italics, bold, font: "Arial" })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80 },
    keepLines: true,
    keepNext: true,
    children: [new TextRun({ text, size: 20, color: DARK_TEXT, font: "Arial" })],
  });
}

function spacer(size = 120) {
  return new Paragraph({ spacing: { after: size }, children: [new TextRun("")] });
}

// Signature field: empty paragraph with a subtle bottom border (the line),
// followed by a small uppercase label. Used in the acceptance signature block.
function sigField(label, opts = {}) {
  const { gap = 540 } = opts;
  return [
    new Paragraph({
      spacing: { before: gap, after: 0 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "9AA3A8", space: 4 },
      },
      children: [new TextRun({ text: "", size: 20, font: "Arial" })],
    }),
    new Paragraph({
      spacing: { before: 80, after: 0 },
      children: [new TextRun({
        text: label.toUpperCase(),
        bold: true,
        size: 14,
        color: MUTED,
        font: "Arial",
        characterSpacing: 30,
      })],
    }),
  ];
}

// ==========================================================
// COVER PAGE
// ==========================================================
const logoBuffer = fs.readFileSync(__dirname + "/logo-fullcolor.png");

const coverPage = [
  // Light grey band across top, implemented as a borderless single-cell table
  // (more reliably rendered than stacked shaded paragraphs around an image)
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            borders: cellBordersNone,
            width: { size: 9360, type: WidthType.DXA },
            shading: { fill: GREY, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 200, bottom: 200, left: 200, right: 200 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                spacing: { before: 0, after: 0 },
                alignment: AlignmentType.LEFT,
                children: [
                  new ImageRun({
                    data: logoBuffer,
                    type: "png",
                    // 2 inches wide → 2/2.55 ≈ 0.784 inches tall
                    transformation: { width: 192, height: 75 },
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  }),
  spacer(400),

  // Eyebrow
  new Paragraph({
    spacing: { before: 800, after: 120 },
    children: [new TextRun({ text: "PROFESSIONAL SERVICES", bold: true, color: GREEN, size: 22, font: "Arial", characterSpacing: 40 })],
  }),

  // Title
  new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: "Statement of Work", bold: true, color: NAVY, size: 64, font: "Arial" })],
  }),

  // Subtitle
  new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: "Prepared for", color: MUTED, size: 24, font: "Arial" })],
  }),
  new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: "NUTECH NATIONAL", bold: true, color: NAVY, size: 40, font: "Arial" })],
  }),
  new Paragraph({
    spacing: { after: 600 },
    children: [new TextRun({ text: "Zoom AI Virtual Agent Deployment", color: MUTED, size: 24, italics: true, font: "Arial" })],
  }),

  // Facts row as table (no borders)
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3120, 3120, 3120],
    rows: [
      new TableRow({ cantSplit: true, children: [
        cell("PLATFORM", { width: 3120, bold: true, size: 16, color: GREEN, borders: cellBordersNone }),
        cell("PREPARED BY", { width: 3120, bold: true, size: 16, color: GREEN, borders: cellBordersNone }),
        cell("DATE", { width: 3120, bold: true, size: 16, color: GREEN, borders: cellBordersNone }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Zoom — AI Virtual Agent", { width: 3120, size: 20, color: NAVY, bold: true, borders: cellBordersNone }),
        cell("Packet Fusion, Inc.", { width: 3120, size: 20, color: NAVY, bold: true, borders: cellBordersNone }),
        cell("April 24, 2026", { width: 3120, size: 20, color: NAVY, bold: true, borders: cellBordersNone }),
      ]}),
    ],
  }),

  spacer(400),

  // MSA boilerplate on cover
  new Paragraph({
    spacing: { after: 120 },
    border: { top: { style: BorderStyle.SINGLE, size: 8, color: GREEN, space: 8 } },
    children: [new TextRun({ text: " ", size: 2, font: "Arial" })],
  }),
  p("This Statement of Work (\"SOW\") is executed by Packet Fusion, Inc. (\"Packet Fusion\") and Nutech National (\"Customer\") pursuant to, and is subject to, the Packet Fusion Master Services Agreement executed by Customer and Packet Fusion. Capitalized terms used in this SOW but not otherwise defined shall have the respective meanings given to them in the Master Services Agreement.",
    { size: 18, color: MUTED, italics: true, after: 0 }),

  new Paragraph({ children: [new PageBreak()] }),
];

// ==========================================================
// SECTION 1 — ENGAGEMENT OVERVIEW
// ==========================================================
const engagementOverview = [
  h1("1. Engagement Overview"),
  p("Packet Fusion will deliver the design, configuration, and deployment of a Zoom AI Virtual Agent (ZVA) solution for Nutech National. This engagement extends Nutech's existing Zoom Phone infrastructure with an autonomous voice agent capable of handling common operational inquiries, delivering system-specific self-help instructions to callers, and escalating to live monitoring-center staff when human intervention is required."),
  p("The deployment is scoped as a Phase 1 voice-channel rollout at a single logical site, targeting 1–10 intents and up to 3,000 monthly sessions. Knowledge base integration and live-agent escalation are both in scope for initial go-live."),

  h2("1.1 Engagement Objectives"),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2600, 6760],
    rows: [
      new TableRow({ cantSplit: true, children: [
        cell("Business Goals", { width: 2600, bold: true, shading: GREY, color: NAVY }),
        cell("Reduce dependence on the after-hours answer service.\nIncrease self-service resolution for callers seeking basic operational help.",
          { width: 6760 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Problems to Solve", { width: 2600, bold: true, shading: GREY, color: NAVY }),
        cell("Routine calls currently require human interaction for mundane tasks.\nAgents perform manual lookups to identify which systems each caller uses.",
          { width: 6760 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Success at 90 Days", { width: 2600, bold: true, shading: GREY, color: NAVY }),
        cell("An autonomous self-help system is in production, delivering system-specific instructions to callers and escalating to monitoring centers as needed for test-mode operation.",
          { width: 6760 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Success at 6–12 Months", { width: 2600, bold: true, shading: GREY, color: NAVY }),
        cell("Measurable reduction in call volume handled by call-center and engineering staff.\nAfter-hours answer service retired.",
          { width: 6760 }),
      ]}),
    ],
  }),

  h2("1.2 Scope at a Glance"),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1872, 1872, 1872, 1872, 1872],
    rows: [
      new TableRow({ cantSplit: true, tableHeader: true, children: [
        headerCell("Channels", 1872, AlignmentType.CENTER),
        headerCell("Intents (Phase 1)", 1872, AlignmentType.CENTER),
        headerCell("Monthly Sessions", 1872, AlignmentType.CENTER),
        headerCell("Sites", 1872, AlignmentType.CENTER),
        headerCell("Go-Lives", 1872, AlignmentType.CENTER),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Voice (IVR)", { width: 1872, align: AlignmentType.CENTER, bold: true, size: 22, color: NAVY }),
        cell("1–10", { width: 1872, align: AlignmentType.CENTER, bold: true, size: 22, color: NAVY }),
        cell("3,000", { width: 1872, align: AlignmentType.CENTER, bold: true, size: 22, color: NAVY }),
        cell("1", { width: 1872, align: AlignmentType.CENTER, bold: true, size: 22, color: NAVY }),
        cell("1", { width: 1872, align: AlignmentType.CENTER, bold: true, size: 22, color: GREEN }),
      ]}),
    ],
  }),

  h2("1.3 In-Scope Use Cases"),
  bullet("Account Inquiry — caller identification and routing based on the customer-to-system mapping."),
  bullet("Technical Support — delivery of system-specific self-help instructions drawn from the knowledge base."),
  bullet("FAQ Self-Service — automated responses to common operational questions."),
  bullet("Live-Agent Escalation — warm handoff to monitoring-center staff when the virtual agent cannot resolve the request."),

  h2("1.4 Solution Sizing", { breakBefore: true }),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3120, 6240],
    rows: [
      new TableRow({ cantSplit: true, children: [
        cell("Virtual Agent Channels", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("Voice", { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Intents (Phase 1)", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("1–10", { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Monthly Sessions", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("3,000", { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Live-Agent Escalation", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("Yes — warm transfer to monitoring center", { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Sites", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("1", { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Phases / Go-Lives", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("1", { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Implementation Strategy", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("Cloud Professional", { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("CRM Integration", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("[TO CONFIRM — CRM system of record to be identified during Discovery]",
          { width: 6240, italics: true, color: MUTED }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Platform Notes", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("ZVA deployment only. Existing Zoom Phone infrastructure is in place and is not modified under this SOW.",
          { width: 6240 }),
      ]}),
    ],
  }),

  new Paragraph({ children: [new PageBreak()] }),
];

// ==========================================================
// SECTION 2 — DELIVERY PLAN
// ==========================================================

// Work Breakdown rows (from estimator)
const wbsRows = [
  ["Discovery & Requirements", "Completed requirements document, current-state analysis, stakeholder interview notes.", "7"],
  ["Solution Design", "Solution design document, architecture diagram, configuration specifications.", "11"],
  ["Project Management", "Project plan, status reports, risk register, steering committee updates.", "9"],
  ["Implementation & Configuration", "Fully configured ZVA per agreed specifications, configuration workbook.", "18"],
  ["Integration", "Integrated systems per design, integration test results, API documentation.", "4"],
  ["Migration & Data Porting", "Customer-to-system mapping loaded, cutover plan, migration test results.", "11"],
  ["Testing & UAT", "Test plan, executed test cases, UAT sign-off, defect resolution log.", "7"],
  ["Training & Enablement", "Training sessions delivered, training materials, recorded sessions where applicable.", "5"],
  ["Documentation & Handover", "As-built documentation, admin guides, runbooks, knowledge-transfer sessions.", "4"],
  ["Hypercare", "Post-go-live support, issue resolution, knowledge transition to customer team.", "5"],
];
const wbsTableRows = [
  new TableRow({ cantSplit: true, tableHeader: true, children: [
    headerCell("Workstream", 2400, AlignmentType.LEFT),
    headerCell("Key Deliverables", 5760, AlignmentType.LEFT),
    headerCell("Hours", 1200, AlignmentType.CENTER),
  ]}),
  ...wbsRows.map(([ws, del, hrs]) => new TableRow({ cantSplit: true, children: [
    cell(ws, { width: 2400, bold: true, color: NAVY }),
    cell(del, { width: 5760 }),
    cell(hrs, { width: 1200, align: AlignmentType.CENTER, bold: true }),
  ]})),
  new TableRow({ cantSplit: true, children: [
    cell("Total Estimated Effort", { width: 2400, bold: true, shading: GREY, color: NAVY }),
    cell("", { width: 5760, shading: GREY }),
    cell("81", { width: 1200, align: AlignmentType.CENTER, bold: true, shading: GREY, color: NAVY, size: 24 }),
  ]}),
];

// Timeline rows
const timelineRows = [
  ["Week 1", "Discovery & Requirements", "Kickoff meeting; stakeholder interviews; current-state review; requirements document signed off.", "Requirements sign-off"],
  ["Week 2", "Solution Design", "Architecture diagram; intent and dialog design; escalation call flow; knowledge-base content plan; configuration specs approved.", "Solution design approved"],
  ["Week 3", "Implementation & Configuration", "ZVA tenant configuration; intent build-out; knowledge-base ingest; live-agent escalation configured.", "Configuration complete"],
  ["Week 4", "Integration & Data", "API integration (customer-to-system mapping); CRM connection; integration test results; end-to-end call flow validated.", "Integration tested"],
  ["Week 5", "Testing, UAT & Training", "Functional and UAT test execution; defect resolution; admin and end-user training delivered; documentation package handed over.", "UAT sign-off & go-live"],
  ["Weeks 6–7", "Hypercare", "Post-go-live support; issue triage; tuning of intents based on live traffic; knowledge transfer to Customer team.", "Hypercare exit & acceptance"],
];
const timelineTableRows = [
  new TableRow({ cantSplit: true, tableHeader: true, children: [
    headerCell("Week", 1000, AlignmentType.CENTER),
    headerCell("Phase", 1900, AlignmentType.LEFT),
    headerCell("Activities", 4360, AlignmentType.LEFT),
    headerCell("Milestone", 2100, AlignmentType.LEFT),
  ]}),
  ...timelineRows.map(([wk, ph, act, ms]) => new TableRow({ cantSplit: true, children: [
    cell(wk, { width: 1000, align: AlignmentType.CENTER, bold: true, color: NAVY }),
    cell(ph, { width: 1900, bold: true }),
    cell(act, { width: 4360 }),
    cell(ms, { width: 2100, italics: true, color: GREEN, bold: true }),
  ]})),
];

const deliveryPlan = [
  h1("2. Delivery Plan"),

  h2("2.1 Work Breakdown & Deliverables"),
  p("The engagement is scoped to approximately 81 hours of Packet Fusion professional services effort, distributed across the following workstreams:"),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2400, 5760, 1200],
    rows: wbsTableRows,
  }),

  h2("2.2 Implementation Timeline", { breakBefore: true }),
  p("Packet Fusion's standard ZVA deployment methodology delivers this scope across approximately five weeks of active implementation, followed by a two-week hypercare period. Exact calendar dates will be finalized at kickoff."),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1000, 1900, 4360, 2100],
    rows: timelineTableRows,
  }),
  spacer(120),
  p("All work is performed remotely. Timeline assumes timely turnaround of Customer deliverables as described in Section 5 (Assumptions & Customer Responsibilities).",
    { size: 18, italics: true, color: MUTED }),

  new Paragraph({ children: [new PageBreak()] }),
];

// ==========================================================
// SECTION 3 — PROJECT INVESTMENT
// ==========================================================

// Pricing — using placeholder $165/hr flat from Osborn model; flag for AE review
const RATE = 165;
const HOURS = 81;
const TOTAL = RATE * HOURS;

const pricingRows = [
  new TableRow({ cantSplit: true, tableHeader: true, children: [
    headerCell("Line Item", 5160, AlignmentType.LEFT),
    headerCell("Hours", 1400, AlignmentType.CENTER),
    headerCell("Rate", 1400, AlignmentType.CENTER),
    headerCell("Subtotal", 1400, AlignmentType.RIGHT),
  ]}),
  new TableRow({ cantSplit: true, children: [
    cell("Zoom AI Virtual Agent — Professional Services (blended)", { width: 5160 }),
    cell(String(HOURS), { width: 1400, align: AlignmentType.CENTER, bold: true }),
    cell(`$${RATE}/hr`, { width: 1400, align: AlignmentType.CENTER }),
    cell(`$${TOTAL.toLocaleString()}.00`, { width: 1400, align: AlignmentType.RIGHT, bold: true }),
  ]}),
  new TableRow({ cantSplit: true, children: [
    cell("Total Professional Services", { width: 5160, bold: true, shading: GREY, color: NAVY, size: 22 }),
    cell(String(HOURS), { width: 1400, align: AlignmentType.CENTER, bold: true, shading: GREY, color: NAVY, size: 22 }),
    cell("", { width: 1400, shading: GREY }),
    cell(`$${TOTAL.toLocaleString()}.00`, { width: 1400, align: AlignmentType.RIGHT, bold: true, shading: GREY, color: GREEN, size: 22 }),
  ]}),
];

const pricingSection = [
  h1("3. Project Investment"),
  p("Pricing below covers the Packet Fusion-delivered professional services only. Zoom platform licensing, recurring ZVA session charges, taxes, and fees are quoted separately by Zoom and are not included in this SOW."),
  p("[PLACEHOLDER: Blended hourly rate of $165/hr used as a default estimate. Confirm against current internal rate card before release to Customer.]",
    { size: 18, italics: true, color: "B33A3A" }),

  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [5160, 1400, 1400, 1400],
    rows: pricingRows,
  }),

  h3("Payment Terms"),
  bullet("50% invoiced upon SOW signature (mobilization)."),
  bullet("50% invoiced upon successful completion and Customer acceptance."),
  bullet("Net 30 terms. All amounts in USD."),

  h3("Optional Add-On Services"),
  p("The following services are not included in the base scope and may be added by mutual written agreement:"),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [6160, 3200],
    rows: [
      new TableRow({ cantSplit: true, tableHeader: true, children: [
        headerCell("Optional Service", 6160, AlignmentType.LEFT),
        headerCell("Estimated Investment", 3200, AlignmentType.CENTER),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Additional intents beyond 10 (Phase 2 expansion)", { width: 6160 }),
        cell("Quoted per scope", { width: 3200, align: AlignmentType.CENTER, italics: true }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Additional live instructor-led training sessions (up to 20 attendees each)", { width: 6160 }),
        cell("$290 per session", { width: 3200, align: AlignmentType.CENTER, bold: true, color: NAVY }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Post-hypercare managed services / ongoing tuning", { width: 6160 }),
        cell("Quoted separately", { width: 3200, align: AlignmentType.CENTER, italics: true }),
      ]}),
    ],
  }),

  new Paragraph({ children: [new PageBreak()] }),
];

// ==========================================================
// SECTION 4 — PACKETFUSION RESPONSIBILITIES
// ==========================================================
const responsibilitiesSection = [
  h1("4. Packet Fusion Responsibilities"),
  p("Packet Fusion will deliver the following activities in accordance with its standard ZVA implementation methodology. The assigned Project Manager serves as the single point of contact throughout the engagement."),

  h2("4.1 Project Management"),
  p("Packet Fusion's Project Manager is responsible for the following:"),
  bullet("Oversight and facilitation of project timelines and scheduling."),
  bullet("Assignment of Packet Fusion, Customer, and Zoom resources required to deliver the solution."),
  bullet("Scheduling and facilitating kickoff, discovery, design, and status sessions."),
  bullet("Development and maintenance of the project plan, risk register, and implementation checklist."),
  bullet("Weekly status reporting, change control, issue management, and risk mitigation."),
  bullet("Scheduling and managing UAT sessions and formal go-live sign-off."),
  bullet("Validation of go-live completion and formal project closure."),

  h2("4.2 Solution Discovery & Design"),
  p("Packet Fusion will collaborate with Customer stakeholders during discovery and design sessions and will produce the following deliverables:"),
  bullet("Detailed project plan with timelines, schedules, and task assignments."),
  bullet("Implementation workbook documenting intents, utterances, escalation logic, knowledge-base content mapping, and customer-to-system mapping."),
  bullet("Call-flow design: visual representation of the virtual agent dialog and escalation paths, submitted for pre-configuration approval."),
  bullet("User Acceptance Test plan detailing test procedures and pass/fail criteria."),
  bullet("Final solution design report: comprehensive document detailing system setup, configuration, and knowledge transfer to Customer administrators."),

  h2("4.3 Configuration & Knowledge Base Integration"),
  bullet("Configuration of the Zoom AI Virtual Agent tenant per the approved implementation workbook."),
  bullet("Build-out of Phase 1 intents (1–10), dialog flows, and prompt tuning."),
  bullet("Ingestion and tuning of knowledge-base content supplied by Customer."),
  bullet("Configuration of live-agent escalation to the Customer's monitoring center."),
  bullet("Integration with Customer-supplied APIs for caller-to-system identification."),

  h2("4.4 User Acceptance Testing (UAT)"),
  p("Once configuration is complete, the Packet Fusion project team will coordinate a UAT event to validate approved call-flow design and virtual-agent functionality. If scope changes or additional intents are requested during UAT, additional time-and-material charges may apply and may impact the agreed implementation timeline."),
  bullet("Review and test inbound virtual-agent configuration and functionality with the Customer's operations team."),
  bullet("Validate intent coverage, escalation triggers, and knowledge-base responses against the UAT test plan."),
  bullet("Document UAT results, defect resolution, and Customer sign-off."),
  bullet("Finalize go-live date following successful UAT."),

  h2("4.5 Training & Enablement"),
  bullet("Administrator training for the Customer's operations manager and designated back-office administrators covering ZVA management, intent tuning, and knowledge-base updates."),
  bullet("Knowledge-transfer session for Customer's engineering staff covering troubleshooting, escalation logic, and API integration behavior."),
  bullet("Training sessions are delivered remotely and recorded. Recordings and materials are provided to the Customer for future reference."),

  h2("4.6 Go-Live & Hypercare"),
  p("At go-live, Packet Fusion will provide technical support and assistance with issues during cutover and the subsequent hypercare period. Hypercare includes:"),
  bullet("Active monitoring of virtual-agent performance and call flows."),
  bullet("Rapid triage and resolution of production issues."),
  bullet("Intent tuning based on live traffic observations."),
  bullet("Knowledge transfer and formal handover to the Customer's internal team at end of hypercare."),

  new Paragraph({ children: [new PageBreak()] }),
];

// ==========================================================
// SECTION 5 — ASSUMPTIONS & CUSTOMER RESPONSIBILITIES
// ==========================================================
const assumptionsSection = [
  h1("5. Assumptions & Customer Responsibilities"),

  h2("5.1 Customer Prerequisites"),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3120, 6240],
    rows: [
      new TableRow({ cantSplit: true, children: [
        cell("API Connection Details", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("Customer will forward API connection details for all systems the virtual agent must query for caller-to-system identification.",
          { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Customer-to-System Mapping", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("Customer will provide a complete list of customers mapped to the systems in use, in a format agreed during Discovery.",
          { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Knowledge Base Content", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("Customer will supply system-specific self-help instructions and FAQ content to be ingested into the virtual agent's knowledge base.",
          { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Program / Platform Owner", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("Joseph McGugan", { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Sandbox / Test Environment", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("Not provided by Customer. Testing will be conducted in the production ZVA tenant using controlled test traffic prior to cutover.",
          { width: 6240 }),
      ]}),
      new TableRow({ cantSplit: true, children: [
        cell("Customer Sign-off Role", { width: 3120, bold: true, shading: GREY, color: NAVY }),
        cell("Operations Manager", { width: 6240 }),
      ]}),
    ],
  }),

  h2("5.2 Customer Responsibilities"),
  p("The Customer is responsible for aspects not specifically included in this SOW, including:"),
  bullet("Providing timely access to key stakeholders for discovery, design, UAT, and training sessions."),
  bullet("Designating a project sponsor with authority to make scope and prioritization decisions."),
  bullet("Supplying all knowledge-base content, call scripts, and pre-recorded greetings/prompts required by the virtual agent."),
  bullet("Providing and maintaining the customer-to-system mapping data."),
  bullet("Maintaining the Customer's existing Zoom Phone infrastructure and licensing during this engagement."),
  bullet("Ensuring API endpoints to be consumed by the virtual agent are available, documented, and authenticated."),
  bullet("Managing end-user change management and internal communications."),
  bullet("Reviewing and approving configuration workbooks, call-flow designs, and test results within agreed SLAs."),

  h2("5.3 Out of Scope"),
  p("The following are not included in this SOW and, if required, will be addressed by separate written agreement:"),
  bullet("Modifications to the Customer's existing Zoom Phone infrastructure, dial plan, or call routing outside the virtual-agent flow."),
  bullet("Non-voice channels (chat, SMS, email, web) — may be added in a future phase."),
  bullet("Additional intents beyond the Phase 1 range of 1–10."),
  bullet("CRM integrations beyond the single system-of-record identified during Discovery."),
  bullet("Third-party systems not listed in scope."),
  bullet("Network, firewall, or telephony remediation outside the ZVA configuration."),
  bullet("Ongoing tier-1/2/3 support of the virtual agent following hypercare exit."),

  h2("5.4 Standard Assumptions"),
  bullet("All work will be performed remotely unless otherwise agreed in writing."),
  bullet("This estimate is based on information available at the time of assessment and may be revised following formal Discovery."),
  bullet("Pricing and effort assumptions are valid for 60 days from the date of this document."),
  bullet("Customer is responsible for end-user change management and internal communications."),

  h2("5.5 Delays & Changes"),
  p("Changes to this SOW shall be made only in a mutually executed written change between Packet Fusion and Customer (a \"Change Order\"), outlining the requested change and its effect on the Services, including without limitation the fees and the timeline as determined by mutual agreement of both parties. Any delays in the performance of consulting services or delivery of deliverables caused by the Customer — including without limitation delays in completing and returning Customer documentation required during design or UAT — may result in an adjustment of the project timeline and additional fees. Any changes or additions to the Services described in this SOW shall be requested by a Change Order and may result in additional fees."),

  new Paragraph({ children: [new PageBreak()] }),
];

// ==========================================================
// SECTION 6 — ACCEPTANCE & SIGN-OFF
// ==========================================================
const acceptanceSection = [
  h1("6. Acceptance & Sign-Off"),

  h2("6.1 Acceptance Criteria"),
  p("The engagement will be deemed complete and accepted when all of the following conditions are satisfied:"),
  bullet("Zoom AI Virtual Agent is configured, deployed, and operational on the voice channel per the approved solution design."),
  bullet("Phase 1 intents (1–10) are in production and responding to live caller traffic."),
  bullet("Knowledge base is ingested and delivering system-specific self-help instructions."),
  bullet("Live-agent escalation to the monitoring center is functional and verified via test calls."),
  bullet("Customer-to-system mapping API integration is functional and validated."),
  bullet("UAT test plan is executed and signed off by the Customer's Operations Manager."),
  bullet("As-built documentation, admin guide, and runbook have been delivered."),
  bullet("Hypercare period has concluded without unresolved critical issues."),

  h2("6.2 Signatures"),
  p("By signing below, the undersigned parties agree to the scope, deliverables, and effort estimates described in this Statement of Work. Packet Fusion, Inc. will proceed with resource planning and project initiation upon receipt of this signed document."),

  // Thin green accent rule above the signature block
  new Paragraph({
    spacing: { before: 240, after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GREEN, space: 4 } },
    children: [new TextRun({ text: "", size: 2, font: "Arial" })],
  }),

  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4360, 640, 4360],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          // ===== Customer column =====
          new TableCell({
            borders: cellBordersNone,
            width: { size: 4360, type: WidthType.DXA },
            margins: { top: 100, bottom: 100, left: 0, right: 200 },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [new TextRun({
                  text: "CUSTOMER",
                  bold: true,
                  size: 14,
                  color: GREEN,
                  font: "Arial",
                  characterSpacing: 60,
                })],
              }),
              new Paragraph({
                spacing: { before: 40, after: 0 },
                children: [new TextRun({
                  text: "Nutech National",
                  bold: true,
                  size: 28,
                  color: NAVY,
                  font: "Arial",
                })],
              }),
              ...sigField("Authorized Signature", { gap: 720 }),
              ...sigField("Printed Name"),
              ...sigField("Title"),
              ...sigField("Date"),
            ],
          }),
          // ===== Spacer column =====
          new TableCell({
            borders: cellBordersNone,
            width: { size: 640, type: WidthType.DXA },
            children: [new Paragraph({ children: [new TextRun("")] })],
          }),
          // ===== Packet Fusion column =====
          new TableCell({
            borders: cellBordersNone,
            width: { size: 4360, type: WidthType.DXA },
            margins: { top: 100, bottom: 100, left: 200, right: 0 },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [new TextRun({
                  text: "SERVICE PROVIDER",
                  bold: true,
                  size: 14,
                  color: GREEN,
                  font: "Arial",
                  characterSpacing: 60,
                })],
              }),
              new Paragraph({
                spacing: { before: 40, after: 0 },
                children: [new TextRun({
                  text: "Packet Fusion, Inc.",
                  bold: true,
                  size: 28,
                  color: NAVY,
                  font: "Arial",
                })],
              }),
              ...sigField("Authorized Signature", { gap: 720 }),
              ...sigField("Printed Name"),
              ...sigField("Title"),
              ...sigField("Date"),
            ],
          }),
        ],
      }),
    ],
  }),

  spacer(300),
  p("This SOW governs Packet Fusion's professional services only and does not supersede the Zoom Master Services Agreement or other agreements between Customer and Zoom covering the underlying platform, licensing, and ongoing platform support.",
    { size: 18, italics: true, color: MUTED }),
];

// ==========================================================
// DOCUMENT ASSEMBLY
// ==========================================================
const doc = new Document({
  creator: "Packet Fusion",
  title: "Nutech National — Zoom AI Virtual Agent SOW",
  styles: {
    default: { document: { run: { font: "Arial", size: 20, color: DARK_TEXT } } },
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 900, hanging: 270 } } } },
        ]
      },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
            children: [
              new TextRun({ text: "Nutech National · Statement of Work · April 24, 2026",
                color: MUTED, size: 16, font: "Arial" }),
              new TextRun({ text: "\tPacket Fusion, Inc. · Confidential · Page ",
                color: MUTED, size: 16, font: "Arial" }),
              new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 16, font: "Arial" }),
              new TextRun({ text: " of ", color: MUTED, size: 16, font: "Arial" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], color: MUTED, size: 16, font: "Arial" }),
            ],
          }),
        ],
      }),
    },
    children: [
      ...coverPage,
      ...engagementOverview,
      ...deliveryPlan,
      ...pricingSection,
      ...responsibilitiesSection,
      ...assumptionsSection,
      ...acceptanceSection,
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(__dirname + "/Nutech_National_ZVA_SOW.docx", buf);
  console.log("Wrote " + buf.length + " bytes");
});

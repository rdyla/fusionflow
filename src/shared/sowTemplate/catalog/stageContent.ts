/**
 * Stage content catalog — intros + subsections.
 *
 * Heaviest file in the catalog. Holds every per-stage subsection
 * across all solution types and vendors. The assembler groups by
 * stage, sorts by sortOrder, and renumbers (2.3.1 / 2.3.2 / …)
 * within each stage at render time.
 *
 * Tagging convention:
 *   - Untagged subsections (no appliesTo) appear on every SOW.
 *   - `appliesTo: ["ucaas"]` lights up for any solution containing
 *     UCaaS — pure UCaaS AND combo UCaaS+CCaaS+etc. Combo SOWs
 *     therefore automatically inherit UCaaS porting / E911 content
 *     when CCaaS is also in scope.
 *   - Vendor filters narrow further. Bulleted content that uses
 *     "the platform" / "the tenant" stays vendor-agnostic; truly
 *     vendor-specific tasks (ZPLS, MS Teams direct routing) carry
 *     a vendor tag.
 */

import type { StageIntro, Subsection } from "./types";

// ─── Stage-level intros ──────────────────────────────────────────────────────
// One intro per (stage, applicability). Assembler picks the highest-priority
// match. Combo-tagged intros override single-type intros.

export const STAGE_INTROS: StageIntro[] = [
  // Initiation — same across all variants.
  {
    stage: "initiation",
    intro: "Packet Fusion assigns a dedicated Project Manager (PM) and Implementation Engineer (IE) and establishes the working environment for the project before the customer-facing kickoff.",
  },

  // Planning
  {
    appliesTo: ["ucaas"],
    stage: "planning",
    intro: "Planning typically begins 6–8 weeks before the target Go-Live date and produces the inputs required to build the tenant and submit porting. Planning has parallel work streams: Assessment & Design, Emergency Services, Porting, Training, and Communications.",
  },
  {
    appliesTo: ["ccaas"],
    stage: "planning",
    intro: "Planning typically begins 4–6 weeks before the target Go-Live date. The contact-center build is driven from a validated queue, flow, and skill design — Packet Fusion produces the design and the Customer signs off before tenant build begins.",
  },
  {
    appliesTo: ["ucaas", "ccaas"],
    stage: "planning",
    intro: "Planning typically begins 6–8 weeks before the target Go-Live date. UCaaS and Contact Center work streams run in parallel — Voice infrastructure, Emergency Services, and Porting on the UCaaS side; Queue / Flow / Skill design and CRM integrations on the Contact Center side.",
    priority: 10,
  },
  {
    appliesTo: ["ci"],
    stage: "planning",
    intro: "Planning produces the inputs required to tune Revenue Accelerator to the Customer's sales motion — recorded seats, scorecards, and tracker library.",
  },
  {
    appliesTo: ["va"],
    stage: "planning",
    intro: "Planning produces the inputs required to build the virtual-agent personas — bot scope, intent library, knowledge sources, channels, and fallback flows.",
  },
  {
    appliesTo: ["rc_air"],
    stage: "planning",
    intro: "Planning produces the inputs required to configure the AI Receptionist — greeting and persona, routing logic, language coverage, and escalation paths.",
  },

  // Executing
  {
    appliesTo: ["ucaas"],
    stage: "executing",
    intro: "Executing typically begins 4–5 weeks before Go-Live. Porting is submitted, the tenant is built and provisioned, and training is locked into the calendar.",
  },
  {
    appliesTo: ["ccaas"],
    stage: "executing",
    intro: "Executing builds the validated queue / flow / skill design in the contact-center tenant and stands up integrations. Agent licenses are assigned and pre-Go-Live training is calendared.",
  },
  {
    appliesTo: ["ucaas", "ccaas"],
    stage: "executing",
    intro: "Executing runs the UCaaS port-and-provision flow in parallel with the Contact Center tenant build. Training is coordinated for end users, agents, and supervisors.",
    priority: 10,
  },
  {
    appliesTo: ["ci"],
    stage: "executing",
    intro: "Executing stands up the recording infrastructure, builds the tracker and scorecard libraries, and connects the CRM integration so coaching context surfaces alongside opportunity data.",
  },
  {
    appliesTo: ["va"],
    stage: "executing",
    intro: "Executing builds the virtual-agent personas, ingests knowledge sources, trains the intent library, and wires the voice + chat channels with the fallback paths agreed during Planning.",
  },
  {
    appliesTo: ["rc_air"],
    stage: "executing",
    intro: "Executing configures the AI Receptionist persona, routing logic, and language coverage; greeting flows are recorded and validated end-to-end before customer testing.",
  },

  // Monitoring
  {
    stage: "monitoring",
    intro: "User Acceptance Testing is executed and signed off prior to Go-Live. Outstanding configuration issues are remediated and re-tested in the same window.",
  },
  {
    appliesTo: ["ucaas"],
    stage: "monitoring",
    intro: "Monitoring/Controlling typically runs 2–3 weeks before Go-Live. Porting is confirmed, hardware is deployed, and User Acceptance Testing (UAT) is executed and signed off.",
    priority: 5,
  },

  // Go-Live
  {
    stage: "go_live",
    intro: "Go/No-Go readiness review, training delivery, the Go-Live event, and Day 1 support.",
  },
  {
    appliesTo: ["ucaas"],
    stage: "go_live",
    intro: "The week of Go-Live includes the Go/No-Go readiness review, delivery of training, the Go-Live event itself, and Day 1 support.",
    priority: 5,
  },

  // Closing
  {
    stage: "closing",
    intro: "Project closing wraps up legacy decommissioning, captures lessons learned, and transitions to the Customer's Customer Success Manager (CSM) for ongoing engagement.",
  },
];

// ─── Subsections ─────────────────────────────────────────────────────────────

export const SUBSECTIONS: Subsection[] = [
  // ── Initiation (shared structure across all variants) ───────────────────
  {
    stage: "initiation",
    title: "Resource assignment.",
    bullets: [
      "Assign Packet Fusion Project Manager (PM) as Customer's single point of contact.",
      "Assign Packet Fusion Implementation Engineer (IE) responsible for technical delivery.",
    ],
    sortOrder: 10,
  },
  {
    stage: "initiation",
    title: "Project workspace.",
    intro: "Packet Fusion uses its Cloud Connect portal as the single workspace for project artifacts, documents, and ongoing collaboration with the Customer team.",
    bullets: [
      "Cloud Connect project workspace provisioned for the engagement; access invitations sent to the Customer Project Manager, Technical Lead, and authorized signer.",
      "Document workspace (SharePoint folder, surfaced inside Cloud Connect) created for SOWs, workbooks, network test results, and design artifacts.",
      "Contract and SOW reviewed by the assigned PM.",
    ],
    sortOrder: 20,
  },
  {
    stage: "initiation",
    title: "Kickoff.",
    bullets: [
      "Customer kickoff: scheduled within five (5) business days of project assignment. PM delivers the kickoff deck, an AI-generated meeting summary is shared, recurring cadence meetings are scheduled, and the first technical session is calendared.",
      "Packet Fusion admin profile confirmed in the Customer's tenant.",
      "On request post-kickoff, a shared chat channel can be established between the Packet Fusion project team and the Customer team for day-to-day collaboration outside of scheduled meetings.",
    ],
    sortOrder: 30,
  },

  // ── Planning ─────────────────────────────────────────────────────────────
  // UCaaS-specific
  {
    appliesTo: ["ucaas"],
    stage: "planning",
    title: "Assessment & Design",
    bullets: [
      "Confirm Packet Fusion access to Customer's tenant and confirm licenses + hardware in scope.",
      "Provide Customer with required network port and firewall data; review against Customer's current configuration.",
      "Document users, sites, locations, DIDs, and existing call flows (extracted from the legacy system where available) for Customer validation.",
      "Document phone make, model, and MAC IDs for any in-scope physical endpoints.",
      "Customer validation rounds for: users, common-area phones, auto-receptionists, call queues, recordings, business / holiday hours, and analog devices / faxes.",
      "Complete network assessment and document results.",
    ],
    sortOrder: 10,
  },
  {
    appliesTo: ["ucaas"],
    stage: "planning",
    title: "10 DLC SMS Registration (if applicable)",
    intro: "Where SMS is in scope, Packet Fusion will manage 10 DLC carrier registration to satisfy U.S. carrier compliance requirements.",
    bullets: [
      "Submit Brand registration.",
      "Submit Campaign registration.",
      "Identify Local Toll / Toll-Free SMS numbers.",
      "Request 50+ numbers added to the SMS campaign via a support ticket where required.",
    ],
    sortOrder: 20,
  },
  {
    appliesTo: ["ucaas"],
    stage: "planning",
    title: "Emergency Services (E911)",
    bullets: [
      "Collect site address data and corresponding public IPs, subnets, BSSIDs, and other network identifiers.",
      "Configure network data in tenant Sites.",
      "Identify E911 response team members.",
      "Identify E911 email notification address(es).",
      "Create E911 call queue.",
      "Assign Emergency Pool number for non-extension users and common-area phones.",
      "Sign nomadic E911 waiver if required by the Customer's jurisdiction or policy.",
    ],
    sortOrder: 30,
  },
  {
    appliesTo: ["ucaas"],
    stage: "planning",
    title: "Porting Preparation",
    bullets: [
      "Confirm the list of numbers to be ported.",
      "Customer provides current copies of invoices for Toll and Toll-Free DIDs.",
      "Customer provides Customer Service Record (CSR) from the losing carrier.",
      "Identify the authorized contact on the carrier account.",
      "Determine the Customer Request Date (CRD) for porting.",
      "Packet Fusion prepares the Letter of Authorization (LOA) for Customer signature.",
    ],
    sortOrder: 40,
  },

  // CCaaS-specific Planning
  {
    appliesTo: ["ccaas"],
    stage: "planning",
    title: "Queue, Flow, and Skill Design",
    bullets: [
      "Inventory the legacy contact-center configuration (queues, IVR menus, after-hours / holiday hours, skill assignments) where one exists.",
      "Design call queues with target service levels and overflow / fallback rules.",
      "Design IVR / call flows with menu options, business-hours logic, and exception paths.",
      "Design skill-based routing and agent groups.",
      "Customer signs off on the queue / flow / skill design before tenant build begins.",
    ],
    sortOrder: 10,
  },
  {
    appliesTo: ["ccaas"],
    stage: "planning",
    title: "CRM + Business-System Integrations",
    bullets: [
      "Identify CRM(s) in scope (Salesforce, HubSpot, Microsoft Dynamics, Zendesk, ServiceNow, etc.).",
      "Confirm API access, OAuth scopes, and data mapping (contact lookup, screen pops, activity logging).",
      "Identify WFM / QM integrations if separately licensed.",
      "Document the integration design and sequence integration work in the Executing stage.",
    ],
    sortOrder: 20,
  },
  {
    appliesTo: ["ccaas"],
    stage: "planning",
    title: "Call Recording + Retention",
    bullets: [
      "Confirm recording scope (always-on, on-demand, agent-pause), retention windows, and access permissions.",
      "Confirm any PCI / PII redaction requirements and the rules that drive pause-and-resume.",
      "Document storage destination (vendor cloud vs. customer-provided) and access controls.",
    ],
    sortOrder: 30,
  },

  // CI-specific Planning
  {
    appliesTo: ["ci"],
    stage: "planning",
    title: "Tracker + Scorecard Design",
    bullets: [
      "Inventory the Customer's sales motion (stages, plays, call types) so trackers map to real workflow.",
      "Author tracker phrase libraries and topic categories for each stage.",
      "Author scorecard rubrics aligned to the Customer's call-quality framework.",
      "Identify coach / reviewer roles and their permissions.",
      "Customer signs off on the tracker + scorecard library before build.",
    ],
    sortOrder: 10,
  },
  {
    appliesTo: ["ci"],
    stage: "planning",
    title: "CRM Integration",
    bullets: [
      "Confirm CRM (typically Salesforce or HubSpot) and the opportunity / deal objects to link.",
      "Confirm API credentials and the user-mapping strategy between the recording platform and CRM.",
      "Identify which deal stages trigger coaching context and which roll up to dashboards.",
    ],
    sortOrder: 20,
  },

  // VA-specific Planning
  {
    appliesTo: ["va"],
    stage: "planning",
    title: "Bot Persona + Conversation Design",
    bullets: [
      "Confirm the use cases the virtual agent should handle (top deflection candidates).",
      "Design the bot persona — name, voice, tone, fallback language.",
      "Map the conversation tree for each use case, including disambiguation and confirmation prompts.",
      "Identify live-agent handoff triggers and the queues that receive transferred conversations.",
    ],
    sortOrder: 10,
  },
  {
    appliesTo: ["va"],
    stage: "planning",
    title: "Knowledge Sources + Intent Library",
    bullets: [
      "Identify the knowledge bases / FAQs / corpora to ingest.",
      "Confirm refresh cadence and ownership for each source.",
      "Inventory candidate intents drawn from historical call / chat reasons.",
      "Define language coverage and the fallback when an unsupported language is detected.",
    ],
    sortOrder: 20,
  },

  // AIR-specific Planning
  {
    appliesTo: ["rc_air"],
    stage: "planning",
    title: "Receptionist Design",
    bullets: [
      "Confirm inbound numbers routed through the AI Receptionist.",
      "Design the greeting flow (persona, business hours, holiday handling).",
      "Design routing logic — department, named extension, queue, voicemail fallback.",
      "Define escalation triggers (caller frustration, after-hours, language-not-supported).",
      "Customer signs off on the receptionist script before tenant configuration.",
    ],
    sortOrder: 10,
  },

  // Shared Planning bullets (any variant)
  {
    stage: "planning",
    title: "Training Planning",
    bullets: [
      "Confirm end-user / agent training count and audience.",
      "Confirm administrator training plan.",
    ],
    sortOrder: 80,
  },
  {
    stage: "planning",
    title: "Change Management & End-User Enablement",
    intro: "Packet Fusion helps the Customer drive adoption with a light-weight change-management approach focused on user readiness, not just compliance comms.",
    bullets: [
      "Joint review of the Customer's change-management approach (stakeholders, audiences, key messages, training plan).",
      "End-user / agent communication templates provided (pre-cutover save-the-date, what-to-expect, training links, day-of cheatsheet); the Customer adapts and sends them under their brand.",
      "Self-paced training resource library curated for the Customer's audience mix; Customer Champions / IT identified for first-line questions.",
      "Optional instructor-led training sessions are scoped under Section 2.8 if the Customer wants live coverage in addition to self-paced resources.",
    ],
    sortOrder: 90,
  },

  // ── Executing ────────────────────────────────────────────────────────────
  // UCaaS
  {
    appliesTo: ["ucaas"],
    stage: "executing",
    title: "Porting Submission",
    bullets: [
      "Send LOA to Customer for signature.",
      "Prepare bulksheet for the porting team.",
      "Submit port request to losing carrier.",
      "Confirm numbers have been added to the new PBX.",
    ],
    sortOrder: 10,
  },
  {
    appliesTo: ["ucaas"],
    stage: "executing",
    title: "Build & Provision the System",
    bullets: [
      "Client software / app prepared for download and installation on Customer PCs; users confirmed in the tenant.",
      "Build Sites, Auto-Receptionists (ARs), Call Queues, and Call Flows per the validated design; assign numbers to users, ARs, CQs, and Common-Area Phones.",
      "Build integrations (e.g., MS Teams, SSO, calendar).",
      "Desk phones provisioned (MAC binding and button profiles).",
      "Auto-Attendant (AA) greetings recorded, uploaded, or computer-generated.",
      "Emergency Services configuration applied to all in-scope sites and devices.",
    ],
    sortOrder: 20,
  },

  // CCaaS
  {
    appliesTo: ["ccaas"],
    stage: "executing",
    title: "Tenant Build",
    bullets: [
      "Build queues, IVR / call flows, and skill assignments per the validated design.",
      "Configure business hours, holiday calendars, and overflow routing rules.",
      "Assign agent licenses, supervisor profiles, and admin roles.",
      "Apply call-recording configuration including any pause-and-resume rules.",
    ],
    sortOrder: 10,
  },
  {
    appliesTo: ["ccaas"],
    stage: "executing",
    title: "Integrations",
    bullets: [
      "Build the in-scope CRM integration(s) per the Planning-stage design.",
      "Validate screen pops, contact lookups, and activity logging end-to-end.",
      "Build WFM / QM integrations where in scope.",
      "Configure SSO and SCIM / directory synchronization.",
    ],
    sortOrder: 20,
  },

  // CI
  {
    appliesTo: ["ci"],
    stage: "executing",
    title: "Recording + Tracker Build",
    bullets: [
      "Provision recorded seats and confirm capture is firing for in-scope users.",
      "Build the tracker library per the Planning-stage design.",
      "Build the scorecard library and publish to coaches / reviewers.",
      "Wire the CRM integration so coaching context surfaces in the CRM.",
    ],
    sortOrder: 10,
  },

  // VA
  {
    appliesTo: ["va"],
    stage: "executing",
    title: "Bot Build + Intent Training",
    bullets: [
      "Build the bot persona(s) per the Planning-stage design.",
      "Ingest the knowledge sources and train the intent library.",
      "Wire voice and chat channels and confirm grammars / NLU coverage.",
      "Build live-agent handoff to the agreed queues.",
    ],
    sortOrder: 10,
  },

  // AIR
  {
    appliesTo: ["rc_air"],
    stage: "executing",
    title: "Receptionist Build",
    bullets: [
      "Configure the AI Receptionist persona, greeting flow, and routing logic per the Planning-stage design.",
      "Record / generate greeting variants for hours, holidays, and language fallbacks.",
      "Wire escalation paths to live receptionist queues or voicemail.",
    ],
    sortOrder: 10,
  },

  // Shared Executing
  {
    stage: "executing",
    title: "Training Coordination",
    bullets: [
      "Packet Fusion PM coordinates training schedule with the Packet Fusion Trainer.",
      "Customer finalizes training dates.",
    ],
    sortOrder: 80,
  },

  // ── Monitoring / Controlling ─────────────────────────────────────────────
  {
    appliesTo: ["ucaas"],
    stage: "monitoring",
    title: "Porting Confirmation",
    bullets: [
      "Receive Firm Order Commitment (FOC) from the losing carrier (typically +10–15 days from submission).",
      "Send calendar invite for the porting event to Customer.",
    ],
    sortOrder: 10,
  },
  {
    stage: "monitoring",
    title: "Communications",
    bullets: [
      "Customer sends user / agent communications confirming the cutover date.",
    ],
    sortOrder: 20,
  },
  {
    appliesTo: ["ucaas"],
    stage: "monitoring",
    title: "User Acceptance Testing (UAT)",
    bullets: [
      "Deploy hardware (desk phones, ATAs, etc.); endpoints register to the cloud and inherit assigned profiles.",
      "Configure Caller ID (CLID) for outbound calls.",
      "Packet Fusion provides UAT test form to Customer.",
      "Customer executes UAT: call flows, E911 (dial 933), and analog devices.",
      "Packet Fusion and Customer review UAT results together; Packet Fusion makes modifications as needed.",
      "Customer signs off on UAT prior to Go-Live.",
    ],
    sortOrder: 30,
  },
  {
    appliesTo: ["ccaas"],
    stage: "monitoring",
    title: "Contact Center UAT",
    bullets: [
      "Packet Fusion provides UAT test form covering queue routing, IVR menus, skill assignment, business-hours logic, recording capture, and CRM screen pops.",
      "Customer executes UAT with representative agent + supervisor users.",
      "Packet Fusion and Customer review UAT results together; Packet Fusion makes modifications as needed.",
      "Customer signs off on UAT prior to Go-Live.",
    ],
    sortOrder: 40,
  },
  {
    appliesTo: ["ci"],
    stage: "monitoring",
    title: "Tracker + Scorecard Validation",
    bullets: [
      "Reviewers test tracker accuracy on a representative sample of recent recordings.",
      "Customer validates scorecards against the live coaching workflow.",
      "Packet Fusion tunes tracker phrases and scorecard rubrics as needed.",
      "Customer signs off on the library prior to Go-Live.",
    ],
    sortOrder: 40,
  },
  {
    appliesTo: ["va"],
    stage: "monitoring",
    title: "Intent Validation + NLP Testing",
    bullets: [
      "Run test conversations covering the in-scope use cases on voice and chat channels.",
      "Customer reviews intent coverage and disambiguation behavior.",
      "Packet Fusion tunes intent boundaries, phrasing, and fallback triggers.",
      "Customer signs off on the intent library prior to Go-Live.",
    ],
    sortOrder: 40,
  },
  {
    appliesTo: ["rc_air"],
    stage: "monitoring",
    title: "Receptionist Validation",
    bullets: [
      "Customer places test calls through the AI Receptionist across hours, holidays, and language scenarios.",
      "Verify routing decisions and escalation triggers fire as designed.",
      "Packet Fusion adjusts persona, scripts, and routing as needed.",
      "Customer signs off on the receptionist behavior prior to Go-Live.",
    ],
    sortOrder: 40,
  },

  // ── Go-Live / Production ─────────────────────────────────────────────────
  {
    stage: "go_live",
    title: "Go/No-Go Readiness",
    bullets: [
      "Determine readiness for Go-Live, including Tier 1 Support readiness on the Customer side.",
      "Packet Fusion Trainer delivers end-user / agent training.",
      "Packet Fusion IE delivers administrator training.",
    ],
    sortOrder: 10,
  },
  {
    stage: "go_live",
    title: "Go-Live Event",
    bullets: [
      "Packet Fusion and Customer follow the Go-Live test plan and record results.",
      "Packet Fusion provides Day 1 Support during the cutover window.",
    ],
    sortOrder: 20,
  },
  {
    appliesTo: ["ucaas"],
    stage: "go_live",
    title: "Voice Cutover Validation",
    bullets: [
      "Ported numbers confirmed routing to the new PBX.",
      "E911 confirmed working end-to-end, including notification to the assigned email address.",
      "Caller ID (CLID) verified on outbound calls.",
    ],
    sortOrder: 25,
  },
  {
    stage: "go_live",
    title: "Change Management & Day 1 Support",
    bullets: [
      "Customer sends the Go-Live announcement using the template provided in Planning, with day-one cheatsheet and support contact info.",
      "Packet Fusion provides Day 1 floor-walking guidance (remote) and escalation paths for issues that surface during the cutover window.",
      "Customer Champions / IT first-line owners pre-briefed on common Day 1 questions.",
    ],
    sortOrder: 30,
  },
  {
    appliesTo: ["ucaas"],
    stage: "go_live",
    title: "10 DLC Activation (if applicable)",
    bullets: [
      "Customer / IE add SMS numbers to the tenant 48 hours after port activation.",
      "Follow the SMS test plan to validate inbound and outbound messaging.",
    ],
    sortOrder: 40,
  },

  // ── Closing (shared across variants) ─────────────────────────────────────
  {
    stage: "closing",
    bullets: [
      "Customer requests cancellation of old cloud services (if applicable).",
      "Customer requests cancellation of telco services (if applicable).",
      "Packet Fusion PM hosts the lessons-learned call and project closure meeting.",
      "Project transitions to the Customer Success Manager (CSM) for ongoing engagement and any future change orders.",
    ],
    sortOrder: 10,
  },
];

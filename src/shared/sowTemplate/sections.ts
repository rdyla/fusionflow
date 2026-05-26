/**
 * Shared SOW sections — content that doesn't vary across variants.
 *
 * Section 4 (Out of Scope), 5 (Assumptions), 6 (Customer Responsibilities),
 * 7 (Project Approach & Governance — RACI / cadence / escalation), 10
 * (Change Management), 11 (Acceptance Process), 12 (Terms & References),
 * and 13 (Signature) are uniform across the SOW. Variants can override
 * via outOfScopeOverride etc. when needed.
 *
 * Verbatim from the authoritative SOW template (docx, May 2026).
 */

export const SHARED_OUT_OF_SCOPE: string[] = [
  "Design, procurement, configuration, or remediation of Customer LAN/WAN infrastructure.",
  "Quality of Service (QoS) policy design or configuration on Customer network equipment.",
  "Firewall, ACL, or NAT/SBC configuration on Customer-owned network equipment.",
  "Power over Ethernet (PoE) port activation or configuration.",
  "Installation or configuration of software on Customer end-user PCs or mobile devices.",
  "Customization of individual user endpoints or phone settings beyond the standard profile.",
  "Decommissioning, removal, or disposal of legacy equipment or services.",
  "Configuration, diagnostics, or troubleshooting of the Customer's legacy premise PBX.",
  "Re-flashing of existing phones or configuration of redirect URL via DHCP.",
  "Unboxing, placement, or physical installation of new phones (available as an Optional service).",
  "Customer mobile-device management (MDM) configuration, diagnostics, or troubleshooting.",
  "Recording, production, or sourcing of greeting prompts, hold music, or IVR audio.",
  "Contact center (Zoom Contact Center, Five9, Genesys, etc.) design or implementation unless explicitly listed in Section 1.3.",
  "Data migration from legacy voicemail, call recording, or analytics systems.",
  "Procurement of CSRs from the Customer's existing carrier(s).",
];

export const E911_FOOTNOTE = "<strong>E911 note.</strong> Accurate 911 location functionality depends on the Customer completing Registered E911 Address and location information in the Zoom administrative portal for each user and device. Packet Fusion will configure E911 per the design but cannot warrant routing accuracy without Customer-supplied location data.";

export const SHARED_ASSUMPTIONS: string[] = [
  "The Customer has an active vendor tenant (or will procure one) sized appropriately for the in-scope users, with administrative access available to Packet Fusion under a documented account.",
  "The Customer's network meets the vendor's published bandwidth, jitter, latency, and packet-loss recommendations at each in-scope location, or remediation will be completed by the Customer in advance of cutover.",
  "The Customer will make available a designated Project Manager, Technical Lead, and an authorized signer with decision-making authority throughout the engagement.",
  "Services are delivered remotely Monday–Friday during U.S. business hours (8:00 AM – 6:00 PM Pacific) unless explicitly stated otherwise. Cutover support may extend outside business hours by mutual agreement.",
  "Number porting timelines are subject to the losing carrier's acceptance and FOC scheduling, which are outside Packet Fusion's control.",
  "All required Customer-provided inputs (workbook entries, prompts, LOAs, CSRs, SSO metadata) will be returned to Packet Fusion within five (5) business days of request.",
  "Existing premise systems remain the responsibility of the Customer and their incumbent vendor throughout migration. Packet Fusion is not responsible for legacy PBX issues that surface during peering or cutover.",
  "The work in this SOW is performed under the master pricing and terms in effect as of the SOW Issue Date.",
];

export const CUSTOMER_RESPONSIBILITIES_GROUPS = [
  {
    number: "6.1",
    title: "Engagement & Governance",
    bullets: [
      "Identify and make available a Customer Project Manager, Technical Lead, Site Lead per location, and an authorized signer.",
      "Attend scheduled meetings and respond to Packet Fusion requests within the agreed turnaround times.",
      "Approve or reject deliverables in writing within five (5) business days of delivery.",
    ],
  },
  {
    number: "6.2",
    title: "Network & Infrastructure",
    bullets: [
      "Provide and maintain LAN/WAN, Wi-Fi, firewall, and Internet connectivity meeting the vendor's published requirements.",
      "Implement remediation recommended in the Network Readiness Review prior to cutover.",
      "Configure firewalls, ACLs, NAT/SBC, and QoS to support the vendor's voice and video traffic.",
      "Provide PoE port activation and switch capacity for any in-scope physical devices.",
    ],
  },
  {
    number: "6.3",
    title: "Data & Inputs",
    bullets: [
      "Procure Customer Service Records (CSRs) from the existing carrier(s) for all locations and accounts requiring porting services.",
      "Provide service addresses, authorized contacts, and Billing Telephone Number (BTN) for each phone bill / carrier account.",
      "Supply Letters of Authorization (LOAs) signed by an authorized signer for each port order.",
      "Provide accurate Registered E911 Address and location information for each user and device.",
      "Supply pre-recorded greetings, IVR prompts, and hold-music files in the formats required by the vendor.",
      "Provide SSO metadata (IdP) and any directory-sync configuration.",
      "Assemble and validate data exported from legacy systems (voicemail, recordings, analytics).",
    ],
  },
  {
    number: "6.4",
    title: "Premise & Endpoints",
    bullets: [
      "Manage all Customer-side premise PBX configuration, diagnostics, and troubleshooting.",
      "Unbox, physically place, and cable any new IP phones (unless On-site Deployment is purchased as an Optional service).",
      "Manage Customer mobile-device configuration, diagnostics, and troubleshooting.",
      "Decommission and dispose of legacy equipment after project closure.",
    ],
  },
];

// ── Section 7 — RACI ────────────────────────────────────────────────────────
// R = Responsible, A = Accountable, C = Consulted, I = Informed
export const RACI_ROWS: Array<{ activity: string; pm: string; ie: string; sa: string; cust_pm: string; cust_tech: string; cust_signer: string }> = [
  { activity: "Project plan & schedule",            pm: "A/R", ie: "I",   sa: "C",   cust_pm: "C",   cust_tech: "I", cust_signer: "I" },
  { activity: "Discovery / Assessment & Design",    pm: "A",   ie: "R",   sa: "C",   cust_pm: "C",   cust_tech: "R", cust_signer: "I" },
  { activity: "Customer validation rounds",          pm: "A",   ie: "C",   sa: "I",   cust_pm: "R",   cust_tech: "R", cust_signer: "—" },
  { activity: "E911 / Emergency Services config",    pm: "C",   ie: "A/R", sa: "I",   cust_pm: "C",   cust_tech: "R", cust_signer: "—" },
  { activity: "10 DLC SMS registration",             pm: "A",   ie: "R",   sa: "I",   cust_pm: "C",   cust_tech: "C", cust_signer: "—" },
  { activity: "LOA / port order submission",         pm: "A/R", ie: "C",   sa: "I",   cust_pm: "C",   cust_tech: "I", cust_signer: "R (sign)" },
  { activity: "Tenant build & provisioning",         pm: "A",   ie: "R",   sa: "C",   cust_pm: "I",   cust_tech: "I", cust_signer: "—" },
  { activity: "UAT execution",                       pm: "A",   ie: "R",   sa: "I",   cust_pm: "C",   cust_tech: "R", cust_signer: "—" },
  { activity: "UAT sign-off",                        pm: "C",   ie: "I",   sa: "I",   cust_pm: "C",   cust_tech: "I", cust_signer: "A/R" },
  { activity: "Training delivery",                   pm: "C",   ie: "R",   sa: "I",   cust_pm: "C",   cust_tech: "I", cust_signer: "—" },
  { activity: "Go-Live event & Day 1 Support",       pm: "A/R", ie: "R",   sa: "C",   cust_pm: "C",   cust_tech: "C", cust_signer: "I" },
  { activity: "Go-Live acceptance",                  pm: "C",   ie: "I",   sa: "I",   cust_pm: "C",   cust_tech: "I", cust_signer: "A/R" },
  { activity: "Project closure & CSM transition",    pm: "A/R", ie: "I",   sa: "C",   cust_pm: "C",   cust_tech: "I", cust_signer: "R (sign)" },
];

export const CADENCE_ROWS: Array<{ forum: string; frequency: string; participants: string; output: string }> = [
  { forum: "Project Kickoff",            frequency: "Once",                  participants: "All stakeholders",       output: "Kickoff deck, signed-off plan" },
  { forum: "PM Status Call",             frequency: "Weekly",                participants: "PF PM, Cust PM",         output: "Written status report" },
  { forum: "Technical Working Session",  frequency: "Bi-weekly",             participants: "PF IE, Cust Tech",       output: "Updated workbook / design" },
  { forum: "Executive Steering Review",  frequency: "Monthly",               participants: "Sponsors + PMs",         output: "Risk & milestone summary" },
  { forum: "Go-Live Bridge",             frequency: "Per Go-Live",           participants: "Cutover team",           output: "Go-Live log + sign-off" },
  { forum: "Day 1 Support Stand-up",     frequency: "Daily (Go-Live week)",  participants: "PF + Cust support",      output: "Issue log update" },
  { forum: "CSM Transition Meeting",     frequency: "Project close",         participants: "PF PM, CSM, Cust PM",    output: "Handoff package & contacts" },
];

export const ESCALATION_ROWS: Array<{ level: string; pf: string; cust: string }> = [
  { level: "L1 Tactical",   pf: "Project Manager",                       cust: "Project Manager" },
  { level: "L2 Technical",  pf: "Solution Architect / Engineering Lead", cust: "Technical Lead" },
  { level: "L3 Commercial", pf: "Director, Professional Services",       cust: "IT Director / Sponsor" },
  { level: "L4 Executive",  pf: "VP, Professional Services",             cust: "Executive Sponsor" },
];

export const TIMELINE_MILESTONES: Array<{ id: string; name: string; target: string; predecessor: string }> = [
  { id: "M1",  name: "SOW Executed & Project Initiated",          target: "T + 0 days",         predecessor: "—" },
  { id: "M2",  name: "Internal & Customer Kickoff Complete",      target: "T + 5 business days", predecessor: "M1" },
  { id: "M3",  name: "Planning: Assessment & Design Validated",   target: "T + 4 weeks",        predecessor: "M2" },
  { id: "M4",  name: "Tenant Build & Provisioning Complete",      target: "T + 7 weeks",        predecessor: "M3" },
  { id: "M5",  name: "Port Orders Submitted",                     target: "T + 5 weeks",        predecessor: "M3" },
  { id: "M6",  name: "FOC Received from Carrier",                 target: "T + 7 weeks",        predecessor: "M5" },
  { id: "M7",  name: "UAT Complete & Customer Sign-off",          target: "T + 9 weeks",        predecessor: "M4" },
  { id: "M8",  name: "Go/No-Go Readiness Confirmed",              target: "T + 10 weeks",       predecessor: "M6, M7" },
  { id: "M9",  name: "Go-Live & Day 1 Support",                   target: "T + 10 weeks",       predecessor: "M8" },
  { id: "M10", name: "Project Closure & Transition to CSM",       target: "T + 11 weeks",       predecessor: "M9" },
];

export const CHANGE_MANAGEMENT_STEPS = [
  { name: "Step 1 — Request",            text: "Either party submits a written change request to the other party's Project Manager describing the change and the reason for it." },
  { name: "Step 2 — Impact Assessment",  text: "Within five (5) business days, Packet Fusion will assess the impact on scope, schedule, fees, deliverables, and assumptions, and provide a written Change Order for the Customer's review." },
  { name: "Step 3 — Approval",           text: "The Change Order takes effect when signed by the authorized signers of both parties. Until then, the original SOW remains in force and the project schedule continues to count the impact-assessment time against the affected milestones." },
  { name: "Step 4 — Execution",          text: "Packet Fusion incorporates the approved change into the project plan and tracks it through the normal status-reporting cadence." },
];

export const ACCEPTANCE_DELIVERABLE_STEPS = [
  "Packet Fusion submits the deliverable to the Customer's designated reviewer in writing (email is acceptable).",
  "The Customer reviews against the stated acceptance criteria within five (5) business days.",
  "If accepted, the Customer authorized signer confirms acceptance in writing.",
  "If rejected, the Customer provides a written list of specific, defensible deficiencies referencing the acceptance criteria. Packet Fusion remedies the deficiencies and resubmits.",
  "If the Customer does not respond within five (5) business days, the deliverable is deemed accepted.",
];

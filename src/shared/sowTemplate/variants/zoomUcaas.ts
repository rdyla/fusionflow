/**
 * Zoom UCaaS variant — full content ported from the authoritative SOW
 * template (src/client/assets/PacketFusion_SOW_Template (2).docx).
 *
 * Phase activity content (§ 2.2 – 2.7), training, engineering, optional
 * services, deliverables, and scope-at-a-glance are all copied verbatim
 * from the docx so the rendered SOW matches what Sales has been issuing.
 *
 * Updates to delivery content should happen by editing this file (and the
 * docx for parity), not by twiddling the renderer.
 */

import type { SowVariant } from "../types";

export const ZOOM_UCAAS_VARIANT: SowVariant = {
  id: "ucaas",
  vendor: "zoom",
  productLine: "Zoom UCaaS Professional Services",
  projectReferenceTemplate: "Zoom UCaaS Migration – {customer}",
  isStub: false,
  showE911Footnote: true,
  heroImageKey: "zoom_ucaas",

  snapshotTiles: [
    { label: "Locations",        value: (ctx) => String(ctx.locationCount || 0) },
    { label: "Zoom Phone Users", value: (ctx) => String(ctx.primarySeatCount || 0) },
    { label: "DIDs to Port",     value: (ctx) => String(ctx.ditNumbers || 0) },
    { label: "Zoom Meetings",    value: (ctx) => String(ctx.meetingsCount || 0) },
  ],

  scopeAtAGlance: [
    { element: "Locations",                        quantity: "{locations}",    notes: "Discrete physical sites in scope for cutover." },
    { element: "Zoom Phone users (UCaaS)",         quantity: "{primary}",      notes: "No physical fax, overhead paging, or physical desk phones in base scope." },
    { element: "DIDs (Direct Inward Dial)",        quantity: "{dids}",         notes: "All to be ported from existing carrier(s) to Zoom." },
    { element: "Zoom Meetings licenses",           quantity: "{meetings}",     notes: "Provisioning and configuration only; licenses procured separately." },
    { element: "Go-Live events",                   quantity: "{golives}",      notes: "One per site, sequenced per the agreed migration plan." },
    { element: "Network / VoIP readiness assessments", quantity: "Included",   notes: "Wired and wireless test results per location." },
    { element: "End-user training",                quantity: "Self-paced",     notes: "Zoom video and knowledge-base library; instructor-led optional." },
    { element: "Administrative training",          quantity: "Included",       notes: "Knowledge transfer to Customer system administrators." },
  ],

  phases: [
    // ── 2.2 Initiation ────────────────────────────────────────────────────────
    {
      number: "2.2",
      title: "Phase 1 — Initiation",
      intro: "Packet Fusion assigns a dedicated Project Manager (PM) and Implementation Engineer (IE) and establishes the working environment for the project before the customer-facing kickoff.",
      subsections: [
        {
          title: "Resource assignment.",
          bullets: [
            "Assign Packet Fusion Project Manager (PM) as Customer's single point of contact.",
            "Assign Packet Fusion Implementation Engineer (IE) responsible for technical delivery.",
          ],
        },
        {
          title: "Project workspace.",
          intro: "Packet Fusion uses its Cloud Connect portal as the single workspace for project artifacts, documents, and ongoing collaboration with the Customer team.",
          bullets: [
            "Cloud Connect project workspace provisioned for the engagement; access invitations sent to the Customer Project Manager, Technical Lead, and authorized signer.",
            "Document workspace (SharePoint folder, surfaced inside Cloud Connect) created for SOWs, workbooks, network test results, and design artifacts.",
            "Contract and SOW reviewed by the assigned PM.",
          ],
        },
        {
          title: "Kickoff.",
          bullets: [
            "Customer kickoff: scheduled within five (5) business days of project assignment. PM delivers the kickoff deck, an AI-generated meeting summary is shared, recurring cadence meetings are scheduled, and the first technical session is calendared.",
            "Packet Fusion admin profile confirmed in the Customer's Zoom tenant.",
            "On request post-kickoff, a shared Zoom Team Chat channel can be established between the Packet Fusion project team and the Customer team for day-to-day collaboration outside of scheduled meetings.",
          ],
        },
      ],
    },

    // ── 2.3 Planning ──────────────────────────────────────────────────────────
    {
      number: "2.3",
      title: "Phase 2 — Planning",
      intro: "Planning typically begins 6–8 weeks before the target Go-Live date and produces the inputs required to build the tenant and submit porting. Planning has five parallel work streams: Assessment & Design, Emergency Services, Porting, Training, and Communications.",
      subsections: [
        {
          number: "2.3.1",
          title: "Assessment & Design",
          bullets: [
            "Confirm Packet Fusion access to Customer's Zoom tenant and confirm licenses + hardware in scope.",
            "Provide Customer with required network port and firewall data; review against Customer's current configuration.",
            "Document users, sites, locations, DIDs, and existing call flows (extracted from the legacy system where available) for Customer validation.",
            "Document phone make, model, and MAC IDs for any in-scope physical endpoints.",
            "Customer validation rounds for: users, common-area phones, auto-receptionists, call queues, recordings, business / holiday hours, and analog devices / faxes.",
            "Complete network assessment and document results.",
          ],
        },
        {
          number: "2.3.2",
          title: "10 DLC SMS Registration (if applicable)",
          intro: "Where SMS is in scope, Packet Fusion will manage 10 DLC carrier registration to satisfy U.S. carrier compliance requirements.",
          bullets: [
            "Submit Brand registration.",
            "Submit Campaign registration.",
            "Identify Local Toll / Toll-Free SMS numbers.",
            "Request 50+ numbers added to the SMS campaign via a support ticket where required.",
          ],
        },
        {
          number: "2.3.3",
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
        },
        {
          number: "2.3.4",
          title: "Porting Preparation",
          bullets: [
            "Confirm the list of numbers to be ported.",
            "Customer provides current copies of invoices for Toll and Toll-Free DIDs.",
            "Customer provides Customer Service Record (CSR) from the losing carrier.",
            "Identify the authorized contact on the carrier account.",
            "Determine the Customer Request Date (CRD) for porting.",
            "Packet Fusion prepares the Letter of Authorization (LOA) for Customer signature.",
          ],
        },
        {
          number: "2.3.5",
          title: "Training Planning",
          bullets: [
            "Confirm end-user training count and audience.",
            "Confirm administrator training plan.",
          ],
        },
        {
          number: "2.3.6",
          title: "Change Management & End-User Enablement",
          intro: "Packet Fusion helps the Customer drive adoption with a light-weight change-management approach focused on end-user readiness, not just compliance comms.",
          bullets: [
            "Joint review of the Customer's change-management approach (stakeholders, audiences, key messages, training plan).",
            "End-user communication templates provided (pre-cutover save-the-date, what-to-expect, training links, day-of cheatsheet); the Customer adapts and sends them under their brand.",
            "Self-paced training resource library (Zoom video + knowledge base) curated for the Customer's user mix; Customer Champions / IT identified for first-line questions.",
            "Optional instructor-led training sessions are scoped under Section 2.8 if the Customer wants live coverage in addition to self-paced resources.",
          ],
        },
      ],
    },

    // ── 2.4 Executing ─────────────────────────────────────────────────────────
    {
      number: "2.4",
      title: "Phase 3 — Executing",
      intro: "Executing typically begins 4–5 weeks before Go-Live. Porting is submitted, the tenant is built and provisioned, and training is locked into the calendar.",
      subsections: [
        {
          number: "2.4.1",
          title: "Porting Submission",
          bullets: [
            "Send LOA to Customer for signature.",
            "Prepare bulksheet for the porting team.",
            "Submit port request to losing carrier.",
            "Confirm numbers have been added to the Zoom PBX.",
          ],
        },
        {
          number: "2.4.2",
          title: "Build & Provision the System",
          bullets: [
            "Client software / app prepared for download and installation on Customer PCs; users confirmed in the Zoom tenant.",
            "Build Sites, Auto-Receptionists (ARs), Call Queues, and Call Flows per the validated design; assign numbers to users, ARs, CQs, and Common-Area Phones.",
            "Build integrations (e.g., MS Teams, SSO, calendar).",
            "Desk phones provisioned (MAC binding and button profiles).",
            "Auto-Attendant (AA) greetings recorded, uploaded, or computer-generated.",
            "Emergency Services configuration applied to all in-scope sites and devices.",
          ],
        },
        {
          number: "2.4.3",
          title: "Training Coordination",
          bullets: [
            "Packet Fusion PM coordinates training schedule with the Packet Fusion Trainer.",
            "Customer finalizes training dates.",
          ],
        },
      ],
    },

    // ── 2.5 Monitoring / Controlling ──────────────────────────────────────────
    {
      number: "2.5",
      title: "Phase 4 — Monitoring / Controlling",
      intro: "Monitoring/Controlling typically runs 2–3 weeks before Go-Live. Porting is confirmed, hardware is deployed, and User Acceptance Testing (UAT) is executed and signed off.",
      subsections: [
        {
          number: "2.5.1",
          title: "Porting Confirmation",
          bullets: [
            "Receive Firm Order Commitment (FOC) from the losing carrier (typically +10–15 days from submission).",
            "Send calendar invite for the porting event to Customer.",
          ],
        },
        {
          number: "2.5.2",
          title: "Communications",
          bullets: [
            "Customer sends end-user communications confirming the cutover date.",
          ],
        },
        {
          number: "2.5.3",
          title: "User Acceptance Testing (UAT)",
          bullets: [
            "Deploy hardware (desk phones, ATAs, etc.); endpoints register to the cloud and inherit assigned profiles.",
            "Configure Caller ID (CLID) for outbound calls.",
            "Packet Fusion provides UAT test form to Customer.",
            "Customer executes UAT: call flows, E911 (dial 933), and analog devices.",
            "Packet Fusion and Customer review UAT results together; Packet Fusion makes modifications as needed.",
            "Customer signs off on UAT prior to Go-Live.",
          ],
        },
      ],
    },

    // ── 2.6 Go-Live / Production ──────────────────────────────────────────────
    {
      number: "2.6",
      title: "Phase 5 — Go Live / Production",
      intro: "The week of Go-Live includes the Go/No-Go readiness review, delivery of training, the Go-Live event itself, and Day 1 support.",
      subsections: [
        {
          number: "2.6.1",
          title: "Go/No-Go Readiness",
          bullets: [
            "Determine readiness for Go-Live, including Tier 1 Support readiness on the Customer side.",
            "Packet Fusion Trainer delivers end-user training.",
            "Packet Fusion IE delivers administrator training.",
          ],
        },
        {
          number: "2.6.2",
          title: "Go-Live Event",
          bullets: [
            "Packet Fusion and Customer follow the Go-Live test plan and record results.",
            "E911 confirmed working end-to-end, including notification to the assigned email address.",
            "Packet Fusion provides Day 1 Support during the cutover window.",
          ],
        },
        {
          number: "2.6.3",
          title: "Change Management & End-User Support",
          bullets: [
            "Customer sends the Go-Live announcement using the template provided in Section 2.3.6, with day-one cheatsheet and support contact info.",
            "Packet Fusion provides Day 1 floor-walking guidance (remote) and escalation paths for end-user issues that surface during the cutover window.",
            "Customer Champions / IT first-line owners pre-briefed on common Day 1 questions (sign-in, voicemail PIN, presence, call forwarding).",
          ],
        },
        {
          number: "2.6.4",
          title: "10 DLC Activation (if applicable)",
          bullets: [
            "Customer / IE add SMS numbers to the tenant 48 hours after port activation.",
            "Follow the SMS test plan to validate inbound and outbound messaging.",
          ],
        },
      ],
    },

    // ── 2.7 Closing ───────────────────────────────────────────────────────────
    {
      number: "2.7",
      title: "Phase 6 — Closing",
      intro: "Project Closing wraps up legacy decommissioning, captures lessons learned, and transitions the relationship to the Customer's assigned Customer Success Manager (CSM) for ongoing engagement.",
      bullets: [
        "Customer requests cancellation of old cloud services (if applicable).",
        "Customer requests cancellation of telco services (if applicable).",
        "Packet Fusion PM hosts the lessons-learned call and project closure meeting.",
        "Project transitions to the Customer Success Manager (CSM) for ongoing engagement and any future change orders.",
      ],
    },
  ],

  trainingIncluded: "Self-paced end-user training via Zoom's video library and knowledge base; instructor-led administrator training delivered by Packet Fusion.",
  trainingOptional: "Live, remote, instructor-led end-user training sessions (up to 20 attendees per session). See Section 9.2 for pricing. Sessions are recorded and download links are provided.",

  engineeringAndIntegration: [
    "Premise peering with existing PBX solutions to enable calling between platforms during migration windows.",
    "Analog Telephone Adapter (ATA) / gateway configuration for fax lines, paging, and other analog endpoints.",
    "Paging system configuration for Zoom-supported paging devices once installed on the network.",
    "Zoom Phone Local Survivability (ZPLS) node registration, configuration, and alpha testing.",
    "E911 setup via Zoom's nomadic E911 service.",
    "Microsoft Teams integration via Zoom's embedded application; direct routing via SBC available as an optional add-on.",
  ],

  optionalServiceBullets: [
    "On-site station discovery and pre-field readiness, including phone repurposing (up to 60 Mitel 6900 series for Zoom).",
    "Additional live, instructor-led remote training sessions.",
    "On-site deployment services (phone distribution, ATA placement, cross-connect, post-install QA).",
    "Direct routing implementation via Session Border Controller (SBC).",
  ],

  optionalServicesTable: [
    { name: "On-site station discovery & pre-field readiness (up to 60 Mitel 6900 series repurposed for Zoom)", unit: "Per project", fee: "$2,475.00" },
    { name: "Live remote instructor-led training session (up to 20 attendees per session)",                       unit: "Per session", fee: "$290.00" },
    { name: "On-site phone deployment services (distribute, unbox, place, connect)",                              unit: "Per visit",   fee: "By quote" },
    { name: "Direct Routing via SBC (Microsoft Teams integration)",                                               unit: "Per project", fee: "By quote" },
  ],

  deliverables: [
    { id: "D1",  name: "Project Plan & RAID Log",            format: "Smartsheet / PDF",       acceptanceCriteria: "Plan reflects scope, milestones, owners, and dependencies; reviewed and acknowledged in writing by Customer PM." },
    { id: "D2",  name: "Implementation Workbook",            format: "Excel",                  acceptanceCriteria: "All users, sites, numbers, roles, and feature assignments populated and approved by Customer authorized signer." },
    { id: "D3",  name: "Call-Flow Design Package",           format: "PDF / Visio",            acceptanceCriteria: "All in-scope call flows depicted (auto-attendant, queue, after-hours, overflow); approved by Customer authorized signer." },
    { id: "D4",  name: "Network Readiness Review",           format: "PDF + test screenshots", acceptanceCriteria: "Customer runs Zoom's network-readiness test at each in-scope site; Customer submits a screenshot of the result to Packet Fusion for the project record. Packet Fusion documents findings, identified risks, and remediation owners; Customer acknowledges remediation responsibilities." },
    { id: "D5",  name: "Port Order Package",                 format: "LOA + CSR",              acceptanceCriteria: "LOA and CSR submitted to losing carrier for each in-scope number; FOC dates received." },
    { id: "D6",  name: "UAT Plan & Results",                 format: "PDF / Excel",            acceptanceCriteria: "All planned test cases executed; pass/fail results recorded; Customer authorized signer accepts UAT results." },
    { id: "D7",  name: "Go-Live Confirmation",               format: "Sign-off form",          acceptanceCriteria: "Per-site cutover confirmed by Customer site lead; outstanding items captured for Day 1 Support follow-up." },
    { id: "D8",  name: "Final Solution Design Report",       format: "PDF",                    acceptanceCriteria: "Documents as-built configuration, integrations, and admin procedures; delivered at or before project closure." },
    { id: "D9",  name: "Administrator Knowledge Transfer",   format: "Live session + recording", acceptanceCriteria: "Recorded session covers admin portal, user lifecycle, call-flow edits, and reporting; Customer acknowledges completion." },
    { id: "D10", name: "Project Closure Memo",               format: "PDF",                    acceptanceCriteria: "Confirms project closure and CSM transition, and lists any deferred items for future change orders." },
  ],
};

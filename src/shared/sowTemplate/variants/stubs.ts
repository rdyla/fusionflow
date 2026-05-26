/**
 * Stub variants for ZCC, CI (Conversation Intelligence — Zoom Revenue
 * Accelerator / RingCentral ACE), VA (Zoom AI Virtual Agent / RingCentral
 * AVA), and RingCentral UCaaS. These render a working SOW end-to-end but
 * with placeholder phase/deliverable content — full authoritative content
 * comes in follow-up PRs (one per variant) once Sales/Delivery provides
 * the canonical source material per product, matching what we have for
 * Zoom UCaaS.
 *
 * The stub copies the Zoom UCaaS phase structure but replaces vendor-
 * specific terms ("Zoom Phone", "ARs", "MAC addresses", etc.) with a
 * generic equivalent or a clearly-marked placeholder line. The SOW
 * renders without errors and the variant interface is exercised, but
 * any PM exporting a stub SOW should NOT issue it to a customer
 * without filling in the variant — the rendered doc carries a banner
 * to that effect.
 */

import type { SowVariant, SowSolutionTypeKey, SowVendorKey } from "../types";

function buildStub(
  id: SowSolutionTypeKey,
  vendor: SowVendorKey,
  productLine: string,
  projectReferenceTemplate: string,
  primaryLabel: string,
  secondaryLabels: { label2: string; label3: string; label4: string },
  heroImageKey: string | undefined,
): SowVariant {
  return {
    id,
    vendor,
    productLine,
    projectReferenceTemplate,
    isStub: true,
    showE911Footnote: false,
    heroImageKey,

    snapshotTiles: [
      { label: "Locations",          value: (ctx) => String(ctx.locationCount || 0) },
      { label: primaryLabel,         value: (ctx) => String(ctx.primarySeatCount || 0) },
      { label: secondaryLabels.label2, value: () => "TBD" },
      { label: secondaryLabels.label3, value: () => "TBD" },
    ],

    scopeAtAGlance: [
      { element: "Locations",                 quantity: "{locations}", notes: "Discrete physical sites in scope for cutover." },
      { element: primaryLabel,                quantity: "{primary}",   notes: "Variant-specific notes pending — see follow-up PR." },
      { element: secondaryLabels.label2,      quantity: "TBD",         notes: "Variant-specific notes pending — see follow-up PR." },
      { element: secondaryLabels.label3,      quantity: "TBD",         notes: "Variant-specific notes pending — see follow-up PR." },
      { element: "End-user training",         quantity: "Self-paced",  notes: "Vendor video and knowledge-base library; instructor-led optional." },
      { element: "Administrative training",   quantity: "Included",    notes: "Knowledge transfer to Customer system administrators." },
    ],

    phases: [
      {
        number: "2.2",
        title: "Phase 1 — Initiation",
        intro: "Packet Fusion assigns a dedicated Project Manager (PM) and Implementation Engineer (IE) and establishes the working environment for the project before the customer-facing kickoff.",
        bullets: [
          "Assign PM as Customer's single point of contact and IE for technical delivery.",
          "Create internal project assets (CE case, SharePoint folder, chat channel, distribution group).",
          "Internal kickoff aligning PM, IE, and supporting roles on scope, schedule, and risks.",
          "Customer kickoff scheduled within five (5) business days of project assignment.",
          `[STUB — ${productLine} initiation specifics pending. Use as a starting point only; not for customer issue.]`,
        ],
      },
      {
        number: "2.3",
        title: "Phase 2 — Planning",
        intro: "Planning produces the inputs required to build the tenant and execute the cutover. Specific work-streams for this product are pending in a follow-up PR.",
        bullets: [
          "Confirm Packet Fusion access to the Customer's tenant.",
          "Confirm licenses, hardware, and integrations in scope.",
          "Document users, sites, and key configuration data for Customer validation.",
          "Complete network / readiness assessment and document results.",
          `[STUB — ${productLine} planning work-streams pending. Use as a starting point only; not for customer issue.]`,
        ],
      },
      {
        number: "2.4",
        title: "Phase 3 — Executing",
        intro: "Tenant build, provisioning, and configuration per the validated design.",
        bullets: [
          "Build the tenant per the validated design (sites, queues, flows, integrations as applicable).",
          "Configure settings at Account, Site, Group, and User levels.",
          "Coordinate training schedule with the assigned Packet Fusion Trainer.",
          `[STUB — ${productLine} build activities pending. Use as a starting point only; not for customer issue.]`,
        ],
      },
      {
        number: "2.5",
        title: "Phase 4 — Monitoring / Controlling",
        intro: "User Acceptance Testing is executed and signed off prior to Go-Live.",
        bullets: [
          "Packet Fusion provides UAT test form to Customer.",
          "Customer executes UAT and Packet Fusion reviews results.",
          "Packet Fusion makes modifications as needed.",
          "Customer signs off on UAT prior to Go-Live.",
          `[STUB — ${productLine} UAT specifics pending. Use as a starting point only; not for customer issue.]`,
        ],
      },
      {
        number: "2.6",
        title: "Phase 5 — Go Live / Production",
        intro: "Go/No-Go readiness review, training delivery, Go-Live event, Day 1 support.",
        bullets: [
          "Determine readiness for Go-Live, including Tier 1 Support readiness on the Customer side.",
          "Packet Fusion delivers end-user and administrator training.",
          "Run the Go-Live event per the agreed plan.",
          "Day 1 Support during the cutover window.",
          `[STUB — ${productLine} cutover specifics pending. Use as a starting point only; not for customer issue.]`,
        ],
      },
      {
        number: "2.7",
        title: "Phase 6 — Closing",
        intro: "Project closing wraps up legacy decommissioning, captures lessons learned, and transitions to the Customer's CSM.",
        bullets: [
          "Customer requests cancellation of legacy services (if applicable).",
          "Packet Fusion PM hosts the lessons-learned call and project closure meeting.",
          "Project transitions to the Customer Success Manager (CSM) for ongoing engagement.",
        ],
      },
    ],

    trainingIncluded: "Self-paced end-user training via the vendor's video library and knowledge base; instructor-led administrator training delivered by Packet Fusion.",
    trainingOptional: "Live, remote, instructor-led end-user training sessions (up to 20 attendees per session) — pricing per Section 9.2.",

    engineeringAndIntegration: [
      "[STUB — engineering and integration services list pending for this variant. See Zoom UCaaS variant for the authoritative pattern.]",
    ],

    optionalServiceBullets: [
      "[STUB — optional services list pending for this variant.]",
    ],

    optionalServicesTable: [
      { name: "Live remote instructor-led training session (up to 20 attendees per session)", unit: "Per session", fee: "$290.00" },
      { name: "On-site deployment services (distribute, unbox, place, connect)",              unit: "Per visit",   fee: "By quote" },
    ],

    deliverables: [
      { id: "D1",  name: "Project Plan & RAID Log",          format: "Smartsheet / PDF",         acceptanceCriteria: "Plan reflects scope, milestones, owners, and dependencies; reviewed and acknowledged in writing by Customer PM." },
      { id: "D2",  name: "Implementation Workbook",          format: "Excel",                    acceptanceCriteria: "All users, sites, and feature assignments populated and approved by Customer authorized signer." },
      { id: "D3",  name: "Design Package",                   format: "PDF",                      acceptanceCriteria: "Approved by Customer authorized signer." },
      { id: "D4",  name: "Network Readiness Review",         format: "PDF",                      acceptanceCriteria: "Results delivered; risks documented; Customer acknowledges remediation responsibilities." },
      { id: "D5",  name: "UAT Plan & Results",               format: "PDF / Excel",              acceptanceCriteria: "Test cases executed; pass/fail results recorded; Customer authorized signer accepts UAT results." },
      { id: "D6",  name: "Go-Live Confirmation",             format: "Sign-off form",            acceptanceCriteria: "Cutover confirmed by Customer site lead; outstanding items captured for Day 1 Support follow-up." },
      { id: "D7",  name: "Final Solution Design Report",     format: "PDF",                      acceptanceCriteria: "As-built configuration, integrations, and admin procedures; delivered at or before project closure." },
      { id: "D8",  name: "Administrator Knowledge Transfer", format: "Live session + recording", acceptanceCriteria: "Recorded session covers admin portal and operating procedures; Customer acknowledges completion." },
      { id: "D9",  name: "Project Closure Memo",             format: "PDF",                      acceptanceCriteria: "Confirms project closure and CSM transition, and lists any deferred items for future change orders." },
    ],
  };
}

// Hero image keys — see ScopeOfWorkDocument.tsx HERO_URLS for the actual
// asset mapping. Each variant nominates the imagery family that best matches
// its product: UCaaS gets the connectivity hero, CCaaS gets the contact-
// center hero, CI / VA / AIR get the AI/data hero.

export const ZOOM_CCAAS_STUB: SowVariant = buildStub(
  "ccaas",
  "zoom",
  "Zoom Contact Center Professional Services",
  "Zoom Contact Center Implementation – {customer}",
  "Agents (CCaaS)",
  { label2: "Queues",       label3: "Skills",        label4: "Integrations" },
  "ccaas",
);

export const ZOOM_CI_STUB: SowVariant = buildStub(
  "ci",
  "zoom",
  "Zoom Revenue Accelerator Professional Services",
  "Zoom Revenue Accelerator Implementation – {customer}",
  "Recorded Seats",
  { label2: "Integrations", label3: "Trackers",      label4: "Reporting" },
  "ai_data",
);

export const ZOOM_VA_STUB: SowVariant = buildStub(
  "va",
  "zoom",
  "Zoom AI Virtual Agent Professional Services",
  "Zoom AI Virtual Agent Implementation – {customer}",
  "Bots",
  { label2: "Intents",      label3: "Integrations",  label4: "Languages" },
  "ai_data",
);

export const RC_UCAAS_STUB: SowVariant = buildStub(
  "ucaas",
  "ringcentral",
  "RingCentral UCaaS Professional Services",
  "RingCentral UCaaS Migration – {customer}",
  "RingCentral Users (UCaaS)",
  { label2: "DIDs to Port", label3: "Meetings",      label4: "Integrations" },
  "ucaas_generic",
);

export const RC_CCAAS_STUB: SowVariant = buildStub(
  "ccaas",
  "ringcentral",
  "RingCentral Contact Center Professional Services",
  "RingCentral Contact Center Implementation – {customer}",
  "Agents (CCaaS)",
  { label2: "Queues",       label3: "Skills",        label4: "Integrations" },
  "ccaas",
);

export const RC_AIR_STUB: SowVariant = buildStub(
  "rc_air",
  "ringcentral",
  "RingCentral AI Receptionist Professional Services",
  "RingCentral AI Receptionist Implementation – {customer}",
  "AI Receptionist Numbers",
  { label2: "Integrations", label3: "Languages",     label4: "Skills" },
  "ai_data",
);

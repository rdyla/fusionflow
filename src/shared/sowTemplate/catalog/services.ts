/**
 * Engineering / integration + optional service catalog entries.
 *
 * The renderer surfaces these in Section 2.9 (engineering) + Section 2.10
 * (optional service bullets) + Section 9.2 (priced optional service table).
 * Tagging follows the same pattern as the rest of the catalog.
 */

import type { EngineeringBullet, OptionalServiceBullet, OptionalServiceRow } from "./types";

// ── Engineering & Integration ────────────────────────────────────────────────

export const ENGINEERING: EngineeringBullet[] = [
  // UCaaS engineering
  { appliesTo: ["ucaas"], bullet: "Premise peering with existing PBX solutions to enable calling between platforms during migration windows.", sortOrder: 10 },
  { appliesTo: ["ucaas"], bullet: "Analog Telephone Adapter (ATA) / gateway configuration for fax lines, paging, and other analog endpoints.", sortOrder: 20 },
  { appliesTo: ["ucaas"], bullet: "Paging system configuration for vendor-supported paging devices once installed on the network.", sortOrder: 30 },
  { appliesTo: ["ucaas"], bullet: "Emergency Services (E911) setup via the vendor's nomadic E911 service.", sortOrder: 40 },
  // Zoom-only
  { appliesTo: ["ucaas"], vendor: ["zoom"], bullet: "Zoom Phone Local Survivability (ZPLS) node registration, configuration, and alpha testing.", sortOrder: 50 },
  { appliesTo: ["ucaas"], vendor: ["zoom"], bullet: "Microsoft Teams integration via Zoom's embedded application; direct routing via SBC available as an optional add-on.", sortOrder: 60 },
  // RingCentral-only
  { appliesTo: ["ucaas"], vendor: ["ringcentral"], bullet: "Microsoft Teams integration via RingCentral's direct-routing solution.", sortOrder: 60 },

  // CCaaS engineering
  { appliesTo: ["ccaas"], bullet: "CRM integration (Salesforce, HubSpot, Microsoft Dynamics, Zendesk, ServiceNow, or equivalent) — screen pop, contact lookup, activity logging.", sortOrder: 10 },
  { appliesTo: ["ccaas"], bullet: "Workforce Management (WFM) integration — schedule adherence, forecasting, and intraday data exchange.", sortOrder: 20 },
  { appliesTo: ["ccaas"], bullet: "Quality Management (QM) integration — recording handoff, calibration workflow, and scorecard sync.", sortOrder: 30 },
  { appliesTo: ["ccaas"], bullet: "Custom IVR / call-flow design for complex menus, after-hours routing, and queue overflow logic.", sortOrder: 40 },
  { appliesTo: ["ccaas"], bullet: "Single Sign-On (SSO) and SCIM directory sync for agents, supervisors, and admins.", sortOrder: 50 },

  // CI engineering
  { appliesTo: ["ci"], bullet: "CRM integration (Salesforce, HubSpot) — opportunity / deal linkage, coaching context surfacing in CRM views.", sortOrder: 10 },
  { appliesTo: ["ci"], bullet: "Recording capture infrastructure — provisioning, retention tuning, and access permissions.", sortOrder: 20 },
  { appliesTo: ["ci"], bullet: "Tracker tuning — phrase + topic libraries iterated against a sample of live recordings.", sortOrder: 30 },

  // VA engineering
  { appliesTo: ["va"], bullet: "Knowledge-source ingestion — connectors to FAQ / KB sources with refresh cadence.", sortOrder: 10 },
  { appliesTo: ["va"], bullet: "Intent training — iterative tuning against a corpus of representative utterances.", sortOrder: 20 },
  { appliesTo: ["va"], bullet: "Voice + chat channel wiring — IVR overlay, web chat widget, mobile SDK integration where in scope.", sortOrder: 30 },
  { appliesTo: ["va"], bullet: "Live-agent handoff — queue + context-transfer configuration.", sortOrder: 40 },
  { appliesTo: ["va"], bullet: "CRM context API — surface caller / chat context for downstream review.", sortOrder: 50 },

  // AIR engineering
  { appliesTo: ["rc_air"], bullet: "AI Receptionist persona + greeting flow configuration.", sortOrder: 10 },
  { appliesTo: ["rc_air"], bullet: "Routing logic build — department, named extension, queue, voicemail fallback.", sortOrder: 20 },
  { appliesTo: ["rc_air"], bullet: "Escalation path configuration for caller frustration, after-hours, and unsupported-language scenarios.", sortOrder: 30 },
];

// ── Optional Service Bullets (prose, Section 2.10) ───────────────────────────

export const OPTIONAL_BULLETS: OptionalServiceBullet[] = [
  // UCaaS-only
  { appliesTo: ["ucaas"], bullet: "On-site station discovery and pre-field readiness, including phone repurposing where supported.", sortOrder: 10 },
  { appliesTo: ["ucaas"], bullet: "On-site deployment services (phone distribution, ATA placement, cross-connect, post-install QA).", sortOrder: 20 },
  { appliesTo: ["ucaas"], vendor: ["zoom"], bullet: "Direct routing implementation via Session Border Controller (SBC) for Microsoft Teams.", sortOrder: 30 },

  // CCaaS-only
  { appliesTo: ["ccaas"], bullet: "Custom reporting / supervisor dashboards beyond the standard library.", sortOrder: 10 },
  { appliesTo: ["ccaas"], bullet: "Workforce Optimization (WFO) suite integration — recording, evaluation, coaching workflow handoff.", sortOrder: 20 },

  // CI-only
  { appliesTo: ["ci"], bullet: "Custom tracker library buildout beyond the standard sales-motion library.", sortOrder: 10 },

  // VA-only
  { appliesTo: ["va"], bullet: "Bot persona localization — additional language coverage beyond the in-scope set.", sortOrder: 10 },
  { appliesTo: ["va"], bullet: "Conversation flow optimization — A/B testing of intent paths and fallback rules.", sortOrder: 20 },

  // AIR-only
  { appliesTo: ["rc_air"], bullet: "Receptionist persona refinement — voice tuning, branded language refresh, additional hours / holiday variants.", sortOrder: 10 },

  // Shared (every variant)
  { bullet: "Additional live, instructor-led remote training sessions.", sortOrder: 90 },
];

// ── Optional Service Table (Section 9.2 pricing) ─────────────────────────────

export const OPTIONAL_ROWS: OptionalServiceRow[] = [
  // UCaaS-only
  {
    appliesTo: ["ucaas"], vendor: ["zoom"],
    name: "On-site station discovery & pre-field readiness (up to 60 Mitel 6900 series repurposed for Zoom)",
    unit: "Per project", fee: "$2,475.00",
    sortOrder: 10,
  },
  {
    appliesTo: ["ucaas"],
    name: "On-site phone deployment services (distribute, unbox, place, connect)",
    unit: "Per visit", fee: "By quote",
    sortOrder: 20,
  },
  {
    appliesTo: ["ucaas"], vendor: ["zoom"],
    name: "Direct Routing via SBC (Microsoft Teams integration)",
    unit: "Per project", fee: "By quote",
    sortOrder: 30,
  },

  // CCaaS-only
  {
    appliesTo: ["ccaas"],
    name: "Additional CRM integration build beyond the in-scope system",
    unit: "Per integration", fee: "By quote",
    sortOrder: 10,
  },
  {
    appliesTo: ["ccaas"],
    name: "Custom reporting / supervisor dashboard build",
    unit: "Per dashboard", fee: "By quote",
    sortOrder: 20,
  },

  // Shared
  {
    name: "Live remote instructor-led training session (up to 20 attendees per session)",
    unit: "Per session", fee: "$290.00",
    sortOrder: 90,
  },
];

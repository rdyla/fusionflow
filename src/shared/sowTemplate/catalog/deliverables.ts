/**
 * Section 3 — Deliverables.
 *
 * Each catalog entry carries an applicability tag. The assembler filters,
 * dedupes by name, sorts by sortOrder, and stamps sequential D1/D2/…
 * identifiers at render time so the rendered list is always consecutive.
 */

import type { DeliverableEntry } from "./types";

export const DELIVERABLES: DeliverableEntry[] = [
  // ── Shared (every variant) ──────────────────────────────────────────────
  {
    name: "Project Plan & RAID Log",
    format: "Smartsheet / PDF",
    acceptanceCriteria: "Plan reflects scope, milestones, owners, and dependencies; reviewed and acknowledged in writing by Customer PM.",
    sortOrder: 10,
  },
  {
    name: "Implementation Workbook",
    format: "Excel",
    acceptanceCriteria: "All users, sites, configuration, and feature assignments populated and approved by Customer authorized signer.",
    sortOrder: 20,
  },
  {
    name: "Network Readiness Review",
    format: "PDF + test screenshots",
    acceptanceCriteria: "Customer runs the platform's network-readiness test at each in-scope site and submits results to Packet Fusion. Packet Fusion documents findings, identified risks, and remediation owners; Customer acknowledges remediation responsibilities.",
    sortOrder: 50,
  },
  {
    name: "UAT Plan & Results",
    format: "PDF / Excel",
    acceptanceCriteria: "All planned test cases executed; pass/fail results recorded; Customer authorized signer accepts UAT results.",
    sortOrder: 70,
  },
  {
    name: "Go-Live Confirmation",
    format: "Sign-off form",
    acceptanceCriteria: "Cutover confirmed by Customer site lead; outstanding items captured for Day 1 Support follow-up.",
    sortOrder: 80,
  },
  {
    name: "Final Solution Design Report",
    format: "PDF",
    acceptanceCriteria: "Documents as-built configuration, integrations, and admin procedures; delivered at or before project closure.",
    sortOrder: 90,
  },
  {
    name: "Administrator Knowledge Transfer",
    format: "Live session + recording",
    acceptanceCriteria: "Recorded session covers admin portal, user / agent lifecycle, configuration edits, and reporting; Customer acknowledges completion.",
    sortOrder: 95,
  },
  {
    name: "Project Closure Memo",
    format: "PDF",
    acceptanceCriteria: "Confirms project closure and CSM transition, and lists any deferred items for future change orders.",
    sortOrder: 99,
  },

  // ── UCaaS-specific ──────────────────────────────────────────────────────
  {
    appliesTo: ["ucaas"],
    name: "Call-Flow Design Package",
    format: "PDF / Visio",
    acceptanceCriteria: "All in-scope call flows depicted (auto-attendant, queue, after-hours, overflow); approved by Customer authorized signer.",
    sortOrder: 30,
  },
  {
    appliesTo: ["ucaas"],
    name: "Port Order Package",
    format: "LOA + CSR",
    acceptanceCriteria: "LOA and CSR submitted to losing carrier for each in-scope number; FOC dates received.",
    sortOrder: 60,
  },

  // ── CCaaS-specific ──────────────────────────────────────────────────────
  {
    appliesTo: ["ccaas"],
    name: "Queue, Flow & Skill Design Package",
    format: "PDF / Visio",
    acceptanceCriteria: "All in-scope queues, IVR / call flows, skill assignments, and routing rules depicted; approved by Customer authorized signer.",
    sortOrder: 30,
  },
  {
    appliesTo: ["ccaas"],
    name: "CRM Integration Design",
    format: "PDF",
    acceptanceCriteria: "Documents the API integration design — screen pop fields, contact-lookup keys, activity-logging template; approved by Customer authorized signer.",
    sortOrder: 35,
  },

  // ── CI-specific ─────────────────────────────────────────────────────────
  {
    appliesTo: ["ci"],
    name: "Tracker Library",
    format: "PDF + platform export",
    acceptanceCriteria: "Trackers tuned against a representative sample of recent recordings; Customer reviewer signs off on accuracy.",
    sortOrder: 30,
  },
  {
    appliesTo: ["ci"],
    name: "Scorecard Catalog",
    format: "PDF + platform export",
    acceptanceCriteria: "Scorecards aligned to the Customer's call-quality framework; published to coaches / reviewers.",
    sortOrder: 35,
  },

  // ── VA-specific ─────────────────────────────────────────────────────────
  {
    appliesTo: ["va"],
    name: "Bot Persona + Conversation Design",
    format: "PDF",
    acceptanceCriteria: "Persona, voice, conversation tree, disambiguation prompts, and fallback flows approved by Customer authorized signer.",
    sortOrder: 30,
  },
  {
    appliesTo: ["va"],
    name: "Intent Library",
    format: "Platform export",
    acceptanceCriteria: "Trained intents covering the in-scope use cases; signed off by Customer reviewer.",
    sortOrder: 35,
  },

  // ── AIR-specific ────────────────────────────────────────────────────────
  {
    appliesTo: ["rc_air"],
    name: "Receptionist Design Document",
    format: "PDF",
    acceptanceCriteria: "Persona, greeting flow, routing logic, language coverage, and escalation paths approved by Customer authorized signer.",
    sortOrder: 30,
  },
];

/**
 * Section 1.3 — Scope at a Glance.
 *
 * Each row is tagged so a combo SOW (UCaaS + CCaaS) inherits both sets
 * automatically. Shared rows (Locations, Go-Live events, training) are
 * untagged so they appear in every SOW.
 */

import type { ScopeItem } from "./types";

export const SCOPE_ITEMS: ScopeItem[] = [
  // ── Shared (every SOW) ──────────────────────────────────────────────────
  { element: "Locations",                            quantity: "{locations}", notes: "Discrete physical sites in scope for cutover.",                                                                  sortOrder: 10 },
  { element: "Go-Live events",                       quantity: "{golives}",   notes: "One per site, sequenced per the agreed migration plan.",                                                          sortOrder: 80 },
  { element: "End-user training",                    quantity: "Self-paced",  notes: "Vendor video and knowledge-base library; instructor-led optional.",                                                sortOrder: 90 },
  { element: "Administrative training",              quantity: "Included",    notes: "Knowledge transfer to Customer system administrators.",                                                            sortOrder: 95 },

  // ── UCaaS ───────────────────────────────────────────────────────────────
  { appliesTo: ["ucaas"], vendor: ["zoom"],        element: "Zoom Phone users (UCaaS)", quantity: "{primary}", notes: "No physical fax, overhead paging, or physical desk phones in base scope.", sortOrder: 20 },
  { appliesTo: ["ucaas"], vendor: ["ringcentral"], element: "RingCentral users (UCaaS)", quantity: "{primary}", notes: "No physical fax, overhead paging, or physical desk phones in base scope.", sortOrder: 20 },
  { appliesTo: ["ucaas"], element: "DIDs (Direct Inward Dial)",        quantity: "{dids}",   notes: "All to be ported from existing carrier(s) to the new platform.",                       sortOrder: 30 },
  { appliesTo: ["ucaas"], vendor: ["zoom"], element: "Zoom Meetings licenses",      quantity: "{meetings}", notes: "Provisioning and configuration only; licenses procured separately.",         sortOrder: 40 },
  { appliesTo: ["ucaas"], element: "Network / VoIP readiness assessments", quantity: "Included", notes: "Wired and wireless test results per location.",                                  sortOrder: 70 },

  // ── CCaaS ───────────────────────────────────────────────────────────────
  { appliesTo: ["ccaas"], vendor: ["zoom"],        element: "Zoom Contact Center agents", quantity: "{primary}", notes: "Agent licensing in scope; supervisor + admin profiles configured.", sortOrder: 20 },
  { appliesTo: ["ccaas"], vendor: ["ringcentral"], element: "RingCX agents",              quantity: "{primary}", notes: "Agent licensing in scope; supervisor + admin profiles configured.", sortOrder: 20 },
  { appliesTo: ["ccaas"], element: "Queues, skills, and call flows",   quantity: "Per design",      notes: "Validated against the legacy contact-center configuration where one exists.",            sortOrder: 30 },
  { appliesTo: ["ccaas"], element: "CRM / business-system integrations", quantity: "Per design",    notes: "Salesforce, HubSpot, Microsoft Dynamics, or equivalent — Customer provides API access.", sortOrder: 40 },
  { appliesTo: ["ccaas"], element: "Call recording configuration",     quantity: "Included",        notes: "Retention windows and access permissions confirmed during design.",                    sortOrder: 50 },
  { appliesTo: ["ccaas"], element: "Reporting + supervisor dashboards", quantity: "Standard library", notes: "Customer-specific dashboards available as an optional service.",                     sortOrder: 60 },

  // ── CI (Revenue Accelerator) ────────────────────────────────────────────
  { appliesTo: ["ci"], element: "Recorded seats",                   quantity: "{primary}",   notes: "Users whose conversations are captured for review and scoring.",                                  sortOrder: 20 },
  { appliesTo: ["ci"], element: "Tracker library",                  quantity: "Per design",  notes: "Phrase + topic trackers tuned to the Customer's sales motion.",                                  sortOrder: 30 },
  { appliesTo: ["ci"], element: "Scorecard catalog",                quantity: "Per design",  notes: "Coaching scorecards aligned to the Customer's call-quality framework.",                          sortOrder: 40 },
  { appliesTo: ["ci"], element: "CRM integration",                  quantity: "Per design",  notes: "Opportunity / deal linkage so coaching context surfaces in the CRM.",                            sortOrder: 50 },

  // ── VA (Virtual Agent) ──────────────────────────────────────────────────
  { appliesTo: ["va"], element: "Bots",                             quantity: "{primary}",   notes: "Independent virtual-agent personas with their own configuration.",                              sortOrder: 20 },
  { appliesTo: ["va"], element: "Intent library",                   quantity: "Per design",  notes: "Trained intents drawn from the Customer's call-deflection priorities.",                          sortOrder: 30 },
  { appliesTo: ["va"], element: "Knowledge sources",                quantity: "Per design",  notes: "Ingested knowledge bases / FAQ corpora the bot can reference.",                                 sortOrder: 40 },
  { appliesTo: ["va"], element: "Channels (voice / chat)",          quantity: "Per design",  notes: "Voice and chat channels enabled and validated.",                                                 sortOrder: 50 },
  { appliesTo: ["va"], element: "Fallback + escalation paths",      quantity: "Included",    notes: "Live-agent handoff and after-hours fallback flows confirmed.",                                  sortOrder: 60 },

  // ── RC AIR (AI Receptionist) ────────────────────────────────────────────
  { appliesTo: ["rc_air"], element: "AI Receptionist numbers",      quantity: "{primary}",   notes: "Inbound numbers routed through the AI Receptionist before reaching a queue or user.",            sortOrder: 20 },
  { appliesTo: ["rc_air"], element: "Greeting / persona library",   quantity: "Per design",  notes: "Receptionist persona, voice, and greeting flow tuned to the Customer's brand.",                  sortOrder: 30 },
  { appliesTo: ["rc_air"], element: "Routing logic",                quantity: "Per design",  notes: "Hours, business units, escalation triggers, voicemail fallback.",                              sortOrder: 40 },
  { appliesTo: ["rc_air"], element: "Languages",                    quantity: "Per design",  notes: "Languages enabled; fallback when an unsupported language is detected.",                          sortOrder: 50 },

  // ── WFM (Workforce Management) ──────────────────────────────────────────
  { appliesTo: ["wfm"], element: "WFM-managed agents",             quantity: "{primary}",   notes: "Agents synchronized into Workforce Management for forecasting and scheduling.",                  sortOrder: 20 },
  { appliesTo: ["wfm"], element: "Queues / work types forecasted", quantity: "Per design",  notes: "Contact-center queues mapped to forecast groups and staffing models.",                          sortOrder: 30 },
  { appliesTo: ["wfm"], element: "Schedule rules + shift profiles", quantity: "Per design",  notes: "Shift templates, breaks, time-off rules, and scheduling constraints per the Customer's operation.", sortOrder: 40 },
  { appliesTo: ["wfm"], element: "Adherence + reporting views",    quantity: "Standard library", notes: "Real-time adherence and historical reporting; Customer-specific views available as an optional service.", sortOrder: 50 },

  // ── QM (Quality Management) ─────────────────────────────────────────────
  { appliesTo: ["qm"], element: "QM-evaluated agents",             quantity: "{primary}",   notes: "Agents whose interactions are captured and scored for quality evaluation.",                      sortOrder: 20 },
  { appliesTo: ["qm"], element: "Evaluation forms / scorecards",   quantity: "Per design",  notes: "Quality scorecards aligned to the Customer's evaluation framework.",                             sortOrder: 30 },
  { appliesTo: ["qm"], element: "Calibration + coaching workflows", quantity: "Per design",  notes: "Calibration sessions and coaching assignment workflows for supervisors and evaluators.",         sortOrder: 40 },
  { appliesTo: ["qm"], element: "Quality reporting dashboards",    quantity: "Standard library", notes: "Quality and coaching dashboards; Customer-specific dashboards available as an optional service.", sortOrder: 50 },
];

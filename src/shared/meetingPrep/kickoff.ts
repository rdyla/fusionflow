/**
 * Kickoff meeting prep — section catalog.
 *
 * Migrated from `src/shared/welcomeSections.ts`. Same content + IDs preserved
 * verbatim so existing draft payloads keep working across the engine
 * refactor.
 *
 * To add a section:
 * 1. Add an ID to `KICKOFF_SECTION_IDS`.
 * 2. Append a meta entry to `KICKOFF_CATALOG`.
 * 3. Add a case to `renderKickoffSection()` in `src/server/lib/meetingPrep/kickoff.ts`.
 *
 * The modal auto-picks up the new checkbox; the renderer auto-includes it for
 * projects whose `solution_types` intersect the section's `appliesTo`.
 */

import type { MeetingPrepSectionMeta } from "./types";

export const KICKOFF_SECTION_IDS = [
  "adminAccess",
  "porting",
  "discoveryUcaas",
  "discoveryCcaas",
  "discoveryVa",
  "discoveryCi",
  "discoveryWfm",
  "discoveryQm",
  "ssoIdentity",
  "changeManagement",
  "timeline",
] as const;

export type KickoffSectionId = typeof KICKOFF_SECTION_IDS[number];

export function isKickoffSectionId(v: unknown): v is KickoffSectionId {
  return typeof v === "string" && (KICKOFF_SECTION_IDS as readonly string[]).includes(v);
}

export const KICKOFF_CATALOG: readonly MeetingPrepSectionMeta[] = [
  { id: "adminAccess",      label: "Admin Access for Packet Fusion", appliesTo: "all",      defaultEnabled: true },
  { id: "porting",          label: "Porting Information",            appliesTo: ["ucaas"],  defaultEnabled: true },
  // Per-type discovery focus areas — frame the topics each project will explore in
  // discovery so the customer team knows what to start thinking about. Soft tone:
  // questions to seed conversations, NOT pre-work asks.
  { id: "discoveryUcaas",   label: "UCaaS Discovery Topics",         appliesTo: ["ucaas"],  defaultEnabled: true },
  { id: "discoveryCcaas",   label: "CCaaS Discovery Topics",         appliesTo: ["ccaas"],  defaultEnabled: true },
  { id: "discoveryVa",      label: "Virtual Agent Discovery Topics", appliesTo: ["va"],     defaultEnabled: true },
  { id: "discoveryCi",      label: "CI Discovery Topics",            appliesTo: ["ci"],     defaultEnabled: true },
  { id: "discoveryWfm",     label: "WFM Discovery Topics",           appliesTo: ["wfm"],    defaultEnabled: true },
  { id: "discoveryQm",      label: "QM Discovery Topics",            appliesTo: ["qm"],     defaultEnabled: true },
  // Cross-cutting discovery topics applicable to every project type.
  { id: "ssoIdentity",      label: "SSO + Identity Provider",        appliesTo: "all",      defaultEnabled: true },
  { id: "changeManagement", label: "Change Management + Rollout",    appliesTo: "all",      defaultEnabled: true },
  { id: "timeline",         label: "Timeline",                        appliesTo: "all",      defaultEnabled: true },
];

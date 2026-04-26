/**
 * Welcome-email section catalog — metadata only.
 *
 * This module is intentionally data-only so it can be imported by both the
 * client modal (for rendering checkbox lists) and the server template (for
 * section visibility filtering). HTML rendering lives in
 * src/server/lib/emailTemplates.ts; the `renderSingleSection` switch there
 * is the only place a new section's body needs to be wired up.
 *
 * To add a new section:
 * 1. Add an ID to the `WelcomeSectionId` union below.
 * 2. Append a `WelcomeSectionMeta` entry to `WELCOME_SECTION_META`.
 * 3. Add a case to `renderSingleSection()` in emailTemplates.ts with the HTML body.
 *
 * The modal auto-picks up the new checkbox; the template auto-renders it for
 * projects whose `solution_types` intersect the section's `appliesTo`.
 */

import type { SolutionType } from "./solutionTypes";

export type WelcomeSectionId =
  | "adminAccess"
  | "porting"
  | "discoveryUcaas"
  | "discoveryCcaas"
  | "discoveryVa"
  | "discoveryCi"
  | "discoveryWfm"
  | "discoveryQm"
  | "ssoIdentity"
  | "changeManagement"
  | "timeline";

export type WelcomeSectionMeta = {
  id: WelcomeSectionId;
  /** Checkbox label in the modal and heading used in the rendered email block. */
  label: string;
  /** `"all"` = every project; `SolutionType[]` = only if the project has at least one of these types. */
  appliesTo: "all" | readonly SolutionType[];
  /** If the client omits this section's key in the draft payload, this is the assumed value. */
  defaultEnabled: boolean;
};

export const WELCOME_SECTION_META: readonly WelcomeSectionMeta[] = [
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

export function isWelcomeSectionId(v: unknown): v is WelcomeSectionId {
  return typeof v === "string" && WELCOME_SECTION_META.some((m) => m.id === v);
}

/** Filter the catalog to sections applicable to a given project's solution types. */
export function sectionsForTypes(types: readonly SolutionType[]): readonly WelcomeSectionMeta[] {
  return WELCOME_SECTION_META.filter((s) =>
    s.appliesTo === "all" || s.appliesTo.some((t) => types.includes(t))
  );
}

/**
 * Produce the final enabled/disabled map for a welcome email:
 *   - Only includes sections applicable to the project's solution types
 *   - Client-supplied values win; missing keys fall back to each section's `defaultEnabled`
 */
export function applyWelcomeSectionDefaults(
  raw: Readonly<Partial<Record<string, boolean>>>,
  types: readonly SolutionType[]
): Record<WelcomeSectionId, boolean> {
  const out = {} as Record<WelcomeSectionId, boolean>;
  for (const meta of sectionsForTypes(types)) {
    out[meta.id] = raw[meta.id] ?? meta.defaultEnabled;
  }
  return out;
}

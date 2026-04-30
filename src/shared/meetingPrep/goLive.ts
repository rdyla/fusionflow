/**
 * Go-Live meeting prep — section catalog.
 *
 * Sent before cutover so everyone (customer, partner, PF) knows the cutover
 * sequence, who's available day-of, and what hypercare looks like.
 */

import type { MeetingPrepSectionMeta } from "./types";

export const GO_LIVE_SECTION_IDS = [
  "goLiveCutoverPlan",
  "goLiveDayOfComms",
  "goLiveHypercare",
] as const;

export type GoLiveSectionId = typeof GO_LIVE_SECTION_IDS[number];

export const GO_LIVE_CATALOG: readonly MeetingPrepSectionMeta[] = [
  { id: "goLiveCutoverPlan",   label: "Cutover Plan",            appliesTo: "all", defaultEnabled: true },
  { id: "goLiveDayOfComms",    label: "Day-of Communications",   appliesTo: "all", defaultEnabled: true },
  { id: "goLiveHypercare",     label: "Hypercare",                appliesTo: "all", defaultEnabled: true },
];

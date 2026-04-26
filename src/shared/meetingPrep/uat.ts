/**
 * UAT (User Acceptance Testing) meeting prep — section catalog.
 *
 * Sent before UAT kickoff so the customer's testers know the bar, the
 * scenarios, and the sign-off process.
 */

import type { MeetingPrepSectionMeta } from "./types";

export const UAT_SECTION_IDS = [
  "uatAgenda",
  "uatAcceptanceCriteria",
  "uatSignoffProcess",
] as const;

export type UatSectionId = typeof UAT_SECTION_IDS[number];

export const UAT_CATALOG: readonly MeetingPrepSectionMeta[] = [
  { id: "uatAgenda",             label: "UAT Agenda",            appliesTo: "all", defaultEnabled: true },
  { id: "uatAcceptanceCriteria", label: "Acceptance Criteria",   appliesTo: "all", defaultEnabled: true },
  { id: "uatSignoffProcess",     label: "UAT Sign-Off Process",  appliesTo: "all", defaultEnabled: true },
];
